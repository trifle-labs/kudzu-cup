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

  const KudzuBurnController = await hre.ethers.getContractFactory(
    'KudzuBurnController'
  );

  const burnController = await KudzuBurnController.deploy(
    Kudzu.target,
    KudzuBurn.target
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
  await tx.wait();
  console.log(`Block number: ${tx.blockNumber}`);

  await copyABI('KudzuBurnController');
  const contract = returnObject.KudzuBurnController;
  await saveAddress(contract, 'KudzuBurnController');

  const verificationData = [
    {
      name: 'KudzuBurnController',
      constructorArguments: [Kudzu.target, KudzuBurn.target],
    },
  ];
  returnObject['verificationData'] = verificationData;

  // Verify the contracts
  await verifyContracts(returnObject);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
