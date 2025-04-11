async function main() {
  const {
    deployController,
    verifyContracts,
    copyABI,
    saveAddress,
    initContracts,
  } = await import('./utils.js');

  // Get the currently deployed Kudzu contract
  const { Kudzu, KudzuBurn } = await initContracts(['Kudzu', 'KudzuBurn']);

  const paused = await KudzuBurn.paused();
  if (!paused) {
    await KudzuBurn.updatePaused(true);
    console.log(`KudzuBurn is paused`);
  }

  // const allPrevControllers = [
  //   '0xE30cef8e99A6eEbE3CBF2862641337f57830FbeE',
  //   '0x23dEf29FAF850A7C5F18C610c34945e65ff334C0',
  //   '0xA62a48D61bF012F70c8C865Dc17e59F6E6761106',
  //   '0x5286f3be5EDaf30Fd71597f15226fac5f9654E2D',
  // ];

  const modulariumAddresses = {
    formatest: '0x83c62Cc36B792eE22ba14e74E07Ab05eC2630d1b', // formatest (assuming this is the testnet name in hardhat config)
    forma: '0x98DF8F54ac374B5F9d814f09978E5287C27e3Ef6', // forma mainnet
    hardhat: ethers.zeroAddress,
    // Add other networks and their Modularium addresses here if needed
  };
  const networkName = hre.network.name;
  console.log(`   Getting Modularium address for network: ${networkName}`);
  const modulariumAddress = modulariumAddresses[networkName];
  if (!modulariumAddress) {
    throw new Error(
      `Modularium address not configured for network '${networkName}' in utils.js. Cannot deploy KudzuBurnController without a valid Modularium address or running in mock mode.`
    );
  }

  const KudzuBurnController = await hre.ethers.getContractFactory(
    'KudzuBurnController'
  );

  const burnController = await KudzuBurnController.deploy(
    Kudzu.target,
    KudzuBurn.target,
    modulariumAddress
  );
  await burnController.deploymentTransaction().wait();

  console.log(`KudzuBurnController deployed to ${burnController.target}`);

  const returnObject = {
    KudzuBurnController: burnController,
  };

  // update ExternalMetadata
  const tx = await KudzuBurn.updateKudzuBurnController(burnController.target);
  console.log(
    `KudzuBurnController address updated to ${burnController.target} in KudzuBurn ${KudzuBurn.target}`
  );
  const receipt = await tx.wait();
  console.log(`Block number: ${receipt.blockNumber}`);

  await copyABI('KudzuBurnController');
  const contract = returnObject.KudzuBurnController;
  await saveAddress(contract, 'KudzuBurnController');

  const verificationData = [
    {
      name: 'KudzuBurnController',
      constructorArguments: [Kudzu.target, KudzuBurn.target, modulariumAddress],
    },
  ];
  returnObject['verificationData'] = verificationData;

  // Verify the contracts
  await verifyContracts(returnObject);

  const paused_ = await KudzuBurn.paused();
  if (paused_) {
    await KudzuBurn.updatePaused(false);
    console.log(`KudzuBurn is unpaused`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
