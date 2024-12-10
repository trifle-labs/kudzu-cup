import { expect } from "chai";
import { describe, it, before, afterEach } from "mocha";
import { deployContracts, getParsedEventLogs } from "../scripts/utils.js";
import {
  getEmoji,
  kudzuName,
  eyes,
  mouths,
} from "../scripts/metadataUtils.mjs";

import hre from "hardhat";
const ethers = hre.ethers;

let snapshot;
describe("ExternalMetadata Tests", function () {
  this.timeout(50000000);

  before(async function () {
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });
  afterEach(async function () {
    await hre.network.provider.send("evm_revert", [snapshot]);
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });

  it("has same eyes and mouths as js", async () => {
    const { ExternalMetadata } = await deployContracts();

    for (let i = 0; i < 32; i++) {
      const eye = await ExternalMetadata.eyes(i);
      const mouth = await ExternalMetadata.mouths(i);
      expect(eye).to.equal(eyes[i]);
      expect(mouth).to.equal(mouths[i]);
    }
  });

  it("getPiecesOfTokenID works", async () => {
    const tokenId = 9897988;
    const expectedEyes = 0x8;
    const expectedMouth = 0x4;
    const realTokenId = 151;
    const { ExternalMetadata } = await deployContracts();
    const [id, eyes, mouth] =
      await ExternalMetadata.getPiecesOfTokenID(tokenId);
    expect(id).to.equal(realTokenId);
    expect(eyes).to.equal(expectedEyes);
    expect(mouth).to.equal(expectedMouth);
  });

  it("calculates id, eyes and mouth correctly", async () => {
    const { ExternalMetadata } = await deployContracts();
    const testTokenId = 20585226;
    const expectedId = 314;
    const expectedEye = "big-eyes";
    const expectedMouth = "little-mad";

    const [id, eye, mouth] =
      await ExternalMetadata.getPiecesOfTokenID(testTokenId);
    expect(id).to.equal(expectedId);
    expect(eyes[eye]).to.equal(expectedEye);
    expect(mouths[mouth]).to.equal(expectedMouth);

    const { indexEye, indexMouth, index } = getEmoji(testTokenId);
    expect(index).to.equal(expectedId);
    expect(eyes[indexEye]).to.equal(expectedEye);
    expect(mouths[indexMouth]).to.equal(expectedMouth);
  });

  it("makes a large range of tokenIds", async () => {
    const { Kudzu, ExternalMetadata } = await deployContracts();
    const [owner] = await ethers.getSigners();
    const startDate = await Kudzu.startDate();
    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");
    const createPrice = await Kudzu.createPrice();
    const allTokenIds = [];
    for (let i = 0; i < 100; i++) {
      const tx = await Kudzu.mint(owner.address, 0, 10, {
        value: 10n * createPrice,
      });
      const receipt = await tx.wait();
      const tokenIds = (
        await getParsedEventLogs(receipt, Kudzu, "Created")
      ).map((t) => t.pretty.tokenId);
      allTokenIds.push(...tokenIds);
    }
    const eyeCount = {};
    const mouthCount = {};
    for (const [i, tokenId] of allTokenIds.entries()) {
      const [index, eye, mouth] =
        await ExternalMetadata.getPiecesOfTokenID(tokenId);
      expect(index).to.equal(i + 1);
      eyeCount[eye] = eyeCount[eye] ? eyeCount[eye] + 1 : 1;
      mouthCount[mouth] = mouthCount[mouth] ? mouthCount[mouth] + 1 : 1;
    }
    const uniqueEyes = Object.keys(eyeCount).length;
    const uniqueMouths = Object.keys(mouthCount).length;
    expect(uniqueEyes).to.be.equal(32);
    expect(uniqueMouths).to.be.equal(32);
  });

  it("has valid json", async function () {
    const [owner] = await ethers.getSigners();

    const { Kudzu, ExternalMetadata } = await deployContracts();

    const startDate = await Kudzu.startDate();

    await hre.network.provider.send("evm_setNextBlockTimestamp", [
      parseInt(startDate),
    ]);
    await hre.network.provider.send("evm_mine");
    const createPrice = await Kudzu.createPrice();
    const tx = await Kudzu.create(owner.address, 1, { value: createPrice });
    const receipt = await tx.wait();
    let tokenId = (await getParsedEventLogs(receipt, Kudzu, "Created"))[0]
      .pretty.tokenId;

    // console.log({ tokenId });

    const base64Json1 = await Kudzu.tokenURI(tokenId);
    const base64Json2 = await Kudzu.uri(tokenId);
    const base64Json3 = await Kudzu.getTokenMetadata(tokenId);
    const base64Json4 = await ExternalMetadata.getMetadata(tokenId);
    expect(base64Json1).to.equal(base64Json2);
    expect(base64Json1).to.equal(base64Json3);
    expect(base64Json1).to.equal(base64Json4);

    const utf8Json = Buffer.from(
      base64Json1.replace("data:application/json;base64,", ""),
      "base64"
    ).toString("utf-8");
    // console.dir({ utf8Json }, { depth: null });
    const json = JSON.parse(utf8Json);
    // console.dir({ json }, { depth: null })

    const { eye, mouth, id } = getEmoji(tokenId);
    const expectedName = kudzuName(tokenId);

    // name
    const name = json.name;
    expect(name).to.equal(expectedName + ` #${id}`);

    // description
    const description = json.description;
    expect(description).to.equal(
      `Kudzu is contagious, let the vine grow...\n\nThis is the token number ${id} but it has ID ${tokenId} with ${eye} eyes and ${mouth} mouth.`
    );

    // image
    const imageURI = json.image;
    const imageURI2 = json.image_url;
    expect(imageURI).to.equal(imageURI2);
    expect(imageURI).to.equal("https://virus.folia.app/img/forma/" + tokenId);

    // attributes

    const mouthURI = json.attributes[0].value;
    const trait_type0 = json.attributes[0].trait_type;
    expect(trait_type0).to.equal("mouth");
    expect(mouthURI).to.equal(mouth);

    const eyeURI = json.attributes[1].value;
    const trait_type1 = json.attributes[1].trait_type;
    expect(trait_type1).to.equal("eyes");
    expect(eyeURI).to.equal(eye);

    const idURI = json.attributes[2].value;
    const trait_type2 = json.attributes[2].trait_type;
    expect(trait_type2).to.equal("index");
    expect(idURI).to.equal(id);
  });
});
