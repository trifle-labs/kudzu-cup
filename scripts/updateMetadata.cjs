async function main() {
  const { deployMetadata, verifyContracts, copyABI, saveAddress, initContracts } = await import(
    './utils.js'
  );

  // Deploy the metadata contract
  const { externalMetadata } = await deployMetadata();
  const returnObject = {
    ExternalMetadata: externalMetadata,
  };

  // Get the currently deployed Kudzu contract
  const { Kudzu } = await initContracts(['Kudzu']);

  // update ExternalMetadata
  await Kudzu.updateExternalMetadata(externalMetadata.address);
  console.log('Kudzu address updated');

  await copyABI('ExternalMetadata');
  const contract = returnObject.ExternalMetadata;
  await saveAddress(contract, 'ExternalMetadata');

  await Kudzu.emitBatchMetadataUpdate();
  console.log('Batch metadata update emitted');

  const verificationData = [
    {
      name: 'ExternalMetadata',
      constructorArguments: [],
    },
  ];
  returnObject['verificationData'] = verificationData;

  // Verify the contracts
  await verifyContracts(returnObject, externalMetadata);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
