async function main() {
  const {
    deployController,
    verifyContracts,
    copyABI,
    saveAddress,
    initContracts,
  } = await import('./utils.js');

  const test = false;
  const redo = false;
  const migrate = false;

  let block_num = 99999999999999;
  // Get the currently deployed Kudzu contract
  const {
    Kudzu,
    KudzuBurn: prevKudzuBurn,
    KudzuBurnController,
  } = await initContracts(['Kudzu', 'KudzuBurn', 'KudzuBurnController']);
  const oldKudzuBurnContract =
    test || redo
      ? '0x0FdDDec12144205F0c1CF88Ff482caE62345c0E6' //'0x3CF554831E309Be39A541080b82bD81b6409C012'
      : prevKudzuBurn.target;
  let kudzuBurn;
  if (redo) {
    kudzuBurn = prevKudzuBurn;
    console.log({ kudzuBurn_fragments: kudzuBurn.interface.fragments });
  }
  // console.log({ prevKudzuBurn: prevKudzuBurn.interface.fragments });
  if (!test && !redo) {
    console.log(`previous kudzuBurn available from ${prevKudzuBurn.target}`);
    const tx = await prevKudzuBurn.updatePaused(true);
    const receipt = await tx.wait();
    block_num = receipt.blockNumber;
    console.log(`Paused at block number: ${block_num}`);
    const KudzuBurn = await hre.ethers.getContractFactory('KudzuBurn');
    kudzuBurn = await KudzuBurn.deploy(Kudzu.target, prevKudzuBurn.target);
    await kudzuBurn.deploymentTransaction().wait();
    console.log(`kudzuBurn deployed to ${kudzuBurn.target}`);
    const returnObject = {
      KudzuBurn: kudzuBurn,
    };
    // update KudzuBurnController
    await KudzuBurnController.updateBurnAddress(kudzuBurn.target);
    console.log(
      `KudzuBurn address updated to ${kudzuBurn.target} in KudzuBurnController ${KudzuBurnController.target}`
    );
    await KudzuBurn.updateKudzuBurnController(KudzuBurnController.target);
    console.log(
      `KudzuBurnController address updated to ${KudzuBurnController.target} in KudzuBurn ${KudzuBurn.target}`
    );
    const contract = returnObject.KudzuBurn;
    await saveAddress(contract, 'KudzuBurn');
    await copyABI('KudzuBurn');
    const verificationData = [
      {
        name: 'KudzuBurn',
        constructorArguments: [Kudzu.target, prevKudzuBurn.target],
      },
    ];
    returnObject['verificationData'] = verificationData;
    // Verify the contracts
    console.log({ returnObject });
    await verifyContracts(returnObject);
  }
  if (migrate) {
    const networkInfo = await ethers.provider.getNetwork();
    const chainId = test ? 984122 : networkInfo.chainId;
    const url = `https://api.indexsupply.net/query?query=SELECT+%0A++"to"%2C+SUM%28"points"%29+as+"sum"%0AFROM+%0A++pointsrewarded%0AWHERE%0A++address+%3D+${oldKudzuBurnContract}%0AAND%0A++block_num+<%3D+${block_num}%0AGROUP+BY+"to"%0AORDER+BY+"sum"+DESC%0A&event_signatures=PointsRewarded%28address+indexed+to%2Cuint256+indexed+tokenId%2Cint256+points%29&chain=${chainId}`;
    console.log(url);
    const response = await fetch(url);
    const data = await response.json();
    // console.log({ data: data.result[0].slice(1) });
    const records = data.result[0].slice(1);
    const count = records.length;
    console.log(`Count of points rewarded: ${count}`);
    const chunksize = 100;
    const totalChunks = Math.ceil(count / chunksize);
    console.log(`Total chunks: ${totalChunks}`);
    const lastChunkSize = count % chunksize;
    console.log(lastChunkSize);
    let totalGasUsed = 0n;
    for (let i = 0; i < totalChunks; i++) {
      const startIndex = i * chunksize;
      const chunk =
        i == totalChunks - 1 && lastChunkSize > 0 ? lastChunkSize : chunksize;
      const burners = [];
      const quantities = [];
      for (let j = 0; j < chunk; j++) {
        const [address, quantity] = records[startIndex + j];
        burners.push(address);
        quantities.push(quantity);
      }
      const tx = await kudzuBurn.adminMassRewardSingleID(
        burners,
        quantities,
        6
      ); // 6 is the rewardId for migrating points from the old contract
      const receipt = await tx.wait();
      console.log(`Chunk ${i + 1}/${totalChunks} gas used: ${receipt.gasUsed}`);
      totalGasUsed += receipt.gasUsed;
    }
    console.log(`Total gas used: ${totalGasUsed}`);
    const gasPrice = 18n * 10n ** 6n;
    const totalTiaUsed = BigInt(totalGasUsed) * gasPrice;
    const totalTiaUsedFormatted = totalTiaUsed / 10n ** 18n;
    console.log(
      `Total TIA used: ${totalTiaUsedFormatted}.${totalTiaUsed % 10n ** 18n}`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
