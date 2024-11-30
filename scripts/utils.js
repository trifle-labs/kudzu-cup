import { ethers } from "ethers";
import hre from "hardhat";
import path from "node:path";
import { promises as fs } from "fs";

const __dirname = path.resolve();

const testJson = (tJson) => {
  try {
    JSON.parse(tJson);
  } catch (e) {
    return false;
  }
  return true;
};

const getPathABI = async (name) => {
  var networkinfo = await hre.ethers.provider.getNetwork();
  var savePath = path.join(
    __dirname,
    "server",
    "contractData",
    "ABI-" + String(networkinfo["chainId"]) + "-" + String(name) + ".json"
  );
  return savePath;
};

async function readData(path) {
  const Newdata = await fs.readFile(path, "utf8");
  return Newdata;
}

const getPathAddress = async (name) => {
  var networkinfo = await hre.ethers.provider.getNetwork();
  var savePath = path.join(
    __dirname,
    "server",
    "contractData",
    String(networkinfo["chainId"]) + "-" + String(name) + ".json"
  );
  return savePath;
};

const initContracts = async (
  contractNames = ["Kudzu", "ExternalMetadata"],
  skipErrors = false // skipErrors
) => {
  let [deployer] = await hre.ethers.getSigners();

  let returnObject = {};

  for (let i = 0; i < contractNames.length; i++) {
    try {
      const address = JSON.parse(
        await readData(await getPathAddress(contractNames[i]))
      )["address"];
      const abi = JSON.parse(
        await readData(await getPathABI(contractNames[i]))
      )["abi"];
      returnObject[contractNames[i]] = new ethers.Contract(
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
    decodedJson.indexOf(",") + 1
  );
  let buff = Buffer.from(metaWithoutDataURL, "base64");
  let text = buff.toString("ascii");
  return text;
};

const deployMetadata = async () => {
  let externalMetadata;
  try {
    const network = await hre.ethers.provider.getNetwork();
    global.networkinfo = network;

    // deploy ExternalMetadata
    const ExternalMetadata =
      await hre.ethers.getContractFactory("ExternalMetadata");
    externalMetadata = await ExternalMetadata.deploy();
    await externalMetadata.deployed();
  } catch (e) {
    console.error(e);
  }

  return {
    externalMetadata,
  };
};

const deployContracts = async (options) => {
  const returnValue = await deployContractsV0(options);
  if (options?.saveAndVerify) {
    await saveAndVerifyContracts(returnValue);
  }
  return returnValue;
};

const saveAndVerifyContracts = async (deployedContracts) => {
  // const networkInfo = await hre.ethers.provider.getNetwork();
  for (const contractName in deployedContracts) {
    await copyABI(contractName);
    const contract = deployedContracts[contractName];
    await saveAddress(contract, contractName);
  }
  if (deployedContracts.verificationData) {
    await verifyContracts(deployedContracts);
  }
};

const deployContractsV0 = async (options) => {
  const defaultOptions = { mock: false, ignoreTesting: false, verbose: false };
  const { ignoreTesting, verbose } = Object.assign(defaultOptions, options);
  global.ignoreTesting = ignoreTesting;
  global.verbose = verbose;
  const networkinfo = await hre.ethers.provider.getNetwork();
  global.networkinfo = networkinfo;
  log("Deploying v0 contracts");

  const returnObject = {};

  // deploy Metadata
  const { externalMetadata } = await deployMetadata();
  log("ExternalMetadata Deployed at " + String(externalMetadata.address));

  returnObject["ExternalMetadata"] = externalMetadata;

  // deploy Kudzu
  const Kudzu = await hre.ethers.getContractFactory("Kudzu");
  const kudzu = await Kudzu.deploy(externalMetadata.address);
  await kudzu.deployed();
  returnObject["Kudzu"] = kudzu;
  log(
    `Kudzu Deployed at ${kudzu.address} with ExternalMetadata at ${externalMetadata.address}`
  );

  const verificationData = [
    {
      name: "ExternalMetadata",
      constructorArguments: [],
    },
    {
      name: "Kudzu",
      constructorArguments: [externalMetadata.address],
    },
  ];

  returnObject.verificationData = verificationData;

  return returnObject;
};

const verifyContracts = async (returnObject) => {
  const networkinfo = await hre.ethers.provider.getNetwork();
  const deployer = await hre.ethers.getSigner();
  // verify contract if network ID is mainnet goerli or sepolia
  if (
    networkinfo["chainId"] == 5 ||
    networkinfo["chainId"] == 1 ||
    networkinfo["chainId"] == 11155111 ||
    networkinfo["chainId"] == 17069 ||
    networkinfo["chainId"] == 84532 ||
    networkinfo["chainId"] == 8453
  ) {
    const verificationData = returnObject.verificationData;
    for (let i = 0; i < verificationData.length; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      log(`Verifying ${verificationData[i].name} Contract`);
      try {
        await hre.run("verify:verify", {
          address: returnObject[verificationData[i].name].address,
          constructorArguments: verificationData[i].constructorArguments,
        });
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
        log({ e, verificationData: verificationData[i] });
        i--;
      }
    }
  } else if (networkinfo["chainId"] == 12345) {
    // This is so dev accounts have spending money on local chain
    await deployer.sendTransaction({
      to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      value: ethers.utils.parseEther("1.0"),
    });
    await deployer.sendTransaction({
      to: "0xc795344b1b30E3CfEE1AFA1D5204B141940CF445",
      value: ethers.utils.parseEther("1.0"),
    });
  }
};

const log = (message) => {
  const ignoreTesting = global.ignoreTesting;
  const networkinfo = global.networkinfo;
  const verbose = global.verbose;
  if (
    !verbose &&
    (!networkinfo || (networkinfo["chainId"] == 12345 && !ignoreTesting))
  )
    return;
  console.log(message);
};

const getParsedEventLogs = (receipt, contract, eventName) => {
  const events = receipt.events
    .filter((x) => x.address === contract.address)
    .map((log) => contract.interface.parseLog(log));
  return eventName ? events.filter((x) => x.name === eventName) : events;
};

async function copyABI(name, contractName) {
  contractName = contractName || name;

  var networkinfo = await hre.ethers.provider.getNetwork();
  log(`--copy ${name} ABI`);
  var pathname = path.join(
    __dirname,
    "artifacts",
    "contracts",
    `${name}.sol`,
    `${contractName}.json`
  );
  try {
    const readABI = await fs.readFile(pathname);
    const parsedABI = JSON.parse(readABI);
    const abi = parsedABI["abi"];

    const newContent = { contractName, abi };

    var copy = path.join(
      __dirname,
      "contractData",
      "ABI-" + String(networkinfo["chainId"]) + `-${name}.json`
    );
    // write the new content to the new file
    await writedata(copy, JSON.stringify(newContent));

    // await copyContractABI(pathname, copy)
    log("-- OK");
  } catch (e) {
    console.error("Failed to copy ABI" + name, { e });
  }
}

async function saveAddress(contract, name) {
  var networkinfo = await hre.ethers.provider.getNetwork();
  log("-save json for " + name);
  var newAddress = await contract.address;
  var savePath = path.join(
    __dirname,
    "contractData",
    String(networkinfo["chainId"]) + "-" + String(name) + ".json"
  );
  var objToWrite = {
    address: newAddress,
    chain: networkinfo,
  };
  await writedata(savePath, JSON.stringify(objToWrite));
}

async function writedata(path, data) {
  // await fs.writeFile(path, data, function (err, result) {
  //   if (err) console.log('error', err);
  // })
  try {
    await fs.writeFile(path, data);
  } catch (e) {
    console.error("Failed to write file" + path, { e });
  }
}

export {
  saveAddress,
  copyABI,
  getParsedEventLogs,
  decodeUri,
  initContracts,
  deployContractsV0,
  deployContracts,
  getPathABI,
  getPathAddress,
  readData,
  testJson,
  verifyContracts,
  deployMetadata,
  saveAndVerifyContracts,
};
