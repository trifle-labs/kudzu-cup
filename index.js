import KudzuABI from "./contractData/ABI-84532-Kudzu.json";
import KudzuBaseSepolia from "./contractData/84532-Kudzu.json";
// import KudzuBase from './contractData/8453-Kudzu.json'
// import KudzuLocal from './contractData/12345-Kudzu.json'

export const Kudzu = {
  abi: KudzuABI,
  networks: {
    84532: KudzuBaseSepolia,
    // 12345: KudzuLocal,
    // 8453: KudzuBase
  },
};
