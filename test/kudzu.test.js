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
    const [, notdeployer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();
    const costToCreate = await Kudzu.createPrice();
    const quantity = 10n;
    const value = costToCreate * quantity;
    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1000);
    await Kudzu.create(quantity, { value });

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
      { name: "emitBatchMetadataUpdate", args: [] },
      { name: "updateMetadata", args: [notdeployer.address] },
      { name: "updateStartDate", args: [0] },
      { name: "updateEndDate", args: [0] },
      { name: "updateRecipient", args: [notdeployer.address] },
      { name: "updateOKtoClaim", args: [true] },
      { name: "updateAttack", args: [true] },
      { name: "updatePrices", args: [0, 0, 0, 0, 0] },
      { name: "updatePercentages", args: [0, 0, 0, 0, 0] },
      { name: "recoverLockedETH", args: [notdeployer.address, 0] },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, args } = functions[i];
      await expect(
        Kudzu.connect(notdeployer)[name](...args)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(Kudzu[name](...args)).to.not.be.reverted;
    }

    const updatePercentages = functions.find(
      (f) => f.name === "updatePercentages"
    );
    const DENOMINATOR = await Kudzu.DENOMINATOR();
    for (let i = 0; i < 5; i++) {
      const { args } = updatePercentages;
      args[i] = DENOMINATOR + 1n;
      await expect(Kudzu[updatePercentages.name](...args)).to.be.revertedWith(
        "INVALID PERCENTAGE"
      );
      args[i] = 0;
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

    const tx = await Kudzu.recoverLockedETH(ethers.ZeroAddress, value);
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
      Kudzu.create(quantity, { value: createPrice })
    ).to.be.revertedWith("CANT CREATE 0");

    quantity = 1;
    await expect(Kudzu.create(quantity, { value: 0 })).to.be.revertedWith(
      "GAME HASN'T STARTED"
    );

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    await expect(Kudzu.create(quantity, { value: 0 })).to.be.revertedWith(
      "INSUFFICIENT FUNDS"
    );

    let tx = await Kudzu.create(quantity, { value: createPrice });
    let receipt = await tx.wait();
    let tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;

    expect(receipt).to.emit(Kudzu, "Buy").withArgs({
      tokenId,
      quantity,
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
    expect(squadSupply).to.equal(quantity);

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

    tx = await Kudzu.create(quantity, { value });
    receipt = await tx.wait();
    tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;

    squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(quantity);

    expect(receipt).to.emit(Kudzu, "Buy").withArgs({
      tokenId,
      quantity,
      buyer: signer.address,
    });

    expect(receipt).to.emit(Kudzu, "TransferSingle").withArgs({
      operator: signer.address,
      from: ethers.ZeroAddress,
      to: signer.address,
      id: tokenId,
      amount: quantity,
    });
  });

  it("basic buy works", async () => {
    const [signer] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    await expect(Kudzu.buy(0, 0)).to.be.revertedWith("CANT BUY 0");
    await expect(Kudzu.buy(0, 1)).to.be.revertedWith("GAME HASN'T STARTED");

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    const quantity = 1n;

    await expect(Kudzu.buy(0, quantity)).to.be.revertedWith(
      "INSUFFICIENT FUNDS"
    );
    const buyPrice = await Kudzu.buyPrice();

    await expect(
      Kudzu.buy(0, quantity, { value: buyPrice * quantity })
    ).to.be.revertedWith("TOKEN DOES NOT EXIST");

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(quantity, { value: createPrice * quantity });
    let receipt = await tx.wait();

    const tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;

    tx = await Kudzu.buy(tokenId, quantity, { value: buyPrice * quantity });
    receipt = await tx.wait();

    const squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(quantity * 2n);

    expect(receipt).to.emit(Kudzu, "Buy").withArgs({
      tokenId,
      quantity,
      buyer: signer.address,
    });

    expect(receipt).to.emit(Kudzu, "TransferSingle").withArgs({
      operator: signer.address,
      from: ethers.ZeroAddress,
      to: signer.address,
      id: tokenId,
      amount: quantity,
    });

    const recipientAddress = await Kudzu.recipient();
    const percentOfBuy = await Kudzu.percentOfBuy();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent = (buyPrice * quantity * percentOfBuy) / denominator;

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
        amount: buyPrice * quantity - expectedPercent,
      });
  });

  it("basic airdrop works", async () => {
    const [airdropper, airdropee] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    await expect(Kudzu.airdrop(airdropee.address, 0, 0)).to.be.revertedWith(
      "CANT AIRDROP 0"
    );
    const quantity = 1n;
    await expect(
      Kudzu.airdrop(airdropee.address, 0, quantity)
    ).to.be.revertedWith("GAME HASN'T STARTED");

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    await expect(
      Kudzu.airdrop(airdropee.address, 0, quantity)
    ).to.be.revertedWith("INSUFFICIENT FUNDS");

    const airdropPrice = await Kudzu.airdropPrice();
    await expect(
      Kudzu.airdrop(airdropee.address, 0, quantity, {
        value: airdropPrice * quantity,
      })
    ).to.be.revertedWith("TOKEN DOES NOT EXIST");

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(quantity, { value: createPrice * quantity });
    let receipt = await tx.wait();
    const tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;

    await expect(
      Kudzu.connect(airdropee).airdrop(airdropee.address, tokenId, quantity, {
        value: airdropPrice * quantity,
      })
    ).to.be.revertedWith("NOT A HOLDER");

    tx = await Kudzu.airdrop(airdropee.address, tokenId, quantity, {
      value: airdropPrice * quantity,
    });
    receipt = await tx.wait();

    expect(receipt).to.emit(Kudzu, "Airdrop").withArgs({
      tokenId,
      quantity,
      airdropper: airdropper.address,
      airdropee: airdropee.address,
    });

    const airdropPercent = await Kudzu.percentOfAirdrop();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent =
      (airdropPrice * quantity * airdropPercent) / denominator;

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
        amount: airdropPrice * quantity - expectedPercent,
      });

    const airdropPending = await Kudzu.airdrops(tokenId, airdropee.address);
    expect(airdropPending).to.equal(quantity);

    let squadSupply = await Kudzu.squadSupply(tokenId);
    expect(squadSupply).to.equal(quantity);
  });

  it("basic claim works", async () => {
    const [, airdropee] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    await expect(Kudzu.claimAirdrop(0, 0)).to.be.revertedWith("CANT CLAIM 0");
    const quantity = 1n;
    await expect(Kudzu.claimAirdrop(0, quantity)).to.be.revertedWith(
      "GAME HASN'T STARTED"
    );

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    await expect(Kudzu.claimAirdrop(0, quantity)).to.be.revertedWith(
      "INSUFFICIENT FUNDS"
    );

    const claimPrice = await Kudzu.claimPrice();
    await expect(
      Kudzu.claimAirdrop(0, quantity, {
        value: claimPrice * quantity,
      })
    ).to.be.revertedWith("TOKEN DOES NOT EXIST");

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(quantity, { value: createPrice * quantity });
    let receipt = await tx.wait();
    const tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;
    await expect(
      Kudzu.claimAirdrop(tokenId, quantity, {
        value: claimPrice * quantity,
      })
    ).to.be.revertedWith("INSUFFICIENT AIRDROPS");

    const airdropPrice = await Kudzu.airdropPrice();
    await Kudzu.airdrop(airdropee.address, tokenId, quantity, {
      value: airdropPrice * quantity,
    });

    await expect(Kudzu.getWinningToken()).to.be.revertedWith(
      "OrderStatisticsTree(404) - Value does not exist."
    );

    tx = await Kudzu.connect(airdropee).claimAirdrop(tokenId, quantity, {
      value: claimPrice * quantity,
    });
    receipt = await tx.wait();

    expect(receipt).to.emit(Kudzu, "Claim").withArgs({
      tokenId,
      quantity,
      claimer: airdropee.address,
    });

    expect(receipt).to.emit(Kudzu, "TransferSingle").withArgs({
      operator: airdropee.address,
      from: ethers.ZeroAddress,
      to: airdropee.address,
      id: tokenId,
      amount: quantity,
    });

    const recipientAddress = await Kudzu.recipient();
    const claimPercent = await Kudzu.percentOfClaim();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent =
      (claimPrice * quantity * claimPercent) / denominator;

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
        amount: claimPrice * quantity - expectedPercent,
      });

    const airdropPending = await Kudzu.airdrops(tokenId, airdropee.address);
    expect(airdropPending).to.equal(0);

    const winningTokenId = await Kudzu.getWinningToken();
    expect(winningTokenId).to.equal(tokenId);
  });

  it("basic attack works", async () => {
    const [, airdropee] = await ethers.getSigners();
    const { Kudzu } = await deployContracts();

    await expect(Kudzu.attack(0, 0)).to.be.revertedWith("ATTACK DISABLED");

    await Kudzu.updateAttack(true);

    await expect(Kudzu.attack(0, 0)).to.be.revertedWith("CANT ATTACK 0");

    const quantity = 1n;
    await expect(Kudzu.attack(0, quantity)).to.be.revertedWith(
      "GAME HASN'T STARTED"
    );

    const now = Math.floor(Date.now() / 1000);
    await Kudzu.updateStartDate(now - 1);

    await expect(Kudzu.attack(0, quantity)).to.be.revertedWith(
      "INSUFFICIENT FUNDS"
    );

    const attackPrice = await Kudzu.attackPrice();
    await expect(
      Kudzu.attack(0, quantity, {
        value: attackPrice * quantity,
      })
    ).to.be.revertedWith("TOKEN DOES NOT EXIST");

    const createPrice = await Kudzu.createPrice();
    let tx = await Kudzu.create(quantity, { value: createPrice * quantity });
    let receipt = await tx.wait();
    const tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;
    await expect(
      Kudzu.attack(tokenId, quantity, {
        value: attackPrice * quantity,
      })
    ).to.be.revertedWith("INSUFFICIENT SQUAD POINTS");

    const airdropPrice = await Kudzu.airdropPrice();
    await Kudzu.airdrop(airdropee.address, tokenId, quantity, {
      value: airdropPrice * quantity,
    });

    const claimPrice = await Kudzu.claimPrice();
    tx = await Kudzu.connect(airdropee).claimAirdrop(tokenId, quantity, {
      value: claimPrice * quantity,
    });

    let winningTokenId = await Kudzu.getWinningToken();
    expect(winningTokenId).to.equal(tokenId);

    tx = await Kudzu.attack(tokenId, quantity, {
      value: attackPrice * quantity,
    });
    receipt = await tx.wait();

    expect(receipt).to.emit(Kudzu, "Attack").withArgs({
      tokenId,
      quantity,
      attacker: airdropee.address,
    });

    const recipientAddress = await Kudzu.recipient();
    const attackPercent = await Kudzu.percentOfAttack();
    const denominator = await Kudzu.DENOMINATOR();
    const expectedPercent =
      (attackPrice * quantity * attackPercent) / denominator;

    expect(receipt)
      .to.emit(Kudzu, "EthMoved")
      .withArgs({
        to: recipientAddress,
        success: true,
        returnData: "0x",
        amount: expectedPercent,
      })
      .to.emit(Kudzu, "EthMoved")
      .withArgs({
        to: Kudzu.target,
        success: true,
        returnData: "0x",
        amount: attackPrice * quantity - expectedPercent,
      });

    await expect(Kudzu.getWinningToken()).to.be.revertedWith(
      "OrderStatisticsTree(404) - Value does not exist."
    );

    await Kudzu.airdrop(airdropee.address, tokenId, quantity, {
      value: airdropPrice * quantity,
    });
    await Kudzu.connect(airdropee).claimAirdrop(tokenId, quantity, {
      value: claimPrice * quantity,
    });

    winningTokenId = await Kudzu.getWinningToken();
    expect(winningTokenId).to.equal(tokenId);

    tx = await Kudzu.create(quantity, { value: createPrice * quantity });
    receipt = await tx.wait();
    const tokenId2 = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;

    const quantity2 = quantity * 2n;

    await Kudzu.airdrop(airdropee.address, tokenId2, quantity2, {
      value: airdropPrice * quantity2,
    });
    await Kudzu.connect(airdropee).claimAirdrop(tokenId2, quantity2, {
      value: claimPrice * quantity2,
    });

    winningTokenId = await Kudzu.getWinningToken();
    expect(winningTokenId).to.equal(tokenId2);

    await Kudzu.attack(tokenId2, quantity, {
      value: attackPrice * quantity,
    });

    winningTokenId = await Kudzu.getWinningToken();
    // tokenId 1 had the value first so is given priority
    expect(winningTokenId).to.equal(tokenId);

    await Kudzu.attack(tokenId2, quantity, {
      value: attackPrice * quantity,
    });
    winningTokenId = await Kudzu.getWinningToken();
    expect(winningTokenId).to.equal(tokenId);

    await Kudzu.attack(tokenId, quantity, {
      value: attackPrice * quantity,
    });

    await expect(Kudzu.getWinningToken()).to.be.revertedWith(
      "OrderStatisticsTree(404) - Value does not exist."
    );
  });

  it("runs the full game", async () => {
    const signers = await ethers.getSigners();
    const { Kudzu } = await deployContracts();
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
    const maxBuyers = 10;
    const maxAirdropees = maxFamilies * 10;

    expect(signers.length).to.be.greaterThan(
      maxFamilies + maxBuyers + maxAirdropees
    );

    const recipient = signers[signers.length - 1].address;
    const recipientStartingBalance =
      await ethers.provider.getBalance(recipient);
    await Kudzu.updateRecipient(recipient);

    const poolStartingBalance = await ethers.provider.getBalance(Kudzu.target);
    expect(poolStartingBalance).to.equal(0);

    const maxCreate = 10;
    const maxBuy = 10;
    const maxAirdrop = 10;

    const createPrice = await Kudzu.createPrice();
    const buyPrice = await Kudzu.buyPrice();
    const airdropPrice = await Kudzu.airdropPrice();
    const claimPrice = await Kudzu.claimPrice();

    const createPercent = await Kudzu.percentOfCreate();
    const buyPercent = await Kudzu.percentOfBuy();
    const airdropPercent = await Kudzu.percentOfAirdrop();
    const claimPercent = await Kudzu.percentOfClaim();

    const DENOMINATOR = await Kudzu.DENOMINATOR();

    const familyCount = Math.floor(Math.random() * maxFamilies) + 1;
    const state = {
      pool: 0n,
      admin: 0n,
      tokenIds: {},
      points: {},
      airdrops: {},
      players: {},
    };

    // create
    for (let i = 0; i < familyCount; i++) {
      const founder = signers[i];
      const quantity = BigInt(Math.floor(Math.random() * maxCreate) + 1);
      const tx = await Kudzu.connect(founder).create(quantity, {
        value: createPrice * quantity,
      });
      const receipt = await tx.wait();
      const tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;
      state.tokenIds[tokenId] = quantity;
      state.players[founder.address] = {};
      state.players[founder.address][tokenId] = quantity;

      const recipeintPercent =
        (createPrice * quantity * createPercent) / DENOMINATOR;
      state.pool += createPrice * quantity - recipeintPercent;
      state.admin += recipeintPercent;
      const poolBalance = await ethers.provider.getBalance(Kudzu.target);
      expect(poolBalance).to.equal(state.pool);

      const recipientBalance = await ethers.provider.getBalance(recipient);
      expect(recipientBalance).to.equal(recipientStartingBalance + state.admin);
    }

    // buy
    const buyerCount = Math.floor(Math.random() * maxBuyers) + 1;
    for (let i = familyCount; i < familyCount + buyerCount; i++) {
      const buyer = signers[i];
      const quantity = BigInt(Math.floor(Math.random() * maxBuy) + 1);
      const tokenId = Object.keys(state.tokenIds)[
        Math.floor(Math.random() * Object.keys(state.tokenIds).length)
      ];
      const tx = await Kudzu.connect(buyer).buy(tokenId, quantity, {
        value: buyPrice * quantity,
      });
      const receipt = await tx.wait();

      state.tokenIds[tokenId] += quantity;

      state.players[buyer.address] = state.players[buyer.address] || {};
      state.players[buyer.address][tokenId] =
        (state.players[buyer.address][tokenId] || 0n) + quantity;

      const recipeintPercent = (buyPrice * quantity * buyPercent) / DENOMINATOR;
      state.pool += buyPrice * quantity - recipeintPercent;
      state.admin += recipeintPercent;

      expect(receipt).to.emit(Kudzu, "Buy").withArgs({
        tokenId,
        quantity,
        buyer: buyer.address,
      });
      expect(receipt)
        .to.emit(Kudzu, "EthMoved")
        .withArgs({
          to: recipient,
          success: true,
          returnData: "0x",
          amount: recipeintPercent,
        })
        .withArgs({
          to: Kudzu.target,
          success: true,
          returnData: "0x",
          amount: buyPrice * quantity - recipeintPercent,
        });

      const recipientBalance = await ethers.provider.getBalance(recipient);
      expect(recipientBalance).to.equal(recipientStartingBalance + state.admin);

      const poolBalance = await ethers.provider.getBalance(Kudzu.target);
      expect(poolBalance).to.equal(state.pool);
    }

    // airdrop
    const players = Object.keys(state.players);
    const airdropeeCount = Math.floor(Math.random() * maxAirdropees) + 1;
    for (let i = buyerCount; i < buyerCount + airdropeeCount; i++) {
      const airdropee = signers[i];
      const quantity = BigInt(Math.floor(Math.random() * maxAirdrop) + 1);
      const player = players[Math.floor(Math.random() * players.length)];
      const tokenId = Object.keys(state.players[player])[
        Math.floor(Math.random() * Object.keys(state.players[player]).length)
      ];

      const signer = signers.find((s) => s.address === player);

      await Kudzu.connect(signer).airdrop(
        airdropee.address,
        tokenId,
        quantity,
        {
          value: airdropPrice * quantity,
        }
      );

      state.airdrops[tokenId] = state.airdrops[tokenId] || {};
      state.airdrops[tokenId][airdropee.address] =
        (state.airdrops[tokenId][airdropee.address] || 0n) + quantity;

      const recipeintPercent =
        (airdropPrice * quantity * airdropPercent) / DENOMINATOR;
      state.pool += airdropPrice * quantity - recipeintPercent;
      state.admin += recipeintPercent;

      const poolBalance = await ethers.provider.getBalance(Kudzu.target);
      expect(poolBalance).to.equal(state.pool);
    }

    // claim
    const airdroppedTokenIds = Object.keys(state.airdrops);
    for (let i = 0; i < airdroppedTokenIds.length; i++) {
      const airdrop = state.airdrops[airdroppedTokenIds[i]];
      const airdropees = Object.keys(airdrop);
      for (let j = 0; j < airdropees.length; j++) {
        const airdropee = signers.find((s) => s.address === airdropees[j]);
        const quantity = BigInt(
          Math.floor(Math.random() * parseInt(airdrop[airdropee.address])) + 1
        );

        await Kudzu.connect(airdropee).claimAirdrop(
          airdroppedTokenIds[i],
          quantity,
          {
            value: claimPrice * quantity,
          }
        );

        state.airdrops[airdroppedTokenIds[i]][airdropee.address] -= quantity;
        state.points[airdroppedTokenIds[i]] =
          state.points[airdroppedTokenIds[i]] || 0n;
        state.points[airdroppedTokenIds[i]] += quantity;
        state.tokenIds[airdroppedTokenIds[i]] += quantity;
        state.players[airdropee.address] =
          state.players[airdropee.address] || {};
        state.players[airdropee.address][airdroppedTokenIds[i]] =
          (state.players[airdropee.address][airdroppedTokenIds[i]] || 0n) +
          quantity;

        const recipeintPercent =
          (claimPrice * quantity * claimPercent) / DENOMINATOR;
        state.pool += claimPrice * quantity - recipeintPercent;
        state.admin += recipeintPercent;

        const poolBalance = await ethers.provider.getBalance(Kudzu.target);
        expect(poolBalance).to.equal(state.pool);
      }
    }

    // compare state to contract
    const actualPool = await ethers.provider.getBalance(Kudzu.target);
    expect(actualPool).to.equal(state.pool);

    const actualAdmin = await ethers.provider.getBalance(recipient);
    expect(actualAdmin).to.equal(recipientStartingBalance + state.admin);

    const actualTokenCount = await Kudzu.totalSquads();
    expect(actualTokenCount).to.equal(Object.keys(state.tokenIds).length);

    const actualWinningToken = await Kudzu.getWinningToken();
    const winningTokenId = Object.keys(state.points).sort((a, b) => {
      return parseInt(state.points[b] - state.points[a]);
    })[0];
    expect(actualWinningToken).to.equal(winningTokenId);

    // console.dir({ state }, { depth: null });
    // console.log({ winningTokenId });

    const expectedPayoutPerToken = state.pool / state.tokenIds[winningTokenId];
    // const parsedAsEth = ethers.formatEther(expectedPayoutPerToken.toString());
    // console.log({ perToken: parsedAsEth, USD: parsedAsEth * 8 });

    // const admin = ethers.formatEther(state.admin.toString());
    // console.log({ admin: admin, USD: admin * 8 });

    // speed up chain until endDate
    await hre.network.provider.send("evm_setNextBlockTimestamp", [end]);
    await hre.network.provider.send("evm_mine");
    const currentTimestamp = await Kudzu.blocktimestamp();
    expect(currentTimestamp).to.be.greaterThanOrEqual(end);

    for (let i = 0; i < Object.keys(state.players).length; i++) {
      const player = Object.keys(state.players)[i];
      const playerWinningTokenBalance = state.players[player][winningTokenId];
      if (playerWinningTokenBalance > 0n) {
        const signer = signers.find((s) => s.address === player);

        const okToClaim = await Kudzu.oKtoClaim();
        if (!okToClaim) {
          await expect(
            Kudzu.connect(signer).claimPrize(winningTokenId, 1)
          ).to.be.revertedWith("NOT OK TO CLAIM YET");
          await Kudzu.updateOKtoClaim(true);
        }

        const tx = await Kudzu.connect(signer).claimPrize(
          winningTokenId,
          playerWinningTokenBalance
        );
        const receipt = await tx.wait();
        // const winnerPayout = expectedPayoutPerToken * playerWinningTokenBalance;
        const totalSupplyOfWinningToken = state.tokenIds[winningTokenId];
        const winnerPayout =
          (state.pool * playerWinningTokenBalance) / totalSupplyOfWinningToken;

        const winnerPayoutPerToken = winnerPayout / playerWinningTokenBalance;
        const diff = winnerPayoutPerToken - expectedPayoutPerToken;
        const absDiff = diff > 0 ? diff : -diff;
        expect(absDiff).to.be.lessThanOrEqual(1);
        state.pool -= winnerPayout;
        state.tokenIds[winningTokenId] -= playerWinningTokenBalance;

        const poolBalance = await ethers.provider.getBalance(Kudzu.target);
        expect(poolBalance).to.equal(state.pool);

        expect(receipt).to.emit(Kudzu, "Claim").withArgs({
          tokenId: winningTokenId,
          quantity: playerWinningTokenBalance,
          claimer: player,
        });

        expect(receipt).to.emit(Kudzu, "EthMoved").withArgs({
          to: recipient,
          success: true,
          returnData: "0x",
          amount: winnerPayout,
        });
      }
    }
    expect(state.tokenIds[winningTokenId]).to.equal(0n);
    expect(state.pool).to.equal(0n);
    const actualPoolEnd = await ethers.provider.getBalance(Kudzu.target);
    expect(actualPoolEnd).to.equal(0);
  });

  it("eth_getProof works with userExists", async () => {
    const { Kudzu } = await deployContracts();
    const airdropee = "0xFa398d672936Dcf428116F687244034961545D91";
    const noAccount = "0x30Ce3CEd12f1faCf02Fe0da8578f809f5e4937E4";

    // forma
    const formaRPC = "https://rpc.forma.art";
    const formaBlocknumber = 7065245;
    const { stateRoot: formaStateroot, proofsBlob: formaProofsBlob } =
      await getParamsForProof(airdropee, formaBlocknumber, formaRPC);
    const storedFormaStateRoot = await Kudzu.stateRootForma();
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
    const RPC = process.env.homesteadRPC;
    const blocknumber = 21303934;
    const { stateRoot, proofsBlob } = await getParamsForProof(
      airdropee,
      blocknumber,
      RPC
    );
    const storedStateRoot = await Kudzu.stateRoot();
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
