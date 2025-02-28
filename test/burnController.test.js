import { expect } from 'chai';
import { afterEach, before, describe, it } from 'mocha';

import hre from 'hardhat';
const ethers = hre.ethers;

import {
  deployKudzuAndBurn,
  getParsedEventLogs,
  prepareKudzuForTests,
} from '../scripts/utils.js';

let snapshot;
describe('KudzuBurnController Tests', function () {
  this.timeout(50000000);
  before(async function () {
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });
  afterEach(async function () {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('deploy works', async () => {
    const { Kudzu, KudzuBurn, KudzuBurnController } =
      await deployKudzuAndBurn();
    expect(KudzuBurnController.target).to.not.equal(null);
    expect(KudzuBurn.target).to.not.equal(null);
    expect(Kudzu.target).to.not.equal(null);

    const kudzuBurnController = await KudzuBurn.kudzuBurnController();
    expect(kudzuBurnController).to.not.equal(null);
    expect(kudzuBurnController).to.equal(KudzuBurnController.target);
  });

  it('ensures onlyOwner is applied correctly', async () => {
    const [deployer, notdeployer] = await ethers.getSigners();
    const { KudzuBurnController } = await deployKudzuAndBurn();
    const functions = [
      { name: 'updateBurnAddress', params: [notdeployer.address] },
      { name: 'updateBurnPoint', params: [0] },
      { name: 'updateNewStrainBonus', params: [0] },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(
        KudzuBurnController.connect(notdeployer)[name](...params)
      ).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(KudzuBurnController.connect(deployer)[name](...params)).to
        .not.be.reverted;
    }
  });

  it('burn works', async () => {
    const [, acct1, acct2] = await ethers.getSigners();
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    const burnPoint = await KudzuBurnController.burnPoint();
    const newStrainBonus = await KudzuBurnController.newStrainBonus();

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
      2,
      '0x'
    );
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])
    ).to.equal(8);
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct2.address, tokenIds[0])
    ).to.equal(3);

    // burn fails before approval is set
    await expect(KudzuBurnController.connect(acct1).burn(tokenIds[0], 1)).to.be
      .reverted;

    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );

    const tx = await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    const receipt = await tx.wait();
    const events = await getParsedEventLogs(
      receipt,
      KudzuBurn,
      'PointsRewarded'
    );
    expect(events[0].pretty.points).to.equal(burnPoint);
    expect(events[1].pretty.points).to.equal(newStrainBonus);

    const winningAddress = await KudzuBurn.getWinningAddress();
    expect(winningAddress).to.equal(acct1.address);

    await Kudzu.connect(acct2).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    await KudzuBurnController.connect(acct2).burn(tokenIds[0], 1);
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

    await KudzuBurnController.connect(acct2).burn(tokenIds[0], 2);

    const acct2Points2 = await KudzuBurn.getPoints(acct2.address);
    expect(acct2Points2).to.equal(burnPoint * 3n + newStrainBonus);

    const winningAddress3 = await KudzuBurn.getWinningAddress();
    expect(winningAddress3).to.equal(acct2.address);

    const getRank3 = await KudzuBurn.getRank(0);
    expect(getRank3).to.equal(acct2.address);

    const getRank4 = await KudzuBurn.getRank(1);
    expect(getRank4).to.equal(acct1.address);
  });

  it('burn fails when token transfer fails', async () => {
    const [deployer, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Try to burn without approval - this will fail the transfer
    await expect(KudzuBurnController.connect(acct1).burn(tokenIds[0], 1)).to.be
      .reverted;

    // Verify balance remained unchanged
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])
    ).to.equal(10);
  });

  it('burn fails under various invalid conditions', async () => {
    const [deployer, acct1, randomAccount] = await ethers.getSigners();
    const { Kudzu, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Approve KudzuBurnController to handle tokens
    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );

    // Try to burn non-existent token ID
    const nonExistentTokenId = 999999;
    await expect(KudzuBurnController.connect(acct1).burn(nonExistentTokenId, 1))
      .to.be.reverted;

    // Try to burn when caller has no tokens
    await expect(
      KudzuBurnController.connect(randomAccount).burn(tokenIds[0], 1)
    ).to.be.reverted;

    // Verify original balance remains unchanged
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])
    ).to.equal(10);

    // Successfully burn one token to verify the function works normally
    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);

    // Verify balance decreased by exactly 1
    expect(
      await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])
    ).to.equal(9);
  });

  it('burn calls rewardWinner when round is over', async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
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

    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    expect(await KudzuBurn.getRank(0)).to.equal(acct1.address);

    await KudzuBurnController.connect(acct2).burn(tokenIds[1], 1);
    expect(await KudzuBurn.getRank(1)).to.equal(acct2.address);

    // Fund the round
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther('1.0'),
    });

    // Fast forward time to after round end
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(roundEndTime[1]) + 1,
    ]);
    await hre.network.provider.send('evm_mine');

    // Get initial balances
    const initialBalance = await ethers.provider.getBalance(acct1.address);

    // Perform burn which should trigger reward
    const tx = await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    const receipt = await tx.wait();

    // Verify reward was distributed
    const finalBalance = await ethers.provider.getBalance(acct1.address);
    expect(finalBalance).to.be.gt(initialBalance); // Account for gas costs

    // Verify round advanced
    expect(await KudzuBurn.currentRound()).to.equal(1);

    // Verify EthMoved event was emitted
    const ethMovedEvents = receipt.logs.filter(
      (log) => log.fragment && log.fragment.name === 'EthMoved'
    );
    expect(ethMovedEvents.length).to.equal(1);
    expect(ethMovedEvents[0].args.to).to.equal(acct1.address);
    expect(ethMovedEvents[0].args.success).to.be.true;
    expect(ethMovedEvents[0].args.amount).to.equal(ethers.parseEther('1.0'));
  });

  it('recoverFunds works correctly', async () => {
    const [deployer, notdeployer] = await ethers.getSigners();
    const { KudzuBurnController } = await deployKudzuAndBurn();

    // Fund the contract
    await deployer.sendTransaction({
      to: KudzuBurnController.target,
      value: ethers.parseEther('1.0'),
    });

    // Ensure non-owner cannot recover funds
    await expect(
      KudzuBurnController.connect(notdeployer).recoverFunds(
        ethers.parseEther('1.0')
      )
    ).to.be.revertedWith('Ownable: caller is not the owner');

    // Get initial balance
    const initialBalance = await ethers.provider.getBalance(deployer.address);

    // Recover funds
    const tx = await KudzuBurnController.recoverFunds(ethers.parseEther('1.0'));
    const receipt = await tx.wait();

    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    // Verify balance increased (accounting for gas costs)
    const finalBalance = await ethers.provider.getBalance(deployer.address);
    expect(finalBalance).to.equal(
      initialBalance + ethers.parseEther('1.0') - gasUsed
    );
    // Verify EthMoved event was emitted correctly
    const ethMovedEvents = receipt.logs.filter(
      (log) => log.fragment && log.fragment.name === 'EthMoved'
    );
    expect(ethMovedEvents.length).to.equal(1);
    expect(ethMovedEvents[0].args.to).to.equal(deployer.address);
    expect(ethMovedEvents[0].args.success).to.be.true;
    expect(ethMovedEvents[0].args.amount).to.equal(ethers.parseEther('1.0'));
  });

  const bonfireTimes = [
    { date: 'Wednesday, March 5, 2025 16:20:00 GMT', quotient: 5 }, // W
    { date: 'Friday, March 14, 2025 00:20:00 GMT', quotient: 6 }, // F
    { date: 'Saturday, March 22, 2025 08:20:00 GMT', quotient: 7 }, // S
    { date: 'Sunday, March 30, 2025 16:20:00 GMT', quotient: 8 }, // S
    { date: 'Tuesday, April 8, 2025 00:20:00 GMT', quotient: 9 }, // T
    { date: 'Wednesday, April 16, 2025 08:20:00 GMT', quotient: 10 }, //W
    // { date: 'April 20, 2025 16:20:00 GMT', quotient: 999999999 },
  ].map((bonfire) => {
    const dateObj = new Date(bonfire.date);
    return {
      ...bonfire,
      timestamp: Math.floor(dateObj.getTime() / 1000),
    };
  });

  it('correctly sets bonfureDelay and bonfureDuration', async () => {
    const { KudzuBurnController } = await deployKudzuAndBurn();

    // Check bonfire duration is one hour
    const bonfireDuration = await KudzuBurnController.bonfireDuration();

    // Create date at Unix epoch start and add 1 hour
    let epochStart = new Date(0); // 1970-01-01T00:00:00.000Z
    epochStart.setHours(epochStart.getHours() + 1);
    const oneHour = epochStart.getTime() / 1000;

    expect(bonfireDuration).to.equal(oneHour);
    // For extra clarity:
    expect(oneHour).to.equal(60 * 60, 'One hour should be 3600 seconds');

    const bonfireDelay = await KudzuBurnController.bonfireDelay();
    epochStart = new Date(0); // 1970-01-01T00:00:00.000Z
    epochStart.setHours(epochStart.getHours() + 200);
    const twoHundredHours = epochStart.getTime() / 1000;
    expect(bonfireDelay).to.equal(twoHundredHours);
    expect(twoHundredHours).to.equal(
      200 * 60 * 60,
      'Two hundred hours should be 720000 seconds'
    );
  });

  it('correctly calculates bonfire phases', async () => {
    const { KudzuBurnController } = await deployKudzuAndBurn();
    const firstBonfireStart = await KudzuBurnController.firstBonfireStart();
    const bonfireDelay = await KudzuBurnController.bonfireDelay();
    for (let i = 0; i < bonfireTimes.length; i++) {
      const phase = await KudzuBurnController.getBonfirePhase(i);
      const expectedPhase = firstBonfireStart + BigInt(i) * bonfireDelay;
      expect(phase).to.equal(expectedPhase);

      expect(
        phase,
        `Phase ${i} should be ${bonfireTimes[i].date} but instead it is ${new Date(parseInt(phase) * 1000).toISOString()}`
      ).to.equal(bonfireTimes[i].timestamp);
    }
  });

  it('correctly identifies bonfire active periods', async () => {
    const { KudzuBurnController } = await deployKudzuAndBurn();

    // Check bonfire duration is one hour
    const bonfireDuration = await KudzuBurnController.bonfireDuration();

    const firstBonfireStart = await KudzuBurnController.firstBonfireStart();
    expect(firstBonfireStart).to.equal(bonfireTimes[0].timestamp);

    for (const bonfire of bonfireTimes) {
      // Check during bonfire (at exact start)
      expect(
        await KudzuBurnController.isBonfireActive(bonfire.timestamp),
        `${bonfire.date} should be active at start`
      ).to.be.true;

      // Check during bonfire (30 minutes in)
      expect(
        await KudzuBurnController.isBonfireActive(bonfire.timestamp + 30 * 60),
        `${bonfire.date} should be active after 30 minutes`
      ).to.be.true;

      // Check after bonfire (after bonfireDuration)
      expect(
        await KudzuBurnController.isBonfireActive(
          bonfire.timestamp + parseInt(bonfireDuration) + 1
        ),
        `${bonfire.date} should be inactive after duration`
      ).to.be.false;
    }

    // Test between bonfires (halfway between first two bonfires)
    const midPoint = Math.floor(
      (bonfireTimes[0].timestamp + bonfireTimes[1].timestamp) / 2
    );
    expect(
      await KudzuBurnController.isBonfireActive(midPoint),
      'Should be inactive between bonfires'
    ).to.be.false;
  });

  it('correctly calculates bonfire multipliers', async () => {
    const { KudzuBurnController } = await deployKudzuAndBurn();

    for (const bonfire of bonfireTimes) {
      const multiplier = await KudzuBurnController.getQuotient(
        bonfire.timestamp
      );
      expect(multiplier, `Incorrect multiplier for ${bonfire.date}`).to.equal(
        bonfire.quotient
      );
    }
  });

  it('batchBurn works correctly', async () => {
    const [, acct1, acct2] = await ethers.getSigners();
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    const burnPoint = await KudzuBurnController.burnPoint();
    const newStrainBonus = await KudzuBurnController.newStrainBonus();

    // Prepare multiple tokens for testing
    const recipients = [
      {
        address: acct1,
        quantity: 3, // Will create 3 different token types
        infected: [{ address: acct2.address, strainIndex: 0 }],
      },
    ];

    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Set approval for burning
    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );

    // Test batch burn without bonfire active
    const quantities = [2, 3, 1];
    const tx1 = await KudzuBurnController.connect(acct1).batchBurn(
      tokenIds,
      quantities
    );
    const receipt1 = await tx1.wait();

    // Verify balances after burn
    for (let i = 0; i < tokenIds.length; i++) {
      expect(
        await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[i])
      ).to.equal(10 - quantities[i]);
    }

    // Check PointsRewarded events
    const events1 = await getParsedEventLogs(
      receipt1,
      KudzuBurn,
      'PointsRewarded'
    );

    // Should have base points for each token
    for (let i = 0; i < tokenIds.length; i++) {
      const index = i * 2;
      const basePointsEvent = events1[index];
      expect(basePointsEvent.pretty.points).to.equal(
        BigInt(quantities[i]) * burnPoint
      );
      expect(basePointsEvent.pretty.tokenId).to.equal(tokenIds[i]);
    }

    // Should have new strain bonus for each token
    for (let i = 0; i < tokenIds.length; i++) {
      const index = i * 2 + 1;
      const bonusEvent = events1[index];
      expect(bonusEvent.pretty.points).to.equal(newStrainBonus);
      expect(bonusEvent.pretty.tokenId).to.equal(tokenIds[i]);
    }

    const firstBonfireStart = await KudzuBurnController.firstBonfireStart();
    const quotient = await KudzuBurnController.getQuotient(
      firstBonfireStart + 100n
    );

    const totalPreBurned = quantities.reduce((a, b) => a + b, 0);
    const preBonfireBonus = Math.floor(totalPreBurned / parseInt(quotient));
    expect(events1[events1.length - 1].pretty.points).to.equal(preBonfireBonus);
    expect(events1[events1.length - 1].pretty.tokenId).to.equal(5); // Bonfire bonus uses tokenId 5

    const preBonfireRemainder = totalPreBurned % parseInt(quotient);

    // Test batch burn during bonfire
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(firstBonfireStart) + 100, // 100 seconds into first bonfire
    ]);

    const quantities2 = [1, 2, 1];
    const tx2 = await KudzuBurnController.connect(acct1).batchBurn(
      tokenIds,
      quantities2
    );
    const receipt2 = await tx2.wait();
    const events2 = await getParsedEventLogs(
      receipt2,
      KudzuBurn,
      'PointsRewarded'
    );

    // Calculate expected bonfire bonus
    const totalBurned =
      quantities2.reduce((a, b) => a + b, 0) + preBonfireRemainder;

    const expectedBonfireBonus = Math.floor(totalBurned / parseInt(quotient));

    // Verify bonfire bonus event
    const bonfireEvent = events2[events2.length - 1];
    expect(bonfireEvent.pretty.points).to.equal(expectedBonfireBonus);
    expect(bonfireEvent.pretty.tokenId).to.equal(5); // Bonfire bonus uses tokenId 5
  });

  it('batchBurn fails with invalid inputs', async () => {
    const [, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    const recipients = [
      {
        address: acct1,
        quantity: 2,
        infected: [],
      },
    ];

    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Test mismatched arrays
    await expect(
      KudzuBurnController.connect(acct1).batchBurn(tokenIds, [1])
    ).to.be.revertedWith('tokenIds and quantities must have the same length');

    // Test burning without approval
    await expect(KudzuBurnController.connect(acct1).batchBurn(tokenIds, [1, 1]))
      .to.be.reverted;

    // Test burning more than owned
    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    await expect(
      KudzuBurnController.connect(acct1).batchBurn(tokenIds, [11, 1])
    ).to.be.reverted;
  });

  it('correctly handles bonfire bonus phases and remainders across multiple burns', async () => {
    const [, acct1] = await ethers.getSigners();
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
      mock: true,
    });

    // Setup tokens with 6 strains, 10 tokens each (60 total)
    const recipients = [
      {
        address: acct1,
        quantity: 6, // Changed from 3 to 6 strains
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);
    await Kudzu.connect(acct1).setApprovalForAll(
      KudzuBurnController.target,
      true
    );
    const tokenBalances = tokenIds.map((t) => 10);
    function getTokenId() {
      for (let i = 0; i < tokenBalances.length; i++) {
        if (tokenBalances[i] > 0) {
          tokenBalances[i] -= 1;
          return i;
        }
      }
      throw new Error('No tokens left');
    }
    function getBatch() {
      const returnBatch = [];
      let totalInBatch = 0;

      for (let i = 0; i < tokenBalances.length; i++) {
        if (tokenBalances[i] > 0) {
          // Calculate how many tokens to take from this position
          let amount = Math.min(3, tokenBalances[i], 6 - totalInBatch);

          returnBatch.push({
            tokenIndex: i, // Index of the token ID
            quantity: amount,
          });

          tokenBalances[i] -= amount;
          totalInBatch += amount;

          if (totalInBatch === 6) {
            break;
          }
        }
      }

      return returnBatch;
    }

    let runningRemainder = 0;
    // Test each bonfire phase
    for (let i = 0; i < bonfireTimes.length; i++) {
      const bonfireTime = bonfireTimes[i].timestamp;
      const quotient = bonfireTimes[i].quotient;

      // Set time to middle of bonfire period
      await hre.network.provider.send('evm_setNextBlockTimestamp', [
        bonfireTime + 100,
      ]);

      const batchQuantities = getBatch();
      const tx1 = await KudzuBurnController.connect(acct1).batchBurn(
        batchQuantities.map((b) => tokenIds[b.tokenIndex]),
        batchQuantities.map((b) => b.quantity)
      );
      const receipt1 = await tx1.wait();
      const events1 = await getParsedEventLogs(
        receipt1,
        KudzuBurn,
        'PointsRewarded'
      );

      const totalBurned =
        batchQuantities.reduce((a, b) => a + b.quantity, 0) + runningRemainder;

      // Calculate expected bonfire bonus for batch (6 / quotient floored)
      const expectedBatchBonus = Math.floor(totalBurned / quotient);
      runningRemainder = totalBurned % quotient;

      // Verify bonfire bonus from batch burn
      const bonfireEvent1 = events1[events1.length - 1];
      expect(bonfireEvent1.pretty.points).to.equal(expectedBatchBonus);
      expect(bonfireEvent1.pretty.tokenId).to.equal(5); // Bonfire bonus tokenId

      // Now do individual burns to test remainder carrying over
      const individualBurns = 4; // This plus the remainder should trigger another bonus
      for (let j = 0; j < individualBurns; j++) {
        const tokenId = getTokenId();
        const tokenBalance = await Kudzu['balanceOf(address,uint256)'](
          acct1.address,
          tokenIds[tokenId]
        );
        expect(tokenBalance).to.be.gt(0);
        const tx2 = await KudzuBurnController.connect(acct1).burn(
          tokenIds[tokenId],
          1
        );
        const receipt2 = await tx2.wait();
        const events2 = await getParsedEventLogs(
          receipt2,
          KudzuBurn,
          'PointsRewarded'
        );

        // On final burn, check if we got a bonus
        const totalBurned = 1 + runningRemainder;
        const expectedBonus = Math.floor(totalBurned / quotient);
        runningRemainder = totalBurned % quotient;
        if (expectedBonus > 0) {
          const bonfireEvent2 = events2[events2.length - 1];
          expect(bonfireEvent2.pretty.points).to.equal(expectedBonus);
          expect(bonfireEvent2.pretty.tokenId).to.equal(5);
        }
      }
    }
  });
});
