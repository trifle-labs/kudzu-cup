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
