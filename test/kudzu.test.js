import { expect } from 'chai';
import { describe, it, before, afterEach } from 'mocha';

import hre from 'hardhat';
const ethers = hre.ethers;

import { deployContracts, getParsedEventLogs } from '../scripts/utils.js';
import { getParamsForProof } from '../scripts/exportUtils.js';

let existingAddress;
async function getExistingAddresses() {
  if (existingAddress) {
    return existingAddress;
  }

  const RPC = process.env.homesteadRPC;
  const blockNumber = 21303934;
  const provider = new ethers.JsonRpcProvider(RPC);
  const block = await provider.getBlock(blockNumber, true);
  const blockPayload = await Promise.all(
    block.transactions.map((hash) => block.getPrefetchedTransaction(hash))
  );
  existingAddress = [...new Set(blockPayload.map((t) => t.from))];
  return existingAddress;
}

let snapshot;
describe('Kudzu Tests', function () {
  this.timeout(50000000);
  before(async () => {
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });
  afterEach(async () => {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('token has a name', async () => {
    const { Kudzu } = await deployContracts();
    const name = await Kudzu.name();
    expect(name).to.equal('Kudzu');
  });

  it('has all the correct interfaces', async () => {
    const interfaces = [
      { name: 'ERC165', id: '0x01ffc9a7', supported: true },
      { name: 'ERC1155', id: '0xd9b67a26', supported: true },
      { name: 'ERC1155Metadata', id: '0x0e89341c', supported: true },
      { name: 'ERC721', id: '0x80ac58cd', supported: false },
      { name: 'ERC721Metadata', id: '0x5b5e139f', supported: false },
      { name: 'ERC4906MetadataUpdate', id: '0x49064906', supported: true },
      { name: 'ERC721Enumerable', id: '0x780e9d63', supported: false },
      { name: 'ERC2981', id: '0x2a55205a', supported: false },
      { name: 'ERC20', id: '0x36372b07', supported: false },
      { name: 'RANDOM', id: '0x36372b08', supported: false },
      { name: 'ITokenMetadata', id: '0xe99684b9', supported: true },
      { name: 'IERC1155MintablePayable', id: '0x156e29f6', supported: true },
      { name: 'Ownable', id: '0x0e083076', supported: true },
    ];
    const { Kudzu } = await deployContracts();

    for (let i = 0; i < interfaces.length; i++) {
      const { name, id, supported } = interfaces[i];
      const supportsInterface2 = await Kudzu.supportsInterface(id);
      expect(name + supportsInterface2).to.equal(name + supported);
    }
  });

  it('checks emitBatchMetadataUpdate works', async () => {
    const [signer, notdeployer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();
    const costToCreate = await Kudzu.createPrice();
    const quantity = 10n;
    const value = costToCreate * quantity;
    const startDate = await Kudzu.startDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDate)]);
    await hre.network.provider.send('evm_mine');

    await Kudzu.create(signer.address, quantity, { value });

    await expect(Kudzu.connect(notdeployer).emitBatchMetadataUpdate()).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );

    const tx = await Kudzu.emitBatchMetadataUpdate();
    const receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, 'BatchMetadataUpdate').withArgs({
      startTokenId: 1,
      quantity,
    });
  });

  it('ensures onlyOwner is applied correctly', async () => {
    const [, notdeployer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();
    const functions = [
      { name: 'emitBatchMetadataUpdate', params: [] },
      { name: 'updateMetadata', params: [notdeployer.address] },
      { name: 'updateRecipient', params: [notdeployer.address] },
      { name: 'addChain', params: [2, 2, `0x${'0'.repeat(64)}`] },
      {
        name: 'collectForfeitPrizeAfterDelay',
        params: [notdeployer.address, 0],
        skipOwnerCheck: true,
      },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(Kudzu.connect(notdeployer)[name](...params)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
      if (!functions[i].skipOwnerCheck) {
        await expect(Kudzu[name](...params)).to.not.be.reverted;
      }
    }

    // sent 1 eth to Kudzu contract
    const value = ethers.parseEther('1');
    await ethers.provider.send('eth_sendTransaction', [
      {
        from: notdeployer.address,
        to: Kudzu.target,
        value: value.toString(),
      },
    ]);
    const kudzuBalance = await ethers.provider.getBalance(Kudzu.target);
    expect(kudzuBalance).to.equal(value);

    const endDate = await Kudzu.endDate();
    const delayPeriod = await Kudzu.forfeitClaim();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(endDate + delayPeriod)]);
    await hre.network.provider.send('evm_mine');

    const tx = await Kudzu.collectForfeitPrizeAfterDelay(ethers.ZeroAddress, value);
    const receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, 'EthMoved').withArgs({
      to: ethers.ZeroAddress,
      success: true,
      returnData: '0x',
      amount: value,
    });
  });

  it('basic create works', async () => {
    const [signer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    const createPrice = await Kudzu.createPrice();

    let quantity = 0;
    await expect(Kudzu.create(signer.address, quantity, { value: createPrice })).to.be.revertedWith(
      'CANT CREATE 0'
    );

    quantity = 1;
    await expect(Kudzu.create(signer.address, quantity, { value: 0 })).to.be.revertedWith(
      "GAME HASN'T STARTED"
    );

    const startDate = await Kudzu.startDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDate)]);
    await hre.network.provider.send('evm_mine');

    await expect(Kudzu.create(signer.address, quantity, { value: 0 })).to.be.revertedWith(
      'INSUFFICIENT FUNDS'
    );
    let tx = Kudzu.create(signer.address, quantity, {
      value: createPrice,
    });
    tx = await tx;
    let receipt = await tx.wait();
    let tokenId = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[0].pretty.tokenId;

    expect(receipt).to.emit(Kudzu, 'Created').withArgs({
      tokenId,
      buyer: signer.address,
    });

    expect(receipt).to.emit(Kudzu, 'TransferSingle').withArgs({
      operator: signer.address,
      from: ethers.ZeroAddress,
      to: signer.address,
      id: tokenId,
      amount: quantity,
    });

    let squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    const exists = await Kudzu.exists(tokenId);
    expect(exists).to.equal(true);

    const doesntExist = await Kudzu.exists(0);
    expect(doesntExist).to.equal(false);

    const percentOfCreate = await Kudzu.percentOfCreate();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent = (createPrice * percentOfCreate) / denominator;

    const recipientAddress = await Kudzu.recipient();
    expect(recipientAddress).to.equal(signer.address);

    expect(receipt)
      .to.emit(Kudzu, 'EthMoved')
      .withArgs({
        to: recipientAddress,
        success: true,
        returnData: '0x',
        amount: expectedPercent,
      })
      .withArgs({
        to: Kudzu.target,
        success: true,
        returnData: '0x',
        amount: createPrice - expectedPercent,
      });

    // tets with multiple quantity

    quantity = 2n;

    const value = createPrice * quantity;

    tx = await Kudzu.create(signer.address, quantity, { value });
    receipt = await tx.wait();
    tokenId = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[0].pretty.tokenId;
    const tokenId2 = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[1].pretty.tokenId;

    squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    squadSupply = await Kudzu.squadSupply(tokenId2);
    expect(squadSupply).to.equal(10);

    expect(receipt)
      .to.emit(Kudzu, 'Created')
      .withArgs({
        tokenId,
        buyer: signer.address,
      })
      .withArgs({
        tokenId: tokenId2,
        buyer: signer.address,
      });

    expect(receipt)
      .to.emit(Kudzu, 'TransferSingle')
      .withArgs({
        operator: signer.address,
        from: ethers.ZeroAddress,
        to: signer.address,
        id: tokenId,
        amount: 10,
      })
      .withArgs({
        operator: signer.address,
        from: ethers.ZeroAddress,
        to: signer.address,
        id: tokenId2,
        amount: 10,
      });

    const endDate = await Kudzu.endDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(endDate)]);
    await hre.network.provider.send('evm_mine');

    await expect(Kudzu.create(signer.address, quantity, { value })).to.be.revertedWith(
      'GAME ENDED'
    );
  });

  it('rate limits after christmas', async () => {
    const [airdropper] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    const existingAddress = await getExistingAddresses();

    const startDate = await Kudzu.startDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDate)]);
    await hre.network.provider.send('evm_mine');

    const createPrice = await Kudzu.createPrice();
    const tx = await Kudzu.create(airdropper.address, 1, {
      value: createPrice,
    });
    const receipt = await tx.wait();
    const tokenId = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[0].pretty.tokenId;

    const airdropPrice = await Kudzu.airdropPrice();
    const mainnetBlocknumber = await Kudzu.blockNumbers(1);
    const homesteadRPC = process.env.homesteadRPC;
    for (let i = 0; i < 5; i++) {
      const { proofsBlob } = await getParamsForProof(
        existingAddress[i],
        mainnetBlocknumber,
        homesteadRPC
      );
      await Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
        value: airdropPrice,
      });
    }

    const christmas = await Kudzu.christmas();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(christmas)]);
    await hre.network.provider.send('evm_mine');

    const increaseBy = await Kudzu.ONE_PER_NUM_BLOCKS();

    for (let i = 5; i < 5 + 3; i++) {
      const { proofsBlob } = await getParamsForProof(
        existingAddress[i],
        mainnetBlocknumber,
        homesteadRPC
      );
      if (i === 5) {
        await expect(
          Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
            value: airdropPrice,
          })
        ).to.not.be.reverted;
      } else if (i === 6) {
        await expect(
          Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
            value: airdropPrice,
          })
        ).to.be.revertedWith('CHRISTMAS RATE LIMIT EXCEEDED');
      } else {
        for (let j = 0; j < increaseBy; j++) {
          await hre.network.provider.send('evm_mine');
        }
        await expect(
          Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
            value: airdropPrice,
          })
        ).to.not.be.reverted;
      }
    }
  });

  it('basic airdrop works', async () => {
    const [airdropper, airdropee] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    const fakeProofsBlob = '0x';

    const formaChainId = await Kudzu.FORMA();

    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, formaChainId)
    ).to.be.revertedWith("GAME HASN'T STARTED");

    const startDate = await Kudzu.startDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDate)]);
    await hre.network.provider.send('evm_mine');

    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, formaChainId)
    ).to.be.revertedWith('INSUFFICIENT FUNDS');

    const airdropPrice = await Kudzu.airdropPrice();
    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith('NOT A HOLDER');

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(airdropper.address, 2, {
      value: createPrice * 2n,
    });
    let receipt = await tx.wait();
    const tokenId = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[0].pretty.tokenId;

    const tokenId2 = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[1].pretty.tokenId;

    await expect(
      Kudzu.connect(airdropee).airdrop(airdropee.address, tokenId, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith('NOT A HOLDER');

    await expect(
      Kudzu.airdrop(airdropper.address, tokenId, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith('ALREADY INFECTED');

    let squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    const existsOnMainnet = '0xFa398d672936Dcf428116F687244034961545D91';
    const doesNotExistOnMainnet = '0x4CeCAbE4756dBF7E8f1E30d4F54B8811a524c7d9';
    let userExists = await Kudzu.accountExists(existsOnMainnet);
    expect(userExists).to.equal(false);

    const mainnetBlocknumber = await Kudzu.blockNumbers(1);
    const homesteadRPC = process.env.homesteadRPC;

    const { proofsBlob: missinAddressProofsBlob } = await getParamsForProof(
      doesNotExistOnMainnet,
      mainnetBlocknumber,
      homesteadRPC
    );
    await expect(
      Kudzu.airdrop(doesNotExistOnMainnet, tokenId, missinAddressProofsBlob, 1, {
        value: airdropPrice,
      })
    ).to.be.revertedWith('USER DOES NOT EXIST ON SPECIFIED CHAIN');

    const { proofsBlob } = await getParamsForProof(
      existsOnMainnet,
      mainnetBlocknumber,
      homesteadRPC
    );

    tx = await Kudzu.airdrop(existsOnMainnet, tokenId, proofsBlob, 1, {
      value: airdropPrice,
    });
    receipt = await tx.wait();

    expect(receipt).to.emit(Kudzu, 'Airdrop').withArgs({
      tokenId,
      airdropper: airdropper.address,
      airdropee: existsOnMainnet,
    });

    userExists = await Kudzu.accountExists(existsOnMainnet);
    expect(userExists).to.equal(true);

    const airdropPercent = await Kudzu.percentOfAirdrop();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent = (airdropPrice * airdropPercent) / denominator;

    const recipientAddress = await Kudzu.recipient();

    expect(receipt)
      .to.emit(Kudzu, 'EthMoved')
      .withArgs({
        to: recipientAddress,
        success: true,
        returnData: '0x',
        amount: expectedPercent,
      })
      .withArgs({
        to: Kudzu.target,
        success: true,
        returnData: '0x',
        amount: airdropPrice - expectedPercent,
      });

    squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(11);

    const winningTeam = await Kudzu.getWinningToken(0);
    expect(winningTeam).to.equal(tokenId);

    await expect(
      Kudzu.airdrop(existsOnMainnet, tokenId2, fakeProofsBlob, 1, {
        value: airdropPrice,
      })
    ).to.not.be.reverted;

    const endDate = await Kudzu.endDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(endDate)]);
    await hre.network.provider.send('evm_mine');

    await expect(
      Kudzu.airdrop(airdropee.address, tokenId, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith('GAME ENDED');
  });

  it('sorts correctly', async () => {
    const [signer, addr1] = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });
    const startDay = await Kudzu.startDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDay)]);
    await hre.network.provider.send('evm_mine');

    const createPrice = await Kudzu.createPrice();
    const value = 3n * createPrice;
    const tx = await Kudzu.create(signer.address, 3, { value });
    const receipt = await tx.wait();
    const tokenId1 = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[0].pretty.tokenId;
    const tokenId2 = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[1].pretty.tokenId;
    const tokenId3 = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[2].pretty.tokenId;

    let firstPlace = await Kudzu.getWinningToken(0);
    let secondPlace = await Kudzu.getWinningToken(1);
    let thirdPlace = await Kudzu.getWinningToken(2);
    expect(firstPlace).to.equal(tokenId1);
    expect(secondPlace).to.equal(tokenId2);
    expect(thirdPlace).to.equal(tokenId3);

    const airdropPrice = await Kudzu.airdropPrice();
    await Kudzu.airdrop(addr1.address, tokenId3, '0x', 1, {
      value: airdropPrice,
    });

    firstPlace = await Kudzu.getWinningToken(0);
    secondPlace = await Kudzu.getWinningToken(1);
    thirdPlace = await Kudzu.getWinningToken(2);

    expect(firstPlace).to.equal(tokenId3);
    expect(secondPlace).to.equal(tokenId1);
    expect(thirdPlace).to.equal(tokenId2);
  });

  it('allows transfer after game ends', async () => {
    const { Kudzu } = await deployContracts({ mock: true });
    const signers = await ethers.getSigners();
    const startDay = await Kudzu.startDate();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDay)]);
    await hre.network.provider.send('evm_mine');

    // signer 0 creates 3 tokens

    const createPrice = await Kudzu.createPrice();
    const tx = await Kudzu.create(signers[0].address, 4, {
      value: createPrice * 4n,
    });
    const receipt = await tx.wait();
    const [tokenId1, tokenId2, tokenId3, tokenId4] = (
      await getParsedEventLogs(receipt, Kudzu, 'Created')
    ).map((t) => t.pretty.tokenId);

    const totalBalancePlayer0 = await Kudzu['balanceOf(address)'](signers[0].address);
    expect(totalBalancePlayer0).to.equal(40);

    // signer 0 airdrops token 1 to signers 1, 2
    const airdropPrice = await Kudzu.airdropPrice();
    await Kudzu.airdrop(signers[1].address, tokenId1, '0x', 1, {
      value: airdropPrice,
    });
    await Kudzu.airdrop(signers[2].address, tokenId1, '0x', 1, {
      value: airdropPrice,
    });

    const totalBalancePlayer1 = await Kudzu['balanceOf(address)'](signers[1].address);
    expect(totalBalancePlayer1).to.equal(1);

    // signer 0 airdrops token 2 to signer 3
    await Kudzu.airdrop(signers[3].address, tokenId2, '0x', 1, {
      value: airdropPrice,
    });

    // token 3 is not airdropped but still wins 3rd place
    const expectedPlaces = [tokenId1, tokenId2, tokenId3];

    await expect(
      Kudzu.safeTransferFrom(signers[0].address, signers[4].address, tokenId1, 1, '0x')
    ).to.be.revertedWith('GAME NOT ENDED');

    const endDate = await Kudzu.endDate();
    const claimDelay = await Kudzu.claimDelay();

    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(endDate + claimDelay)]);
    await hre.network.provider.send('evm_mine');

    const winningTokenA = await Kudzu.getWinningToken(0);
    const winningTokenB = await Kudzu.getWinningToken(1);
    const winningTokenC = await Kudzu.getWinningToken(2);
    expect(winningTokenA).to.equal(expectedPlaces[0]);
    expect(winningTokenB).to.equal(expectedPlaces[1]);
    expect(winningTokenC).to.equal(expectedPlaces[2]);

    // can't transfer an unclaimed token
    await expect(
      Kudzu.safeTransferFrom(signers[0].address, signers[4].address, tokenId1, 1, '0x')
    ).to.be.revertedWith('WINNERS CANT TRANSFER UNTIL THEY CLAIM OR CLAIM PERIOD IS OVER');

    // non winning token can be transferred already
    await expect(Kudzu.safeTransferFrom(signers[0].address, signers[7].address, tokenId4, 1, '0x'))
      .to.not.be.reverted;
    const player8Balance = await Kudzu['balanceOf(address,uint256)'](signers[7].address, tokenId4);
    expect(player8Balance).to.equal(1);

    // signer 0 has 10 of the winning tokens
    const player0Balance = await Kudzu['balanceOf(address,uint256)'](signers[0].address, tokenId1);
    expect(player0Balance).to.equal(10);

    // signer 0 claims prize for token 1
    const tx2 = await Kudzu.claimPrize(0);
    const receipt2 = await tx2.wait();
    const amountReceived = (await getParsedEventLogs(receipt2, Kudzu, 'EthMoved'))[0].pretty.amount;

    // the prize per token is calculated here by prize received / balance of tokens
    const place0ClaimPerToken = amountReceived / player0Balance;

    // signer 0 transfers 1 token to signer 4, this is fine because it has been claimed
    await Kudzu.safeTransferFrom(signers[0].address, signers[4].address, tokenId1, 1, '0x');

    const player0BalanceAfter = await Kudzu['balanceOf(address,uint256)'](
      signers[0].address,
      tokenId1
    );
    expect(player0BalanceAfter).to.equal(9);

    // tokenId1 and tokenId4 have both been transferred
    const totalBalancePlayer0After = await Kudzu['balanceOf(address)'](signers[0].address);
    expect(totalBalancePlayer0After).to.equal(38);

    const player4Balance = await Kudzu['balanceOf(address,uint256)'](signers[4].address, tokenId1);
    expect(player4Balance).to.equal(1);

    // player 4 claimed is 1 because the transfer keeps this updated
    const player4Claimed = await Kudzu.claimed(tokenId1, signers[4].address);
    expect(player4Claimed).to.equal(1);

    // player 0 claimed is 9 because they transferred 1 claimed token to player 4
    const player0Claimed = await Kudzu.claimed(tokenId1, signers[0].address);
    expect(player0Claimed).to.equal(9);

    // player 4 transfers to player 5
    await Kudzu.connect(signers[4]).safeTransferFrom(
      signers[4].address,
      signers[5].address,
      tokenId1,
      1,
      '0x'
    );
    const player4BalanceAfter = await Kudzu['balanceOf(address,uint256)'](
      signers[4].address,
      tokenId1
    );
    expect(player4BalanceAfter).to.equal(0);

    const player4TotalBalance = await Kudzu['balanceOf(address)'](signers[4].address);
    expect(player4TotalBalance).to.equal(0);

    // the claimed value is reduced for player 4 to match reduced balance
    const player4ClaimedAfter = await Kudzu.claimed(tokenId1, signers[4].address);
    expect(player4ClaimedAfter).to.equal(0);

    const player5Balance = await Kudzu['balanceOf(address,uint256)'](signers[5].address, tokenId1);
    expect(player5Balance).to.equal(1);

    // the claimed value is increased for player 5 to match increased balance
    const player5Claimed = await Kudzu.claimed(tokenId1, signers[5].address);
    expect(player5Claimed).to.equal(1);

    // player 5 transfers it back to original signer 0
    await Kudzu.connect(signers[5]).safeTransferFrom(
      signers[5].address,
      signers[0].address,
      tokenId1,
      1,
      '0x'
    );
    const player5BalanceAfter = await Kudzu['balanceOf(address,uint256)'](
      signers[5].address,
      tokenId1
    );
    expect(player5BalanceAfter).to.equal(0);

    // player 0 has original balance of 10
    const player0BalanceAfter2 = await Kudzu['balanceOf(address,uint256)'](
      signers[0].address,
      tokenId1
    );
    expect(player0BalanceAfter2).to.equal(10);

    // now send from a player 0 who has already claimed to player 1 who has not but could
    // player 1 has 1 token from original airdrop from player 0
    // player 1 has no claimed yet
    const player1Balance = await Kudzu['balanceOf(address,uint256)'](signers[1].address, tokenId1);
    expect(player1Balance).to.equal(1);

    const player1Claimed = await Kudzu.claimed(tokenId1, signers[1].address);
    expect(player1Claimed).to.equal(0);

    // player 0 transfers 2 to player 1
    await Kudzu.safeTransferFrom(signers[0].address, signers[1].address, tokenId1, 2, '0x');
    const player1BalanceAfter = await Kudzu['balanceOf(address,uint256)'](
      signers[1].address,
      tokenId1
    );
    expect(player1BalanceAfter).to.equal(3);

    // player 1 has claimed 2 of the 3 tokens via player 0's claim
    const player1ClaimedAfter = await Kudzu.claimed(tokenId1, signers[1].address);
    expect(player1ClaimedAfter).to.equal(2);

    const player0BalanceAfter3 = await Kudzu['balanceOf(address,uint256)'](
      signers[0].address,
      tokenId1
    );
    expect(player0BalanceAfter3).to.equal(8);

    const player0TotalBalanceAfter = await Kudzu['balanceOf(address)'](signers[0].address);
    expect(player0TotalBalanceAfter).to.equal(37);

    const player0Claimed2 = await Kudzu.claimed(tokenId1, signers[0].address);
    expect(player0Claimed2).to.equal(8);

    // player 1 can't transfer all 3 of their tokens because only 2 have been claimed
    await expect(
      Kudzu.connect(signers[1]).safeTransferFrom(
        signers[1].address,
        signers[6].address,
        tokenId1,
        3,
        '0x'
      )
    ).to.be.revertedWith('WINNERS CANT TRANSFER UNTIL THEY CLAIM OR CLAIM PERIOD IS OVER');

    // player 1 only gets prize for 1 out of the 3 tokens they hold since 2 are claimed
    const claimedBy1 = await Kudzu.claimed(tokenId1, signers[1].address);
    expect(claimedBy1).to.equal(2);

    const balanceOf1 = await Kudzu['balanceOf(address,uint256)'](signers[1].address, tokenId1);
    expect(balanceOf1).to.equal(3);

    const tx3 = await Kudzu.connect(signers[1]).claimPrize(0);
    const receipt3 = await tx3.wait();
    const amountReceived2 = (await getParsedEventLogs(receipt3, Kudzu, 'EthMoved'))[0].pretty
      .amount;
    expect(amountReceived2).to.equal((balanceOf1 - claimedBy1) * place0ClaimPerToken);

    // player 1 send 1 token to player 2
    await Kudzu.connect(signers[1]).safeTransferFrom(
      signers[1].address,
      signers[2].address,
      tokenId1,
      1,
      '0x'
    );
    const player1BalanceAfter3 = await Kudzu['balanceOf(address,uint256)'](
      signers[1].address,
      tokenId1
    );
    expect(player1BalanceAfter3).to.equal(2);
    const player1ClaimedAfter3 = await Kudzu.claimed(tokenId1, signers[1].address);
    expect(player1ClaimedAfter3).to.equal(2);

    const player2Balance = await Kudzu['balanceOf(address,uint256)'](signers[2].address, tokenId1);
    expect(player2Balance).to.equal(2);
    const player2Claimed = await Kudzu.claimed(tokenId1, signers[2].address);
    expect(player2Claimed).to.equal(1);

    // player 2 tries to send 2 to player 6 but fails
    await expect(
      Kudzu.connect(signers[2]).safeTransferFrom(
        signers[2].address,
        signers[6].address,
        tokenId1,
        2,
        '0x'
      )
    ).to.be.revertedWith('WINNERS CANT TRANSFER UNTIL THEY CLAIM OR CLAIM PERIOD IS OVER');
    // player 2 can only send 1, sends it to player 6
    await Kudzu.connect(signers[2]).safeTransferFrom(
      signers[2].address,
      signers[6].address,
      tokenId1,
      1,
      '0x'
    );
    const player2BalanceAfter = await Kudzu['balanceOf(address,uint256)'](
      signers[2].address,
      tokenId1
    );
    expect(player2BalanceAfter).to.equal(1);
    const player2ClaimedAfter = await Kudzu.claimed(tokenId1, signers[2].address);
    expect(player2ClaimedAfter).to.equal(0);

    const player6BalanceAfter = await Kudzu['balanceOf(address,uint256)'](
      signers[6].address,
      tokenId1
    );
    expect(player6BalanceAfter).to.equal(1);
    const player6ClaimedAfter = await Kudzu.claimed(tokenId1, signers[6].address);
    expect(player6ClaimedAfter).to.equal(1);

    // player 6 tries to claim but fails
    await expect(Kudzu.connect(signers[6]).claimPrize(0)).to.be.revertedWith('ALREADY CLAIMED');

    // player 2 tries to claim and succeeds
    const tx4 = await Kudzu.connect(signers[2]).claimPrize(0);
    const receipt4 = await tx4.wait();
    const amountReceived3 = (await getParsedEventLogs(receipt4, Kudzu, 'EthMoved'))[0].pretty
      .amount;
    expect(amountReceived3).to.equal(place0ClaimPerToken);

    // claim the prize for place 2 and 3 and make sure there's no prize left

    await Kudzu.claimPrize(1);
    await Kudzu.connect(signers[3]).claimPrize(1);

    // fast forward time and allow token in 3rd place to be transfered without claim
    const forfeitClaim = await Kudzu.forfeitClaim();
    await hre.network.provider.send('evm_setNextBlockTimestamp', [
      parseInt(endDate + forfeitClaim),
    ]);
    await hre.network.provider.send('evm_mine');

    const claimed3By0 = await Kudzu.claimed(tokenId3, signers[0].address);
    expect(claimed3By0).to.equal(0);
    const balanceOf3By0 = await Kudzu['balanceOf(address,uint256)'](signers[0].address, tokenId2);
    expect(balanceOf3By0).to.equal(10);

    await Kudzu.safeTransferFrom(signers[0].address, signers[7].address, tokenId3, 10, '0x');
  });

  it('runs the full game', async () => {
    let seed = 263294; // Math.floor(Math.random() * 1000000);

    function random() {
      const x = Math.sin(seed++) * 10000;
      const result = x - Math.floor(x);
      return result;
    }

    const stableSort = (arr, compare) =>
      arr
        .map((item, index) => ({ item, index }))
        .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
        .map(({ item }) => item);

    function updateWinningTokens(winningTokens, state, tokenId) {
      // if the token is already a record holder, update it's value and then reorder the group
      // if not, check whether it's able to enter the group
      tokenId = parseInt(tokenId);
      const supply = JSON.parse(JSON.stringify(state.tokenIds[tokenId]));
      // console.log("before", { tokenId, supply, winningTokens });
      const found = winningTokens.findIndex((t) => parseInt(t.tokenId) === parseInt(tokenId));
      if (found === -1) {
        // console.log("not found");
        if (supply > winningTokens[0].supply) {
          winningTokens[2] = winningTokens[1];
          winningTokens[1] = winningTokens[0];
          winningTokens[0] = { tokenId, supply };
        } else if (supply > winningTokens[1].supply && winningTokens[0].tokenId !== tokenId) {
          winningTokens[2] = winningTokens[1];
          winningTokens[1] = { tokenId, supply };
        } else if (
          supply > winningTokens[2].supply &&
          winningTokens[0].tokenId !== tokenId &&
          winningTokens[1].tokenId !== tokenId
        ) {
          winningTokens[2] = { tokenId, supply };
        }
      } else {
        // update supply
        // console.log("found");
        winningTokens[found].supply = supply;
        winningTokens = stableSort(
          winningTokens,
          (a, b) => parseInt(b.supply) - parseInt(a.supply)
        );
      }
      // console.log("after", { tokenId, supply, winningTokens });
      return winningTokens;
    }

    const signers = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    const startDate = await Kudzu.startDate();
    const end = await Kudzu.endDate();

    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(startDate)]);
    await hre.network.provider.send('evm_mine');

    const blocktimestamp = await Kudzu.blocktimestamp();
    expect(blocktimestamp).to.be.greaterThanOrEqual(startDate);

    const maxFamilies = 10;
    const maxAirdropees = maxFamilies * 10;

    const existingAddress = await getExistingAddresses();

    expect(signers.length).to.be.greaterThan(maxFamilies + maxAirdropees);

    const recipient = signers[signers.length - 1].address;
    const recipientStartingBalance = await ethers.provider.getBalance(recipient);
    await Kudzu.updateRecipient(recipient);

    const poolStartingBalance = await ethers.provider.getBalance(Kudzu.target);
    expect(poolStartingBalance).to.equal(0);

    const createPrice = await Kudzu.createPrice();
    const airdropPrice = await Kudzu.airdropPrice();

    const createPercent = await Kudzu.percentOfCreate();
    const airdropPercent = await Kudzu.percentOfAirdrop();

    const DENOMINATOR = await Kudzu.DENOMINATOR();

    const familyCount = maxFamilies; // Math.floor(Math.random() * (maxFamilies - 3 + 1)) + 3;
    const state = {
      pool: 0n,
      admin: 0n,
      tokenIds: {},
      points: {},
      airdrops: {},
      players: {},
    };

    let winningTokens = new Array(3).fill({ tokenId: 0, supply: 0 });

    // create
    for (let i = 0; i < familyCount; i++) {
      const founder = signers[i];
      const tx = await Kudzu.connect(founder).create(founder.address, 1, {
        value: createPrice,
      });
      const receipt = await tx.wait();
      const tokenId = (await getParsedEventLogs(receipt, Kudzu, 'Created'))[0].pretty.tokenId;
      state.tokenIds[tokenId] = 10;
      state.players[founder.address] = {};
      state.players[founder.address][tokenId] = 10;
      winningTokens = updateWinningTokens(winningTokens, state, tokenId);

      const recipeintPercent = (createPrice * createPercent) / DENOMINATOR;
      state.pool += createPrice - recipeintPercent;
      state.admin += recipeintPercent;
      const poolBalance = await ethers.provider.getBalance(Kudzu.target);
      expect(poolBalance).to.equal(state.pool);

      const recipientBalance = await ethers.provider.getBalance(recipient);
      expect(recipientBalance).to.equal(recipientStartingBalance + state.admin);
    }

    // airdrop
    const airdropeeCount = maxAirdropees; // Math.floor(Math.random() * maxAirdropees) + 1;

    const homesteadRPC = process.env.homesteadRPC;
    const mainnetBlocknumber = await Kudzu.blockNumbers(1);

    const notExistingAccount = await Kudzu.accountExists(signers[0].address);
    expect(notExistingAccount).to.equal(false);

    for (let i = 0; i < airdropeeCount; i++) {
      const airdropee = existingAddress[i];
      const signer = signers[Math.floor(random() * familyCount)];
      const player = signer.address;
      const tokenId = Object.keys(state.players[player])[
        Math.floor(random() * Object.keys(state.players[player]).length)
      ];

      // const existsOnMainnet = "0xFa398d672936Dcf428116F687244034961545D91";
      const { proofsBlob } = await getParamsForProof(airdropee, mainnetBlocknumber, homesteadRPC);

      await Kudzu.connect(signer).airdrop(airdropee, tokenId, proofsBlob, 1, {
        value: airdropPrice,
      });

      const accountExists = await Kudzu.accountExists(airdropee);
      expect(accountExists).to.equal(true);

      state.players[airdropee] ||= {};
      state.players[airdropee][tokenId] ||= 0;
      state.players[airdropee][tokenId] += 1;
      state.tokenIds[tokenId] += 1;
      winningTokens = updateWinningTokens(winningTokens, state, tokenId);

      const recipeintPercent = (airdropPrice * airdropPercent) / DENOMINATOR;
      state.pool += airdropPrice - recipeintPercent;
      state.admin += recipeintPercent;

      const poolBalance = await ethers.provider.getBalance(Kudzu.target);
      expect(poolBalance).to.equal(state.pool);
    }

    // compare state to contract
    const actualPool = await ethers.provider.getBalance(Kudzu.target);
    expect(actualPool).to.equal(state.pool);

    const actualAdmin = await ethers.provider.getBalance(recipient);
    expect(actualAdmin).to.equal(recipientStartingBalance + state.admin);

    const actualTokenCount = await Kudzu.totalSquads();
    expect(actualTokenCount).to.equal(Object.keys(state.tokenIds).length);

    for (const player in state.players) {
      for (const tokenId in state.players[player]) {
        const playerBalance = await Kudzu['balanceOf(address,uint256)'](player, tokenId);
        expect(playerBalance).to.equal(state.players[player][tokenId]);
        expect(playerBalance).to.be.greaterThan(0);
      }
    }
    for (const tokenId in state.tokenIds) {
      const squadSupply = await Kudzu.squadSupply(tokenId);
      expect(squadSupply).to.equal(state.tokenIds[tokenId]);
    }

    const totalSquads = await Kudzu.totalSquads();
    expect(totalSquads).to.equal(Object.keys(state.tokenIds).length);

    const prizePoolFinaBeforeClaim = await Kudzu.prizePoolFinal();
    expect(prizePoolFinaBeforeClaim).to.equal(0);

    const prizePool = state.pool;

    // console.log({ winningTokens });

    // for (let i = 0; i < 3; i++) {
    //   const actualWinningToken = await Kudzu.getWinningToken(i);
    //   const tokenBalance = await Kudzu.squadSupply(actualWinningToken);
    //   console.log({ i, actualWinningToken, tokenBalance });
    // }

    for (let i = 0; i < 3; i++) {
      const actualWinningToken = await Kudzu.getWinningToken(i);
      expect(actualWinningToken).to.equal(
        winningTokens[i].tokenId,
        `random seed used during run: ${seed} (remember ids will be different on subsequent runs but the values should be the same)`
      );
    }

    // console.log({ winningTokenId });

    const prizePercentFirst = await Kudzu.FIRST_PLACE_PERCENT();
    const prizePercentSecond = await Kudzu.SECOND_PLACE_PERCENT();
    const prizePercentThird = await Kudzu.THIRD_PLACE_PERCENT();

    const firstPortion = (state.pool * prizePercentFirst) / DENOMINATOR;
    const secondPortion = (state.pool * prizePercentSecond) / DENOMINATOR;
    const thirdPortion = (state.pool * prizePercentThird) / DENOMINATOR;

    const winnerPools = [firstPortion, secondPortion, thirdPortion];

    const expectedPayoutPerTokens = [];
    for (let i = 0; i < 3; i++) {
      expectedPayoutPerTokens[i] = winnerPools[i] / BigInt(winningTokens[i].supply);
    }

    // claims
    for (let i = 0; i < 3; i++) {
      const winningToken = winningTokens[i].tokenId;
      const isItTho = await Kudzu.isWinningtoken(winningToken);
      expect(isItTho).to.equal(true);
    }
    const winningToken = winningTokens[0].tokenId;

    const itIsNot = await Kudzu.isWinningtoken(0);
    expect(itIsNot).to.equal(false);

    const exampleWinner = Object.keys(state.players).find(
      (a) => state.players[a][winningToken] > 0
    );
    const signer = signers.find((s) => s.address === exampleWinner);
    await expect(Kudzu.connect(signer).claimPrize(0)).to.be.revertedWith('GAME NOT ENDED');

    // speed up chain until endDate

    await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(end)]);
    await hre.network.provider.send('evm_mine');

    await expect(Kudzu.claimPrize(0)).to.be.revertedWith('CLAIM DELAY NOT ENDED');

    const delayToClaim = await Kudzu.claimDelay();
    const realEnd = parseInt(end + delayToClaim);

    await hre.network.provider.send('evm_setNextBlockTimestamp', [realEnd]);
    await hre.network.provider.send('evm_mine');
    const currentTimestamp = await Kudzu.blocktimestamp();
    expect(currentTimestamp).to.be.greaterThanOrEqual(end);
    let unclaimedAmount = 0n;
    let totalClaimedAmount = 0n;

    let claims = 0;

    for (let i = 0; i < Object.keys(state.players).length; i++) {
      const player = Object.keys(state.players)[i];
      for (let j = 0; j < 3; j++) {
        const expectedPayoutPerToken = expectedPayoutPerTokens[j];
        const winningTokenId = winningTokens[j].tokenId;
        const totalSupplyOfWinningToken = state.tokenIds[winningTokenId];

        const playerWinningTokenBalance = state.players[player][winningTokenId];
        if (playerWinningTokenBalance > 0n) {
          const signer = signers.find((s) => s.address === player);

          const winnerPayout =
            (winnerPools[j] * BigInt(playerWinningTokenBalance)) /
            BigInt(totalSupplyOfWinningToken);

          const winnerPayoutPerToken = winnerPayout / BigInt(playerWinningTokenBalance);

          const diff = winnerPayoutPerToken - expectedPayoutPerToken;
          const absDiff = diff > 0n ? diff : -diff;
          expect(absDiff).to.be.lessThanOrEqual(1n);
          claims += 1;

          if (signer) {
            state.pool -= winnerPayout;
            totalClaimedAmount += winnerPayout;

            const tx = await Kudzu.connect(signer).claimPrize(j);
            const receipt = await tx.wait();

            await expect(Kudzu.connect(signer).claimPrize(j)).to.be.revertedWith('ALREADY CLAIMED');

            await expect(Kudzu.connect(signers[0]).claimPrize(j)).to.be.revertedWith(
              'ALREADY CLAIMED'
            );

            expect(receipt).to.emit(Kudzu, 'Claim').withArgs({
              tokenId: winningTokenId,
              claimer: player,
              prizeAmount: winnerPayout,
            });

            expect(receipt).to.emit(Kudzu, 'EthMoved').withArgs({
              to: recipient,
              success: true,
              returnData: '0x',
              amount: winnerPayout,
            });

            const claimed = await Kudzu.claimed(winningTokens[j].tokenId, player);
            const balance = await Kudzu['balanceOf(address,uint256)'](
              player,
              winningTokens[j].tokenId
            );
            expect(claimed).to.equal(balance);
            expect(claimed).to.equal(state.players[player][winningTokenId]);

            const totalClaimed = await Kudzu.totalClaimed();
            expect(totalClaimed).to.equal(totalClaimedAmount);
          } else {
            unclaimedAmount += winnerPayout;
          }

          const poolBalance = await ethers.provider.getBalance(Kudzu.target);
          expect(poolBalance).to.equal(state.pool);
        }
      }
    }

    const prizePoolFinal = await Kudzu.prizePoolFinal();
    expect(prizePool).to.equal(prizePoolFinal);

    const totalClaimed = await Kudzu.totalClaimed();
    const diff = totalClaimed - (prizePool - unclaimedAmount);
    expect(diff).to.be.lessThanOrEqual(claims);

    const poolDiff = unclaimedAmount - state.pool;
    expect(poolDiff).to.be.lessThanOrEqual(claims);
    const actualPoolEnd = await ethers.provider.getBalance(Kudzu.target);
    const actualDiff = unclaimedAmount - actualPoolEnd;
    expect(actualDiff).to.be.lessThanOrEqual(claims);

    await expect(Kudzu.collectForfeitPrizeAfterDelay(recipient, actualPoolEnd)).to.be.revertedWith(
      'REMAINING PRIZE IS FORFEIT ONLY AFTER DELAY PERIOD'
    );

    const forfeitClaim = await Kudzu.forfeitClaim();
    const afterForfeit = parseInt(end + forfeitClaim);

    await hre.network.provider.send('evm_setNextBlockTimestamp', [afterForfeit]);
    await hre.network.provider.send('evm_mine');

    await expect(Kudzu.claimPrize(0)).to.be.revertedWith('CLAIM PERIOD ENDED');

    const tx = await Kudzu.collectForfeitPrizeAfterDelay(recipient, actualPoolEnd);
    const receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, 'EthMoved').withArgs({
      to: recipient,
      success: true,
      returnData: '0x',
      amount: actualPoolEnd,
    });
  });

  it('handles a tie');

  it('eth_getProof works with userExists', async () => {
    const { Kudzu } = await deployContracts();
    const airdropee = '0xFa398d672936Dcf428116F687244034961545D91';
    const noAccount = '0x30Ce3CEd12f1faCf02Fe0da8578f809f5e4937E4';

    const chains = [
      {
        id: 1,
        rpc: process.env.homesteadRPC,
        blocknumber: 21303934,
      },
      {
        id: 984122,
        rpc: 'https://rpc.forma.art',
        blocknumber: 7065245,
      },
      {
        id: 8453,
        rpc: process.env.baseRPC,
        blocknumber: 23110927,
      },
      {
        id: 42161,
        rpc: process.env.arbitrumRPC,
        blocknumber: 280041525,
      },
      {
        id: 10,
        rpc: process.env.optimismRPC,
        blocknumber: 128706212,
      },
    ];
    for (let i = 0; i < chains.length; i++) {
      const c = chains[i];
      const { stateRoot, proofsBlob } = await getParamsForProof(airdropee, c.blocknumber, c.rpc);
      const storedStateRoot = await Kudzu.stateRoots(c.id);
      expect(storedStateRoot).to.equal(stateRoot, `chain id: ${c.id}`);

      const storedBlocknumber = await Kudzu.blockNumbers(c.id);
      expect(c.blocknumber).to.equal(storedBlocknumber, `chain id: ${c.id}`);

      const exists = await Kudzu.userExists(airdropee, stateRoot, proofsBlob);
      expect(exists[0]).to.equal(true);

      const { proofsBlob: proofsBlob2 } = await getParamsForProof(noAccount, c.blocknumber, c.rpc);
      const doesNotExist = await Kudzu.userExists(noAccount, stateRoot, proofsBlob2);
      expect(doesNotExist[0]).to.equal(false);
    }
  });
});
