import { expect } from "chai";
import { describe, it } from "mocha";

import hre from "hardhat";
const ethers = hre.ethers;

import {
  deployContracts,
  getParsedEventLogs,
  getParamsForProof,
} from "../scripts/utils.js";

// let tx
describe("Kudzu Tests", function () {
  this.timeout(50000000);

  it("has all the correct interfaces", async () => {
    const interfaces = [
      { name: "ERC165", id: "0x01ffc9a7", supported: true },
      { name: "ERC1155", id: "0xd9b67a26", supported: true },
      { name: "ERC1155Metadata", id: "0x0e89341c", supported: true },
      { name: "ERC721", id: "0x80ac58cd", supported: false },
      { name: "ERC721Metadata", id: "0x5b5e139f", supported: false },
      { name: "ERC4906MetadataUpdate", id: "0x49064906", supported: true },
      { name: "ERC721Enumerable", id: "0x780e9d63", supported: false },
      { name: "ERC2981", id: "0x2a55205a", supported: false },
      { name: "ERC20", id: "0x36372b07", supported: false },
    ];
    const { Kudzu } = await deployContracts();

    for (let i = 0; i < interfaces.length; i++) {
      const { name, id, supported } = interfaces[i];
      const supportsInterface2 = await Kudzu.supportsInterface(id);
      expect(name + supportsInterface2).to.equal(name + supported);
    }
  });

  it("getPiecesOfTokenID works", async () => {
    const tokenId = 9897988;
    const expectedEyes = 0x8;
    const expectedMouth = 0x4;
    const realTokenId = 151;
    const { Kudzu } = await deployContracts();
    const pieces = await Kudzu.getPiecesOfTokenID(tokenId);
    expect(pieces.id).to.equal(realTokenId);
    expect(pieces.eyes).to.equal(expectedEyes);
    expect(pieces.mouth).to.equal(expectedMouth);
  });

  it("checks URI works", async () => {
    const { Kudzu, ExternalMetadata } = await deployContracts();
    const tokenId = 1;
    const uri = await Kudzu.uri(tokenId);
    expect(uri).to.equal("https://virus.folia.app/celestia/1");
    const externalUri = await ExternalMetadata.getMetadata(tokenId);
    expect(externalUri).to.equal(uri);
  });

  it("checks emitBatchMetadataUpdate works", async () => {
    const [signer, notdeployer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });
    const costToCreate = await Kudzu.createPrice();
    const quantity = 10n;
    const value = costToCreate * quantity;
    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1000);
    await Kudzu.create(signer.address, quantity, { value });

    await expect(
      Kudzu.connect(notdeployer).emitBatchMetadataUpdate()
    ).to.be.revertedWith("Ownable: caller is not the owner");

    const tx = await Kudzu.emitBatchMetadataUpdate();
    const receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, "BatchMetadataUpdate").withArgs({
      startTokenId: 1,
      quantity,
    });
  });

  it("ensures onlyOwner is applied correctly", async () => {
    const [, notdeployer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });
    const functions = [
      { name: "emitBatchMetadataUpdate", params: [] },
      { name: "updateMetadata", params: [notdeployer.address] },
      { name: "updateStartDate", params: [0] },
      { name: "updateEndDate", params: [0] },
      { name: "updateRecipient", params: [notdeployer.address] },
      { name: "updatePrices", params: [0, 0] },
      { name: "updatePercentages", params: [0, 0] },
      {
        name: "collectForfeitPrizeAfterDelay",
        params: [notdeployer.address, 0],
      },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(
        Kudzu.connect(notdeployer)[name](...params)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(Kudzu[name](...params)).to.not.be.reverted;
    }

    const updatePercentages = functions.find(
      (f) => f.name === "updatePercentages"
    );
    const DENOMINATOR = await Kudzu.DENOMINATOR();
    const { params } = updatePercentages;
    for (let i = 0; i < params.length; i++) {
      params[i] = DENOMINATOR + 1n;
      await expect(Kudzu[updatePercentages.name](...params)).to.be.revertedWith(
        "INVALID PERCENTAGE"
      );
      params[i] = 0;
    }

    // sent 1 eth to Kudzu contract
    const value = ethers.parseEther("1");
    await ethers.provider.send("eth_sendTransaction", [
      {
        from: notdeployer.address,
        to: Kudzu.target,
        value: value.toString(),
      },
    ]);
    const kudzuBalance = await ethers.provider.getBalance(Kudzu.target);
    expect(kudzuBalance).to.equal(value);

    await Kudzu.updateEndDate(0);

    const tx = await Kudzu.collectForfeitPrizeAfterDelay(
      ethers.ZeroAddress,
      value
    );
    const receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, "EthMoved").withArgs({
      to: ethers.ZeroAddress,
      success: true,
      returnData: "0x",
      amount: value,
    });
  });

  it("basic create works", async () => {
    const [signer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });

    const createPrice = await Kudzu.createPrice();

    let quantity = 0;
    await expect(
      Kudzu.create(signer.address, quantity, { value: createPrice })
    ).to.be.revertedWith("CANT CREATE 0");

    quantity = 1;
    await expect(
      Kudzu.create(signer.address, quantity, { value: 0 })
    ).to.be.revertedWith("GAME HASN'T STARTED");

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    await expect(
      Kudzu.create(signer.address, quantity, { value: 0 })
    ).to.be.revertedWith("INSUFFICIENT FUNDS");
    let tx = Kudzu.create(signer.address, quantity, {
      value: createPrice,
    });
    tx = await tx;
    let receipt = await tx.wait();
    let tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;

    expect(receipt).to.emit(Kudzu, "Created").withArgs({
      tokenId,
      buyer: signer.address,
    });

    expect(receipt).to.emit(Kudzu, "TransferSingle").withArgs({
      operator: signer.address,
      from: ethers.ZeroAddress,
      to: signer.address,
      id: tokenId,
      amount: quantity,
    });

    let squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    const percentOfCreate = await Kudzu.percentOfCreate();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent = (createPrice * percentOfCreate) / denominator;

    const recipientAddress = await Kudzu.recipient();
    expect(recipientAddress).to.equal(signer.address);

    expect(receipt)
      .to.emit(Kudzu, "EthMoved")
      .withArgs({
        to: recipientAddress,
        success: true,
        returnData: "0x",
        amount: expectedPercent,
      })
      .withArgs({
        to: Kudzu.target,
        success: true,
        returnData: "0x",
        amount: createPrice - expectedPercent,
      });

    // tets with multiple quantity

    quantity = 2n;

    const value = createPrice * quantity;

    tx = await Kudzu.create(signer.address, quantity, { value });
    receipt = await tx.wait();
    tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0].pretty
      .tokenId;
    const tokenId2 = (await getParsedEventLogs(receipt, Kudzu, "Created"))[1]
      .pretty.tokenId;

    squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    squadSupply = await Kudzu.squadSupply(tokenId2);
    expect(squadSupply).to.equal(10);

    expect(receipt)
      .to.emit(Kudzu, "Created")
      .withArgs({
        tokenId,
        buyer: signer.address,
      })
      .withArgs({
        tokenId: tokenId2,
        buyer: signer.address,
      });

    expect(receipt)
      .to.emit(Kudzu, "TransferSingle")
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
  });

  it("basic airdrop works", async () => {
    const [airdropper, airdropee] = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });

    const fakeProofsBlob = "0x";

    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, true)
    ).to.be.revertedWith("GAME HASN'T STARTED");

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, true)
    ).to.be.revertedWith("INSUFFICIENT FUNDS");

    const airdropPrice = await Kudzu.airdropPrice();
    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, true, {
        value: airdropPrice,
      })
    ).to.be.revertedWith("NOT A HOLDER");

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(airdropper.address, 1, {
      value: createPrice,
    });
    let receipt = await tx.wait();
    const tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;

    await expect(
      Kudzu.connect(airdropee).airdrop(
        airdropee.address,
        tokenId,
        fakeProofsBlob,
        true,
        {
          value: airdropPrice,
        }
      )
    ).to.be.revertedWith("NOT A HOLDER");

    await expect(
      Kudzu.airdrop(airdropper.address, tokenId, fakeProofsBlob, true, {
        value: airdropPrice,
      })
    ).to.be.revertedWith("ALREADY INFECTED");

    let squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    const existsOnMainnet = "0xFa398d672936Dcf428116F687244034961545D91";
    const mainnetBlocknumber = await Kudzu.BLOCK_NUMBER();
    const homesteadRPC = process.env.homesteadRPC;
    const { proofsBlob } = await getParamsForProof(
      existsOnMainnet,
      mainnetBlocknumber,
      homesteadRPC
    );

    tx = await Kudzu.airdrop(existsOnMainnet, tokenId, proofsBlob, false, {
      value: airdropPrice,
    });
    receipt = await tx.wait();

    expect(receipt).to.emit(Kudzu, "Airdrop").withArgs({
      tokenId,
      airdropper: airdropper.address,
      airdropee: existsOnMainnet,
    });

    const airdropPercent = await Kudzu.percentOfAirdrop();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent = (airdropPrice * airdropPercent) / denominator;

    const recipientAddress = await Kudzu.recipient();

    expect(receipt)
      .to.emit(Kudzu, "EthMoved")
      .withArgs({
        to: recipientAddress,
        success: true,
        returnData: "0x",
        amount: expectedPercent,
      })
      .withArgs({
        to: Kudzu.target,
        success: true,
        returnData: "0x",
        amount: airdropPrice - expectedPercent,
      });

    squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(11);

    const winningTeam = await Kudzu.getWinningToken(0);
    expect(winningTeam).to.equal(tokenId);
  });

  it("runs the full game", async () => {
    const signers = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });
    const now = Math.floor(Date.now() / 1000);
    const end = now + 60 * 60 * 24 * 7;
    const newStartDate = now - 1000;
    await Kudzu.updateStartDate(newStartDate);
    const startDate = await Kudzu.startDate();
    expect(startDate).to.equal(newStartDate);
    const blocktimestamp = await Kudzu.blocktimestamp();
    expect(blocktimestamp).to.be.greaterThan(newStartDate);
    await Kudzu.updateEndDate(end);
    const maxFamilies = 10;
    const maxAirdropees = maxFamilies * 10;

    const RPC = process.env.homesteadRPC;
    const blockNumber = await Kudzu.BLOCK_NUMBER();
    const provider = new ethers.JsonRpcProvider(RPC);
    const block = await provider.getBlock(blockNumber, true);
    const blockPayload = await Promise.all(
      block.transactions.map((hash) => block.getPrefetchedTransaction(hash))
    );

    // NOTE: these are not unique addresses
    const existingAddress = blockPayload.map((t) => t.from);

    expect(signers.length).to.be.greaterThan(maxFamilies + maxAirdropees);

    const recipient = signers[signers.length - 1].address;
    const recipientStartingBalance =
      await ethers.provider.getBalance(recipient);
    await Kudzu.updateRecipient(recipient);

    const poolStartingBalance = await ethers.provider.getBalance(Kudzu.target);
    expect(poolStartingBalance).to.equal(0);

    const createPrice = await Kudzu.createPrice();
    const airdropPrice = await Kudzu.airdropPrice();

    const createPercent = await Kudzu.percentOfCreate();
    const airdropPercent = await Kudzu.percentOfAirdrop();

    const DENOMINATOR = await Kudzu.DENOMINATOR();

    const familyCount = Math.floor(Math.random() * (maxFamilies - 3 + 1)) + 3;
    const state = {
      pool: 0n,
      admin: 0n,
      tokenIds: {},
      points: {},
      airdrops: {},
      players: {},
    };

    const winningTokens = new Array(3).fill({ tokenId: 0, supply: 0 });

    function updateWinningTokens(tokenId) {
      // if the token is already a record holder, update it's value and then reorder the group
      // if not, check whether it's able to enter the group
      tokenId = parseInt(tokenId);
      const supply = parseInt(state.tokenIds[tokenId]);
      const found = winningTokens.findIndex((t) => t.tokenId === tokenId);
      if (found > -1) {
        // update supply
        winningTokens[found].supply = supply;
        // sort the array
        for (let i = 0; i < 3; i++) {
          for (let j = i + 1; j < 3; j++) {
            if (winningTokens[i].supply < winningTokens[j].supply) {
              const temp = winningTokens[i];
              winningTokens[i] = winningTokens[j];
              winningTokens[j] = temp;
            }
          }
        }
      } else {
        for (let i = 0; i < winningTokens.length; i++) {
          if (supply > winningTokens[i].supply) {
            for (let j = i; j < winningTokens.length - 1; j++) {
              winningTokens[j + 1] = winningTokens[j];
            }
            winningTokens[i] = { tokenId, supply };
            break;
          }
        }
      }
    }
    // create
    for (let i = 0; i < familyCount; i++) {
      const founder = signers[i];
      const tx = await Kudzu.connect(founder).create(founder.address, 1, {
        value: createPrice,
      });
      const receipt = await tx.wait();
      const tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
        .pretty.tokenId;
      state.tokenIds[tokenId] = 10;
      state.players[founder.address] = {};
      state.players[founder.address][tokenId] = 10;
      updateWinningTokens(tokenId);

      const recipeintPercent = (createPrice * createPercent) / DENOMINATOR;
      state.pool += createPrice - recipeintPercent;
      state.admin += recipeintPercent;
      const poolBalance = await ethers.provider.getBalance(Kudzu.target);
      expect(poolBalance).to.equal(state.pool);

      const recipientBalance = await ethers.provider.getBalance(recipient);
      expect(recipientBalance).to.equal(recipientStartingBalance + state.admin);
    }

    // airdrop
    const airdropeeCount = Math.floor(Math.random() * maxAirdropees) + 1;

    const homesteadRPC = process.env.homesteadRPC;
    const mainnetBlocknumber = await Kudzu.BLOCK_NUMBER();

    for (let i = 0; i < airdropeeCount; i++) {
      const airdropee = existingAddress[i];
      const signer = signers[Math.floor(Math.random() * familyCount)];
      const player = signer.address;
      const tokenId = Object.keys(state.players[player])[
        Math.floor(Math.random() * Object.keys(state.players[player]).length)
      ];

      // const existsOnMainnet = "0xFa398d672936Dcf428116F687244034961545D91";
      const { proofsBlob } = await getParamsForProof(
        airdropee,
        mainnetBlocknumber,
        homesteadRPC
      );

      await Kudzu.connect(signer).airdrop(
        airdropee,
        tokenId,
        proofsBlob,
        false,
        {
          value: airdropPrice,
        }
      );

      state.players[airdropee] ||= {};
      state.players[airdropee][tokenId] ||= 0;
      state.players[airdropee][tokenId] += 1;
      state.tokenIds[tokenId] += 1;
      updateWinningTokens(tokenId);

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

    // console.log({ winningTokens });

    // for (let i = 0; i < 3; i++) {
    //   const actualWinningToken = await Kudzu.getWinningToken(i);
    //   const tokenBalance = await Kudzu.squadSupply(actualWinningToken);
    //   console.log({ i, actualWinningToken, tokenBalance });
    // }

    for (let i = 0; i < 3; i++) {
      const actualWinningToken = await Kudzu.getWinningToken(i);
      expect(actualWinningToken).to.equal(winningTokens[i].tokenId);
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
      expectedPayoutPerTokens[i] =
        winnerPools[i] / BigInt(winningTokens[i].supply);
    }

    // claims

    const winningToken = winningTokens[0].tokenId;
    const isItTho = await Kudzu.winningToken(winningToken);
    expect(isItTho).to.equal(true);

    const itIsNot = await Kudzu.winningToken(0);
    expect(itIsNot).to.equal(false);

    const exampleWinner = Object.keys(state.players).find(
      (a) => state.players[a][winningToken] > 0
    );
    const signer = signers.find((s) => s.address === exampleWinner);
    await expect(Kudzu.connect(signer).claimPrize(0)).to.be.revertedWith(
      "GAME NOT ENDED"
    );

    // speed up chain until endDate
    const delayToClaim = await Kudzu.claimDelay();
    const realEnd = end + parseInt(delayToClaim);

    await hre.network.provider.send("evm_setNextBlockTimestamp", [realEnd]);
    await hre.network.provider.send("evm_mine");
    const currentTimestamp = await Kudzu.blocktimestamp();
    expect(currentTimestamp).to.be.greaterThanOrEqual(end);
    let unclaimedAmount = 0n;

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

          const winnerPayoutPerToken =
            winnerPayout / BigInt(playerWinningTokenBalance);

          const diff = winnerPayoutPerToken - expectedPayoutPerToken;
          const absDiff = diff > 0n ? diff : -diff;
          expect(absDiff).to.be.lessThanOrEqual(1n);
          claims += 1;

          if (signer) {
            state.pool -= winnerPayout;

            const tx = await Kudzu.connect(signer).claimPrize(j);
            const receipt = await tx.wait();

            expect(receipt).to.emit(Kudzu, "Claim").withArgs({
              tokenId: winningTokenId,
              claimer: player,
              prizeAmount: winnerPayout,
            });

            expect(receipt).to.emit(Kudzu, "EthMoved").withArgs({
              to: recipient,
              success: true,
              returnData: "0x",
              amount: winnerPayout,
            });
          } else {
            unclaimedAmount += winnerPayout;
          }

          const poolBalance = await ethers.provider.getBalance(Kudzu.target);
          expect(poolBalance).to.equal(state.pool);
        }
      }
    }

    const poolDiff = unclaimedAmount - state.pool;
    expect(poolDiff).to.be.lessThanOrEqual(claims);
    const actualPoolEnd = await ethers.provider.getBalance(Kudzu.target);
    const actualDiff = unclaimedAmount - actualPoolEnd;
    expect(actualDiff).to.be.lessThanOrEqual(claims);

    await expect(
      Kudzu.collectForfeitPrizeAfterDelay(recipient, actualPoolEnd)
    ).to.be.revertedWith("REMAINING PRIZE IS FORFEIT ONLY AFTER DELAY PERIOD");

    const forfeitClaim = await Kudzu.forfeitClaim();
    const afterForfeit = end + parseInt(forfeitClaim);

    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      afterForfeit,
    ]);
    await hre.network.provider.send("evm_mine");

    const tx = await Kudzu.collectForfeitPrizeAfterDelay(
      recipient,
      actualPoolEnd
    );
    const receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, "EthMoved").withArgs({
      to: recipient,
      success: true,
      returnData: "0x",
      amount: actualPoolEnd,
    });
  });

  it("handles a tie");

  it("eth_getProof works with userExists", async () => {
    const { Kudzu } = await deployContracts();
    const airdropee = "0xFa398d672936Dcf428116F687244034961545D91";
    const noAccount = "0x30Ce3CEd12f1faCf02Fe0da8578f809f5e4937E4";

    // forma
    const formaRPC = "https://rpc.forma.art";
    const formaBlocknumber = 7065245;
    const { stateRoot: formaStateroot, proofsBlob: formaProofsBlob } =
      await getParamsForProof(airdropee, formaBlocknumber, formaRPC);
    const storedFormaStateRoot = await Kudzu.STATE_ROOT_FORMA();
    expect(formaStateroot).to.equal(storedFormaStateRoot);
    const formaExists = await Kudzu.userExists(
      airdropee,
      formaStateroot,
      formaProofsBlob
    );
    expect(formaExists[0]).to.equal(true);

    const { proofsBlob: formaProofsBlob2 } = await getParamsForProof(
      noAccount,
      formaBlocknumber,
      formaRPC
    );
    const notExistsForma = await Kudzu.userExists(
      noAccount,
      formaStateroot,
      formaProofsBlob2
    );
    expect(notExistsForma[0]).to.equal(false);

    // mainnet
    const blocknumber = 21303934;
    const RPC = process.env.homesteadRPC;
    const { stateRoot, proofsBlob } = await getParamsForProof(
      airdropee,
      blocknumber,
      RPC
    );
    const storedStateRoot = await Kudzu.STATE_ROOT();
    expect(stateRoot).to.equal(storedStateRoot);
    const exists = await Kudzu.userExists(airdropee, stateRoot, proofsBlob);
    const expectedBalance = 277344486899296690n;
    expect(exists[0]).to.equal(true);
    expect(exists[1]).to.equal(expectedBalance);

    const { proofsBlob: proofsBlob2 } = await getParamsForProof(
      noAccount,
      blocknumber,
      RPC
    );
    const notExists = await Kudzu.userExists(noAccount, stateRoot, proofsBlob2);
    expect(notExists[0]).to.equal(false);
  });
});
