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
    const { Kudzu } = await deployContracts({ verbose: true });

    const createPrice = await Kudzu.createPrice();
    let quantity = 0;
    await expect(
      Kudzu.create(quantity, { value: createPrice })
    ).to.be.revertedWith("CANT CREATE 0");

    // quantity = 1;
    // expect(await Kudzu.create(quantity, { value: 0 })).to.be.revertedWith(
    //   "GAME HASN'T STARTED"
    // );

    // const now = Math.floor(Date.now() / 1000);
    // await Kudzu.setStartTime(now - 1);

    // expect(await Kudzu.create(quantity, { value: 0 })).to.be.revertedWith(
    //   "INSUFFICIENT FUNDS"
    // );

    // const tx = await Kudzu.create(quantity, { value: createPrice });
    // const receipt = await tx.wait();
    // const tokenId = getParsedEventLogs(receipt, Kudzu, "Buy")[0].args.tokenId;

    // expect(receipt).to.emit(Kudzu, "Buy").withNamedArgs({
    //   tokenId,
    //   quantity,
    //   buyer: signer.address,
    // });
  });
});
