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
  // ];

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

  // for (let i = 0; i < allPrevControllers.length; i++) {
  //   const tx = await burnController.addPrevController(allPrevControllers[i]);
  //   await tx.wait();
  //   console.log(
  //     `PrevController ${allPrevControllers[i]} added to KudzuBurnController ${burnController.target}`
  //   );
  // }

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
      constructorArguments: [Kudzu.target, KudzuBurn.target],
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
