import KudzuABI from "./contractData/ABI-984122-Kudzu.json" assert { type: "json" };

import KudzuForma from "./contractData/984122-Kudzu.json" assert { type: "json" };
import KudzuFromaTest from "./contractData/984123-Kudzu.json" assert { type: "json" };
import KudzuBaseSepolia from "./contractData/84532-Kudzu.json" assert { type: "json" };

import KudzuBurnABI from "./contractData/ABI-84532-KudzuBurn.json" assert { type: "json" };
import KudzuBurnBaseSeplia from "./contractData/84532-KudzuBurn.json" assert { type: "json" };

export const Kudzu = {
  abi: KudzuABI,
  networks: {
    84532: KudzuBaseSepolia,
    984122: KudzuForma,
    984123: KudzuFromaTest,
  },
};

export const KudzuBurn = {
  abi: KudzuBurnABI,
  networks: {
    84532: KudzuBurnBaseSeplia,
  },
};

export { getParamsForProof } from "./scripts/exportUtils.js";

export { kudzuName, eyes, mouths, getEmoji } from "./scripts/metadataUtils.mjs";
