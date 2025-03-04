async function main() {
  const {
    deployController,
    verifyContracts,
    copyABI,
    saveAddress,
    initContracts,
  } = await import('./utils.js');

  // Get the currently deployed Kudzu contract
  const {
    Kudzu,
    KudzuBurn: prevKudzuBurn,
    KudzuBurnController,
  } = await initContracts(['Kudzu', 'KudzuBurn', 'KudzuBurnController']);

  // console.log({ prevKudzuBurn: prevKudzuBurn.interface.fragments });

  let block_num = 999999999999999999;
  console.log(`previous kudzuBurn available from ${prevKudzuBurn.target}`);
  // const tx = await prevKudzuBurn.updatePaused(true);
  // const receipt = await tx.wait();
  // block_num = receipt.blockNumber;
  // console.log(`Block number: ${block_num}`);

  const KudzuBurn = await hre.ethers.getContractFactory('KudzuBurn');

  const kudzuBurn = await KudzuBurn.deploy(Kudzu.target, prevKudzuBurn.target);
  await kudzuBurn.deploymentTransaction().wait();

  console.log(`kudzuBurn deployed to ${kudzuBurn.target}`);

  // const returnObject = {
  //   KudzuBurn: kudzuBurn,
  // };

  // update KudzuBurnController
  // await KudzuBurnController.updateBurnAddress(kudzuBurn.target);
  // console.log(
  //   `KudzuBurn address updated to ${kudzuBurn.target} in KudzuBurnController ${KudzuBurnController.target}`
  // );
  // const contract = returnObject.KudzuBurn;
  // await saveAddress(contract, 'KudzuBurn');

  // const verificationData = [
  //   {
  //     name: 'KudzuBurn',
  //     constructorArguments: [Kudzu.target, prevKudzuBurn.target],
  //   },
  // ];
  // returnObject['verificationData'] = verificationData;

  // Verify the contracts
  // await verifyContracts(returnObject);

  const oldKudzuBurnContract = prevKudzuBurn.target;
  const networkInfo = await ethers.provider.getNetwork();
  const chainId = networkInfo.chainId;
  const url = `https://api.indexsupply.net/query?query=SELECT+%0A++count%28distinct%28%22to%22%29%29%0AFROM+%0A++pointsrewarded%0AWHERE%0A++address+%3D+${oldKudzuBurnContract}%0AAND%0A++block_num+%3C%3D+${block_num}%0A&event_signatures=PointsRewarded%28address+indexed+to%2Cuint256+indexed+tokenId%2Cint256+points%29&chain=${chainId}`;
  console.log(url);
  const response = await fetch(url);
  const data = await response.json();
  const count = data.result[0][1];
  console.log(`Count of points rewarded: ${count}`);
  const chunksize = 1;
  const totalChunks = Math.ceil(count / chunksize);
  const lastChunkSize = count % chunksize;
  let totalGasUsed = 0n;
  for (let i = 170; i < totalChunks; i++) {
    const startIndex = i * chunksize;
    const chunk =
      i == totalChunks - 1 && lastChunkSize > 0 ? lastChunkSize : chunksize;
    // for (let j = 64; j < chunk; j++) {
    //   const estimateGas = await prevKudzuBurn.kvAtGlobalIndex.estimateGas(
    //     startIndex + j
    //   );
    //   console.log({
    //     index: startIndex + j,
    //     estimateGas,
    //   });
    //   const result = await prevKudzuBurn.kvAtGlobalIndex(startIndex + j);
    //   console.log({ result });
    // }
    const tx = await kudzuBurn.migrateTree(startIndex, chunk);
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
