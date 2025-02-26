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
});
