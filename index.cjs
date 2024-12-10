const {
  getParamsForProof,
  eyes,
  mouths,
  getEmoji,
} = await import("./scripts/exportUtils.js");

const KudzuABI = require("./contractData/ABI-984122-Kudzu.json");
const KudzuBaseSepolia = require("./contractData/84532-Kudzu.json");

// const KudzuBase = require('./contractData/8453-Kudzu.json');
// const KudzuLocal = require('./contractData/12345-Kudzu.json');

const KudzuForma = require("./contractData/984122-Kudzu.json");

const Kudzu = {
  abi: KudzuABI,
  networks: {
    84532: KudzuBaseSepolia,
    984122: KudzuForma,
    // 12345: KudzuLocal,
    // 8453: KudzuBase
  },
};

module.exports = {
  Kudzu,
  getParamsForProof,
  eyes,
  mouths,
  getEmoji,
};
