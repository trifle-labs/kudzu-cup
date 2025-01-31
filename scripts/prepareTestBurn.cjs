const hre = require("hardhat");

async function main() {
  const accounts = await hre.ethers.getSigners();
  const [deployer] = accounts;
  console.log({ deployer: deployer.address });
  const networkinfo = await hre.network.provider.send("eth_chainId");
  const chainId = BigInt(networkinfo);
  console.log("Deploy to chain:");
  console.log({ chainId });
  const { deployKudzuAndBurn, getParsedEventLogs } = await import("./utils.js");
  const { Kudzu, KudzuBurn } = await deployKudzuAndBurn({
    mock: true,
    ignoreTesting: true,
    saveAndVerify: true,
  });
  const block = await hre.ethers.provider.getBlock("latest");
  console.log({ block });
  const currentTime = block.timestamp;
  console.log({ currentTime });

  await Kudzu.updateStartDate(currentTime);
  await Kudzu.updateEndDate(currentTime + 60 * 60 * 24 * 30);
  await Kudzu.updateChristmas(currentTime + 60 * 60 * 24 * 30);
  await Kudzu.updateClaimDelay(0);
  await Kudzu.updateForfeitClaim(0);
  await Kudzu.updatePrices(0, 0);
  const userTokens = [];
  for (let i = 0; i < 10; i++) {
    const account = accounts[i];
    let tokenIds;
    try {
      const tx = await Kudzu.connect(account).mint(account.address, 0, 10);
      const receipt = await tx.wait();
      tokenIds = (await getParsedEventLogs(receipt, Kudzu, "Created")).map(
        (e) => e.pretty.tokenId
      );
      userTokens.push(tokenIds);
    } catch (e) {
      console.warn(e);
      i--;
      continue;
    }
    for (let j = 0; j < 10; j++) {
      if (i == j) continue;
      const ethBalance = await hre.ethers.provider.getBalance(
        accounts[j].address
      );
      if (ethBalance < hre.ethers.parseEther("0.01")) {
        try {
          await accounts[0].sendTransaction({
            to: accounts[j].address,
            value: hre.ethers.parseEther("0.01"),
          });
        } catch (e) {
          console.warn(e);
          j--;
          continue;
        }
      }

      for (let k = 0; k < 10; k++) {
        try {
          await Kudzu.connect(account).airdrop(
            accounts[j].address,
            tokenIds[k],
            "0x",
            0
          );
        } catch (e) {
          console.warn(e);
          k--;
        }
      }
    }
  }
  const block2 = await hre.ethers.provider.getBlock("latest");
  const timenow = block2.timestamp;
  await Kudzu.updateEndDate(timenow);

  for (let i = 0; i < 10; i++) {
    try {
      await Kudzu.connect(accounts[i]).setApprovalForAll(
        KudzuBurn.target,
        true
      );
    } catch (e) {
      console.warn(e);
      i--;
      continue;
    }
    for (let j = 0; j <= i; j++) {
      const tokenId = userTokens[i][0];
      console.log({ tokenId });
      try {
        await KudzuBurn.connect(accounts[i]).burn(tokenId);
      } catch (e) {
        console.warn(e);
        j--;
        continue;
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
