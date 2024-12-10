import { ethers } from "ethers";

export async function getParamsForProof(address, blocknumber, rpcURL) {
  const provider = new ethers.JsonRpcProvider(rpcURL);
  const hexBlock = "0x" + blocknumber.toString(16);
  const block = await provider.send("eth_getBlockByNumber", [hexBlock, false]);

  const stateRoot = block.stateRoot;

  const eth_getProofResult = await provider.send("eth_getProof", [
    address,
    ["0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421"], // account hash = keccak256("")
    hexBlock,
  ]);

  const accountProof = formatProofNodes(eth_getProofResult.accountProof);
  const proofsBlob = ethers.encodeRlp([accountProof]);
  return { eth_getProofResult, stateRoot, proofsBlob };
}

function formatProofNodes(proof) {
  const trieProof = [];
  for (const rlpNode of proof) {
    trieProof.push(ethers.decodeRlp(rlpNode));
  }
  return trieProof;
}

export const eyes = {
  0: "worry-sweat",
  1: "whyyy",
  2: "upside-down",
  3: "cool",
  4: "x-eyes",
  5: "literally-crying",
  6: "wink",
  7: "wworry-sweat",
  8: "pwease",
  9: "drunk",
  10: "mad",
  11: "rawr",
  12: "sorrow",
  13: "wwhyyy",
  14: "blank",
  15: "hehe",
  16: "stress",
  17: "eye-roll",
  18: "glasses",
  19: "wwink",
  20: "dollar-eyes",
  21: "surprise",
  22: "wwwink",
  23: "eeee",
  24: "heart",
  25: "wwwwink",
  26: "bblank",
  27: "big-eyes",
  28: "fml",
  29: "ugh",
  30: "bbblank",
  31: "pleased",
};
export const mouths = {
  0: "smile",
  1: "barf",
  2: "upside-down",
  3: "ssmile",
  4: "big-o",
  5: "big-o-teeth",
  6: "drunk",
  7: "hot",
  8: "small-frown",
  9: "party",
  10: "little-mad",
  11: "wha-wha-wha",
  12: "whyyy",
  13: "llittle-mad",
  14: "big-sad",
  15: "happy",
  16: "lllittle-mad",
  17: "shock",
  18: "flat",
  19: "front-teeth",
  20: "pparty",
  21: "money-mouth",
  22: "kiss-heart",
  23: "small-o",
  24: "silly",
  25: "open-smile",
  26: "small-smile",
  27: "uh-oh",
  28: "fflat",
  29: "big-flat",
  30: "drool",
  31: "grimmace",
};

export const kudzuName = (id) => {
  return "$" + getEmoji(id).eye + "-" + getEmoji(id).mouth;
};

export const getEmoji = (tokenId) => {
  const bigTokenId = BigInt(tokenId);
  const id = bigTokenId >> 16n;
  const mouth = bigTokenId & 31n;
  const eye = (bigTokenId >> 8n) & 31n;
  return {
    id,
    index: id,
    indexEye: eye,
    indexMouth: mouth,
    eye: eyes[Number(eye)],
    mouth: mouths[Number(mouth)],
  };
};
