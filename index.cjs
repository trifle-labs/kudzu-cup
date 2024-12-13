const KudzuABI = require("./contractData/ABI-984122-Kudzu.json");

const KudzuForma = require("./contractData/984122-Kudzu.json");
const KudzuFromaTest = require("./contractData/984123-Kudzu.json");
const KudzuBaseSepolia = require("./contractData/84532-Kudzu.json");

const Kudzu = {
  abi: KudzuABI,
  networks: {
    84532: KudzuBaseSepolia,
    984122: KudzuForma,
    984123: KudzuFromaTest,
  },
};

const {
  eyes,
  mouths,
  getEmoji,
  kudzuName,
} = require("./scripts/metadataUtils.cjs");
module.exports = {
  Kudzu,
  eyes,
  mouths,
  getEmoji,
  kudzuName,
};
