const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log({ deployer: deployer.address });
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  console.log('Deploy to chain:');
  console.log({ chainId });
  const { initContracts, deployBurn } = await import('./utils.js');
  const { Kudzu } = await initContracts();
  await deployBurn({
    // Kudzu: { target: "0x822eca148785eca2c465053553c06cb4c52c5f7c" },
    Kudzu,
    ignoreTesting: true,
    saveAndVerify: true,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
