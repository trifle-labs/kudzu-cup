const KudzuABI = require("./contractData/ABI-984122-Kudzu.json");

const KudzuForma = require("./contractData/984122-Kudzu.json");
const KudzuFormaTest = require("./contractData/984123-Kudzu.json");
const KudzuBaseSepolia = require("./contractData/84532-Kudzu.json");

const KudzuBurnABI = require("./contractData/ABI-84532-KudzuBurn.json");
const KudzuBurnBaseSeplia = require("./contractData/84532-KudzuBurn.json");
const KudzuBurnFormaTest = require("./contractData/984123-KudzuBurn.json");

const Kudzu = {
  abi: KudzuABI,
  networks: {
    84532: KudzuBaseSepolia,
    984122: KudzuForma,
    984123: KudzuFormaTest,
  },
};

const KudzuBurn = {
  abi: KudzuBurnABI,
  networks: {
    84532: KudzuBurnBaseSeplia,
    984123: KudzuBurnFormaTest,
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
  KudzuBurn,
  eyes,
  mouths,
  getEmoji,
  kudzuName,
};
