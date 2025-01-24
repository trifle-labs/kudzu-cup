import { expect } from "chai";
import { describe, it, before, afterEach } from "mocha";

import hre from "hardhat";
const ethers = hre.ethers;

import { deployKudzuAndBurn, getParsedEventLogs } from "../scripts/utils.js";

let snapshot;
describe("KudzuBurn Tests", function () {
  this.timeout(50000000);
  before(async function () {
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });
  afterEach(async function () {
    await hre.network.provider.send("evm_revert", [snapshot]);
    snapshot = await hre.network.provider.send("evm_snapshot", []);
  });

  it("deploy works", async () => {
    await deployKudzuAndBurn();
  });

  it.skip("has all the correct interfaces", async () => {
    const interfaces = [
      { name: "ERC165", id: "0x01ffc9a7", supported: false },
      { name: "ERC1155", id: "0xd9b67a26", supported: false },
      { name: "ERC1155Metadata", id: "0x0e89341c", supported: false },
      { name: "ERC721", id: "0x80ac58cd", supported: false },
      { name: "ERC721Metadata", id: "0x5b5e139f", supported: false },
      { name: "ERC4906MetadataUpdate", id: "0x49064906", supported: false },
      { name: "ERC721Enumerable", id: "0x780e9d63", supported: false },
      { name: "ERC2981", id: "0x2a55205a", supported: false },
      { name: "ERC20", id: "0x36372b07", supported: false },
      { name: "RANDOM", id: "0x36372b08", supported: false },
      { name: "ITokenMetadata", id: "0xe99684b9", supported: false },
      { name: "IERC1155MintablePayable", id: "0x156e29f6", supported: false },
      { name: "Ownable", id: "0x0e083076", supported: true },
    ];
    const { KudzuBurn } = await deployKudzuAndBurn();

    for (let i = 0; i < interfaces.length; i++) {
      const { name, id, supported } = interfaces[i];
      const supportsInterface2 = await KudzuBurn.supportsInterface(id);
      expect(name + supportsInterface2).to.equal(name + supported);
    }
  });

  it("ensures onlyOwner is applied correctly", async () => {
    const [deployer, notdeployer] = await ethers.getSigners();
    const { KudzuBurn } = await deployKudzuAndBurn();
    const functions = [
      { name: "updateBurnAddress", params: [notdeployer.address] },
      { name: "updateBurnPoint", params: [0] },
      { name: "updateNewStrainBonus", params: [0] },
      { name: "updateEndDate", params: [0, 0] },
      { name: "recoverFunds", params: [0] },
    ];

    for (let i = 0; i < functions.length; i++) {
      const { name, params } = functions[i];
      await expect(
        KudzuBurn.connect(notdeployer)[name](...params)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      await expect(KudzuBurn.connect(deployer)[name](...params)).to.not.be
        .reverted;
    }
  });

  it("has the correct dates", async () => {
    const startingDate = "April 20, 2025";
    const convertDateToUnix = (date) =>
      Math.floor(new Date(date + " UTC").getTime() / 1000);
    const startingDataUnix = convertDateToUnix(startingDate);
    const { KudzuBurn } = await deployKudzuAndBurn();
    for (let i = 0; i < 13; i++) {
      const round = await KudzuBurn.rounds(i);
      const endDate = round[1];
      const monthsSinceStart = 3 * i;
      const expectedDate = new Date(startingDataUnix * 1000);
      expectedDate.setMonth(expectedDate.getMonth() + monthsSinceStart);
      const expectedUnix = expectedDate.getTime() / 1000;
      expect(endDate).to.equal(expectedUnix);
    }
  });

  it("ensure prepareKudzuForTests works", async () => {
    const [, acct1, acct2, acct3, acct4, acct5] = await ethers.getSigners();
    const { Kudzu } = await deployKudzuAndBurn({ mock: true });

    const recipients = [
      {
        address: acct1,
        quantity: 1,
        infected: [{ address: acct2.address, strainIndex: 0 }],
      },
      {
        address: acct3,
        quantity: 2,
        infected: [
          { address: acct4.address, strainIndex: 0 },
          { address: acct5.address, strainIndex: 1 },
        ],
      },
    ];

    // 5 accounts infected with following balances
    // acct1: 10 of token id 1
    // acct2: 1 of token id 1
    // acct3: 10 of token id 2
    // acct3: 10 of token id 3
    // acct4: 1 of token id 2
    // acct5: 1 of token id 3
    const tokenIds = await prepareKudzuForTests(Kudzu, recipients);

    // confirm quantities are correct
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(10);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct2.address, tokenIds[0])
    ).to.equal(1);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct3.address, tokenIds[1])
    ).to.equal(10);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct4.address, tokenIds[1])
    ).to.equal(1);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct3.address, tokenIds[2])
    ).to.equal(10);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct5.address, tokenIds[2])
    ).to.equal(1);
  });

  it("burn works", async () => {
    const [, acct1, acct2, acct3, acct4, acct5] = await ethers.getSigners();
    const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({ mock: true });

    const burnPoint = await KudzuBurn.burnPoint();
    const newStrainBonus = await KudzuBurn.newStrainBonus();

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
      1,
      "0x"
    );
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct1.address, tokenIds[0])
    ).to.equal(9);
    expect(
      await Kudzu["balanceOf(address,uint256)"](acct2.address, tokenIds[0])
    ).to.equal(2);

    // burn fails before approval is set
    await expect(KudzuBurn.connect(acct1).burn(tokenIds[0])).to.be.reverted;

    await Kudzu.connect(acct1).setApprovalForAll(KudzuBurn.target, true);

    const tx = await KudzuBurn.connect(acct1).burn(tokenIds[0]);
    const receipt = await tx.wait();
    const events = await getParsedEventLogs(
      receipt,
      KudzuBurn,
      "PointsRewarded"
    );
    expect(events[0].pretty.points).to.equal(burnPoint);
    expect(events[1].pretty.points).to.equal(newStrainBonus);

    const winningAddress = await KudzuBurn.getWinningAddress();
    expect(winningAddress).to.equal(acct1.address);

    await Kudzu.connect(acct2).setApprovalForAll(KudzuBurn.target, true);
    await KudzuBurn.connect(acct2).burn(tokenIds[0]);
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

    await KudzuBurn.connect(acct2).burn(tokenIds[0]);

    const acct2Points2 = await KudzuBurn.getPoints(acct2.address);
    expect(acct2Points2).to.equal(burnPoint * 2n + newStrainBonus);

    const acct1Points2 = await KudzuBurn.getPoints(acct1.address);
    expect(acct1Points2).to.equal(burnPoint + newStrainBonus);

    const winningAddress3 = await KudzuBurn.getWinningAddress();
    expect(winningAddress3).to.equal(acct2.address);

    const getRank3 = await KudzuBurn.getRank(0);
    expect(getRank3).to.equal(acct2.address);

    const getRank4 = await KudzuBurn.getRank(1);
    expect(getRank4).to.equal(acct1.address);
  });
});

const prepareKudzuForTests = async (Kudzu, recipients = []) => {
  const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
  const currentTimePlusOneDay = currentTime + 86400;

  await Kudzu.updateStartDate(currentTime);
  await Kudzu.updateEndDate(currentTimePlusOneDay);
  await Kudzu.updatePrices(0, 0);
  await Kudzu.updateClaimDelay(0);
  await Kudzu.updateForfeitClaim(0);
  const allTokenIds = [];
  for (let i = 0; i < recipients.length; i++) {
    const address = recipients[i].address;
    const quantity = recipients[i].quantity;
    const infected = recipients[i].infected;
    const tx = await Kudzu.connect(address).mint(address.address, 0, quantity);
    const receipt = await tx.wait();
    const tokenIds = (
      await getParsedEventLogs(receipt, Kudzu, "TransferSingle")
    ).map((e) => e.pretty.id);
    allTokenIds.push(...tokenIds);
    for (let j = 0; j < infected.length; j++) {
      const infectedAddress = infected[j].address;
      const strainIndex = infected[j].strainIndex;
      await Kudzu.connect(address).airdrop(
        infectedAddress,
        tokenIds[strainIndex],
        "0x",
        0
      );
    }
  }
  await hre.network.provider.send("evm_setNextBlockTimestamp", [
    parseInt(currentTimePlusOneDay),
  ]);
  await hre.network.provider.send("evm_mine");
  return allTokenIds;
};
