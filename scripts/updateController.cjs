async function main() {
  const { verifyContracts, copyABI, saveAddress, initContracts } = await import('./utils.js');

  // Get the currently deployed Kudzu contract
  const { Kudzu, KudzuBurn } = await initContracts(['Kudzu', 'KudzuBurn'], { skipErrors: false });

  // Check if contracts exist
  if (!Kudzu || !KudzuBurn) {
    console.error('Error: Kudzu and KudzuBurn contracts must be deployed first.');
    console.error('Run: npx hardhat run scripts/deploy.cjs --network hardhat');
    console.error('Or: npx hardhat run scripts/deployBurn.cjs --network hardhat');
    process.exit(1);
  }

  const paused = await KudzuBurn.paused();
  if (!paused) {
    await KudzuBurn.updatePaused(true);
    console.log('KudzuBurn is paused');
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
    hardhat: null,
    // Add other networks and their Modularium addresses here if needed
  };

  const chimeraAddresses = {
    formatest: `${ethers.ZeroAddress.slice(0, -1)}1`, // TODO: Update with actual chimera address when available
    forma: `${ethers.ZeroAddress.slice(0, -1)}1`, // TODO: Update with actual chimera address when available
    hardhat: null,
    // Add other networks and their Chimera addresses here if needed
  };

  const networkName = hre.network.name;
  console.log(`   Getting Modularium address for network: ${networkName}`);
  const modulariumAddress = modulariumAddresses[networkName];
  if (!modulariumAddress) {
    throw new Error(
      `Modularium address not configured for network '${networkName}' in utils.js. Cannot deploy KudzuBurnController without a valid Modularium address or running in mock mode.`
    );
  }

  console.log(`   Getting Chimera address for network: ${networkName}`);
  const chimeraAddress = chimeraAddresses[networkName];
  if (chimeraAddress === undefined) {
    throw new Error(
      `Chimera address not configured for network '${networkName}' in updateController.cjs. Cannot deploy KudzuBurnController without a valid Chimera address.`
    );
  }
  if (chimeraAddress === ethers.zeroAddress) {
    console.warn('Chimera address is zero address ensure this is intentional');
  }

  const KudzuBurnController = await hre.ethers.getContractFactory('KudzuBurnController');

  const burnController = await KudzuBurnController.deploy(
    Kudzu.target,
    KudzuBurn.target,
    modulariumAddress,
    chimeraAddress
  );
  await burnController.deploymentTransaction().wait();

  console.log(
    `KudzuBurnController deployed to ${burnController.target} with chimera address ${chimeraAddress}`
  );

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
      constructorArguments: [Kudzu.target, KudzuBurn.target, modulariumAddress, chimeraAddress],
    },
  ];
  returnObject['verificationData'] = verificationData;

  // Verify the contracts
  await verifyContracts(returnObject);

  const paused_ = await KudzuBurn.paused();
  if (paused_) {
    await KudzuBurn.updatePaused(false);
    console.log('KudzuBurn is unpaused');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
