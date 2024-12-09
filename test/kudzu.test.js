import { expect } from "chai";
import { describe, it, before, afterEach } from "mocha";

import hre from "hardhat";
const ethers = hre.ethers;

import { deployContracts, getParsedEventLogs } from "../scripts/utils.js";
import { getParamsForProof } from "../scripts/exportUtils.js";

let existingAddress;
async function getExistingAddresses() {
  if (existingAddress) return existingAddress;

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
describe("Kudzu Tests", function () {
  this.timeout(50000000);
  before(async function () {
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });
  afterEach(async function () {
    await hre.network.provider.send("evm_revert", [snapshot]);
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });

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
      { name: "RANDOM", id: "0x36372b08", supported: false },
      { name: "ITokenMetadata", id: "0xe99684b9", supported: true },
      { name: "IERC1155MintablePayable", id: "0x156e29f6", supported: true },
      { name: "Ownable", id: "0x0e083076", supported: true },
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
    const expectedURL = "https://virus.folia.app/celestia/1";
    const uri = await Kudzu.uri(tokenId);
    expect(uri).to.equal(expectedURL);
    const externalUri = await ExternalMetadata.getMetadata(tokenId);
    expect(externalUri).to.equal(expectedURL);

    const altURI = await Kudzu.tokenURI(tokenId);
    expect(altURI).to.equal(expectedURL);

    const altURI2 = await Kudzu.getTokenMetadata(tokenId);
    expect(altURI2).to.equal(expectedURL);
  });

  it("checks emitBatchMetadataUpdate works", async () => {
    const [signer, notdeployer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();
    const costToCreate = await Kudzu.createPrice();
    const quantity = 10n;
    const value = costToCreate * quantity;
    const startDate = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");

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
    const { Kudzu } = await deployContracts();
    const functions = [
      { name: "emitBatchMetadataUpdate", params: [] },
      { name: "updateMetadata", params: [notdeployer.address] },
      { name: "updateRecipient", params: [notdeployer.address] },
      { name: "addChain", params: [2, 2, "0x" + "0".repeat(64)] },
      {
        name: "collectForfeitPrizeAfterDelay",
        params: [notdeployer.address, 0],
        skipOwnerCheck: true,
      },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(
        Kudzu.connect(notdeployer)[name](...params)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      if (!functions[i].skipOwnerCheck) {
        await expect(Kudzu[name](...params)).to.not.be.reverted;
      }
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

    const endDate = await Kudzu.endDate();
    const delayPeriod = await Kudzu.forfeitClaim();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(endDate + delayPeriod),
    ]);
    await hre.network.provider.send("evm_mine");

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
    const { Kudzu } = await deployContracts();

    const createPrice = await Kudzu.createPrice();

    let quantity = 0;
    await expect(
      Kudzu.create(signer.address, quantity, { value: createPrice })
    ).to.be.revertedWith("CANT CREATE 0");

    quantity = 1;
    await expect(
      Kudzu.create(signer.address, quantity, { value: 0 })
    ).to.be.revertedWith("GAME HASN'T STARTED");

    const startDate = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");

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

    const endDate = await Kudzu.endDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(endDate),
    ]);
    await hre.network.provider.send("evm_mine");

    await expect(
      Kudzu.create(signer.address, quantity, { value })
    ).to.be.revertedWith("GAME ENDED");
  });

  it("rate limits after christmas", async () => {
    const [airdropper] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    const existingAddress = await getExistingAddresses();

    const startDate = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");

    const createPrice = await Kudzu.createPrice();
    const tx = await Kudzu.create(airdropper.address, 1, {
      value: createPrice,
    });
    const receipt = await tx.wait();
    const tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;

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
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(christmas),
    ]);
    await hre.network.provider.send("evm_mine");

    const increaseBy = await Kudzu.ONE_PER_NUM_BLOCKS();

    for (let i = 5; i < 5 + 3; i++) {
      const { proofsBlob } = await getParamsForProof(
        existingAddress[i],
        mainnetBlocknumber,
        homesteadRPC
      );
      if (i == 5) {
        await expect(
          Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
            value: airdropPrice,
          })
        ).to.not.be.reverted;
      } else if (i == 6) {
        await expect(
          Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
            value: airdropPrice,
          })
        ).to.be.revertedWith("CHRISTMAS RATE LIMIT EXCEEDED");
      } else {
        for (let j = 0; j < increaseBy; j++) {
          await hre.network.provider.send("evm_mine");
        }
        await expect(
          Kudzu.airdrop(existingAddress[i], tokenId, proofsBlob, 1, {
            value: airdropPrice,
          })
        ).to.not.be.reverted;
      }
    }
  });

  it("basic airdrop works", async () => {
    const [airdropper, airdropee] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    const fakeProofsBlob = "0x";

    const formaChainId = await Kudzu.FORMA();

    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, formaChainId)
    ).to.be.revertedWith("GAME HASN'T STARTED");

    const startDate = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");

    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, formaChainId)
    ).to.be.revertedWith("INSUFFICIENT FUNDS");

    const airdropPrice = await Kudzu.airdropPrice();
    await expect(
      Kudzu.airdrop(airdropee.address, 0, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith("NOT A HOLDER");

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(airdropper.address, 2, {
      value: createPrice * 2n,
    });
    let receipt = await tx.wait();
    const tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;

    const tokenId2 = (await getParsedEventLogs(receipt, Kudzu, "Created"))[1]
      .pretty.tokenId;

    await expect(
      Kudzu.connect(airdropee).airdrop(
        airdropee.address,
        tokenId,
        fakeProofsBlob,
        formaChainId,
        {
          value: airdropPrice,
        }
      )
    ).to.be.revertedWith("NOT A HOLDER");

    await expect(
      Kudzu.airdrop(airdropper.address, tokenId, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith("ALREADY INFECTED");

    let squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(10);

    const existsOnMainnet = "0xFa398d672936Dcf428116F687244034961545D91";
    const doesNotExistOnMainnet = "0x4CeCAbE4756dBF7E8f1E30d4F54B8811a524c7d9";
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
      Kudzu.airdrop(
        doesNotExistOnMainnet,
        tokenId,
        missinAddressProofsBlob,
        1,
        {
          value: airdropPrice,
        }
      )
    ).to.be.revertedWith("USER DOES NOT EXIST ON SPECIFIED CHAIN");

    const { proofsBlob } = await getParamsForProof(
      existsOnMainnet,
      mainnetBlocknumber,
      homesteadRPC
    );

    tx = await Kudzu.airdrop(existsOnMainnet, tokenId, proofsBlob, 1, {
      value: airdropPrice,
    });
    receipt = await tx.wait();

    expect(receipt).to.emit(Kudzu, "Airdrop").withArgs({
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

    await expect(
      Kudzu.airdrop(existsOnMainnet, tokenId2, fakeProofsBlob, 1, {
        value: airdropPrice,
      })
    ).to.not.be.reverted;

    const endDate = await Kudzu.endDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(endDate),
    ]);
    await hre.network.provider.send("evm_mine");

    await expect(
      Kudzu.airdrop(airdropee.address, tokenId, fakeProofsBlob, formaChainId, {
        value: airdropPrice,
      })
    ).to.be.revertedWith("GAME ENDED");
  });

  it("sorts correctly", async () => {
    const [signer, addr1] = await ethers.getSigners();
    const { Kudzu } = await deployContracts({ mock: true });
    const startDay = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDay),
    ]);
    await hre.network.provider.send("evm_mine");

    const createPrice = await Kudzu.createPrice();
    const value = 3n * createPrice;
    const tx = await Kudzu.create(signer.address, 3, { value });
    const receipt = await tx.wait();
    const tokenId1 = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;
    const tokenId2 = (await getParsedEventLogs(receipt, Kudzu, "Created"))[1]
      .pretty.tokenId;
    const tokenId3 = (await getParsedEventLogs(receipt, Kudzu, "Created"))[2]
      .pretty.tokenId;

    let firstPlace = await Kudzu.getWinningToken(0);
    let secondPlace = await Kudzu.getWinningToken(1);
    let thirdPlace = await Kudzu.getWinningToken(2);
    expect(firstPlace).to.equal(tokenId1);
    expect(secondPlace).to.equal(tokenId2);
    expect(thirdPlace).to.equal(tokenId3);

    const airdropPrice = await Kudzu.airdropPrice();
    await Kudzu.airdrop(addr1.address, tokenId3, "0x", 1, {
      value: airdropPrice,
    });

    firstPlace = await Kudzu.getWinningToken(0);
    secondPlace = await Kudzu.getWinningToken(1);
    thirdPlace = await Kudzu.getWinningToken(2);

    expect(firstPlace).to.equal(tokenId3);
    expect(secondPlace).to.equal(tokenId1);
    expect(thirdPlace).to.equal(tokenId2);
  });

  it("tests infect", async () => {
    const { Kudzu } = await deployContracts();
    const signers = await ethers.getSigners();
    const startDay = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDay),
    ]);
    await hre.network.provider.send("evm_mine");
    const createPrice = await Kudzu.createPrice();

    await expect(
      Kudzu.mint(signers[0].address, 1, 1, {
        value: createPrice,
      })
    ).to.be.revertedWith("MINT ONLY FOR NEW TOKENS");

    let tx = await Kudzu.mint(signers[0].address, 0, 1, {
      value: createPrice,
    });
    let receipt = await tx.wait();
    const tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;

    const mainnetBlocknumber = await Kudzu.blockNumbers(1);
    const homesteadRPC = process.env.homesteadRPC;
    const { proofsBlob } = await getParamsForProof(
      signers[1].address,
      mainnetBlocknumber,
      homesteadRPC
    );
    const airdropPrice = await Kudzu.airdropPrice();
    await Kudzu.airdrop(signers[1].address, tokenId, proofsBlob, 1, {
      value: airdropPrice,
    });

    const { proofsBlob: proofsBlob2 } = await getParamsForProof(
      signers[2].address,
      mainnetBlocknumber,
      homesteadRPC
    );
    await Kudzu.airdrop(signers[2].address, tokenId, proofsBlob2, 1, {
      value: airdropPrice,
    });

    await expect(Kudzu.infect(tokenId, signers[1].address)).to.be.revertedWith(
      "GAME NOT ENDED"
    );
    await expect(
      Kudzu.safeTransferFrom(
        signers[0].address,
        signers[1].address,
        tokenId,
        1,
        "0x"
      )
    ).to.be.revertedWith("GAME NOT ENDED");

    await expect(
      Kudzu.safeBatchTransferFrom(
        signers[0].address,
        signers[1].address,
        [tokenId],
        [1],
        "0x"
      )
    ).to.be.revertedWith("GAME NOT ENDED");

    const endDate = await Kudzu.endDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(endDate),
    ]);
    await hre.network.provider.send("evm_mine");
    await expect(Kudzu.infect(tokenId, signers[3].address)).to.be.revertedWith(
      "WINNERS CANT INFECT UNTIL THEY CLAIM OR CLAIM PERIOD IS OVER"
    );
    const claimDelay = await Kudzu.claimDelay();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(endDate + claimDelay),
    ]);
    await hre.network.provider.send("evm_mine");
    await Kudzu.claimPrize(0);
    await expect(Kudzu.infect(0, signers[3].address)).to.be.revertedWith(
      "NOT A HOLDER"
    );
    await expect(Kudzu.infect(tokenId, signers[0].address)).to.be.revertedWith(
      "ALREADY INFECTED"
    );
    tx = await Kudzu.infect(tokenId, signers[3].address);
    receipt = await tx.wait();
    expect(receipt).to.emit(Kudzu, "Airdrop").withArgs({
      tokenId,
      from: signers[3].address,
      to: signers[0].address,
    });

    await expect(
      Kudzu.connect(signers[1]).infect(tokenId, signers[4].address)
    ).to.be.revertedWith(
      "WINNERS CANT INFECT UNTIL THEY CLAIM OR CLAIM PERIOD IS OVER"
    );

    const forfeitClaim = await Kudzu.forfeitClaim();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(endDate + claimDelay + forfeitClaim),
    ]);
    await hre.network.provider.send("evm_mine");
    await expect(Kudzu.connect(signers[1]).claimPrize(0)).to.be.revertedWith(
      "CLAIM PERIOD ENDED"
    );

    await expect(Kudzu.connect(signers[1]).infect(tokenId, signers[4].address))
      .to.not.be.reverted;
  });

  it("runs the full game", async () => {
    let seed = 263294; //Math.floor(Math.random() * 1000000);

    function random() {
      var x = Math.sin(seed++) * 10000;
      const result = x - Math.floor(x);
      return result;
    }

    var stableSort = (arr, compare) =>
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
      const found = winningTokens.findIndex(
        (t) => parseInt(t.tokenId) === parseInt(tokenId)
      );
      if (found == -1) {
        // console.log("not found");
        if (supply > winningTokens[0].supply) {
          winningTokens[2] = winningTokens[1];
          winningTokens[1] = winningTokens[0];
          winningTokens[0] = { tokenId: tokenId, supply: supply };
        } else if (
          supply > winningTokens[1].supply &&
          winningTokens[0].tokenId != tokenId
        ) {
          winningTokens[2] = winningTokens[1];
          winningTokens[1] = { tokenId: tokenId, supply: supply };
        } else if (
          supply > winningTokens[2].supply &&
          winningTokens[0].tokenId != tokenId &&
          winningTokens[1].tokenId != tokenId
        ) {
          winningTokens[2] = { tokenId: tokenId, supply: supply };
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

    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");

    const blocktimestamp = await Kudzu.blocktimestamp();
    expect(blocktimestamp).to.be.greaterThanOrEqual(startDate);

    const maxFamilies = 10;
    const maxAirdropees = maxFamilies * 10;

    const existingAddress = await getExistingAddresses();

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

    const familyCount = maxFamilies; //Math.floor(Math.random() * (maxFamilies - 3 + 1)) + 3;
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
      const tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
        .pretty.tokenId;
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
    const airdropeeCount = maxAirdropees; //Math.floor(Math.random() * maxAirdropees) + 1;

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
      const { proofsBlob } = await getParamsForProof(
        airdropee,
        mainnetBlocknumber,
        homesteadRPC
      );

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
        const playerBalance = await Kudzu.balanceOf(player, tokenId);
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
      expectedPayoutPerTokens[i] =
        winnerPools[i] / BigInt(winningTokens[i].supply);
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
    await expect(Kudzu.connect(signer).claimPrize(0)).to.be.revertedWith(
      "GAME NOT ENDED"
    );

    // speed up chain until endDate

    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(end),
    ]);
    await hre.network.provider.send("evm_mine");

    await expect(Kudzu.claimPrize(0)).to.be.revertedWith(
      "CLAIM DELAY NOT ENDED"
    );

    const delayToClaim = await Kudzu.claimDelay();
    const realEnd = parseInt(end + delayToClaim);

    await hre.network.provider.send("evm_setNextBlockTimestamp", [realEnd]);
    await hre.network.provider.send("evm_mine");
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

          const winnerPayoutPerToken =
            winnerPayout / BigInt(playerWinningTokenBalance);

          const diff = winnerPayoutPerToken - expectedPayoutPerToken;
          const absDiff = diff > 0n ? diff : -diff;
          expect(absDiff).to.be.lessThanOrEqual(1n);
          claims += 1;

          if (signer) {
            state.pool -= winnerPayout;
            totalClaimedAmount += winnerPayout;

            const tx = await Kudzu.connect(signer).claimPrize(j);
            const receipt = await tx.wait();

            await expect(
              Kudzu.connect(signer).claimPrize(j)
            ).to.be.revertedWith("ALREADY CLAIMED");

            await expect(
              Kudzu.connect(signers[0]).claimPrize(j)
            ).to.be.revertedWith("INSUFFICIENT FUNDS");

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

            const claimed = await Kudzu.claimed(
              winningTokens[j].tokenId,
              player
            );
            const balance = await Kudzu.balanceOf(
              player,
              winningTokens[j].tokenId
            );
            expect(claimed).to.equal(balance);
            expect(claimed).to.equal(state.players[player][winningTokenId]);

            const claimedAmount = await Kudzu.claimedAmount();
            expect(claimedAmount).to.equal(totalClaimedAmount);
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

    const claimedAmount = await Kudzu.claimedAmount();
    const diff = claimedAmount - (prizePool - unclaimedAmount);
    expect(diff).to.be.lessThanOrEqual(claims);

    const poolDiff = unclaimedAmount - state.pool;
    expect(poolDiff).to.be.lessThanOrEqual(claims);
    const actualPoolEnd = await ethers.provider.getBalance(Kudzu.target);
    const actualDiff = unclaimedAmount - actualPoolEnd;
    expect(actualDiff).to.be.lessThanOrEqual(claims);

    await expect(
      Kudzu.collectForfeitPrizeAfterDelay(recipient, actualPoolEnd)
    ).to.be.revertedWith("REMAINING PRIZE IS FORFEIT ONLY AFTER DELAY PERIOD");

    const forfeitClaim = await Kudzu.forfeitClaim();
    const afterForfeit = parseInt(end + forfeitClaim);

    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      afterForfeit,
    ]);
    await hre.network.provider.send("evm_mine");

    await expect(Kudzu.claimPrize(0)).to.be.revertedWith("CLAIM PERIOD ENDED");

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

    const chains = [
      {
        id: 1,
        rpc: process.env.homesteadRPC,
        blocknumber: 21303934,
      },
      {
        id: 984122,
        rpc: "https://rpc.forma.art",
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
      const { stateRoot, proofsBlob } = await getParamsForProof(
        airdropee,
        c.blocknumber,
        c.rpc
      );
      const storedStateRoot = await Kudzu.stateRoots(c.id);
      expect(storedStateRoot).to.equal(stateRoot, `chain id: ${c.id}`);

      const storedBlocknumber = await Kudzu.blockNumbers(c.id);
      expect(c.blocknumber).to.equal(storedBlocknumber, `chain id: ${c.id}`);

      const exists = await Kudzu.userExists(airdropee, stateRoot, proofsBlob);
      expect(exists[0]).to.equal(true);

      const { proofsBlob: proofsBlob2 } = await getParamsForProof(
        noAccount,
        c.blocknumber,
        c.rpc
      );
      const doesNotExist = await Kudzu.userExists(
        noAccount,
        stateRoot,
        proofsBlob2
      );
      expect(doesNotExist[0]).to.equal(false);
    }
  });
});
