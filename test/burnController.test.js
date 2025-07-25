import { expect } from 'chai';
import { afterEach, before, describe, it } from 'mocha';

import hre from 'hardhat';
const ethers = hre.ethers;

import {
  deployKudzuAndBurn,
  getParsedEventLogs,
  prepareKudzuForTests,
  DeterministicRandom,
  fifoSort,
} from '../scripts/utils.js';

let snapshot, KudzuMock, KudzuBurnMock, KudzuBurnControllerMock, ModulariumMock;
describe('KudzuBurnController Tests', function () {
  this.timeout(50000000);
  before(async () => {
    ({
      Kudzu: KudzuMock,
      KudzuBurn: KudzuBurnMock,
      KudzuBurnController: KudzuBurnControllerMock,
      ModulariumMock: ModulariumMock,
    } = await deployKudzuAndBurn({
      mock: true,
    }));
    const totalRounds = 13;
    const threeMonths = 7776000;
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const firstEndDate = now + threeMonths;
    for (let i = 0; i < totalRounds; i++) {
      await KudzuBurnMock.updateEndDate(i, firstEndDate + i * threeMonths);
    }
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });
  afterEach(async () => {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('deploy works', async () => {
    const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn();
    expect(KudzuBurnController.target).to.not.equal(null);
    expect(KudzuBurn.target).to.not.equal(null);
    expect(Kudzu.target).to.not.equal(null);

    const kudzuBurnController = await KudzuBurn.kudzuBurnController();
    expect(kudzuBurnController).to.not.equal(null);
    expect(kudzuBurnController).to.equal(KudzuBurnController.target);

    // Verify chimera contract is set (should be zero address in default deployment)
    const chimeraContract = await KudzuBurnController.chimeraContract();
    expect(chimeraContract).to.equal(ethers.ZeroAddress);
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
      await expect(KudzuBurnController.connect(notdeployer)[name](...params)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
      await expect(KudzuBurnController.connect(deployer)[name](...params)).to.not.be.reverted;
    }
  });

  it('burn works', async () => {
    const [, acct1, acct2] = await ethers.getSigners();
    // const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
    //   mock: true,
    // });
    const { Kudzu, KudzuBurn, KudzuBurnController } = {
      Kudzu: KudzuMock,
      KudzuBurn: KudzuBurnMock,
      KudzuBurnController: KudzuBurnControllerMock,
    };

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
    await Kudzu.connect(acct1).safeTransferFrom(acct1.address, acct2.address, tokenIds[0], 2, '0x');
    expect(await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])).to.equal(8);
    expect(await Kudzu['balanceOf(address,uint256)'](acct2.address, tokenIds[0])).to.equal(3);

    // burn fails before approval is set
    await expect(KudzuBurnController.connect(acct1).burn(tokenIds[0], 1)).to.be.reverted;

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurnController.target, true);

    const tx = await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    const receipt = await tx.wait();
    const events = await getParsedEventLogs(receipt, KudzuBurn, 'PointsRewarded');
    expect(events[0].pretty.points).to.equal(burnPoint);
    expect(events[1].pretty.points).to.equal(newStrainBonus);

    const winningAddress = await KudzuBurn.getWinningAddress();
    expect(winningAddress).to.equal(acct1.address);

    await Kudzu.connect(acct2).setApprovalForAll(KudzuBurnController.target, true);
    await KudzuBurnController.connect(acct2).burn(tokenIds[0], 1);
    const winningAddress2 = await KudzuBurn.getWinningAddress();
    // first to make the score should be in first place
    expect(winningAddress2).to.equal(acct1.address);

    const acct1Points = await KudzuBurn.getPoints(acct1.address);
    expect(acct1Points).to.equal(burnPoint + newStrainBonus);

    const acct2Points = await KudzuBurn.getPoints(acct2.address);
    expect(acct2Points).to.equal(burnPoint + newStrainBonus);

    const getRank1 = await KudzuBurn.getOwnerAtRank(0);
    expect(getRank1).to.equal(acct1.address);

    const getRank2 = await KudzuBurn.getOwnerAtRank(1);
    expect(getRank2).to.equal(acct2.address);

    await KudzuBurnController.connect(acct2).burn(tokenIds[0], 2);

    const acct2Points2 = await KudzuBurn.getPoints(acct2.address);
    expect(acct2Points2).to.equal(burnPoint * 3n + newStrainBonus);

    const winningAddress3 = await KudzuBurn.getWinningAddress();
    expect(winningAddress3).to.equal(acct2.address);

    const getRank3 = await KudzuBurn.getOwnerAtRank(0);
    expect(getRank3).to.equal(acct2.address);

    const getRank4 = await KudzuBurn.getOwnerAtRank(1);
    expect(getRank4).to.equal(acct1.address);
  });

  it('burn fails when token transfer fails', async () => {
    const [, acct1] = await ethers.getSigners();
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
    await expect(KudzuBurnController.connect(acct1).burn(tokenIds[0], 1)).to.be.reverted;

    // Verify balance remained unchanged
    expect(await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])).to.equal(10);
  });

  it('burn fails under various invalid conditions', async () => {
    const [, acct1, randomAccount] = await ethers.getSigners();
    // const { Kudzu, KudzuBurnController } = await deployKudzuAndBurn({
    //   mock: true,
    // });
    const { Kudzu, KudzuBurnController } = {
      Kudzu: KudzuMock,
      KudzuBurn: KudzuBurnMock,
      KudzuBurnController: KudzuBurnControllerMock,
    };
    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // Approve KudzuBurnController to handle tokens
    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurnController.target, true);

    // Try to burn non-existent token ID
    const nonExistentTokenId = 999999;
    await expect(KudzuBurnController.connect(acct1).burn(nonExistentTokenId, 1)).to.be.reverted;

    // Try to burn when caller has no tokens
    await expect(KudzuBurnController.connect(randomAccount).burn(tokenIds[0], 1)).to.be.reverted;

    // Verify original balance remains unchanged
    expect(await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])).to.equal(10);

    // Successfully burn one token to verify the function works normally
    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);

    // Verify balance decreased by exactly 1
    expect(await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[0])).to.equal(9);
  });

  it('burn calls rewardWinner when round is over', async () => {
    const [deployer, acct1, acct2] = await ethers.getSigners();
    // const { Kudzu, KudzuBurn, KudzuBurnController } = await deployKudzuAndBurn({
    //   mock: true,
    // });
    const { Kudzu, KudzuBurn, KudzuBurnController } = {
      Kudzu: KudzuMock,
      KudzuBurn: KudzuBurnMock,
      KudzuBurnController: KudzuBurnControllerMock,
    };

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

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurnController.target, true);
    await Kudzu.connect(acct2).setApprovalForAll(KudzuBurnController.target, true);

    await KudzuBurnController.connect(acct1).burn(tokenIds[0], 1);
    expect(await KudzuBurn.getOwnerAtRank(0)).to.equal(acct1.address);

    await KudzuBurnController.connect(acct2).burn(tokenIds[1], 1);
    expect(await KudzuBurn.getOwnerAtRank(1)).to.equal(acct2.address);

    // Fund the round
    await deployer.sendTransaction({
      to: KudzuBurn.target,
      value: ethers.parseEther('1.0'),
    });

    // Fast forward time to after round end
    const roundEndTime = await KudzuBurn.rounds(0);
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(roundEndTime[1]) + 1]);
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
      KudzuBurnController.connect(notdeployer).recoverFunds(ethers.parseEther('1.0'))
    ).to.be.revertedWith('Ownable: caller is not the owner');

    // Get initial balance
    const initialBalance = await ethers.provider.getBalance(deployer.address);

    // Recover funds
    const tx = await KudzuBurnController.recoverFunds(ethers.parseEther('1.0'));
    const receipt = await tx.wait();

    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    // Verify balance increased (accounting for gas costs)
    const finalBalance = await ethers.provider.getBalance(deployer.address);
    expect(finalBalance).to.equal(initialBalance + ethers.parseEther('1.0') - gasUsed);
    // Verify EthMoved event was emitted correctly
    const ethMovedEvents = receipt.logs.filter(
      (log) => log.fragment && log.fragment.name === 'EthMoved'
    );
    expect(ethMovedEvents.length).to.equal(1);
    expect(ethMovedEvents[0].args.to).to.equal(deployer.address);
    expect(ethMovedEvents[0].args.success).to.be.true;
    expect(ethMovedEvents[0].args.amount).to.equal(ethers.parseEther('1.0'));
  });

  it('burnHook function access control works correctly', async () => {
    const [deployer, notChimera] = await ethers.getSigners();
    const { KudzuBurnController } = await deployKudzuAndBurn();

    // Test that non-chimera address cannot call burnHook
    await expect(
      KudzuBurnController.connect(notChimera).burnHook(notChimera.address, 1, 1)
    ).to.be.revertedWith('Only chimera contract can call this function');

    // Test that owner cannot call burnHook (only chimera can)
    await expect(
      KudzuBurnController.connect(deployer).burnHook(deployer.address, 1, 1)
    ).to.be.revertedWith('Only chimera contract can call this function');
  });

  it('burnHook function works when called by chimera contract', async () => {
    const [, acct1, acct2] = await ethers.getSigners();
    const { KudzuMock: Kudzu, KudzuBurnControllerMock: KudzuBurnController } = {
      KudzuBurnMock,
      KudzuMock,
      KudzuBurnControllerMock,
    };
    const recipients = [
      {
        address: acct1,
        quantity: 3, // Will create 3 different token types
        infected: [{ address: acct2.address, strainIndex: 0 }],
      },
    ];
    await prepareKudzuForTests(Kudzu, recipients);

    await KudzuBurnController.updateChimeraContract(acct1.address);
    await KudzuBurnController.connect(acct1).burnHook(acct1.address, 1, 1);
  });

  it('batchBurn works correctly', async () => {
    const [, acct1, acct2] = await ethers.getSigners();
    const {
      KudzuMock: Kudzu,
      KudzuBurnMock: KudzuBurn,
      KudzuBurnControllerMock: KudzuBurnController,
    } = { KudzuBurnMock, KudzuMock, KudzuBurnControllerMock };

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
    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurnController.target, true);

    // Test batch burn
    const quantities = [2, 3, 1];
    const tx1 = await KudzuBurnController.connect(acct1).batchBurn(tokenIds, quantities);
    const receipt1 = await tx1.wait();

    // Verify balances after burn
    for (let i = 0; i < tokenIds.length; i++) {
      expect(await Kudzu['balanceOf(address,uint256)'](acct1.address, tokenIds[i])).to.equal(
        10 - quantities[i]
      );
    }

    // Check PointsRewarded events
    const events1 = await getParsedEventLogs(receipt1, KudzuBurn, 'PointsRewarded');

    expect(events1.length).to.equal(6); // 3 base points + 3 new strain bonuses
    // Should have base points for each token
    for (let i = 0; i < tokenIds.length; i++) {
      const index = i * 2;
      const basePointsEvent = events1[index];
      expect(basePointsEvent.pretty.points).to.equal(BigInt(quantities[i]) * burnPoint);
      expect(basePointsEvent.pretty.tokenId).to.equal(tokenIds[i]);
    }

    // Should have new strain bonus for each token
    for (let i = 0; i < tokenIds.length; i++) {
      const index = i * 2 + 1;
      const bonusEvent = events1[index];
      expect(bonusEvent.pretty.points).to.equal(newStrainBonus);
      expect(bonusEvent.pretty.tokenId).to.equal(7);
    }

    // Test another batch burn
    const quantities2 = [1, 2, 1];
    const tx2 = await KudzuBurnController.connect(acct1).batchBurn(tokenIds, quantities2);
    const receipt2 = await tx2.wait();
    const events2 = await getParsedEventLogs(receipt2, KudzuBurn, 'PointsRewarded');

    // Should only have base points (no new strain bonuses since tokens already burned)
    expect(events2.length).to.equal(3);
    for (let i = 0; i < tokenIds.length; i++) {
      expect(events2[i].pretty.points).to.equal(BigInt(quantities2[i]) * burnPoint);
      expect(events2[i].pretty.tokenId).to.equal(tokenIds[i]);
    }
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
    await expect(KudzuBurnController.connect(acct1).batchBurn(tokenIds, [1])).to.be.revertedWith(
      'tokenIds and quantities must have the same length'
    );

    // Test burning without approval
    await expect(KudzuBurnController.connect(acct1).batchBurn(tokenIds, [1, 1])).to.be.reverted;

    // Test burning more than owned
    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurnController.target, true);
    await expect(KudzuBurnController.connect(acct1).batchBurn(tokenIds, [11, 1])).to.be.reverted;
  });

  // // Helper function to get a player's rank
  // async function getPlayerRank(KudzuBurn, playerAddress) {
  //   try {
  //     const points = await KudzuBurn.getPoints(playerAddress);
  //     if (points === 0n) {
  //       return 999;
  //     } // Not ranked

  //     let rank = 0;
  //     while (true) {
  //       try {
  //         const addressAtRank = await KudzuBurn.getOwnerAtRank(rank);
  //         if (addressAtRank === playerAddress) {
  //           return rank;
  //         }
  //         rank++;
  //       } catch (e) {
  //         return 999; // Not found in rankings
  //       }
  //     }
  //   } catch (e) {
  //     return 999;
  //   }
  // }

  it.skip('handles high volume activity with 10,000 players over 3 months', async () => {
    const PLAYER_COUNT = 10_000;
    const INITIAL_POINTS = 15;
    const THIRTEEN_TIMES_THREE_MONTHS_IN_SECONDS = 13 * 3 * 30 * 24 * 60 * 60;
    const TIME_INTERVAL = 1 * 60 * 60; // 1 hours
    const NUM_PLAYERS_PER_ROUND = 3;

    const INTERVALS = Math.floor(THIRTEEN_TIMES_THREE_MONTHS_IN_SECONDS / TIME_INTERVAL);
    const seed = 614727; // Math.floor(Math.random() * 1000000);
    const random = new DeterministicRandom(seed);

    // Setup accounts and contracts
    const [deployer, ...signers] = await ethers.getSigners();

    // Create deterministic wallets for all players
    const players = Array(PLAYER_COUNT)
      .fill(0)
      .map((_) => {
        return ethers.Wallet.createRandom().connect(ethers.provider);
      });

    const fundInEth = '0.1';
    // Fund players with ETH for gas (0.1 ETH each)
    const FUNDING_PER_PLAYER = ethers.parseEther(fundInEth);
    console.log(`Funding ${PLAYER_COUNT} players with ${fundInEth} ETH each`);

    let currentSignerIndex = 0;
    for (let i = 0; i < players.length; i++) {
      // Check if current signer has enough balance
      while (currentSignerIndex < signers.length) {
        const signerBalance = await signers[currentSignerIndex].provider.getBalance(
          signers[currentSignerIndex].address
        );

        if (signerBalance >= FUNDING_PER_PLAYER) {
          // Current signer has enough balance, proceed with funding
          await signers[currentSignerIndex].sendTransaction({
            to: players[i].address,
            value: FUNDING_PER_PLAYER,
          });
          break;
        } else {
          // Current signer doesn't have enough balance, move to next signer
          currentSignerIndex++;
          if (currentSignerIndex >= signers.length) {
            throw new Error('Not enough ETH across all signers to fund remaining players');
          }
        }
      }
    }

    console.log(`Used ${currentSignerIndex + 1} signers to fund all players`);

    const {
      KudzuMock: Kudzu,
      KudzuBurnMock: KudzuBurn,
      KudzuBurnControllerMock: KudzuBurnController,
    } = { KudzuBurnMock, KudzuMock, KudzuBurnControllerMock };

    let playerNonce = 0;

    // Initialize player tokens and tracking state
    const playerTokens = {};
    let playerScores = []; // Change to array to track insertion order
    const tokenBalances = {};
    const playerBurnedTokens = {}; // Track which tokens each player has burned
    try {
      // Setup initial state for each player

      const chunkSize = 50;
      const count = players.length;
      const totalChunks = Math.ceil(count / chunkSize);
      const lastChunkSize = count % chunkSize === 0 ? chunkSize : count % chunkSize;
      console.log({ totalChunks });
      for (let i = 0; i < totalChunks; i++) {
        const startIndex = i * chunkSize;
        const endIndex =
          i === totalChunks - 1 ? startIndex + lastChunkSize : startIndex + chunkSize;
        const chunk = players.slice(startIndex, endIndex);
        console.log(`Rewarding ${chunk.length} players with ${INITIAL_POINTS} points`);
        await KudzuBurn.adminMassRewardSingleQuantity(chunk, INITIAL_POINTS, 3); // rewardId 3 for pre-game points
      }

      const playersApproved = new Set();
      const recipients = [
        {
          address: deployer,
          quantity: 3 * PLAYER_COUNT,
          infected: [],
        },
      ];
      const tokenIds = await prepareKudzuForTests(Kudzu, recipients);
      console.time('prepareKudzuInTest');

      const tokenQuantity = 10;
      const tokenIdsInBatchesOfThree = tokenIds.reduce((acc, tokenId, index) => {
        const batchIndex = Math.floor(index / 3);
        if (!acc[batchIndex]) {
          acc[batchIndex] = [];
        }
        acc[batchIndex].push(tokenId);
        const player = players[batchIndex];
        playerTokens[player.address] ||= [];
        playerTokens[player.address].push(tokenId);
        playerBurnedTokens[player.address] ||= new Set(); // Initialize burned tokens tracking
        tokenBalances[`${player.address}-${tokenId}`] = tokenQuantity;

        return acc;
      }, []);
      const tokenIdsAsQuantities = Array(PLAYER_COUNT).fill(Array(3).fill(tokenQuantity));
      const playersAsAddresses = players.map((p) => p.address);
      await Kudzu.connect(deployer).setApprovalForAll(KudzuBurn.target, true);
      const transferChunkSize = 100;
      const transferChunks = Math.ceil(playersAsAddresses.length / transferChunkSize);
      const transferChunkLastSize =
        playersAsAddresses.length % transferChunkSize === 0
          ? transferChunkSize
          : playersAsAddresses.length % transferChunkSize;
      for (let i = 0; i < transferChunks; i++) {
        const startIndex = i * transferChunkSize;
        const endIndex =
          i === transferChunks - 1
            ? startIndex + transferChunkLastSize
            : startIndex + transferChunkSize;
        const transferChunk = playersAsAddresses.slice(startIndex, endIndex);
        const tokenIdsInBatchesOfThree_ = tokenIdsInBatchesOfThree.slice(startIndex, endIndex);
        const tokenIdsAsQuantities_ = tokenIdsAsQuantities.slice(startIndex, endIndex);
        await KudzuBurn.massBatchTransferTokens(
          deployer,
          transferChunk,
          tokenIdsInBatchesOfThree_,
          tokenIdsAsQuantities_
        );
      }
      for (const [, player] of players.entries()) {
        // Add initial points using adminReward
        playerScores.push({
          address: player.address,
          value: INITIAL_POINTS,
          playerNonce,
        });
        playerNonce++;
      }
      console.timeEnd('prepareKudzuInTest');
      const confirmInitialState = true;
      if (confirmInitialState) {
        const size = await KudzuBurn.size();
        expect(size).to.equal(players.length);
        for (let j = 0; j < players.length; j++) {
          const [contractScore, contractPlayer] = await KudzuBurn.getValueAndOwnerAtRank(j);
          expect(contractPlayer.toLowerCase()).to.equal(players[j].address.toLowerCase());
          expect(contractScore).to.equal(INITIAL_POINTS);
        }
      }

      // Get initial timestamp and round end time
      const startTime = (await ethers.provider.getBlock('latest')).timestamp;
      // const endTime = startTime + THIRTEEN_TIMES_THREE_MONTHS_IN_SECONDS;
      // console.log({ INTERVALS });
      // Run simulation over time intervals
      const completedRounds = 0;

      outerloop: for (let i = 0; i < INTERVALS; i++) {
        console.time('intervalLoop');

        const currentTime = startTime + i * TIME_INTERVAL;

        const actualTime = await ethers.provider.getBlock('latest');
        if (actualTime.timestamp < currentTime) {
          // Set timestamp
          await ethers.provider.send('evm_setNextBlockTimestamp', [currentTime]);
          await ethers.provider.send('evm_mine');
        }
        console.log(
          `${i}/${INTERVALS} (${((i / INTERVALS) * 100).toFixed(2)}%) - ${new Date(currentTime * 1000).toLocaleString()}`
        );

        // Randomly select 1-10 players for this interval
        const numPlayers = Math.floor(random.next() * NUM_PLAYERS_PER_ROUND) + 1;
        const selectedPlayers = players.sort(() => random.next() - 0.5).slice(0, numPlayers);

        // Process burns for selected players
        for (const player of selectedPlayers) {
          if (!playersApproved.has(player.address)) {
            // Approve burn controller
            await Kudzu.connect(player).setApprovalForAll(KudzuBurnController.target, true);
            playersApproved.add(player.address);
          }
          // if (await checkWinner()) break
          // const currentTime = (await ethers.provider.getBlock('latest')).timestamp;

          // Select random token to burn
          const playerTokenIds = playerTokens[player.address];
          const tokenId = playerTokenIds[Math.floor(random.next() * playerTokenIds.length)];

          // Perform burn
          const playerBalance = await Kudzu['balanceOf(address,uint256)'](player.address, tokenId);

          // Random number of burns (1-100)
          const burnAmount = Math.floor(random.next() * Number(playerBalance)) + 1;
          const balanceKey = `${player.address}-${tokenId}`;

          expect(tokenBalances[balanceKey]).to.equal(playerBalance);
          // Skip if not enough tokens
          if (tokenBalances[balanceKey] < burnAmount) {
            continue;
          }
          try {
            await KudzuBurn.isOver();
          } catch (e) {
            console.log('game over, over 13 rounds completed');
            break outerloop;
          }
          const tx = await KudzuBurnController.connect(player).burn(tokenId, burnAmount);
          const receipt = await tx.wait();
          const events = await getParsedEventLogs(receipt, KudzuBurn, 'PointsRewarded');
          if (events.some((e) => e.pretty.points < 0)) {
            // player has won
            const winningEvent = events.find((e) => e.pretty.points < 0);
            // console.log({ winningEvent });
            const winningPlayer = winningEvent.pretty.to;
            const winningPoints = winningEvent.pretty.points;
            console.log(
              `PLAYER ${winningPlayer} HAS WON ROUND ${completedRounds} WITH ${winningPoints}`
            );
            const winningScoreEntry = playerScores.find(
              (p) => p.address.toLowerCase() === winningPlayer.toLowerCase()
            );
            expect(winningPoints).to.equal(-1 * winningScoreEntry.value);
            winningScoreEntry.value += Number(winningPoints); // negative number
            winningScoreEntry.playerNonce = playerNonce;
            playerNonce++;
            // events = events.splice();
          }
          const eventTotal = events.reduce((a, e) => {
            return a + (Number(e.pretty.points) > 0 ? Number(e.pretty.points) : 0);
          }, 0);
          if (eventTotal < 0) {
            console.dir({ events: events.map((e) => e.pretty) }, { depth: null });
          }
          let pointsAddedToJS = burnAmount;

          // Update local state
          tokenBalances[balanceKey] -= burnAmount;

          // Calculate points
          const burnPoints = burnAmount * Number(await KudzuBurnController.burnPoint());
          // Update score in playerScores array
          const playerScoreEntry = playerScores.find((p) => p.address === player.address);
          playerScoreEntry.value += burnPoints;
          playerScoreEntry.playerNonce = playerNonce;
          playerNonce++;
          // console.log(
          //   `add ${burnPoints} to ${player.address} for new total of ${playerScoreEntry.value}`
          // );

          // Add new strain bonus if this is the first time burning this token
          if (!playerBurnedTokens[player.address].has(tokenId)) {
            playerBurnedTokens[player.address].add(tokenId);
            const newStrainBonus = Number(await KudzuBurnController.newStrainBonus());
            playerScoreEntry.value += newStrainBonus;
            playerScoreEntry.playerNonce = playerNonce;
            playerNonce++;
            pointsAddedToJS += newStrainBonus;
            // console.log(
            //   `add ${newStrainBonus} (bonus) to ${player.address} for new total of ${playerScoreEntry.value}`
            // );
          }

          expect(eventTotal).to.equal(pointsAddedToJS);
        }
        // console.timeEnd('burnRound');

        // Every 24 hours (12 intervals), verify contract state matches local state
        if (i % 12 === 0) {
          // Sort local scores using fifoSort
          playerScores = fifoSort(playerScores);
          // console.time('verifyPositions');
          // Verify positions for top 10 players
          for (let rank = 0; rank < Math.min(playerScores.length, 10); rank++) {
            const rankIndex = playerScores.length - 1 - rank;
            const expectedPlayer = playerScores[rankIndex];
            const expectedAddress = expectedPlayer.address;
            const expectedScore = expectedPlayer.value;

            const contractAddress = await KudzuBurn.getOwnerAtRank(rank);
            const contractScore = await KudzuBurn.getPoints(contractAddress);
            expect(contractAddress.toLowerCase()).to.equal(
              expectedAddress.toLowerCase(),
              `Rank ${rank} address mismatch at interval ${i}`
            );
            expect(contractScore).to.equal(
              expectedScore,
              `Rank ${rank} score mismatch at interval ${i}`
            );
          }
          // console.timeEnd('verifyPositions');
        }
        console.timeEnd('intervalLoop');
      }
      try {
        console.timeEnd('intervalLoop');
      } catch (e) {
        console.error(e);
      }

      // // Final state verification
      // playerScores = fifoSort(playerScores);
      // const winner = playerScores[playerScores.length - 1];
      // const contractWinner = await KudzuBurn.getWinningAddress();

      // expect(contractWinner.toLowerCase()).to.equal(
      //   winner.address.toLowerCase(),
      //   'Final winner mismatch'
      // );
    } catch (e) {
      console.log({ e });
      console.log({ playerScores });
      console.log({ seed });
      throw e;
    }
  });

  it.skip('batchBuyAndBurn gas analysis with ModulariumMock', async () => {
    const [, buyer] = await ethers.getSigners();
    // We need the mock instances setup in the main `before` block
    const Kudzu = KudzuMock;
    const KudzuBurn = KudzuBurnMock;
    const KudzuBurnController = KudzuBurnControllerMock;
    const Modularium = ModulariumMock;

    const kudzuBurnKudzuBurnController = await KudzuBurn.kudzuBurnController();
    expect(kudzuBurnKudzuBurnController).to.equal(KudzuBurnController.target);

    const modulariumAddress = await KudzuBurnController.modularium();
    expect(modulariumAddress).to.equal(Modularium.target);

    // Test chimera contract property
    const chimeraAddress = await KudzuBurnController.chimeraContract();
    expect(chimeraAddress).to.equal(ethers.ZeroAddress); // Should be zero address in mock mode

    // Ensure Modularium was deployed and added to the return object in utils.js
    expect(Modularium, 'Modularium instance not found. Update deployBurnContract in utils.js?').to
      .exist;

    console.log('\n    Gas Analysis for batchBuyAndBurn:');

    // Mint 2 distinct token types directly to the buyer
    const recipients = [
      {
        address: buyer,
        quantity: 2, // Creates 2 token IDs
        infected: [],
      },
    ];
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);
    expect(tokenIds.length).to.equal(2);
    const tokenId1 = tokenIds[0];
    const tokenId2 = tokenIds[1];

    // Buyer needs to approve the controller
    await Kudzu.connect(buyer).setApprovalForAll(KudzuBurnController.target, true);

    // --- Scenario 1: Buy & Burn 1 Token ---
    console.log('      Scenario 1: Buying & Burning 1 token type...');
    const orderId1 = [1n]; // Dummy Order ID
    const qty1 = [1n];
    const burnTokenIds1 = [tokenId1];
    const burnQtys1 = [1n];
    const dummyValue1 = ethers.parseEther('0.1'); // Value doesn't matter for mock gas, but required by payable

    const tx1 = await KudzuBurnController.connect(buyer).batchBuyAndBurn(
      orderId1,
      qty1,
      burnTokenIds1,
      burnQtys1,
      { value: dummyValue1 }
    );
    const receipt1 = await tx1.wait();

    const gasUsed1 = receipt1.gasUsed;
    console.log(`        Gas Used (1 Order/Token): ${gasUsed1.toString()}`);
    expect(await Kudzu['balanceOf(address,uint256)'](buyer.address, tokenId1)).to.equal(9);

    // --- Scenario 2: Buy & Burn 2 Tokens (Requires snapshot reset) ---
    console.log('\n      Scenario 2: Buying & Burning 2 token types...');

    const orderIds2 = [1n, 2n]; // Dummy Order IDs
    const qtys2 = [1n, 1n];
    const burnTokenIds2 = [tokenId1, tokenId2];
    const burnQtys2 = [1n, 1n];
    const dummyValue2 = ethers.parseEther('0.2'); // 0.1 ETH per dummy order
    const tokenIdBalance2 = await Kudzu['balanceOf(address,uint256)'](buyer.address, tokenId2);
    expect(tokenIdBalance2).to.equal(10);
    const tx2 = await KudzuBurnController.connect(buyer).batchBuyAndBurn(
      orderIds2,
      qtys2,
      burnTokenIds2,
      burnQtys2,
      { value: dummyValue2 }
    );
    const receipt2 = await tx2.wait();
    const gasUsed2 = receipt2.gasUsed;
    console.log(`        Gas Used (2 Orders/Tokens): ${gasUsed2.toString()}`);
    expect(await Kudzu['balanceOf(address,uint256)'](buyer.address, tokenId1)).to.equal(8);
    expect(await Kudzu['balanceOf(address,uint256)'](buyer.address, tokenId2)).to.equal(9);

    // --- Gas Comparison & Estimation ---
    console.log('\n      Gas Comparison & Estimation:');
    const baseGas = gasUsed1;
    // Marginal cost includes ModulariumMock cost + KudzuBurnController cost for the extra token
    const marginalGasPerListing = gasUsed2 - gasUsed1;
    console.log(`        Base Gas Cost (1 Listing): ${baseGas.toString()}`);
    console.log(
      `        Marginal Gas Cost (per extra Listing): ${marginalGasPerListing.toString()}`
    );

    if (marginalGasPerListing <= 0) {
      console.warn(
        '        ⚠️ Marginal gas cost is zero or negative. Estimation might be inaccurate.'
      );
    } else {
      const limits = {
        '100M': 100_000_000n,
        '30M': 30000000n,
        '20M': 20000000n,
        '10M': 10000000n,
      };
      for (const [label, limit] of Object.entries(limits)) {
        if (limit < baseGas) {
          console.log(`        Est. Max Orders (${label} Gas Limit): 0 (Base cost exceeds limit)`);
        } else {
          // Calculation: (Limit - BaseCost) / MarginalCost gives how many *additional* items fit.
          // Add 1 for the base item.
          const maxOrders = (limit - baseGas) / marginalGasPerListing + 1n;
          console.log(`        Est. Max Orders (${label} Gas Limit): ${maxOrders.toString()}`);
        }
      }
    }
    console.log('        (Note: Estimation assumes linear scaling and sufficient block space)');
  });
});
