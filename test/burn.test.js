import { expect } from "chai";
import { describe, it, before, afterEach } from "mocha";

import hre from "hardhat";
const ethers = hre.ethers;

import { deployKudzuAndBurn, getParsedEventLogs, prepareKudzuForTests } from "../scripts/utils.js";

let snapshot;
describe("KudzuBurn Tests", function () {
  this.timeout(50000000);
  before(async function () {
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });
  afterEach(async function () {
    await hre.network.provider.send("evm_revert", [snapshot]);
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });

  it("deploy works", async () => {
    await deployKudzuAndBurn();
  });

  it.skip("has all the correct interfaces", async () => {
    const interfaces = [
      { name: "ERC165", id: "0x01ffc9a7", supported: false },
      { name: "ERC1155", id: "0xd9b67a26", supported: false },
      { name: "ERC1155Metadata", id: "0x0e89341c", supported: false },
      { name: "ERC721", id: "0x80ac58cd", supported: false },
      { name: "ERC721Metadata", id: "0x5b5e139f", supported: false },
      { name: "ERC4906MetadataUpdate", id: "0x49064906", supported: false },
      { name: "ERC721Enumerable", id: "0x780e9d63", supported: false },
      { name: "ERC2981", id: "0x2a55205a", supported: false },
      { name: "ERC20", id: "0x36372b07", supported: false },
      { name: "RANDOM", id: "0x36372b08", supported: false },
      { name: "ITokenMetadata", id: "0xe99684b9", supported: false },
      { name: "IERC1155MintablePayable", id: "0x156e29f6", supported: false },
      { name: "Ownable", id: "0x0e083076", supported: true },
    ];
    const { KudzuBurn } = await deployKudzuAndBurn();

    for (let i = 0; i < interfaces.length; i++) {
      const { name, id, supported } = interfaces[i];
      const supportsInterface2 = await KudzuBurn.supportsInterface(id);
      expect(name + supportsInterface2).to.equal(name + supported);
    }
  });

  it("ensures onlyOwner is applied correctly", async () => {
    const [deployer, notdeployer] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn();
    const functions = [
      { name: "updateBurnAddress", params: [notdeployer.address] },
      { name: "updateBurnPoint", params: [0] },
      { name: "updateNewStrainBonus", params: [0] },
      { name: "updateEndDate", params: [0, 0] },
      { name: "recoverFunds", params: [0, 0] },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(
        KudzuBurn.connect(notdeployer)[name](...params)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(KudzuBurn.connect(deployer)[name](...params)).to.not.be
        .reverted;
    }
  });

  it("has the correct dates", async () => {
    const startingDate = "April 20, 2025";
    const convertDateToUnix = (date) =>
      Math.floor(new Date(date + " UTC").getTime() / 1000);
    const startingDataUnix = convertDateToUnix(startingDate);
    const { KudzuBurn } = await deployKudzuAndBurn();
    for (let i = 0; i < 13; i++) {
      const round = await KudzuBurn.rounds(i);
      const endDate = round[1];
      const monthsSinceStart = 3 * i;
      const expectedDate = new Date(startingDataUnix * 1000);
      expectedDate.setMonth(expectedDate.getMonth() + monthsSinceStart);
      const expectedUnix = expectedDate.getTime() / 1000;
      expect(endDate).to.equal(expectedUnix);
    }
  });

  it("ensure prepareKudzuForTests works", async () => {
    const [, acct1, acct2, acct3, acct4, acct5] = await ethers.getSigners();
    const { Kudzu } = await deployKudzuAndBurn({ mock: true });

    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [{ address: acct2.address, strainIndex: 0 }],
      },
      {
        address: acct3,
        quantity: 2,
        infected: [
          { address: acct4.address, strainIndex: 0 },
          { address: acct5.address, strainIndex: 1 },
        ],
      },
    ];

    // 5 accounts infected with following balances
    // acct1: 10 of token id 1
    // acct2: 1 of token id 1
    // acct3: 10 of token id 2
    // acct3: 10 of token id 3
    // acct4: 1 of token id 2
    // acct5: 1 of token id 3
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // confirm quantities are correct
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(10);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct2.address, tokenIds[0])
    ).to.equal(1);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct3.address, tokenIds[1])
    ).to.equal(10);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct4.address, tokenIds[1])
    ).to.equal(1);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct3.address, tokenIds[2])
    ).to.equal(10);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct5.address, tokenIds[2])
    ).to.equal(1);
  });

  it("burn works", async () => {
    const [, acct1, acct2, acct3, acct4, acct5] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    const burnPoint = await KudzuBurn.burnPoint();
    const newStrainBonus = await KudzuBurn.newStrainBonus();

    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [{ address: acct2.address, strainIndex: 0 }],
      },
    ];

    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // transfer works
    await Kudzu.connect(acct1).safeTransferFrom(
      acct1.address,
      acct2.address,
      tokenIds[0],
      1,
      "0x"
    );
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(9);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct2.address, tokenIds[0])
    ).to.equal(2);

    // burn fails before approval is set
    await expect(KudzuBurn.connect(acct1).burn(tokenIds[0], 1)).to.be.reverted;

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);

    const tx = await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);
    const receipt = await tx.wait();
    const events = await getParsedEventLogs(
      receipt,
      KudzuBurn,
      "PointsRewarded"
    );
    expect(events[0].pretty.points).to.equal(burnPoint);
    expect(events[1].pretty.points).to.equal(newStrainBonus);

    const winningAddress = await KudzuBurn.getWinningAddress();
    expect(winningAddress).to.equal(acct1.address);

    await Kudzu.connect(acct2).setApprovalForAll(KudzuBurn.target, true);
    await KudzuBurn.connect(acct2).burn(tokenIds[0], 1);
    const winningAddress2 = await KudzuBurn.getWinningAddress();
    // first to make the score should be in first place
    expect(winningAddress2).to.equal(acct1.address);

    const acct1Points = await KudzuBurn.getPoints(acct1.address);
    expect(acct1Points).to.equal(burnPoint + newStrainBonus);

    const acct2Points = await KudzuBurn.getPoints(acct2.address);
    expect(acct2Points).to.equal(burnPoint + newStrainBonus);

    const getRank1 = await KudzuBurn.getRank(0);
    expect(getRank1).to.equal(acct1.address);

    const getRank2 = await KudzuBurn.getRank(1);
    expect(getRank2).to.equal(acct2.address);

    await KudzuBurn.connect(acct2).burn(tokenIds[0], 1);

    const acct2Points2 = await KudzuBurn.getPoints(acct2.address);
    expect(acct2Points2).to.equal(burnPoint * 2n + newStrainBonus);

    const acct1Points2 = await KudzuBurn.getPoints(acct1.address);
    expect(acct1Points2).to.equal(burnPoint + newStrainBonus);

    const winningAddress3 = await KudzuBurn.getWinningAddress();
    expect(winningAddress3).to.equal(acct2.address);

    const getRank3 = await KudzuBurn.getRank(0);
    expect(getRank3).to.equal(acct2.address);

    const getRank4 = await KudzuBurn.getRank(1);
    expect(getRank4).to.equal(acct1.address);
  });

  it("adminReward and adminPunish work correctly", async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Test adminReward
    await KudzuBurn.connect(deployer).adminReward(acct1.address, 10);
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(10);
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct1.address);

    // Test multiple rewards
    await KudzuBurn.connect(deployer).adminReward(acct2.address, 15);
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(15);
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct2.address);

    // Test adminPunish
    await KudzuBurn.connect(deployer).adminPunish(acct2.address, 10);
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(5);
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct1.address);

    // Test that non-owners cannot use these functions
    await expect(
      KudzuBurn.connect(acct1).adminReward(acct1.address, 10)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      KudzuBurn.connect(acct1).adminPunish(acct2.address, 10)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // Verify rankings
    expect(await KudzuBurn.getRank(0)).to.equal(acct1.address);
    expect(await KudzuBurn.getRank(1)).to.equal(acct2.address);
  });

  it("burn calls rewardWinner when round is over", async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Setup initial state
    const recipients = [{
      address: acct1,
      quantity: 1,
      infected: []
    }, {
      address: acct2,
      quantity: 1,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);
    await Kudzu.connect(acct2).setApprovalForAll(KudzuBurn.target, true);

    await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);
    expect(await KudzuBurn.getRank(0)).to.equal(acct1.address);

    await KudzuBurn.connect(acct2).burn(tokenIds[1], 1);
    expect(await KudzuBurn.getRank(1)).to.equal(acct2.address);

    // Fund the round
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther("1.0")
    });

    // Fast forward time to after round end
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send("evm_setNextBlockTimestamp", [parseInt(roundEndTime[1]) + 1]);
    await hre.network.provider.send("evm_mine");

    // Get initial balances
    const initialBalance = await ethers.provider.getBalance(acct1.address);

    // Perform burn which should trigger reward
    const tx = await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);
    const receipt = await tx.wait();

    // Verify reward was distributed
    const finalBalance = await ethers.provider.getBalance(acct1.address);
    expect(finalBalance).to.be.gt(initialBalance); // Account for gas costs

    // Verify round advanced
    expect(await KudzuBurn.currentRound()).to.equal(1);

    // Verify EthMoved event was emitted
    const ethMovedEvents = receipt.logs.filter(
      log => log.fragment && log.fragment.name === 'EthMoved'
    );
    expect(ethMovedEvents.length).to.equal(1);
    expect(ethMovedEvents[0].args.to).to.equal(acct1.address);
    expect(ethMovedEvents[0].args.success).to.be.true;
    expect(ethMovedEvents[0].args.amount).to.equal(ethers.parseEther("1.0"));
  });

  it("fundRound works and validates round indices", async () => {
    const [deployer, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });


    // Setup initial state
    const recipients = [{
      address: acct1,
      quantity: 1,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);

    await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);
    expect(await KudzuBurn.getRank(0)).to.equal(acct1.address);

    const fundAmount = ethers.parseEther("1.0");


    // Test successful funding of current round
    await KudzuBurn.fundRound(0, { value: fundAmount });
    const round0 = await KudzuBurn.rounds(0);
    expect(round0.payoutToRecipient).to.equal(fundAmount);

    // Test funding future valid round
    await KudzuBurn.fundRound(12, { value: fundAmount });
    const round12 = await KudzuBurn.rounds(12);
    expect(round12.payoutToRecipient).to.equal(fundAmount);

    // Test invalid round index (13)
    await expect(
      KudzuBurn.fundRound(13, { value: fundAmount })
    ).to.be.revertedWith("Invalid round index");



    // Fast forward past round 0
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send("evm_setNextBlockTimestamp", [parseInt(roundEndTime.endDate) + 1]);
    await hre.network.provider.send("evm_mine");

    // Trigger round advancement
    await KudzuBurn.rewardWinner();

    // Test funding past round (0) after advancement
    await expect(
      KudzuBurn.fundRound(0, { value: fundAmount })
    ).to.be.revertedWith("Round already over");
  });

  it("receive function calls rewardWinner when round is over", async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });


    // Send ETH directly to contract which should trigger reward
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther("1.0")
    });

    // Setup initial state
    const recipients = [{
      address: acct1,
      quantity: 1,
      infected: []
    }, {
      address: acct2,
      quantity: 1,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);
    await Kudzu.connect(acct2).setApprovalForAll(KudzuBurn.target, true);

    // Create a winner by burning tokens
    await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);
    expect(await KudzuBurn.getRank(0)).to.equal(acct1.address);

    await KudzuBurn.connect(acct2).burn(tokenIds[1], 1);
    expect(await KudzuBurn.getRank(1)).to.equal(acct2.address);

    // Fast forward time to after round end
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send("evm_setNextBlockTimestamp", [parseInt(roundEndTime[1]) + 1]);
    await hre.network.provider.send("evm_mine");

    const over = await KudzuBurn.isOver();
    expect(over).to.be.true;

    // Get initial balances
    const initialBalance = await ethers.provider.getBalance(acct1.address);

    // Send ETH directly to contract which should trigger reward
    const tx = await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther("1.0")
    });
    const receipt = await tx.wait();

    // Verify reward was distributed
    const finalBalance = await ethers.provider.getBalance(acct1.address);
    expect(finalBalance).to.be.gt(initialBalance);

    // Verify round advanced
    expect(await KudzuBurn.currentRound()).to.equal(1);

    const ethMovedEvents = await getParsedEventLogs(receipt, KudzuBurn, "EthMoved");
    expect(ethMovedEvents.length).to.equal(2);

    // First event should be the reward distribution
    expect(ethMovedEvents[0].args.to).to.equal(acct1.address);
    expect(ethMovedEvents[0].args.success).to.be.true;
    expect(ethMovedEvents[0].args.amount).to.equal(ethers.parseEther("1.0")); // No funds in round 0 yet

    // Second event should be the receive function recording the new funds
    expect(ethMovedEvents[1].args.to).to.equal(deployer.address);
    expect(ethMovedEvents[1].args.success).to.be.true;
    expect(ethMovedEvents[1].args.amount).to.equal(ethers.parseEther("1.0"));
  });

  it("burn fails when token transfer fails", async () => {
    const [deployer, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Setup initial state with no tokens
    const recipients = [{
      address: acct1,
      quantity: 1,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Try to burn without approval - this will fail the transfer
    // but the balance check in burn() should catch it
    await expect(
      KudzuBurn.connect(acct1).burn(tokenIds[0], 1)
    ).to.be.reverted;

    // Verify balance remained unchanged
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(10);
  });

  it("burn fails under various invalid conditions", async () => {
    const [deployer, acct1, randomAccount] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Setup initial state
    const recipients = [{
      address: acct1,
      quantity: 1,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Approve KudzuBurn to handle tokens
    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);

    // Try to burn non-existent token ID
    const nonExistentTokenId = 999999;
    await expect(
      KudzuBurn.connect(acct1).burn(nonExistentTokenId, 1)
    ).to.be.reverted;

    // Try to burn when caller has no tokens
    await expect(
      KudzuBurn.connect(randomAccount).burn(tokenIds[0], 1)
    ).to.be.reverted;

    // Verify original balance remains unchanged
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(10);

    // Successfully burn one token to verify the function works normally
    await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);

    // Verify balance decreased by exactly 1
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(9);
  });

  it("rewardWinner fails when round is not over", async () => {
    const [deployer, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Setup initial state with a winner
    const recipients = [{
      address: acct1,
      quantity: 1,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);
    await KudzuBurn.connect(acct1).burn(tokenIds[0], 1);

    // Fund the round
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther("1.0")
    });

    // Verify round is not over
    const over = await KudzuBurn.isOver();
    expect(over).to.be.false;

    // Try to call rewardWinner - should fail
    await expect(
      KudzuBurn.rewardWinner()
    ).to.be.revertedWith("Current round is not over");
  });

  it("reverts when all rounds are over", async () => {
    const accounts = await ethers.getSigners();
    const [deployer, acct1] = accounts;
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Setup initial state with a winner
    const recipients = [{
      address: acct1,
      quantity: 2,
      infected: []
    }];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);

    // Progress through all 13 rounds
    for (let i = 0; i < 13; i++) {
      // Create a winner and fund each round
      await KudzuBurn.connect(acct1).burn(tokenIds[i < 9 ? 0 : 1], 1);
      await deployer.sendTransaction({
        to: KudzuBurn.target,
        value: ethers.parseEther("1.0")
      });

      // Fast forward to end of round
      const roundEndTime = await KudzuBurn.rounds(i);
      await hre.network.provider.send("evm_setNextBlockTimestamp", [parseInt(roundEndTime[1]) + 1]);
      await hre.network.provider.send("evm_mine");

      // Trigger round advancement
      await KudzuBurn.rewardWinner();
    }

    // Verify we're past the last round
    expect(await KudzuBurn.currentRound()).to.equal(13);

    // Try to call functions that use isOver - should all revert
    await expect(
      KudzuBurn.isOver()
    ).to.be.revertedWith("All rounds are over");

    await expect(
      KudzuBurn.burn(tokenIds[0], 1)
    ).to.be.revertedWith("All rounds are over");

    await expect(
      deployer.sendTransaction({
        to: KudzuBurn.target,
        value: ethers.parseEther("1.0")
      })
    ).to.be.revertedWith("All rounds are over");
  });

  it("adminMassReward and adminMassPunish work correctly and emit events", async () => {
    const [deployer, acct1, acct2, acct3] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    const addresses = [acct1.address, acct2.address, acct3.address];
    const quantities = [10, 20, 30];

    // Test adminMassReward
    const rewardTx = await KudzuBurn.adminMassReward(addresses, quantities);
    const rewardReceipt = await rewardTx.wait();

    // Check events
    const rewardEvents = await getParsedEventLogs(rewardReceipt, KudzuBurn, "PointsRewarded");
    expect(rewardEvents.length).to.equal(3);

    // Verify each reward event
    for (let i = 0; i < rewardEvents.length; i++) {
      expect(rewardEvents[i].args.to).to.equal(addresses[i]);
      expect(rewardEvents[i].args.tokenId).to.equal(0);
      expect(rewardEvents[i].args.points).to.equal(quantities[i]);
    }

    // Verify points were awarded correctly
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(10);
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(20);
    expect(await KudzuBurn.getPoints(acct3.address)).to.equal(30);

    // Verify rankings
    expect(await KudzuBurn.getRank(0)).to.equal(acct3.address); // 30 points
    expect(await KudzuBurn.getRank(1)).to.equal(acct2.address); // 20 points
    expect(await KudzuBurn.getRank(2)).to.equal(acct1.address); // 10 points

    // Test adminMassPunish
    const punishQuantities = [5, 15, 10];
    const punishTx = await KudzuBurn.adminMassPunish(addresses, punishQuantities);
    const punishReceipt = await punishTx.wait();

    // Check events
    const punishEvents = await getParsedEventLogs(punishReceipt, KudzuBurn, "PointsRewarded");
    expect(punishEvents.length).to.equal(3);

    // Verify each punish event
    for (let i = 0; i < punishEvents.length; i++) {
      expect(punishEvents[i].args.to).to.equal(addresses[i]);
      expect(punishEvents[i].args.tokenId).to.equal(0);
      expect(punishEvents[i].args.points).to.equal(-1 * punishQuantities[i]); // Should be negative
    }

    const newBalances = [5, 5, 20]
    // Verify points were deducted correctly
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(newBalances[0]);  // 10 - 5
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(newBalances[1]);  // 20 - 15
    expect(await KudzuBurn.getPoints(acct3.address)).to.equal(newBalances[2]); // 30 - 10

    // Verify new rankings
    expect(await KudzuBurn.getRank(0)).to.equal(acct3.address); // 20 points
    expect(await KudzuBurn.getRank(1)).to.equal(acct1.address); // 5 points
    expect(await KudzuBurn.getRank(2)).to.equal(acct2.address); // 5 points

    // Test that points can't go negative
    const excessivePunishQuantities = [10, 20, 30];
    const massPunishTx = await KudzuBurn.adminMassPunish(addresses, excessivePunishQuantities);
    const massPunishReceipt = await massPunishTx.wait();
    const massPunishEvents = await getParsedEventLogs(massPunishReceipt, KudzuBurn, "PointsRewarded");
    expect(massPunishEvents.length).to.equal(6);
    for (let i = 0; i < massPunishEvents.length; i++) {
      const ii = Math.floor(i / 2)
      if (i % 2 === 0) {
        expect(massPunishEvents[i].args.to).to.equal(addresses[ii]);
        expect(massPunishEvents[i].args.tokenId).to.equal(0);
        expect(massPunishEvents[i].args.points).to.equal(-1 * excessivePunishQuantities[ii]);
      } else {
        const resultingBalance = newBalances[ii] - excessivePunishQuantities[ii];
        expect(massPunishEvents[i].args.points).to.equal(-1 * resultingBalance);
      }
    }

    // Verify points bottom out at 0
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(0);  // 5 - 10 = 0 (not -5)
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(0);  // 5 - 20 = 0 (not -15)
    expect(await KudzuBurn.getPoints(acct3.address)).to.equal(0);  // 20 - 30 = 0 (not -10)

    const zeroAddress = ethers.ZeroAddress;
    // Verify rankings after zeroing out
    expect(await KudzuBurn.getRank(0)).to.equal(zeroAddress); // All tied at 0
    expect(await KudzuBurn.getRank(1)).to.equal(zeroAddress); // Order preserved for ties
    expect(await KudzuBurn.getRank(2)).to.equal(zeroAddress);

    // Test array length mismatch
    await expect(
      KudzuBurn.adminMassReward(addresses, [10, 20])
    ).to.be.revertedWith("Arrays must be same length");

    await expect(
      KudzuBurn.adminMassPunish(addresses, [10, 20])
    ).to.be.revertedWith("Arrays must be same length");

    // Test non-owner access
    await expect(
      KudzuBurn.connect(acct1).adminMassReward(addresses, quantities)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await expect(
      KudzuBurn.connect(acct1).adminMassPunish(addresses, quantities)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
