const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log({ deployer: deployer.address });
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  console.log('Deploy to chain:');
  console.log({ chainId });
  const { deployContracts } = await import('./utils.js');
  await deployContracts({ ignoreTesting: true, saveAndVerify: true });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
