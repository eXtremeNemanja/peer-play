# Front-running `uploadVideo()`

- Contract: `P2P App/contract/contracts/VideoStreaming.sol`
- Backend: `P2P App/app/server.js`
- Attack scripts: `P2P App/contract/scripts/attacks/frontrun-direct.js`,
  `P2P App/app/attacks/frontrun-api.js`

Recordings for each step are in [`videos/`](videos/).

---

## 1. Concepts needed to understand the scenario

- **Mempool.** - Pending transactions wait in the mempool before they are included in a block. Anyone running a node can read it, so a transaction and all of its arguments are **public before** it is mined.
- **Gas-price ordering (EIP-1559).** - When several transactions compete for the same block, the node orders them by priority fee (the tip); a higher tip is mined earlier. *Front-running* means watching a pending transaction and sending your own with a higher tip so that yours lands first.
- **First-come ownership.** - `uploadVideo()` gates registration only with `require(videos[cid].owner == address(0), "Video already exists")`. The first successful call wins the CID **forever** - there is no transfer, delete, or re-price function - and there is no proof that the caller actually owns the content behind the CID.
- **Why the backend makes it worse.** - The server signs and broadcasts the upload on the user's behalf, leaking the CID in the clear (`server.js`). The attacker does not need to break the server; they just watch the chain.
- **Custodial architecture.** In peer-play the server holds each user's wallet and signs on their behalf, but the blockchain node is public: the flaw can be reached either **through the API** (the victim uploads normally while the attacker watches the mempool) or **directly on the contract** over JSON-RPC. Both paths are demonstrated below.

---

## 2. Vulnerable code and explanation

### 2.1 Contract - `VideoStreaming.sol`

This is the original upload function, unchanged:

```solidity
// Function to upload a new video
function uploadVideo(string memory _ipfsHash, uint256 _price) public {
    require(videos[_ipfsHash].owner == address(0), "Video already exists");

    videos[_ipfsHash] = Video({
        ipfsHash: _ipfsHash,
        owner: msg.sender,
        price: _price,
        isAvailable: true
    });

    emit VideoUploaded(_ipfsHash, msg.sender, _price);
}
```

**Why it is exploitable.** - Ownership is decided purely by transaction ordering: the only check is whether the CID is still unclaimed, and `owner` is set to whoever calls first (`msg.sender`). Because the CID is public in the mempool and ordering is buyable with a higher tip, an attacker who sees the victim's pending `uploadVideo(cid)` can copy the CID and submit their own call with a larger tip. Their transaction is mined first, they become the permanent owner, and the honest uploader's transaction reverts with `"Video already exists"`. From then on every `purchaseVideo(cid)` payment credits `balances[video.owner]` - the attacker.

### 2.2 Backend - `server.js`

The `/upload` endpoint signs and broadcasts the upload as a single plaintext transaction, putting the CID into the public mempool:

```js
const signer = new ethers.Wallet(result.rows[0].private_key, provider);

const tx = await videoStreamingContract.connect(signer).uploadVideo(result.rows[0].cid, priceWei);
await tx.wait(); // Wait for the transaction to be mined
```

Anyone watching the node sees `uploadVideo(cid, price)` with the CID in clear text before it is mined - exactly the window a front-runner needs.

---

## 3. Attack and successful result

The attack has two variants that both target the same flaw.

### 3.1 Direct attack on the contract

`P2P App/contract/scripts/attacks/frontrun-direct.js` connects straight to the contract (bypassing the API). The scenario needs more than one pending transaction at once, so the script turns automining off, lets both uploads queue in the mempool, then mines a block: the victim uploads with a low tip, the attacker copies the CID and uploads with a high tip.

Run:

```bash
cd "P2P App/contract"
npx hardhat run scripts/attacks/frontrun-direct.js          # in-process EVM
```

Observed output:

```
=== Front-running - direct contract attack ===

VideoStreaming deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Victim  : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Attacker: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Victim wants to register CID "QmVictimOriginalVideo" @ 0.1 ETH

Victim broadcast uploadVideo(cid) with tip = 1 gwei (pending in mempool)
Attacker sees the CID and front-runs uploadVideo(cid) with tip = 100 gwei

Mining the mempool (ordered by tip) ...

--- Result ---
On-chain owner of the CID: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (ATTACKER)
Victim tx reverted       : true (Video already exists)

Attack succeeded - the attacker stole ownership of the victim's CID.
The attacker now collects every purchase payment for that video.
```

The higher-tip attacker transaction is ordered first and wins the CID; the victim's transaction reverts and they are locked out permanently.

Recording: [direct attack succeeds](videos/direct-attack.mp4)

<video src="videos/direct-attack.mp4" controls width="720"></video>

### 3.2 Attack through the API

`P2P App/app/attacks/frontrun-api.js` attacks the whole application. The **victim** uploads normally with `POST /upload`; the backend broadcasts `uploadVideo(cid, price)` to the public mempool. The **attacker never touches the server** - like any node observer it watches the mempool, reads the pending CID, and submits its own `uploadVideo(cid)` with a higher tip. The attacker uses Hardhat account #5, deliberately outside the server's custodial pool (accounts #0-#4).

On a real network the ~12 s block time is the front-running window. The local Hardhat node mines instantly, so the script turns automining off to recreate the same "two transactions pending together" condition, then mines.

Prerequisites: PostgreSQL (via `docker compose up -d`), `npx hardhat node`, the deployed contract, and the backend (`npm start` in `P2P App/app`). Run:

```bash
cd "P2P App/app"
node attacks/frontrun-api.js
```

Observed output:

```
=== Front-running - attack through the API ===

Registered + logged in: victim
Attacker wallet: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (not a custodial account)

Victim calls POST /upload (backend broadcasts uploadVideo to the mempool) ...
Attacker read the pending CID from the mempool: Qmd193fG1M9efvbET1F4YqnKrxJqQMkqHts1hMaf6pdGzJ
Attacker submits uploadVideo(cid) directly with tip = 100 gwei ...

--- Result ---
Victim POST /upload status: 500 (upload failed)
On-chain owner of the CID : 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (ATTACKER)

Attack succeeded - the attacker stole the CID through the public mempool.
The victim's upload reverted; the attacker now owns the video on-chain.
```

The attacker reads the CID straight from the mempool and front-runs it. The victim's `POST /upload` returns `500` because its on-chain transaction reverted, and the CID is now owned by the attacker.

Recording: [API attack succeeds](videos/api-attack.mp4)

<video src="videos/api-attack.mp4" controls width="720"></video>

---

## 4. Mitigation and explanation

The fix binds ownership to the uploader with a **commit-reveal** scheme. The uploader first publishes a hash that includes *their own address*; only in a later block do they reveal the CID. A front-runner who copies the reveal cannot match the commitment, because it was computed with the victim's address, not theirs.

### 4.1 Contract - `VideoStreaming.sol`

```solidity
// FIXED (front-running): commitment => block number it was registered in.
mapping(bytes32 => uint256) public commitBlock;

event VideoCommitted(bytes32 commitment, address committer);

// Step 1: publish a commitment that binds the upload to the caller's address. The
// commitment is keccak256(cid, price, salt, msg.sender) and reveals nothing about the
// CID, so a mempool watcher learns nothing.
function commitVideo(bytes32 _commitment) public {
    require(commitBlock[_commitment] == 0, "Commitment exists");
    commitBlock[_commitment] = block.number;
    emit VideoCommitted(_commitment, msg.sender);
}

// Step 2 (in a later block): reveal. The commitment is recomputed with msg.sender, so
// only the original committer can satisfy it. A front-runner who copies the reveal
// computes a different commitment (their own address) that was never committed, so
// their transaction reverts.
function uploadVideo(string memory _ipfsHash, uint256 _price, bytes32 _salt) public {
    bytes32 commitment = keccak256(abi.encodePacked(_ipfsHash, _price, _salt, msg.sender));
    require(commitBlock[commitment] != 0, "No matching commit");
    require(block.number > commitBlock[commitment], "Reveal too early");
    require(videos[_ipfsHash].owner == address(0), "Video already exists");

    videos[_ipfsHash] = Video({
        ipfsHash: _ipfsHash,
        owner: msg.sender,
        price: _price,
        isAvailable: true
    });

    emit VideoUploaded(_ipfsHash, msg.sender, _price);
}
```

### 4.2 Backend - `server.js`

`/upload` now performs the two steps for the user: commit, then reveal in a later block.

```js
const salt = ethers.hexlify(ethers.randomBytes(32));
const commitment = ethers.solidityPackedKeccak256(
    ['string', 'uint256', 'bytes32', 'address'],
    [cidStr, priceWei, salt, signer.address]
);
// Pin explicit sequential nonces: the provider can cache the pending nonce, so
// the reveal would otherwise reuse the commit's nonce ("nonce too low").
const baseNonce = await provider.getTransactionCount(signer.address, 'latest');
const commitTx = await videoStreamingContract.connect(signer).commitVideo(commitment, { nonce: baseNonce });
await commitTx.wait();

const tx = await videoStreamingContract.connect(signer).uploadVideo(cidStr, priceWei, salt, { nonce: baseNonce + 1 });
await tx.wait();
```

**What changed and why it works:**
- Ownership now requires a prior `commitVideo()` whose hash bakes in `msg.sender`. The commit is opaque, so watching the mempool reveals no CID to copy.
- When the attacker copies the victim's reveal (`cid`, `price`, `salt`), the contract recomputes the commitment with the **attacker's** address. That hash was never committed, so `require(commitBlock[commitment] != 0, "No matching commit")` reverts.
- The attacker could only win by committing the same CID *earlier* with their own address - but the CID is secret until the victim reveals it, so they cannot.
- `require(block.number > commitBlock[...])` forces commit and reveal into different blocks, closing the same-block race.

---

## 5. Failed attack on the fixed code

The **same two attack scripts** are re-run against the fixed code. Each one attempts the front-run and reports why it can no longer succeed.

### 5.1 Direct attack, blocked

```bash
cd "P2P App/contract"
npx hardhat run scripts/attacks/frontrun-direct.js
```

Observed output:

```
=== Front-running - direct contract attack ===

VideoStreaming deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Victim  : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Attacker: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Victim wants to register CID "QmVictimOriginalVideo" @ 0.1 ETH

--- Result ---
Attack failed - the front-run could not be submitted.
Reason: invalid BytesLike value

The contract now requires commit-reveal: uploadVideo(cid, price, salt)
with a prior commitVideo() bound to msg.sender. The old 2-argument
uploadVideo(cid, price) no longer exists, so a plain front-run is impossible.
```

The plaintext `uploadVideo(cid, price)` the front-run relied on is gone; registration now goes through the commit-reveal flow, so the attack cannot even be formed.

Recording: [direct attack blocked](videos/mitigated-direct-attack.mp4)

<video src="videos/mitigated-direct-attack.mp4" controls width="720"></video>

### 5.2 API attack, blocked

After redeploying the fixed contract and restarting the backend, re-running the API script:

```bash
cd "P2P App/app"
node attacks/frontrun-api.js
```

Observed output:

```
=== Front-running - attack through the API ===

Registered + logged in: victim
Attacker wallet: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (not a custodial account)

Victim calls POST /upload (backend broadcasts uploadVideo to the mempool) ...

--- Result ---
Attack failed - the attacker had nothing to front-run.
Reason: victim's uploadVideo never appeared in the mempool
Victim POST /upload status: 200 (victim uploaded successfully, keeps ownership)

The commit-reveal fix broadcasts an opaque commitVideo(hash) first, so a
mempool watcher sees no CID to copy. The reveal is bound to the victim's
address, so even copying it later cannot transfer ownership.
```

The attacker watches the mempool but only sees the opaque `commitVideo(hash)` - there is no plaintext CID to copy. The victim's upload completes normally (`200`) and they keep ownership. Even if the attacker later reads the reveal off the chain, replaying it fails: the commitment is bound to the victim's address (`"No matching commit"`).

Recording: [API attack blocked](videos/mitigated-api-attack.mp4)

<video src="videos/mitigated-api-attack.mp4" controls width="720"></video>

---

## How to reproduce

1. `git checkout security/front-running`
2. Contract env: `cd "P2P App/contract" && npm install`
3. Direct attack: `npx hardhat run scripts/attacks/frontrun-direct.js`
4. Full stack for the API attack: `docker compose up -d` (in `P2P App`),
   `npx hardhat node`, `npx hardhat run scripts/deploy.js --network localhost`, fill
   `P2P App/app/config.js`, then `cd "P2P App/app" && npm install && npm start`.
5. API attack: `node attacks/frontrun-api.js`.

The vulnerable state is the first commit on the branch; the mitigation is the second commit. Check out either commit to reproduce the successful or the failed attack.