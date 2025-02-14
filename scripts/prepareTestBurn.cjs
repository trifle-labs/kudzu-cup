const hre = require("hardhat");
let skip = false;

async function main() {
  const accounts = await hre.ethers.getSigners();
  const [deployer] = accounts;
  console.log({ deployer: deployer.address });
  const networkinfo = await hre.network.provider.send("eth_chainId");
  const chainId = BigInt(networkinfo);
  console.log("Deploy to chain:");
  console.log({ chainId });
  const { deployKudzuAndBurn, getParsedEventLogs, initContracts } =
    await import("./utils.js");
  let Kudzu, KudzuBurn, tx;
  if (skip) {
    const { Kudzu: Kudzu_, KudzuBurn: KudzuBurn_ } = await initContracts([
      "Kudzu",
      "KudzuBurn",
    ]);
    Kudzu = Kudzu_;
    KudzuBurn = KudzuBurn_;
  } else {
    const { Kudzu: Kudzu_, KudzuBurn: KudzuBurn_ } = await deployKudzuAndBurn({
      mock: true,
      ignoreTesting: true,
      saveAndVerify: true,
    });
    Kudzu = Kudzu_;
    KudzuBurn = KudzuBurn_;

    // const {Kudzu, KudzuBurn} = await initContracts(['Kudzu', 'KudzuBurn']);
    const block = await hre.ethers.provider.getBlock("latest");
    console.log({ block });
    const currentTime = block.timestamp;
    console.log({ currentTime });

    tx = await Kudzu.updateStartDate(currentTime);
    await tx.wait();
    const startDate = await Kudzu.startDate();
    console.log({ startDate });
    if (parseInt(startDate) !== parseInt(currentTime))
      throw new Error("startDate");

    tx = await Kudzu.updateEndDate(9999999999);
    await tx.wait();
    const endDate = await Kudzu.endDate();
    console.log({ endDate });

    tx = await Kudzu.updateChristmas(currentTime + 60 * 60 * 24 * 30);
    await tx.wait();
    const christmas = await Kudzu.christmas();
    console.log({ christmas });

    tx = await Kudzu.updateClaimDelay(0);
    await tx.wait();
    const claimDelay = await Kudzu.claimDelay();
    console.log({ claimDelay });

    tx = await Kudzu.updateForfeitClaim(0);
    await tx.wait();
    const forfeitClaim = await Kudzu.forfeitClaim();
    console.log({ forfeitClaim });

    tx = await Kudzu.updatePrices(0, 0);
    await tx.wait();

    const fundAccountsWith = "0.5";
    const userTokens = [];

    for (let i = 0; i < 3; i++) {
      const account = accounts[i];
      let tokenIds;
      try {
        tx = await Kudzu.connect(account).mint(account.address, 0, 10);
        const receipt = await tx.wait();
        tokenIds = (await getParsedEventLogs(receipt, Kudzu, "Created")).map(
          (e) => e.pretty.tokenId
        );
        userTokens.push(tokenIds);
      } catch (e) {
        console.log({ i, e });
        i--;
        continue;
      }
      for (let j = 0; j < 10; j++) {
        if (i == j) continue;
        const ethBalance = await hre.ethers.provider.getBalance(
          accounts[j].address
        );
        if (ethBalance < hre.ethers.parseEther(fundAccountsWith)) {
          try {
            tx = await accounts[0].sendTransaction({
              to: accounts[j].address,
              value: hre.ethers.parseEther(fundAccountsWith),
            });
            await tx.wait();
          } catch (e) {
            console.log({ i, j, e });
            j--;
            continue;
          }
        }

        for (let k = 0; k < 10; k++) {
          try {
            tx = await Kudzu.connect(account).airdrop(
              accounts[j].address,
              tokenIds[k],
              "0x",
              0
            );
            await tx.wait();
          } catch (e) {
            if (e.message.includes("ALREADY INFECTED")) {
              continue;
            }

            console.log({ i, j, k, e });
            k--;
          }
        }
      }
    }
  }
  const block2 = await hre.ethers.provider.getBlock("latest");
  const timenow = block2.timestamp;
  console.log({ Kudzu });

  if (skip) {
    const { Interface } = require("ethers");

    // Create minimal ABI for just the function we need
    const minimalABI = ["function updateEndDate(uint256) external"];

    // Create interface with minimal ABI
    const iface = new Interface(minimalABI);

    // Encode the function call
    const data = iface.encodeFunctionData("updateEndDate", [timenow]);

    // Create transaction object with the target address
    const txData = {
      to: Kudzu.target,
      data: data,
    };

    // Send the transaction
    const tx = await deployer.sendTransaction(txData);
    console.log({ tx });

    // Wait for transaction
    const receipt = await tx.wait();
    console.log({ receipt });
  } else {
    tx = await Kudzu.updateEndDate(timenow);
    await tx.wait();
  }

  for (let i = 0; i < 10; i++) {
    // try {
    //   tx = await Kudzu.connect(accounts[i]).setApprovalForAll(
    //     KudzuBurn.target,
    //     true
    //   );
    //   await tx.wait();
    // } catch (e) {
    //   console.warn(e);
    //   i--;
    //   continue;
    // }
    // for (let j = 0; j <= i; j++) {
    //   const tokenId = userTokens[i][0];
    //   console.log({ tokenId });
    //   try {
    //     tx = await KudzuBurn.connect(accounts[i]).burn(tokenId);
    //     await tx.wait();
    //   } catch (e) {
    //     console.warn(e);
    //     j--;
    //     continue;
    //   }
    // }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
