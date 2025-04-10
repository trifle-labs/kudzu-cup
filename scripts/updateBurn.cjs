async function main() {
  const {
    deployController,
    verifyContracts,
    copyABI,
    saveAddress,
    initContracts,
  } = await import('./utils.js');

  const test = false;
  const testNetworkWithMainnetData = true;
  const redo = false;
  const migrate = true;

  let block_num = 99999999999999;
  // Get the currently deployed Kudzu contract, this will be used to gete the previous token holders
  // as well will need to be paused
  const {
    Kudzu,
    KudzuBurn: prevKudzuBurn,
    KudzuBurnController,
  } = await initContracts(['Kudzu', 'KudzuBurn', 'KudzuBurnController']);

  let KudzuBurn;

  const prevKudzuBurnContractsFormaTest = [
    '0x0FdDDec12144205F0c1CF88Ff482caE62345c0E6',
  ];

  const prevKudzuBurnContractsForma = [
    '0xF0457689De0B2b061615d47eAD81923d3a3e2140',
    '0x3CF554831E309Be39A541080b82bD81b6409C012',
  ];

  if (redo) {
    // if redo is true, the prevKudzuBurn is actually the new KudzuBurn contract
    // redo will continue the migration without re-deploying the KudzuBurn contract
    KudzuBurn = prevKudzuBurn;
  }

  if (!test && !redo) {
    // pause the current KudzuBurn contract and get the block number
    // in order to be used in indexSupply query for all previous points
    console.log(`previous KudzuBurn available from ${prevKudzuBurn.target}`);
    const tx = await prevKudzuBurn.updatePaused(true);
    const receipt = await tx.wait();
    block_num = testNetworkWithMainnetData ? block_num : receipt.blockNumber;
    console.log(`Paused at block number: ${block_num}`);

    // deploy the new KudzuBurn contract
    const KudzuBurnFactory = await hre.ethers.getContractFactory('KudzuBurn');
    KudzuBurn = await KudzuBurnFactory.deploy(
      Kudzu.target,
      prevKudzuBurn.target
    );
    await KudzuBurn.deploymentTransaction().wait();
    console.log(`KudzuBurn deployed to ${KudzuBurn.target}`);

    // update KudzuBurn with kudzuBurnController address
    await KudzuBurn.updateKudzuBurnController(KudzuBurnController.target);
    console.log(
      `KudzuBurnController address updated to ${KudzuBurnController.target} in KudzuBurn ${KudzuBurn.target}`
    );

    // update KudzuBurnController with KudzuBurn address
    await KudzuBurnController.updateBurnAddress(KudzuBurn.target);
    console.log(
      `KudzuBurn address updated to ${KudzuBurn.target} in KudzuBurnController ${KudzuBurnController.target}`
    );

    // save the new deploy information
    const returnObject = {
      KudzuBurn,
    };
    await saveAddress(KudzuBurn, 'KudzuBurn');
    await copyABI('KudzuBurn');

    // verify the contracts
    returnObject.verificationData = [
      {
        name: 'KudzuBurn',
        constructorArguments: [Kudzu.target, prevKudzuBurn.target],
      },
    ];
    await verifyContracts(returnObject);
  }

  // migration gets all combined points from all previous KudzuBurn contracts and
  // distributes them to the relevant owners in the new KudzuBurn contract
  // it also ensures the first time a token is burned is stored per user
  if (migrate) {
    const networkInfo = await ethers.provider.getNetwork();
    // get the relevant chainId for the indexSupply query
    const chainId = testNetworkWithMainnetData ? 984122 : networkInfo.chainId;
    // if testNetworkWithMainnetData is true, the data from mainnet will be used
    // regardless of what network the script is running on
    // get the relevant addresses for the indexSupply query
    const whichAddressArray = testNetworkWithMainnetData
      ? prevKudzuBurnContractsForma
      : networkInfo.chainId == 984123
        ? prevKudzuBurnContractsFormaTest
        : prevKudzuBurnContractsForma;
    const oldKudzuBurnQuery = `WHERE (address = ${whichAddressArray.join(' OR address = ')}) `;
    const API = process.env.indexSupplyApiKey;
    const makeEndpoint = (query, eventSig, chainId) => {
      const escapedQuery = encodeURIComponent(query);
      return `https://api.indexsupply.net/query?api-key=${API}&query=${escapedQuery}&event_signatures=${eventSig}&chain=${chainId}`;
    };
    const rewardPointsSig = `PointsRewarded(address indexed to,uint256 indexed tokenId,int256 points)`;

    const gasUsedToRewardPoints = await rewardPoints();
    const gasUsedToUpdateTokenIds = await updateTokenIds();
    const totalGasUsed = gasUsedToRewardPoints + gasUsedToUpdateTokenIds;

    console.log(`Total gas used: ${totalGasUsed}`);
    const gasPrice = 18n * 10n ** 9n;
    const totalTiaUsed = BigInt(totalGasUsed) * gasPrice;
    const totalTiaUsedFormatted = totalTiaUsed / 10n ** 18n; // why is this 15?
    console.log(
      `Total TIA used: ${totalTiaUsedFormatted}.${totalTiaUsed % 10n ** 18n}`
    );

    async function updateTokenIds() {
      const query = `SELECT 
  "to", tokenid
FROM 
  pointsrewarded
${oldKudzuBurnQuery}
AND
  tokenid >= 10000
AND
  block_num <= ${block_num}
GROUP BY "to", tokenid
ORDER BY "to" ASC`;

      async function processMassBurnedTokens(chunk) {
        const burners = [];
        const tokenIds = [];
        for (let i = 0; i < chunk.length; i++) {
          const [burner, tokenId] = chunk[i];
          burners.push(burner);
          tokenIds.push(tokenId);
        }
        return KudzuBurn.massUpdateBurnedTokens(burners, tokenIds, true);
      }
      const gasUsed = await queryAndProcessRecords(
        query,
        processMassBurnedTokens
      );
      return gasUsed;
    }

    async function rewardPoints() {
      const query = `SELECT 
  "to", SUM("points") as "sum"
FROM 
  pointsrewarded
${oldKudzuBurnQuery}
AND
  block_num <= ${block_num}
GROUP BY "to"
ORDER BY "sum" DESC
`;
      async function processMassRewardedPoints(chunk) {
        const burners = [];
        const quantities = [];
        for (let i = 0; i < chunk.length; i++) {
          const [burner, quantity] = chunk[i];
          burners.push(burner);
          quantities.push(quantity);
        }
        return KudzuBurn.adminMassRewardSingleID(burners, quantities, 6);
      }
      const gasUsed = await queryAndProcessRecords(
        query,
        processMassRewardedPoints
      );
      return gasUsed;
    }

    async function queryAndProcessRecords(query, process, chunksize = 50) {
      // build the indexSupply query
      const endpoint = makeEndpoint(query, rewardPointsSig, chainId);
      console.log({ endpoint });
      const response = await fetch(endpoint);
      const data = await response.json();
      console.log({ data });
      const records = data.result[0].slice(1);
      console.log({ records });

      const count = records.length;
      const totalChunks = Math.ceil(count / chunksize);
      const lastChunkSize =
        count % chunksize == 0 ? chunksize : count % chunksize;

      let totalGasUsed = 0n;
      let totalExecuted = 0;
      for (let i = 0; i < totalChunks; i++) {
        const startIndex = i * chunksize;
        const chunk =
          i == totalChunks - 1 && lastChunkSize > 0 ? lastChunkSize : chunksize;
        totalExecuted += chunk;
        const actualChunk = records.slice(startIndex, startIndex + chunk);
        const tx = await process(actualChunk);
        const receipt = await tx.wait();
        totalGasUsed += receipt.gasUsed;

        const gasPrice = 18n * 10n ** 9n;
        const times100 = (100n * (gasPrice * receipt.gasUsed)) / 10n ** 18n;
        const times100Total = (100n * (gasPrice * totalGasUsed)) / 10n ** 18n;
        console.log(
          `Chunk ${i + 1}/${totalChunks} gas used: ${times100 / 100n}.${String(times100 % 100n).padStart(2, '0')} TIA (${times100Total / 100n}.${String(times100Total % 100n).padStart(2, '0')} TIA)`
        );
      }
      if (totalExecuted !== count)
        throw new Error('Total executed is not equal to count');

      return totalGasUsed;
    }
  }

  if (!test) {
    await KudzuBurn.updatePaused(false);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
