const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // 1) Deploy MockUSDC (for testnet demo you can deploy it; for real you'd use real USDC address)
  console.log("\nDeploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // 2) Deploy Escrow (no attester needed - auto-releases when both fund)
  console.log("\nDeploying CreatorCheckoutEscrow...");
  const Escrow = await ethers.getContractFactory("CreatorCheckoutEscrow");
  const escrow = await Escrow.deploy(usdcAddress);
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("Escrow deployed to:", escrowAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("MockUSDC:", usdcAddress);
  console.log("Escrow:", escrowAddress);
  console.log("Owner:", deployer.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
