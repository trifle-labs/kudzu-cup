require('@nomicfoundation/hardhat-chai-matchers');

require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('dotenv').config();
require('@nomicfoundation/hardhat-verify');
require('solidity-coverage');
require('@nomicfoundation/hardhat-ethers');
require('./scripts/bulkBuyModularium.cjs');
// const { subtask } = require('hardhat/config')
// const {
//   TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS
// } = require('hardhat/builtin-tasks/task-names')

// Add a subtask that sets the action for the TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS task

//eslint-disable-next-line
// subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(
//   async (_, __, runSuper) => {
//     // Get the list of source paths that would normally be passed to the Solidity compiler
//     const paths = await runSuper()
//     // Apply a filter function to exclude paths that contain the string "ignore"
//     let val = paths.filter((p) => !p.includes('Assets') && !p.includes('Game'))
//     // console.log(val)
//     return val
//   }
// )

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config = {
  mocha: {
    timeout: 100_000_000,
  },
  solidity: {
    compilers: [
      {
        version: '0.8.28',
        settings: {
          viaIR: true,
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      accounts: { mnemonic: process.env.localKey, count: 121 },
      gasPrice: 18_000_000_000, // 18 GWEI
      blockGasLimit: 30_000_000,
      chainId: 12345,
      // loggingEnabled: false
    },
    localhost: {
      accounts: { mnemonic: process.env.localKey, count: 121 },
      gasPrice: 18_000_000_000, // 18 GWEI
      blockGasLimit: 100_000_000, // 100 M
      chainId: 12345,
      // loggingEnabled: false
    },
    forma: {
      url: 'https://rpc.forma.art/',
      accounts: { mnemonic: process.env.deploymentKey },
      gasPrice: 18_000_000_000, // 18 GWEI
    },
    formatest: {
      url: 'https://rpc.sketchpad-1.forma.art/',
      accounts: { mnemonic: process.env.deploymentKey },
      gasPrice: 18_000_000_000, // 18 GWEI
    },
    baseSepolia: {
      // network ID: 84532
      // url: 'https://sepolia.base.org',
      url: process.env.baseSepoliaRPC,
      accounts: { mnemonic: process.env.deploymentKey },
      gas: 5_000_000,
      gasPrice: 2_000_000_000, // 2 GWEI
    },
    base: {
      // network ID: 8453
      // url: 'https://sepolia.base.org',
      url: process.env.baseRPC,
      accounts: { mnemonic: process.env.deploymentKey, initialIndex: 0 },
      // gas: 5_000_000,
      gasPrice: 50_000_000, // 0.05 GWEI
    },
    sepolia: {
      // url: 'https://sepolia.infura.io/v3/' + process.env.INFURA_API_KEY,
      // url: 'https://sepolia.rpc.grove.city/v1/' + process.env.grove,
      url: 'https://ethereum-sepolia.blockpi.network/v1/rpc/public',
      accounts: { mnemonic: process.env.deploymentKey },
      gasPrice: 15_000_000_000, // 10 GWEI
      gas: 10_000_000,
    },
    garnet: {
      url: 'https://rpc.garnetchain.com',
      accounts: { mnemonic: process.env.localKey },
      gasPrice: 10_000_000, // 0.01 GWEI
    },
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 0.1,
    url: 'http://localhost:8545',
    coinmarketcap: '38b60711-0559-45f4-8bda-e72f446c8278',
    enabled: true,
    showMethodSig: true,
  },
  sourcify: {
    enabled: false,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.etherscanApiNew,
      sepolia: process.env.etherscanApiNew,
      base: process.env.etherscanApiBase,
      baseSepolia: process.env.etherscanApiBase,
      formatest: 'asdf',
      forma: 'asdf',
    },

    customChains: [
      {
        network: 'garnet',
        chainId: 17069,
        urls: {
          apiURL: 'https://explorer.garnetchain.com/api/',
          browserURL: 'https://explorer.garnetchain.com',
        },
      },
      {
        network: 'formatest',
        chainId: 984123,
        urls: {
          apiURL: 'https://explorer.sketchpad-1.forma.art/api/',
          browserURL: 'https://explorer.sketchpad-1.forma.art',
        },
      },
      {
        network: 'forma',
        chainId: 984122,
        urls: {
          apiURL: 'https://explorer.forma.art/api/',
          browserURL: 'https://explorer.forma.art',
        },
      },
    ],
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: false,
    only: ['Kudzu', 'ExternalMetadata'],
  },
};
module.exports = config;
