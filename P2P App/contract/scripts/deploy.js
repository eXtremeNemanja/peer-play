const hre = require("hardhat");

async function main() {
  // Get the contract factory
  const VideoStreaming = await hre.ethers.getContractFactory("VideoStreaming");

  // Deploy the contract
  const contract = await VideoStreaming.deploy();

  // Wait for the contract deployment to be confirmed
  await contract.waitForDeployment();

  console.log("VideoStreaming contract deployed to:", await contract.getAddress());
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
