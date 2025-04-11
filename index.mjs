import KudzuABI from './contractData/ABI-984122-Kudzu.json' assert { type: 'json' };

import KudzuBaseSepolia from './contractData/84532-Kudzu.json' assert { type: 'json' };
import KudzuForma from './contractData/984122-Kudzu.json' assert { type: 'json' };
import KudzuFromaTest from './contractData/984123-Kudzu.json' assert { type: 'json' };

import KudzuBurnBaseSeplia from './contractData/84532-KudzuBurn.json' assert { type: 'json' };
import KudzuBurnFormaTest from './contractData/984123-KudzuBurn.json' assert { type: 'json' };
import KudzuBurnABI from './contractData/ABI-984123-KudzuBurn.json' assert { type: 'json' };
import KudzuBurnForma from './contractData/984122-KudzuBurn.json' assert { type: 'json' };

import KudzuBurnControllerFormaTest from './contractData/984123-KudzuBurnController.json' assert { type: 'json' };
import KudzuBurnControllerForma from './contractData/984122-KudzuBurnController.json' assert { type: 'json' };
import KudzuBurnControllerABI from './contractData/ABI-984123-KudzuBurnController.json' assert { type: 'json' };

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
    984123: KudzuBurnFormaTest,
    984122: KudzuBurnForma,
  },
};

export const KudzuBurnController = {
  abi: KudzuBurnControllerABI,
  networks: {
    984123: KudzuBurnControllerFormaTest,
    984122: KudzuBurnControllerForma,
  },
};

export { getParamsForProof } from './scripts/exportUtils.js';

export { eyes, getEmoji, kudzuName, mouths } from './scripts/metadataUtils.mjs';
