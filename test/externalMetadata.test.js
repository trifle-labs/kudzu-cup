import { expect } from "chai";
import { describe, it } from "mocha";
import { deployContracts } from "../scripts/utils.js";

describe("ExternalMetadata Tests", function () {
  this.timeout(50000000);

  it("has valid json", async function () {
    const { ExternalMetadata } = await deployContracts({
      mock: true,
      verbose: false,
    });
    const tokenId = 1;
    const uri = await ExternalMetadata.getMetadata(tokenId);
    expect(uri).to.equal("https://virus.folia.app/celestia/1");
  });
});
