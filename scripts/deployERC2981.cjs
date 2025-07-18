const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log({ deployer: deployer.address });
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  console.log('Deploy to chain:');
  console.log({ chainId });
  const { deployERC2981Contracts } = await import('./utils.js');
  await deployERC2981Contracts({ ignoreTesting: true, saveAndVerify: true });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
