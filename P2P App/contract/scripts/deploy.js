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

// Run the script.
// Note: we set process.exitCode instead of calling process.exit() so the
// process can shut down its handles cleanly. Calling process.exit(0) here
// races with libuv tearing down the still-open JSON-RPC connection and
// triggers "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" on
// Node.js v24 + Windows (harmless, but noisy).
main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
