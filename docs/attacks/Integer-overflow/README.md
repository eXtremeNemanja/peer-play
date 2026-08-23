# Integer Overflow in batch `purchaseVideos()`

Attack scenario report for the _peer-play_ platform.
The vulnerability, both attacks, and the fix were implemented as changes to the **original** project code on the `security/integer-overflow` branch (not as separate example files).

- Contract: `P2P App/contract/contracts/VideoStreaming.sol`
- Backend: `P2P App/app/server.js`
- Attack scripts: `P2P App/contract/scripts/attacks/overflow-direct.js`,
  `P2P App/app/attacks/overflow-api.js`

Recordings for each step are in [`videos/`](videos/).

---

## 1. Concepts needed to understand the scenario

- **Fixed-width integers.** Solidity's `uint256` holds values from `0` to `2^256 - 1`. Arithmetic is modular: adding past the maximum **wraps around**, so `(2^256 - 1) + 1 == 0`.
- **Checked vs `unchecked` arithmetic.** Since Solidity 0.8.0 every arithmetic operation is *checked*: on overflow/underflow the transaction reverts with panic code `0x11`. An `unchecked { ... }` block turns that protection off. It is normally used as a micro gas optimization, most commonly around a loop counter (`i++`) that probably cannot overflow.
- **Attacker-controlled price.** `uploadVideo(cid, price)` lets any caller set an arbitrary `price`, including a value close to `2^256`. That single value is the attacker's lever to force the wrap-around.
- **Custodial architecture.** In peer-play the server holds each user's wallet and signs on their behalf, but the blockchain node is public: an attacker can reach the vulnerable function either **through the API** (as a normal authenticated user) or **directly on the contract** over JSON-RPC. Both paths are demonstrated below.

---

## 2. Vulnerable code and explanation

### 2.1 Contract - `VideoStreaming.sol`

A batch-purchase function was added. The whole summing loop is wrapped in `unchecked`:

```solidity
// Function to purchase access to several videos in a single transaction.
function purchaseVideos(string[] memory _ipfsHashes) public payable {
    uint256 totalPrice = 0;
    unchecked {
        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            Video storage video = videos[_ipfsHashes[i]];
            require(video.isAvailable, "Video is not available");
            totalPrice += video.price;   // <-- overflow no longer reverts
        }
    }

    require(msg.value >= totalPrice, "Insufficient payment");

    for (uint256 i = 0; i < _ipfsHashes.length; ) {
        videoPurchasers[_ipfsHashes[i]][msg.sender] = true;
        emit VideoPurchased(_ipfsHashes[i], msg.sender);
        unchecked { i++; }
    }
}
```

**Why it is exploitable.** The attacker uploads a video whose price is `2^256 - victimPrice`. The batch then sums `victimPrice + (2^256 - victimPrice) = 2^256`, which under `unchecked` wraps to `0`. The check `require(msg.value >= totalPrice)` becomes `require(msg.value >= 0)` and passes for `msg.value == 0`. The attacker is recorded as a purchaser of every video in the batch, including the victim's paid video, for nothing.

### 2.2 Backend - `server.js`

To make the vulnerability reachable through the application, two changes exposed it over HTTP:

**(a)** `/upload` now takes the price from the request body (attacker-controlled), instead of the hardcoded `0.1 ETH`, and accepts it as a raw wei value so a huge price can be set directly:

```js
const {file, filename, price} = req.body;
// ...
const priceWei = (price !== undefined && price !== null)
    ? BigInt(price)
    : ethers.parseEther('0.1');
const tx = await videoStreamingContract.connect(signer).uploadVideo(result.rows[0].cid, priceWei);
```

**(b)** a batch-purchase endpoint that forwards a list of videos and an
attacker-chosen `msg.value` to `purchaseVideos()`:

```js
app.put('/purchaseVideos', authenticateToken, async (req, res) => {
    const { items, value } = req.body;            // items: [{ owner, videoName }], value in wei
    // resolve each { owner, videoName } to its CID ...
    const tx = await videoStreamingContract
        .connect(userWallet)
        .purchaseVideos(cids, { value: BigInt(value ?? '0') });
    await tx.wait();
    res.json({ transactionHash: tx.hash, cids });
});
```

---

## 3. Attack and successful result

The attack has two variants that both target the same flaw.

### 3.1 Direct attack on the contract

`P2P App/contract/scripts/attacks/overflow-direct.js` connects straight to the contract (bypassing the API): a victim uploads a `0.1 ETH` video, the attacker uploads a video priced `2^256 - victimPrice`, then batch-buys both for `0 ETH`.

Run:

```bash
cd "P2P App/contract"
npx hardhat run scripts/attacks/overflow-direct.js          # in-process EVM
# or, against a running node:
# npx hardhat run scripts/attacks/overflow-direct.js --network localhost
```

Observed output:

```
=== Integer overflow - direct contract attack ===

VideoStreaming deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Victim  : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Attacker: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Victim uploaded "QmVictimVideo" @ 0.1 ETH
Attacker uploaded "QmEvilVideo" @ (2^256 - victimPrice) wei
   -> chosen so the unchecked batch total overflows back to 0

Attacker calls purchaseVideos([victim, evil]) with value = 0 ETH ...

--- Result ---
Attacker paid:                               0 ETH
Attacker has access to victim's paid video:  true  <-- STOLEN FOR FREE
```

Recording: [direct attack succeeds](videos/direct-attack.mp4)

<video src="videos/direct-attack.mp4" controls width="720"></video>

### 3.2 Attack through the API

`P2P App/app/attacks/overflow-api.js` performs the attack as a normal authenticated user against the running backend: it registers victim and attacker, the victim uploads a paid video, the attacker uploads a video with the crafted huge price, then calls `PUT /purchaseVideos` with `value: "0"` and confirms stolen access via `/retrieve`.

Prerequisites: PostgreSQL (via `docker compose up -d`), `npx hardhat node`, the deployed contract, and the backend (`npm start` in `P2P App/app`). Run:

```bash
cd "P2P App/app"
node attacks/overflow-api.js
```

Observed output:

```
=== Integer overflow - attack through the API ===

Registered + logged in: victim, attacker
Victim upload status: 200
Attacker upload status: 200 (price = 2^256 - victimPrice wei)

Attacker calls PUT /purchaseVideos with value = 0 ...
purchaseVideos status: 200
{"transactionHash":"0x1907115470e4fed67b032d930c9171f473599f9c119bbee068f85109dad1a584","cids":["QmQyZtMQnT2UWbCFwr8X9BBR33TCvVmrDeDNrTRwNeU8yj","QmQJ8fB1SDS8M9tnVkYiBPriqrytuzcCLT9ryuipFjbyuq"]}

Retrieve victim's video status: 200  <-- ACCESS GRANTED (stolen for free)
```

`purchaseVideos` returns `200` for a `0`-wei payment, and the attacker can then retrieve the victim's paid video (`200`).

Recording: [API attack succeeds](videos/api-attack.mp4)

<video src="videos/api-attack.mp4" controls width="720"></video>

---

## 4. Mitigation and explanation

The fix keeps the gas optimization but restores overflow protection: the `unchecked` block is **narrowed from the whole loop to only the `i++` counter**. The price accumulation `totalPrice += video.price` now runs under checked arithmetic.

```solidity
function purchaseVideos(string[] memory _ipfsHashes) public payable {
    uint256 totalPrice = 0;
    // FIXED: unchecked narrowed to only i++; the sum is checked again.
    for (uint256 i = 0; i < _ipfsHashes.length; ) {
        Video storage video = videos[_ipfsHashes[i]];
        require(video.isAvailable, "Video is not available");
        totalPrice += video.price;   // checked: overflow reverts (panic 0x11)
        unchecked { i++; }
    }

    require(msg.value >= totalPrice, "Insufficient payment");

    for (uint256 i = 0; i < _ipfsHashes.length; ) {
        videoPurchasers[_ipfsHashes[i]][msg.sender] = true;
        emit VideoPurchased(_ipfsHashes[i], msg.sender);
        unchecked { i++; }
    }
}
```

**What changed and why it works.** The only change is moving `unchecked` off the summing loop and onto the counter increment. With checked arithmetic, summing `victimPrice + (2^256 - victimPrice)` overflows `uint256` and the EVM reverts with panic `0x11` **before** the payment check is reached. The attacker can no longer force the total to wrap, so `require(msg.value >= totalPrice)` reflects the true total and a `0`-ETH purchase is rejected. The `i++` gas saving is preserved. No backend change was needed; the fixed contract makes both attack paths fail.

---

## 5. Failed attack on the fixed code

### 5.1 Direct attack, blocked

Re-running the same direct script against the fixed contract:

```bash
cd "P2P App/contract"
npx hardhat run scripts/attacks/overflow-direct.js
```

Observed output:

```
=== Integer overflow - direct contract attack ===

VideoStreaming deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Victim  : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
Attacker: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

Victim uploaded "QmVictimVideo" @ 0.1 ETH
Attacker uploaded "QmEvilVideo" @ (2^256 - victimPrice) wei
   -> chosen so the unchecked batch total overflows back to 0

Attacker calls purchaseVideos([victim, evil]) with value = 0 ETH ...
   Transaction REVERTED: Error: VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation overflowed outside of an unchecked block)

--- Result ---
Attack blocked - the overflow reverted.
Attacker has access to victim's paid video:  false  <-- attack failed
```

Recording: [direct attack blocked](videos/mitigated-direct-attack.mp4)

<video src="videos/mitigated-direct-attack.mp4" controls width="720"></video>

### 5.2 API attack, blocked

After redeploying the fixed contract and restarting the backend, re-running the API script:

```bash
cd "P2P App/app"
node attacks/overflow-api.js
```

Observed output:

```
=== Integer overflow - attack through the API ===

Registered + logged in: victim, attacker
Victim upload status: 200
Attacker upload status: 200 (price = 2^256 - victimPrice wei)

Attacker calls PUT /purchaseVideos with value = 0 ...
purchaseVideos status: 500
Error batch purchasing videos

Retrieve victim's video status: 404  <-- access denied
```

The batch purchase now reverts on-chain (the server returns `500`), the attacker is never recorded as a purchaser, and retrieving the victim's video is denied (`404`).

Recording: [API attack blocked](videos/mitigated-api-attack.mp4)

<video src="videos/mitigated-api-attack.mp4" controls width="720"></video>

---

## How to reproduce

1. `git checkout security/integer-overflow`
2. Contract env: `cd "P2P App/contract" && npm install`
3. Direct attack: `npx hardhat run scripts/attacks/overflow-direct.js`
4. Full stack for the API attack: `docker compose up -d` (in `P2P App`),
   `npx hardhat node`, `npx hardhat run scripts/deploy.js --network localhost`, fill
   `P2P App/app/config.js`, then `cd "P2P App/app" && npm install && npm start`.
5. API attack: `node attacks/overflow-api.js`.

The vulnerable state is the first commit on the branch; the mitigation is the second commit. Check out either commit to reproduce the successful or the failed attack.