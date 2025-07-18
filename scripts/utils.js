import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import hre from 'hardhat';
import path from 'node:path';

const __dirname = path.resolve();

BigInt.prototype.toJSON = function () {
  return `${this.toString()}n`;
};

export class DeterministicRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

export const printTree = async (leaderboard) => {
  console.log('----printTree---');
  const depth = await leaderboard.maxDepth();
  for (let i = 0; i < depth; i++) {
    const [, players, scores, colors] = await leaderboard.printDepth(i);
    let line = '';
    const totalLevels = parseInt(depth);
    const spacingFactor = 2 ** (totalLevels - i + 1); // Controls spacing

    for (let j = 0; j < players.length; j++) {
      // Customize content display (currently using '00' as placeholder)
      const content = `${players[j].slice(2, 4)}(${scores[j].toString().padStart(3)})${colors[j] === 0 ? 'R' : 'B'}`;
      // Calculate padding: Larger for top levels, smaller for bottom levels
      const leftPadding = '-'.repeat(spacingFactor - content.length / 2);
      const rightPadding = '-'.repeat(spacingFactor - content.length / 2);

      line += `${leftPadding}${content}${rightPadding}`;
    }

    console.log(line);
  }
};

const testJson = (tJson) => {
  try {
    JSON.parse(tJson);
  } catch (e) {
    return false;
  }
  return true;
};

const getPathABI = async (name) => {
  // var networkinfo = await hre.ethers.provider.getNetwork();
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);

  const savePath = path.join(
    __dirname,
    'contractData',
    `ABI-${String(chainId)}-${String(name)}.json`
  );
  return savePath;
};

async function readData(path) {
  const Newdata = await fs.readFile(path, 'utf8');
  return Newdata;
}

const getPathAddress = async (name) => {
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  const savePath = path.join(__dirname, 'contractData', `${String(chainId)}-${String(name)}.json`);
  return savePath;
};

const initContracts = async (
  contractNames = ['Kudzu', 'ExternalMetadata'],
  { skipErrors = false, mock = false } = {}
) => {
  const [deployer] = await hre.ethers.getSigners();

  const returnObject = {};

  for (let i = 0; i < contractNames.length; i++) {
    try {
      const address = JSON.parse(await readData(await getPathAddress(contractNames[i])))['address'];
      let abi;
      if (contractNames[i] === 'Kudzu' && mock) {
        const mockKudzu = await hre.ethers.getContractFactory('KudzuMock');
        abi = mockKudzu.interface;
      } else {
        abi = JSON.parse(await readData(await getPathABI(contractNames[i])))['abi'];
      }
      returnObject[contractNames[i]] = new hre.ethers.Contract(address, abi, deployer);
    } catch (e) {
      if (!skipErrors) {
        console.log({ e });
      }
    }
  }

  return returnObject;
};

const decodeUri = (decodedJson) => {
  const metaWithoutDataURL = decodedJson.substring(decodedJson.indexOf(',') + 1);
  const buff = Buffer.from(metaWithoutDataURL, 'base64');
  const text = buff.toString('ascii');
  return text;
};

const deployMetadata = async () => {
  let externalMetadata;
  try {
    const networkinfo = await hre.network.provider.send('eth_chainId');
    const chainId = BigInt(networkinfo);
    global.chainId = chainId;

    // deploy ExternalMetadata
    const ExternalMetadata = await hre.ethers.getContractFactory('ExternalMetadata');
    externalMetadata = await ExternalMetadata.deploy();
    await externalMetadata.deploymentTransaction().wait(); // Updated for v6
  } catch (e) {
    console.error(e);
  }

  return {
    externalMetadata,
  };
};

const deployKudzuAndBurn = async (options) => {
  let returnValues = await deployContractsV0(options);
  returnValues = await deployBurnContract(returnValues);
  if (options?.saveAndVerify) {
    await saveAndVerifyContracts(returnValues);
  }
  return returnValues;
};

const deployBurn = async (options) => {
  options = await deployBurnContract(options);
  if (options?.saveAndVerify) {
    await saveAndVerifyContracts(options);
  }
  return options;
};

const deployERC2981Contracts = async (options) => {
  const returnValue = await deployERC2981Contract(options);
  if (options?.saveAndVerify) {
    await saveAndVerifyContracts(returnValue);
  }
  return returnValue;
};

const deployContracts = async (options) => {
  const returnValue = await deployContractsV0(options);
  if (options?.saveAndVerify) {
    await saveAndVerifyContracts(returnValue);
  }
  return returnValue;
};

const saveAndVerifyContracts = async (deployedContracts) => {
  for (const contractName in deployedContracts) {
    if (
      contractName === 'verificationData' ||
      contractName === 'saveAndVerify' ||
      contractName === 'ignoreTesting' ||
      contractName === 'verbose' ||
      contractName === 'chainId' ||
      contractName === 'mock' ||
      contractName === 'mockRound'
    ) {
      continue;
    }
    log(`Saving and verifying ${contractName}`);
    await copyABI(contractName);
    const contract = deployedContracts[contractName];
    await saveAddress(contract, contractName);
  }
  if (deployedContracts.verificationData) {
    await verifyContracts(deployedContracts);
  }
};

const deployERC2981Contract = async (options) => {
  const defaultOptions = { mock: false, ignoreTesting: false, verbose: false };
  const { ignoreTesting, verbose } = Object.assign(defaultOptions, options);
  global.ignoreTesting = ignoreTesting;
  global.verbose = verbose;
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);

  // const networkinfo = await hre.ethers.provider.getNetwork();
  global.chainId = chainId;
  log('Deploying contracts');

  const returnObject = {};

  // deploy ERC2981
  const ERC2981 = await hre.ethers.getContractFactory('ERC2981');

  const eRC2981 = await ERC2981.deploy();

  await eRC2981.deploymentTransaction().wait();

  returnObject['ERC2981'] = eRC2981;
  log(`ERC2981 Deployed at ${eRC2981.target} `);

  const verificationData = [
    {
      name: 'ERC2981',
      constructorArguments: [],
    },
  ];

  returnObject.verificationData = verificationData;

  return returnObject;
};

const deployBurnContract = async (returnObject) => {
  if (!returnObject.Kudzu) {
    throw new Error('Kudzu contract is required to deploy KudzuBurn contract');
  }
  const unpause = returnObject.unpause || true;

  log('Deploying KudzuBurn contract');

  const zeroAddress = '0x0000000000000000000000000000000000000000';

  // --- Determine Modularium Address ---+
  let modulariumAddress;
  let modulariumInstance; // To hold the deployed mock instance if needed
  const { mock } = returnObject; // Assuming mock flag is passed in the object
  const modulariumAddresses = {
    formatest: '0x83c62Cc36B792eE22ba14e74E07Ab05eC2630d1b', // formatest (assuming this is the testnet name in hardhat config)
    forma: '0x98DF8F54ac374B5F9d814f09978E5287C27e3Ef6', // forma mainnet
    hardhat: zeroAddress,
    // Add other networks and their Modularium addresses here if needed
  };

  // --- Determine Chimera Address ---+
  let chimeraAddress;
  const chimeraAddresses = {
    formatest: zeroAddress, // TODO: Update with actual chimera address when available
    forma: zeroAddress, // TODO: Update with actual chimera address when available
    hardhat: zeroAddress,
    // Add other networks and their Chimera addresses here if needed
  };

  if (mock) {
    log('   Deploying ModulariumMock...');
    const ModulariumMockFactory = await hre.ethers.getContractFactory('ModulariumMock');
    modulariumInstance = await ModulariumMockFactory.deploy();
    await modulariumInstance.deploymentTransaction().wait();
    modulariumAddress = modulariumInstance.target;
    log(`   ModulariumMock deployed at: ${modulariumAddress}`);
    // Optionally add the mock instance to the return object if needed elsewhere
    returnObject['ModulariumMock'] = modulariumInstance;

    // For mock mode, use zero address for chimera
    chimeraAddress = zeroAddress;
    log(`   Using zero address for chimera in mock mode: ${chimeraAddress}`);
  } else {
    const networkName = hre.network.name;
    log(`   Getting Modularium address for network: ${networkName}`);
    modulariumAddress = modulariumAddresses[networkName];
    if (!modulariumAddress) {
      throw new Error(
        `Modularium address not configured for network '${networkName}' in utils.js. Cannot deploy KudzuBurnController without a valid Modularium address or running in mock mode.`
      );
    }
    log(`   Using Modularium address: ${modulariumAddress}`);

    log(`   Getting Chimera address for network: ${networkName}`);
    chimeraAddress = chimeraAddresses[networkName];
    if (chimeraAddress === undefined) {
      throw new Error(
        `Chimera address not configured for network '${networkName}' in utils.js. Cannot deploy KudzuBurnController without a valid Chimera address.`
      );
    }
    log(`   Using Chimera address: ${chimeraAddress}`);
  }

  // deploy KudzuBurn
  const KudzuBurn = await hre.ethers.getContractFactory('KudzuBurn');
  const kudzuBurn = await KudzuBurn.deploy(returnObject.Kudzu.target, zeroAddress);
  await kudzuBurn.deploymentTransaction().wait();
  returnObject['KudzuBurn'] = kudzuBurn;
  log(`KudzuBurn Deployed at ${kudzuBurn.target} `);

  // Deploy KudzuBurnController with the determined Modularium and Chimera addresses
  log('Deploying KudzuBurnController...');
  const KudzuBurnControllerFactory = await hre.ethers.getContractFactory('KudzuBurnController');
  const kudzuBurnController = await KudzuBurnControllerFactory.deploy(
    returnObject.Kudzu.target, // Kudzu address
    kudzuBurn.target, // KudzuBurn address
    modulariumAddress, // Determined Modularium address (real or mock)
    chimeraAddress // Determined Chimera address (real or zero address)
  );
  await kudzuBurnController.deploymentTransaction().wait();
  returnObject['KudzuBurnController'] = kudzuBurnController;
  log(
    `KudzuBurnController Deployed at ${kudzuBurnController.target} with Kudzu at ${returnObject.Kudzu.target} and KudzuBurn at ${kudzuBurn.target}, modularium address at ${modulariumAddress}, and chimera address at ${chimeraAddress}`
  );

  // update KudzuBurn with KudzuController address
  await kudzuBurn.updateKudzuBurnController(kudzuBurnController.target);
  log(`KudzuBurn updated with KudzuBurnController at ${kudzuBurnController.target}`);

  // If mockRound is provided, set the currentRound to that value (for testing purposes)
  if (returnObject.mockRound !== undefined) {
    // Use a transaction to set currentRound directly
    // Note: This bypasses normal contract logic for testing purposes only
    const currentRoundSlot = 0; // Storage slot for currentRound (verify this is correct)

    // Directly modify storage using hardhat's setStorageAt
    await hre.network.provider.send('hardhat_setStorageAt', [
      kudzuBurn.target,
      currentRoundSlot.toString(16).padStart(64, '0'), // Convert to hex and pad
      returnObject.mockRound.toString(16).padStart(64, '0'), // Convert to hex and pad
    ]);

    log(`KudzuBurn currentRound set to ${returnObject.mockRound} for testing`);
  }

  if (unpause) {
    await kudzuBurn.updatePaused(false);
  }

  const verificationData = [
    {
      name: 'KudzuBurn',
      constructorArguments: [returnObject.Kudzu.target],
    },
    {
      name: 'KudzuBurnController',
      constructorArguments: [
        returnObject.Kudzu.target,
        kudzuBurn.target,
        modulariumAddress,
        chimeraAddress,
      ],
    },
  ];
  returnObject.verificationData = verificationData;
  return returnObject;
};

const deployContractsV0 = async (options) => {
  const defaultOptions = {
    burn: false,
    mock: false,
    ignoreTesting: false,
    verbose: false,
    mockRound: undefined, // Add mockRound option with default undefined
  };
  const { mock, ignoreTesting, verbose, mockRound } = Object.assign(defaultOptions, options);
  global.ignoreTesting = ignoreTesting;
  global.verbose = verbose;
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);

  // const networkinfo = await hre.ethers.provider.getNetwork();
  global.chainId = chainId;
  log('Deploying contracts');

  const returnObject = {
    mockRound, // Pass mockRound to the returnObject for use in deployBurnContract
    mock,
    ignoreTesting,
    verbose,
  };

  // deploy Metadata
  const { externalMetadata } = await deployMetadata();
  log(`ExternalMetadata Deployed at ${String(externalMetadata.target)}`); // Updated from .address to .target

  returnObject['ExternalMetadata'] = externalMetadata;

  // deploy Kudzu
  const Kudzu = await hre.ethers.getContractFactory(mock ? 'KudzuMock' : 'Kudzu');

  if (mock) {
    log('Deploying KudzuMock contract');
  }

  // const now = Math.floor(Date.now() / 1000);
  // const inOneMonth = now + 60 * 60 * 24 * 30;
  // let startDate, endDate;
  // switch (chainId) {
  //   case 984122n:
  //     startDate = 0;
  //     endDate = 0;
  //     break;
  //   default:
  //     startDate = now + 5 * 60;
  //     endDate = now + 5 * 60 + inOneMonth;
  // }

  const kudzu = await Kudzu.deploy(externalMetadata.target); // Updated from .address to .target
  await kudzu.deploymentTransaction().wait(); // Updated for v6
  returnObject['Kudzu'] = kudzu;
  log(
    `Kudzu Deployed at ${kudzu.target} with ExternalMetadata at ${externalMetadata.target}` // Updated .address to .target
  );

  const verificationData = [
    {
      name: 'ExternalMetadata',
      constructorArguments: [],
    },
    {
      name: 'Kudzu',
      constructorArguments: [externalMetadata.target], // Updated from .address to .target
    },
  ];

  returnObject.verificationData = verificationData;

  return returnObject;
};

const verifyContracts = async (returnObject) => {
  const networkInfo = await hre.ethers.provider.getNetwork();
  const chainId = BigInt(networkInfo.chainId);
  const [deployer] = await hre.ethers.getSigners();
  // verify contract if network ID is mainnet goerli or sepolia
  if (
    chainId === 5n || // Updated to use bigint
    chainId === 1n ||
    chainId === 984123n ||
    chainId === 984122n ||
    chainId === 11155111n ||
    chainId === 17069n ||
    chainId === 84532n ||
    chainId === 8453n
  ) {
    const verificationData = returnObject.verificationData;
    for (let i = 0; i < verificationData.length; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      log(`Verifying ${verificationData[i].name} Contract`);
      try {
        await hre.run('verify:verify', {
          address: returnObject[verificationData[i].name].target, // Updated from .address to .target
          constructorArguments: verificationData[i].constructorArguments,
        });
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
        log({ e, verificationData: verificationData[i] });
        i--;
      }
    }
  } else if (chainId === 12345n) {
    // Updated to use bigint
    // This is so dev accounts have spending money on local chain
    await deployer.sendTransaction({
      to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      value: ethers.parseEther('1.0'), // Updated from utils.parseEther
    });
    await deployer.sendTransaction({
      to: '0xc795344b1b30E3CfEE1AFA1D5204B141940CF445',
      value: ethers.parseEther('1.0'), // Updated from utils.parseEther
    });
  }
};

const log = (message) => {
  const ignoreTesting = global.ignoreTesting;
  const chainId = global.chainId;
  const verbose = global.verbose;
  if (
    !verbose &&
    (!chainId || (chainId === 12345n && !ignoreTesting)) // Updated to use bigint
  ) {
    return;
  }
  console.log(message);
};

const getParsedEventLogs = async (receipt, contract, eventName) => {
  // const events = await contract.queryFilter(
  //   contract.filters[eventName],
  //   receipt?.blockNumber,
  //   receipt?.blockNumber
  // );

  // NOTE: i miss this way of doing things
  // const events = receipt.logs
  //   .filter((x) => x.address === contract.target) // Updated from .address to .target
  //   .map((log) => contract.interface.parseLog(log));
  const filter = contract.filters[eventName];
  if (!filter) {
    throw new Error(`Event ${eventName} not found in contract`);
  }
  let events = await contract.queryFilter(filter, receipt.blockNumber);
  // delete events[0].provider;
  // delete events[0].interface;
  const result = eventName ? events.filter((x) => x.fragment.name === eventName) : events;
  events = events.map((e) => {
    e.pretty = [...e.args];

    for (let i = 0; i < e.fragment.inputs.length; i++) {
      const input = e.fragment.inputs[i];
      e.pretty[input.name] = e.args[i];
    }
  });
  return result;
};

async function copyABI(name, contractName) {
  contractName = contractName || name;

  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  log(`--copy ${name} ABI`);
  const pathname = path.join(
    __dirname,
    'artifacts',
    'contracts',
    `${name}.sol`,
    `${contractName}.json`
  );
  try {
    const readABI = await fs.readFile(pathname);
    const parsedABI = JSON.parse(readABI);
    const abi = parsedABI['abi'];

    const newContent = { contractName, abi };

    const copy = path.join(__dirname, 'contractData', `ABI-${String(chainId)}-${name}.json`);
    await writedata(copy, JSON.stringify(newContent));
    log('-- OK');
  } catch (e) {
    console.error(`Failed to copy ABI${name}`, { e });
  }
}

async function saveAddress(contract, name) {
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  log(`-save json for ${name}`);
  const newAddress = await contract.target; // Updated from .address to .target
  const savePath = path.join(__dirname, 'contractData', `${String(chainId)}-${String(name)}.json`);
  const objToWrite = {
    address: newAddress,
    chain: chainId,
  };
  await writedata(savePath, JSON.stringify(objToWrite));
}

async function writedata(path, data) {
  try {
    await fs.writeFile(path, data);
  } catch (e) {
    console.error(`Failed to write file${path}`, { e });
  }
}

// fifoSort for increasing values but decreasing nonces
// smaller nonces are considered "greater" when values are equal
export const fifoSort = (ar) => {
  const withNewIndexes = ar.map((a, i) => {
    return { ...a, i };
  });
  return withNewIndexes
    .sort((a, b) => {
      if (a.value === b.value) {
        if (Object.keys(a).includes('playerNonce')) {
          return b.playerNonce - a.playerNonce;
        } else {
          return b.i - a.i;
        }
      } else {
        return a.value - b.value;
      }
    })
    .map((a, rank) => {
      a.rank = withNewIndexes.length - 1 - rank;
      delete a.i;
      return a;
    });
};

const prepareKudzuForTests = async (Kudzu, recipients = []) => {
  const currentTime = (await hre.ethers.provider.getBlock('latest')).timestamp;
  const currentTimePlusOneDay = currentTime + 86400;
  let tx = await Kudzu.updateStartDate(currentTime);
  await tx.wait();
  // const startDate = await Kudzu.startDate();

  tx = await Kudzu.updateEndDate(currentTimePlusOneDay);
  await tx.wait();
  // const endDate = await Kudzu.endDate();
  tx = await Kudzu.updatePrices(0, 0);
  await tx.wait();
  tx = await Kudzu.updateClaimDelay(0);
  await tx.wait();
  tx = await Kudzu.updateForfeitClaim(0);
  await tx.wait();
  const allTokenIds = [];
  // Create tokens and handle airdrops
  for (let i = 0; i < recipients.length; i++) {
    const address = recipients[i].address;
    const quantity = recipients[i].quantity;
    const infected = recipients[i].infected;
    const quantityChunkSize = 100;
    const quantityChunks = Math.ceil(quantity / quantityChunkSize);
    const quantityChunkLast =
      quantity % quantityChunkSize === 0 ? quantityChunkSize : quantity % quantityChunkSize;

    const tokenIds = [];
    for (let j = 0; j < quantityChunks; j++) {
      const quantityChunk = j === quantityChunks - 1 ? quantityChunkLast : quantityChunkSize;
      const tx = await Kudzu.connect(address).mint(address.address, 0, quantityChunk);
      const receipt = await tx.wait();
      tokenIds.push(
        ...(await getParsedEventLogs(receipt, Kudzu, 'TransferSingle')).map((e) => e.pretty.id)
      );
    }
    allTokenIds.push(...tokenIds);
    for (let k = 0; k < infected.length; k++) {
      const infectedAddress = infected[k].address;
      const strainIndex = infected[k].strainIndex;
      await Kudzu.connect(address).airdrop(infectedAddress, tokenIds[strainIndex], '0x', 0);
    }
  }

  // Fast forward to end of game
  await hre.network.provider.send('evm_setNextBlockTimestamp', [parseInt(currentTimePlusOneDay)]);
  await hre.network.provider.send('evm_mine');

  // Get winning tokens
  const winningTokens = [];
  for (let i = 0; i < 3; i++) {
    winningTokens.push(await Kudzu.getWinningToken(i));
  }

  // Try claiming for all recipients
  for (let i = 0; i < recipients.length; i++) {
    const address = recipients[i].address;

    // Try claiming for all places (0, 1, 2)
    for (let place = 0; place < 3; place++) {
      // This address holds a winning token
      try {
        await Kudzu.connect(address).claimPrize(place);
      } catch (e) {
        // Prize claiming can fail if this address doesn't hold a winning token
      }
    }
  }

  return allTokenIds;
};

export {
  copyABI,
  decodeUri,
  deployBurn,
  deployBurnContract,
  deployContracts,
  deployContractsV0,
  deployERC2981Contracts,
  deployKudzuAndBurn,
  deployMetadata,
  getParsedEventLogs,
  getPathABI,
  getPathAddress,
  initContracts,
  prepareKudzuForTests,
  readData,
  saveAddress,
  saveAndVerifyContracts,
  testJson,
  verifyContracts,
};
