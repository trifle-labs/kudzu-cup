import { afterEach, before, describe, it } from 'mocha';

import hre from 'hardhat';
const ethers = hre.ethers;

import { deployKudzuAndBurn } from '../scripts/utils.js';

let snapshot;
describe('KudzuBurnController Tests', function () {
  this.timeout(50000000);
  before(async function () {
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });
  afterEach(async function () {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('deploy works', async () => {
    const { Kudzu, KudzuBurn, KudzuBurnController } =
      await deployKudzuAndBurn();
    expect(KudzuBurnController.target).to.not.equal(null);
    expect(KudzuBurn.target).to.not.equal(null);
    expect(Kudzu.target).to.not.equal(null);

    const kudzuBurnController = await KudzuBurn.kuzuBurnController();
    expect(kudzuBurnController).to.not.equal(null);
    expect(kudzuBurnController).to.equal(KudzuBurnController.target);
  });
});
