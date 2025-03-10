import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import hre from 'hardhat';
import path from 'node:path';

const __dirname = path.resolve();

BigInt.prototype.toJSON = function () {
  return this.toString() + 'n';
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

  var savePath = path.join(
    __dirname,
    'contractData',
    'ABI-' + String(chainId) + '-' + String(name) + '.json'
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
  var savePath = path.join(
    __dirname,
    'contractData',
    String(chainId) + '-' + String(name) + '.json'
  );
  return savePath;
};

const initContracts = async (
  contractNames = ['Kudzu', 'ExternalMetadata'],
  { skipErrors = false, mock = false } = {}
) => {
  let [deployer] = await hre.ethers.getSigners();

  let returnObject = {};

  for (let i = 0; i < contractNames.length; i++) {
    try {
      const address = JSON.parse(
        await readData(await getPathAddress(contractNames[i]))
      )['address'];
      let abi;
      if (contractNames[i] === 'Kudzu' && mock) {
        const mockKudzu = await hre.ethers.getContractFactory('KudzuMock');
        abi = mockKudzu.interface;
      } else {
        abi = JSON.parse(await readData(await getPathABI(contractNames[i])))[
          'abi'
        ];
      }
      returnObject[contractNames[i]] = new hre.ethers.Contract(
        address,
        abi,
        deployer
      );
    } catch (e) {
      if (!skipErrors) {
        console.log({ e });
      }
    }
  }

  return returnObject;
};

const decodeUri = (decodedJson) => {
  const metaWithoutDataURL = decodedJson.substring(
    decodedJson.indexOf(',') + 1
  );
  let buff = Buffer.from(metaWithoutDataURL, 'base64');
  let text = buff.toString('ascii');
  return text;
};

const deployMetadata = async () => {
  let externalMetadata;
  try {
    const networkinfo = await hre.network.provider.send('eth_chainId');
    const chainId = BigInt(networkinfo);
    global.chainId = chainId;

    // deploy ExternalMetadata
    const ExternalMetadata =
      await hre.ethers.getContractFactory('ExternalMetadata');
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
      contractName === 'mock'
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

  log('Deploying KudzuBurn contract');

  const KudzuBurn = await hre.ethers.getContractFactory('KudzuBurn');
  const burn = await KudzuBurn.deploy(returnObject.Kudzu.target);
  await burn.deploymentTransaction().wait();
  returnObject['KudzuBurn'] = burn;
  log(`KudzuBurn Deployed at ${burn.target} `);

  const KudzuBurnController = await hre.ethers.getContractFactory(
    'KudzuBurnController'
  );
  const burnController = await KudzuBurnController.deploy(
    returnObject.Kudzu.target,
    burn.target
  );
  await burnController.deploymentTransaction().wait();
  returnObject['KudzuBurnController'] = burnController;
  log(
    `KudzuBurnController Deployed at ${burnController.target} with Kudzu at ${returnObject.Kudzu.target} and KudzuBurn at ${burn.target} `
  );

  // update KudzuBurn with KudzuController address
  await burn.updateKudzuBurnController(burnController.target);
  log(`KudzuBurn updated with KudzuBurnController at ${burnController.target}`);

  const verificationData = [
    {
      name: 'KudzuBurn',
      constructorArguments: [returnObject.Kudzu.target],
    },
    {
      name: 'KudzuBurnController',
      constructorArguments: [returnObject.Kudzu.target, burn.target],
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
  };
  const { mock, ignoreTesting, verbose } = Object.assign(
    defaultOptions,
    options
  );
  global.ignoreTesting = ignoreTesting;
  global.verbose = verbose;
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);

  // const networkinfo = await hre.ethers.provider.getNetwork();
  global.chainId = chainId;
  log('Deploying contracts');

  const returnObject = {};

  // deploy Metadata
  const { externalMetadata } = await deployMetadata();
  log('ExternalMetadata Deployed at ' + String(externalMetadata.target)); // Updated from .address to .target

  returnObject['ExternalMetadata'] = externalMetadata;

  // deploy Kudzu
  const Kudzu = await hre.ethers.getContractFactory(
    mock ? 'KudzuMock' : 'Kudzu'
  );

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
    chainId == 5n || // Updated to use bigint
    chainId == 1n ||
    chainId == 984123n ||
    chainId == 984122n ||
    chainId == 11155111n ||
    chainId == 17069n ||
    chainId == 84532n ||
    chainId == 8453n
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
  } else if (chainId == 12345n) {
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
    (!chainId || (chainId == 12345n && !ignoreTesting)) // Updated to use bigint
  )
    return;
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
  const result = eventName
    ? events.filter((x) => x.fragment.name === eventName)
    : events;
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
  var pathname = path.join(
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

    var copy = path.join(
      __dirname,
      'contractData',
      'ABI-' + String(chainId) + `-${name}.json`
    );
    await writedata(copy, JSON.stringify(newContent));
    log('-- OK');
  } catch (e) {
    console.error('Failed to copy ABI' + name, { e });
  }
}

async function saveAddress(contract, name) {
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  log('-save json for ' + name);
  var newAddress = await contract.target; // Updated from .address to .target
  var savePath = path.join(
    __dirname,
    'contractData',
    String(chainId) + '-' + String(name) + '.json'
  );
  var objToWrite = {
    address: newAddress,
    chain: chainId,
  };
  await writedata(savePath, JSON.stringify(objToWrite));
}

async function writedata(path, data) {
  try {
    await fs.writeFile(path, data);
  } catch (e) {
    console.error('Failed to write file' + path, { e });
  }
}

const prepareKudzuForTests = async (Kudzu, recipients = []) => {
  const currentTime = (await hre.ethers.provider.getBlock('latest')).timestamp;
  const currentTimePlusOneDay = currentTime + 86400;
  let tx = await Kudzu.updateStartDate(currentTime);
  await tx.wait();
  const startDate = await Kudzu.startDate();

  tx = await Kudzu.updateEndDate(currentTimePlusOneDay);
  await tx.wait();
  const endDate = await Kudzu.endDate();
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
    const tx = await Kudzu.connect(address).mint(address.address, 0, quantity);
    const receipt = await tx.wait();
    const tokenIds = (
      await getParsedEventLogs(receipt, Kudzu, 'TransferSingle')
    ).map((e) => e.pretty.id);
    allTokenIds.push(...tokenIds);
    for (let j = 0; j < infected.length; j++) {
      const infectedAddress = infected[j].address;
      const strainIndex = infected[j].strainIndex;
      await Kudzu.connect(address).airdrop(
        infectedAddress,
        tokenIds[strainIndex],
        '0x',
        0
      );
    }
  }

  // Fast forward to end of game
  await hre.network.provider.send('evm_setNextBlockTimestamp', [
    parseInt(currentTimePlusOneDay),
  ]);
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
      } catch (e) {}
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
