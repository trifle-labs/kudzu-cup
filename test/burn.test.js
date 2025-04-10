import { expect } from 'chai';
import { afterEach, before, describe, it } from 'mocha';

import hre from 'hardhat';
const ethers = hre.ethers;

import {
  deployKudzuAndBurn,
  getParsedEventLogs,
  prepareKudzuForTests,
  printTree,
} from '../scripts/utils.js';

let snapshot;
describe('KudzuBurn Tests', function () {
  this.timeout(50000000);
  before(async function () {
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });
  afterEach(async function () {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('deploy works', async () => {
    await deployKudzuAndBurn();
  });

  it('ensures onlyOwner is applied correctly', async () => {
    const [deployer, notdeployer] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn();
    const functions = [
      { name: 'updateKudzuBurnController', params: [notdeployer.address] },
      { name: 'updateEndDate', params: [0, 0] },
      { name: 'recoverFunds', params: [notdeployer.address, 0, 0] },
      { name: 'updatePaused', params: [false] },
      { name: 'adminReward', params: [notdeployer.address, 1, 1] },
      { name: 'adminPunish', params: [notdeployer.address, 1, 1] },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(
        KudzuBurn.connect(notdeployer)[name](...params),
        name
      ).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(KudzuBurn.connect(deployer)[name](...params), name).to.not.be
        .reverted;
    }
  });

  it('can recover funds', async () => {
    const value = ethers.parseEther('1.0');
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });
    for (let i = 0; i < 13; i++) {
      await KudzuBurn.fundRound(i, { value });
    }

    const zeroAddress = ethers.ZeroAddress;
    for (let i = 0; i < 13; i++) {
      await KudzuBurn.recoverFunds(zeroAddress, i, value);
    }
    const zeroBalance = await ethers.provider.getBalance(zeroAddress);
    expect(zeroBalance).to.equal(13n * value);
  });

  it('has the correct dates', async () => {
    const startingDate = 'April 20, 2025, 16:20 GMT+0000';
    const convertDateToUnix = (date) =>
      Math.floor(new Date(date + ' UTC').getTime() / 1000);
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

  it('ensure prepareKudzuForTests works', async () => {
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
      await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])
    ).to.equal(10);
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct2.address, tokenIds[0])
    ).to.equal(1);
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct3.address, tokenIds[1])
    ).to.equal(10);
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct4.address, tokenIds[1])
    ).to.equal(1);
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct3.address, tokenIds[2])
    ).to.equal(10);
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct5.address, tokenIds[2])
    ).to.equal(1);
  });

  it('adminReward and adminPunish work correctly', async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Test adminReward
    await KudzuBurn.connect(deployer).adminReward(acct1.address, 10, 0);
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(10);
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct1.address);

    // Test multiple rewards
    await KudzuBurn.connect(deployer).adminReward(acct2.address, 15, 0);
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(15);
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct2.address);

    // Test adminPunish
    await KudzuBurn.connect(deployer).adminPunish(acct2.address, 10, 0);
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(5);
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct1.address);

    // Test that non-owners cannot use these functions
    await expect(
      KudzuBurn.connect(acct1).adminReward(acct1.address, 10, 0)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await expect(
      KudzuBurn.connect(acct1).adminPunish(acct2.address, 10, 0)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    // Verify rankings
    expect(await KudzuBurn.getOwnerAtRank(0)).to.equal(acct1.address);
    expect(await KudzuBurn.getOwnerAtRank(1)).to.equal(acct2.address);
  });

  it('fundRound works and validates round indices', async () => {
    const [deployer, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    // Setup initial state
    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );

    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    expect(await KudzuBurn.getOwnerAtRank(0)).to.equal(acct1.address);

    const fundAmount = ethers.parseEther('1.0');

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
    ).to.be.revertedWith('Invalid round index');

    // Fast forward past round 0
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(roundEndTime.endDate) + 1,
    ]);
    await hre.network.provider.send('evm_mine');

    // Trigger round advancement
    await KudzuBurn.rewardWinner();

    // Test funding past round (0) after advancement
    await expect(
      KudzuBurn.fundRound(0, { value: fundAmount })
    ).to.be.revertedWith('Round already over');
  });

  // Helper function to convert rank to index
  function rankToIndex(size, rank) {
    return Number(size) - 1 - Number(rank);
  }

  // Helper function to get owner at rank
  async function getOwnerAtRank(kudzuBurn, rank) {
    const size = await kudzuBurn.size();
    // Convert rank to index (highest rank is size-1, lowest rank is 0)
    const index = rankToIndex(size, rank);
    return kudzuBurn.getOwnerAtIndex(index);
  }

  it('receive function calls rewardWinner when round is over', async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    // Send ETH directly to contract which should trigger reward
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther('1.0'),
    });

    // Setup initial state
    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [],
      },
      {
        address: acct2,
        quantity: 1,
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    await Kudzu.connect(acct2).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    // Create a winner by burning tokens
    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    expect(await getOwnerAtRank(KudzuBurn, 0)).to.equal(acct1.address);
    await KudzuBurnController.connect(acct2).burn(tokenIds[1], 1);
    expect(await getOwnerAtRank(KudzuBurn, 1)).to.equal(acct2.address);

    // Fast forward time to after round end
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(roundEndTime[1]) + 1,
    ]);
    await hre.network.provider.send('evm_mine');

    const over = await KudzuBurn.isOver();
    expect(over).to.be.true;

    // Get initial balances
    const initialBalance = await ethers.provider.getBalance(acct1.address);

    // Send ETH directly to contract which should trigger reward
    const tx = await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther('1.0'),
    });
    const receipt = await tx.wait();

    // Verify reward was distributed
    const finalBalance = await ethers.provider.getBalance(acct1.address);
    expect(finalBalance).to.be.gt(initialBalance);

    // Verify round advanced
    expect(await KudzuBurn.currentRound()).to.equal(1);

    const ethMovedEvents = await getParsedEventLogs(
      receipt,
      KudzuBurn,
      'EthMoved'
    );
    expect(ethMovedEvents.length).to.equal(2);

    // First event should be the reward distribution
    expect(ethMovedEvents[0].args.to).to.equal(acct1.address);
    expect(ethMovedEvents[0].args.success).to.be.true;
    expect(ethMovedEvents[0].args.amount).to.equal(ethers.parseEther('1.0')); // No funds in round 0 yet

    // Second event should be the receive function recording the new funds
    expect(ethMovedEvents[1].args.to).to.equal(deployer.address);
    expect(ethMovedEvents[1].args.success).to.be.true;
    expect(ethMovedEvents[1].args.amount).to.equal(ethers.parseEther('1.0'));
  });

  it('rewardWinner fails when round is not over', async () => {
    const [deployer, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    // Setup initial state with a winner
    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);

    // Fund the round
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther('1.0'),
    });

    // Verify round is not over
    const over = await KudzuBurn.isOver();
    expect(over).to.be.false;

    // Call rewardWinner - should do nothing (return without effect)
    const initialRound = await KudzuBurn.currentRound();
    await KudzuBurn.rewardWinner();
    const finalRound = await KudzuBurn.currentRound();

    // Round should not advance since round is not over
    expect(finalRound).to.equal(initialRound);
  });

  it('adminMassReward and adminMassPunish work correctly and emit events', async () => {
    const [deployer, acct1, acct2, acct3] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    const addresses = [acct1.address, acct2.address, acct3.address];
    const quantities = [10, 20, 30];
    const rewardIds = [0, 0, 0];

    // Test adminMassReward
    const rewardTx = await KudzuBurn.adminMassReward(
      addresses,
      quantities,
      rewardIds
    );
    const rewardReceipt = await rewardTx.wait();

    // Check events
    const rewardEvents = await getParsedEventLogs(
      rewardReceipt,
      KudzuBurn,
      'PointsRewarded'
    );
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

    // Verify rankings - highest points (acct3) should be rank 0
    expect(await getOwnerAtRank(KudzuBurn, 0)).to.equal(acct3.address); // 30 points
    expect(await getOwnerAtRank(KudzuBurn, 1)).to.equal(acct2.address); // 20 points
    expect(await getOwnerAtRank(KudzuBurn, 2)).to.equal(acct1.address); // 10 points

    // Test adminMassPunish
    const punishQuantities = [5, 15, 10];
    const punishTx = await KudzuBurn.adminMassPunish(
      addresses,
      punishQuantities,
      rewardIds
    );
    const punishReceipt = await punishTx.wait();

    // Check events
    const punishEvents = await getParsedEventLogs(
      punishReceipt,
      KudzuBurn,
      'PointsRewarded'
    );
    expect(punishEvents.length).to.equal(3);

    // Verify each punish event
    for (let i = 0; i < punishEvents.length; i++) {
      expect(punishEvents[i].args.to).to.equal(addresses[i]);
      expect(punishEvents[i].args.tokenId).to.equal(0);
      expect(punishEvents[i].args.points).to.equal(-1 * punishQuantities[i]); // Should be negative
    }

    const newBalances = [5, 5, 20];
    // Verify points were deducted correctly
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(newBalances[0]); // 10 - 5 = 5
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(newBalances[1]); // 20 - 15 = 5
    expect(await KudzuBurn.getPoints(acct3.address)).to.equal(newBalances[2]); // 30 - 10 = 20

    const nonceAcct1 = await KudzuBurn.getNonce(acct1.address);
    const nonceAcct2 = await KudzuBurn.getNonce(acct2.address);
    expect(nonceAcct1).to.be.lessThan(nonceAcct2);
    // Verify new rankings
    expect(await getOwnerAtRank(KudzuBurn, 0)).to.equal(acct3.address); // 20 points
    expect(await getOwnerAtRank(KudzuBurn, 1)).to.equal(acct1.address); // 5 points
    expect(await getOwnerAtRank(KudzuBurn, 2)).to.equal(acct2.address); // 5 points

    // Test that points can't go negative
    const excessivePunishQuantities = [10, 20, 30];
    const massPunishTx = await KudzuBurn.adminMassPunish(
      addresses,
      excessivePunishQuantities,
      rewardIds
    );
    const massPunishReceipt = await massPunishTx.wait();
    const massPunishEvents = await getParsedEventLogs(
      massPunishReceipt,
      KudzuBurn,
      'PointsRewarded'
    );
    expect(massPunishEvents.length).to.equal(3);
    for (let i = 0; i < massPunishEvents.length; i++) {
      expect(massPunishEvents[i].args.to).to.equal(addresses[i]);
      expect(massPunishEvents[i].args.tokenId).to.equal(0);
      expect(massPunishEvents[i].args.points).to.equal(-1 * newBalances[i]);
    }

    // Verify points bottom out at 0
    expect(await KudzuBurn.getPoints(acct1.address)).to.equal(0); // 5 - 10 = 0 (not -5)
    expect(await KudzuBurn.getPoints(acct2.address)).to.equal(0); // 5 - 20 = 0 (not -15)
    expect(await KudzuBurn.getPoints(acct3.address)).to.equal(0); // 20 - 30 = 0 (not -10)

    // Test array length mismatch
    await expect(
      KudzuBurn.adminMassReward(addresses, [10, 20], rewardIds)
    ).to.be.revertedWith('Arrays must be same length');

    await expect(
      KudzuBurn.adminMassPunish(addresses, [10, 20], rewardIds)
    ).to.be.revertedWith('Arrays must be same length');

    await expect(
      KudzuBurn.adminMassReward(addresses, quantities, [0, 0])
    ).to.be.revertedWith('Arrays must be same length');

    await expect(
      KudzuBurn.adminMassPunish(addresses, quantities, [0, 0])
    ).to.be.revertedWith('Arrays must be same length');

    // Test non-owner access
    await expect(
      KudzuBurn.connect(acct1).adminMassReward(addresses, quantities, rewardIds)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await expect(
      KudzuBurn.connect(acct1).adminMassPunish(addresses, quantities, rewardIds)
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('ensures onlyController modifier works correctly', async () => {
    const [deployer, notController] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn();

    // Try to call updateTreeOnlyController as non-controller
    await expect(
      KudzuBurn.connect(notController).updateTreeOnlyController(
        notController.address,
        1,
        true,
        0
      )
    ).to.be.revertedWith('Only KudzuBurnController can call this function');

    // Set notController as the controller
    await KudzuBurn.updateKudzuBurnController(notController.address);

    // Should now work with the correct controller
    await expect(
      KudzuBurn.connect(notController).updateTreeOnlyController(
        notController.address,
        1,
        true,
        0
      )
    ).to.not.be.reverted;
  });

  it('ensures paused functionality works correctly', async () => {
    const [deployer, user] = await ethers.getSigners();
    const { KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn();

    // Set user as controller for testing
    await KudzuBurn.updateKudzuBurnController(user.address);

    // Initially not paused
    expect(await KudzuBurn.paused()).to.be.false;

    // Pause the contract
    await KudzuBurn.updatePaused(true);
    expect(await KudzuBurn.paused()).to.be.true;

    // Check that updateTreeOnlyController fails when paused
    await expect(
      KudzuBurn.connect(user).updateTreeOnlyController(user.address, 1, true, 0)
    ).to.be.revertedWith('Contract is paused');

    // Check that rewardWinner fails when paused
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(roundEndTime[1]) + 1,
    ]);
    await hre.network.provider.send('evm_mine');

    await expect(KudzuBurn.rewardWinner()).to.be.revertedWith(
      'Contract is paused'
    );

    // Unpause and verify operations work again
    await KudzuBurn.updatePaused(false);
    expect(await KudzuBurn.paused()).to.be.false;

    // Should now work
    await expect(
      KudzuBurn.connect(user).updateTreeOnlyController(user.address, 1, true, 0)
    ).to.not.be.reverted;

    // Verify only owner can update pause state
    await expect(KudzuBurn.connect(user).updatePaused(true)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
  });

  it('ranks ties correctly', async () => {
    const accounts = await ethers.getSigners();
    const [deployer] = accounts;
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    await KudzuBurn.updateKudzuBurnController(deployer.address);

    // First round: Add 100 points to each account in order
    // console.log('\nFirst round - Adding 100 points to each account:');
    for (let i = 0; i < 6; i++) {
      const acct = accounts[i];
      // console.log(`Adding 100 points to ${acct.address} (index ${i})`);
      await KudzuBurn.updateTreeOnlyController(acct.address, 100, true, 123);

      // Print current points and rank for verification
      const points = await KudzuBurn.getPoints(acct.address);
      const rank = await KudzuBurn.getOwnerAtRank(i);
      // console.log(`Account ${i} now has ${points} points and is at rank ${i}`);

      // Verify points and rank
      expect(points).to.equal(100);
      expect(rank).to.equal(acct.address);
    }

    // Second round: Add another 100 points in reverse order
    // console.log('\nSecond round - Adding another 100 points in reverse order:');
    for (let i = 5; i >= 0; i--) {
      const acct = accounts[i];
      // console.log(`Adding 100 points to ${acct.address} (index ${i})`);
      await KudzuBurn.updateTreeOnlyController(acct.address, 100, true, 123);

      // Print current points for verification
      const points = await KudzuBurn.getPoints(acct.address);
      // console.log(`Account ${i} now has ${points} points`);
      expect(points).to.equal(200);
    }

    // Print final rankings before removing points
    // console.log('\nRankings before removing points:');
    for (let i = 0; i < 6; i++) {
      const rank = await KudzuBurn.getOwnerAtRank(i);
      const points = await KudzuBurn.getPoints(rank);
      // console.log(`Rank ${i}: ${rank} with ${points} points`);
    }

    // Remove 100 points from account 5
    // console.log('\nRemoving 100 points from account 5:');
    await KudzuBurn.updateTreeOnlyController(
      accounts[5].address,
      100,
      false,
      123
    );

    // Print final rankings
    // console.log('\nFinal rankings after removing points:');
    for (let i = 0; i < 6; i++) {
      const rank = await KudzuBurn.getOwnerAtRank(i);
      const points = await KudzuBurn.getPoints(rank);
      // console.log(`Rank ${i}: ${rank} with ${points} points`);
    }

    // Verify account 5 is now at the end (rank 5)
    const lastRank = await KudzuBurn.getOwnerAtRank(5);
    expect(lastRank).to.equal(accounts[5].address);
    expect(await KudzuBurn.getPoints(lastRank)).to.equal(100);
  });

  it('removes first place after round is over', async () => {
    const accounts = await ethers.getSigners();
    const [deployer, acct1, acct2] = accounts;
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });
    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [{ address: acct2.address, strainIndex: 0 }],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    await Kudzu.connect(acct2).setApprovalForAll(
      KudzuBurnController.target,
      true
    );

    await KudzuBurnController.connect(acct2).burn(tokenIds[0], 1);

    const rank = await KudzuBurn.getOwnerAtRank(0);
    expect(rank).to.equal(acct2.address);

    const [value, player] = await KudzuBurn.getValueAndOwnerAtIndex(0);
    expect(player).to.equal(acct2.address);
    expect(value).to.equal(6);

    const points = await KudzuBurn.getPoints(acct2.address);
    expect(points).to.equal(6);

    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);

    const rank2 = await KudzuBurn.getOwnerAtRank(1);
    expect(rank2).to.equal(acct1.address);

    const points2 = await KudzuBurn.getPoints(acct1.address);
    expect(points2).to.equal(6);

    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);

    const rank3 = await KudzuBurn.getOwnerAtRank(0);
    expect(rank3).to.equal(acct1.address);

    const points3 = await KudzuBurn.getPoints(acct1.address);
    expect(points3).to.equal(7);

    await KudzuBurn.fundRound(0, { value: ethers.parseEther('1.0') });

    const [order, endDate, payoutToRecipient] = await KudzuBurn.rounds(0);
    expect(payoutToRecipient).to.equal(ethers.parseEther('1.0'));

    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(endDate) + 1,
    ]);
    await hre.network.provider.send('evm_mine');

    await KudzuBurn.rewardWinner();

    const rank4 = await KudzuBurn.getOwnerAtRank(0);
    expect(rank4).to.equal(acct2.address);
  });

  it('ensures getWinningAddress matches getOwnerAtRank(0)', async () => {
    const [deployer, acct1, acct2, acct3] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    // Add some points to create different rankings
    await KudzuBurn.adminReward(acct1.address, 10, 0);
    await KudzuBurn.adminReward(acct2.address, 10, 0);
    await KudzuBurn.adminReward(acct3.address, 10, 0);

    // Verify getWinningAddress matches getOwnerAtRank(0)
    expect(await KudzuBurn.getWinningAddress()).to.equal(
      await KudzuBurn.getOwnerAtRank(0)
    );
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct1.address);

    // Change rankings and verify again
    await KudzuBurn.adminReward(acct1.address, 15, 0);
    expect(await KudzuBurn.getWinningAddress()).to.equal(
      await KudzuBurn.getOwnerAtRank(0)
    );
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct1.address);

    // Remove points and verify
    await KudzuBurn.adminPunish(acct1.address, 20, 0);
    expect(await KudzuBurn.getWinningAddress()).to.equal(
      await KudzuBurn.getOwnerAtRank(0)
    );
    expect(await KudzuBurn.getWinningAddress()).to.equal(acct2.address);
  });

  // it.only('tests migration with many addresses', async () => {
  //   const {
  //     Kudzu,
  //     KudzuBurn: originalKudzuBurn,
  //     KudzuBurnController,
  //   } = await deployKudzuAndBurn({ mock: true });

  //   const groupSize = 9636;
  //   const chunksize = 100;

  //   const indexToAddress = (index) => {
  //     const id = ethers.id(index + '').slice(0, 42);
  //     return ethers.getAddress(id);
  //   };

  //   const allPoints = {};

  //   // Add 90 addresses with various scores
  //   for (let i = 0; i < groupSize; i++) {
  //     const points = Math.floor(Math.random() * 1000) + 1; // Random points between 1-1000
  //     const address = indexToAddress(i);
  //     allPoints[address] = points;
  //     await originalKudzuBurn.adminReward(address, points, 0);
  //   }

  //   // Deploy new KudzuBurn and update controller
  //   const KudzuBurnFactory = await ethers.getContractFactory('KudzuBurn');
  //   const newKudzuBurn = await KudzuBurnFactory.deploy(
  //     Kudzu.target,
  //     originalKudzuBurn.target
  //   );
  //   await newKudzuBurn.deploymentTransaction().wait();
  //   await KudzuBurnController.updateBurnAddress(newKudzuBurn.target);

  //   // Get original tree count

  //   // Test migration in chunks to measure gas
  //   const totalChunks = Math.ceil(groupSize / chunksize);
  //   const lastChunkSize = groupSize % chunksize;
  //   let totalGasUsed = 0n;
  //   for (let i = 0; i < totalChunks; i++) {
  //     const startIndex = i * chunksize;
  //     const chunk =
  //       i == totalChunks - 1 && lastChunkSize > 0 ? lastChunkSize : chunksize;
  //     const tx = await newKudzuBurn.migrateTree(startIndex, chunk);
  //     const receipt = await tx.wait();
  //     console.log(`Chunk ${i + 1}/${totalChunks} gas used: ${receipt.gasUsed}`);
  //     totalGasUsed += receipt.gasUsed;
  //     // Check gas used is under 20M
  //     expect(receipt.gasUsed).to.be.lt(25000000);
  //   }
  //   console.log(`Total gas used: ${totalGasUsed}`);
  //   const gasPrice = 18n * 10n ** 9n;
  //   const totalTiaUsed = BigInt(totalGasUsed) * gasPrice;
  //   const totalTiaUsedFormatted = totalTiaUsed / 10n ** 18n;
  //   console.log(
  //     `Total TIA used: ${totalTiaUsedFormatted}.${totalTiaUsed % 10n ** 18n}`
  //   );

  //   // Verify migration was successful
  //   for (let i = 0; i < groupSize; i++) {
  //     const address = indexToAddress(i);
  //     const originalPoints = await originalKudzuBurn.getPoints(address);
  //     expect(originalPoints).to.equal(allPoints[address]);

  //     const newPoints = await newKudzuBurn.getPoints(address);

  //     expect(newPoints).to.equal(originalPoints);
  //   }

  //   // Verify rankings maintained
  //   for (let i = 0; i < groupSize; i++) {
  //     const originalRank = await originalKudzuBurn.getOwnerAtRank(i);
  //     const newRank = await newKudzuBurn.getOwnerAtRank(i);
  //     expect(newRank).to.equal(originalRank);
  //   }
  // });
});
