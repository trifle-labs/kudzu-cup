import { expect } from "chai";
import { describe, it } from "mocha";

import hre from "hardhat";
const ethers = hre.ethers;

import { deployContracts, getParsedEventLogs } from "../scripts/utils.js";

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
        to: Kudzu.address,
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
        to: Kudzu.address,
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
        to: Kudzu.address,
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
        to: Kudzu.address,
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
        to: Kudzu.address,
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
});
