const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CreatorCheckoutEscrow", function () {
  it("automatically releases funds when both consumer and store fund", async function () {
    const [deployer, consumer, store, influencer] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy Escrow (no attester needed)
    const Escrow = await ethers.getContractFactory("CreatorCheckoutEscrow");
    const escrow = await Escrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    // Create a deal
    const price = 100n * 10n ** 6n;      // 100 USDC in 6 decimals
    const commission = 2n * 10n ** 6n;   // 2 USDC

    const tx = await escrow.createDeal(
      consumer.address,
      store.address,
      influencer.address,
      price,
      commission
    );
    const receipt = await tx.wait();
    
    // Get dealId from event
    const dealCreatedEvent = receipt.logs.find(
      log => log.fragment && log.fragment.name === "DealCreated"
    );
    const dealId = dealCreatedEvent.args[0];

    // Mint funds
    await usdc.mint(consumer.address, price);
    await usdc.mint(store.address, commission);

    // Consumer funds first
    await usdc.connect(consumer).approve(await escrow.getAddress(), price);
    await escrow.connect(consumer).fundConsumer(dealId);

    // Store funds second - this should auto-release
    await usdc.connect(store).approve(await escrow.getAddress(), commission);
    await escrow.connect(store).fundStore(dealId);

    // Check payouts
    expect(await usdc.balanceOf(store.address)).to.equal(price);
    expect(await usdc.balanceOf(influencer.address)).to.equal(commission);
  });

  it("automatically releases when consumer funds after store", async function () {
    const [deployer, consumer, store, influencer] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const Escrow = await ethers.getContractFactory("CreatorCheckoutEscrow");
    const escrow = await Escrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    const price = 100n * 10n ** 6n;
    const commission = 2n * 10n ** 6n;

    const tx = await escrow.createDeal(
      consumer.address,
      store.address,
      influencer.address,
      price,
      commission
    );
    const receipt = await tx.wait();
    const dealCreatedEvent = receipt.logs.find(
      log => log.fragment && log.fragment.name === "DealCreated"
    );
    const dealId = dealCreatedEvent.args[0];

    // Mint funds
    await usdc.mint(consumer.address, price);
    await usdc.mint(store.address, commission);

    // Store funds first
    await usdc.connect(store).approve(await escrow.getAddress(), commission);
    await escrow.connect(store).fundStore(dealId);

    // Consumer funds second - this should auto-release
    await usdc.connect(consumer).approve(await escrow.getAddress(), price);
    await escrow.connect(consumer).fundConsumer(dealId);

    // Check payouts
    expect(await usdc.balanceOf(store.address)).to.equal(price);
    expect(await usdc.balanceOf(influencer.address)).to.equal(commission);
  });

  it("allows owner to refund if deal not completed", async function () {
    const [deployer, consumer, store, influencer] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const Escrow = await ethers.getContractFactory("CreatorCheckoutEscrow");
    const escrow = await Escrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    const price = 100n * 10n ** 6n;
    const commission = 2n * 10n ** 6n;

    const tx = await escrow.createDeal(
      consumer.address,
      store.address,
      influencer.address,
      price,
      commission
    );
    const receipt = await tx.wait();
    const dealCreatedEvent = receipt.logs.find(
      log => log.fragment && log.fragment.name === "DealCreated"
    );
    const dealId = dealCreatedEvent.args[0];

    // Only consumer funds
    await usdc.mint(consumer.address, price);
    await usdc.connect(consumer).approve(await escrow.getAddress(), price);
    await escrow.connect(consumer).fundConsumer(dealId);

    // Owner refunds
    await escrow.refund(dealId);

    // Check refund
    expect(await usdc.balanceOf(consumer.address)).to.equal(price);
  });

  it("prevents unauthorized funding", async function () {
    const [deployer, consumer, store, influencer, attacker] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const Escrow = await ethers.getContractFactory("CreatorCheckoutEscrow");
    const escrow = await Escrow.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    const price = 100n * 10n ** 6n;
    const commission = 2n * 10n ** 6n;

    const tx = await escrow.createDeal(
      consumer.address,
      store.address,
      influencer.address,
      price,
      commission
    );
    const receipt = await tx.wait();
    const dealCreatedEvent = receipt.logs.find(
      log => log.fragment && log.fragment.name === "DealCreated"
    );
    const dealId = dealCreatedEvent.args[0];

    // Attacker tries to fund as consumer
    await usdc.mint(attacker.address, price);
    await usdc.connect(attacker).approve(await escrow.getAddress(), price);
    await expect(escrow.connect(attacker).fundConsumer(dealId)).to.be.revertedWithCustomError(escrow, "Unauthorized");
  });
});
