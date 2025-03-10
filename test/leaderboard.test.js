import { expect } from 'chai';
import { afterEach, before, describe, it } from 'mocha';
import hre from 'hardhat';
const ethers = hre.ethers;

class DeterministicRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

const fifoSort = (ar) => {
  return ar
    .map((a, i) => {
      return { ...a, i };
    })
    .sort((a, b) => {
      if (a.value === b.value) {
        return a.i - b.i;
      } else {
        return a.value - b.value;
      }
    });
};

const printTree = async (leaderboard) => {
  console.log('----printTree---');
  const depth = await leaderboard.maxDepth();
  for (let i = 0; i < depth; i++) {
    const [level, players, scores, colors] = await leaderboard.printDepth(i);
    let line = '';
    const totalLevels = parseInt(depth);
    const spacingFactor = 2 ** (totalLevels - i + 1); // Controls spacing

    for (let j = 0; j < players.length; j++) {
      // Customize content display (currently using '00' as placeholder)
      const content = `${players[j].slice(2, 4)}(${scores[j].toString().padStart(3)})${colors[j] === 0 ? 'R' : 'B'}`;
      // Calculate padding: Larger for top levels, smaller for bottom levels
      const leftPadding = '-'.repeat(spacingFactor - content.length / 2);
      const rightPadding = '-'.repeat(spacingFactor - content.length / 2);

      line += `${leftPadding}${content}${rightPadding}`;
    }

    console.log(line);
  }
};

let snapshot;
describe('Leaderboard Tests', function () {
  this.timeout(500_000);
  let leaderboard;
  let accounts;

  before(async function () {
    accounts = await ethers.getSigners();
    const Leaderboard = await ethers.getContractFactory('Leaderboard');
    leaderboard = await Leaderboard.deploy();
    await leaderboard.waitForDeployment();

    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  afterEach(async function () {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('should handle basic insertions correctly', async () => {
    await leaderboard.insert(100, accounts[1].address);
    await leaderboard.insert(50, accounts[2].address);
    await leaderboard.insert(150, accounts[3].address);

    const size = await leaderboard.getSize();
    expect(size).to.equal(3);

    // Check order (should be ascending)
    const [player1, score1] = await leaderboard.findByIndex(0);
    const [player2, score2] = await leaderboard.findByIndex(1);
    const [player3, score3] = await leaderboard.findByIndex(2);

    expect(score1).to.equal(50);
    expect(score2).to.equal(100);
    expect(score3).to.equal(150);
  });

  it('should handle removals correctly', async () => {
    await leaderboard.insert(100, accounts[1].address);
    await leaderboard.insert(50, accounts[2].address);
    await leaderboard.insert(150, accounts[3].address);

    await leaderboard.remove(50, accounts[2].address);

    const size = await leaderboard.getSize();
    expect(size).to.equal(2);

    // Check remaining order
    const [player1, score1] = await leaderboard.findByIndex(0);
    const [player2, score2] = await leaderboard.findByIndex(1);

    expect(score1).to.equal(100);
    expect(score2).to.equal(150);
  });

  it('should handle FIFO ordering for equal scores', async () => {
    // Insert players with same score
    await leaderboard.insert(100, accounts[1].address);
    await ethers.provider.send('evm_increaseTime', [1]);
    await leaderboard.insert(100, accounts[2].address);
    await ethers.provider.send('evm_increaseTime', [1]);
    await leaderboard.insert(100, accounts[3].address);

    const count = await leaderboard.getSize();
    expect(count).to.equal(3);
    // Check FIFO order
    const [player1] = await leaderboard.findByIndex(0);
    const [player2] = await leaderboard.findByIndex(1);
    const [player3] = await leaderboard.findByIndex(2);

    expect(player1).to.equal(accounts[1].address);
    expect(player2).to.equal(accounts[2].address);
    expect(player3).to.equal(accounts[3].address);
  });

  it('should handle edge cases correctly', async () => {
    // Try to find index in empty leaderboard
    await expect(leaderboard.findByIndex(0)).to.be.revertedWith(
      'Index out of bounds'
    );

    // Try to remove non-existent player
    await expect(
      leaderboard.remove(50, accounts[1].address)
    ).to.be.revertedWith('Player not found');

    // Try to insert zero address
    await expect(
      leaderboard.insert(100, ethers.ZeroAddress)
    ).to.be.revertedWith('Invalid player');
  });

  it('should maintain correct indices after mixed operations', async () => {
    // Insert players
    await leaderboard.insert(100, accounts[1].address);
    await leaderboard.insert(50, accounts[2].address);
    await leaderboard.insert(150, accounts[3].address);

    // Remove middle player
    await leaderboard.remove(50, accounts[2].address);

    // Verify indices are correct
    const [player1, score1] = await leaderboard.findByIndex(0);
    const [player2, score2] = await leaderboard.findByIndex(1);

    expect(score1).to.equal(50);
    expect(score2).to.equal(150);
    expect(player1).to.equal(accounts[2].address);
    expect(player2).to.equal(accounts[3].address);
  });

  it.only('should maintain correct indices across operations with array comparison', async () => {
    const batchSizes = [10, 20, 50, 100, 200, 500, 1000, 2000];
    const seed = 411865; //Math.floor(Math.random() * 1000000);
    const random = new DeterministicRandom(seed);
    try {
      for (const size of batchSizes) {
        console.log(`Testing batch size: ${size}`);

        // Generate random values with incrementing keys
        const values = Array.from({ length: size }, (_, i) => ({
          value: Math.floor(random.next() * 100) + 1,
          address: ethers.id(`key${i}`).slice(0, 42).toLowerCase(),
          i: i,
        }));

        // Keep a sorted array representation
        let sortedArray = [...values];
        // Insert all values into tree
        for (const { value, address } of values) {
          await leaderboard.insert(value, address);
        }

        // Sort array using FIFO logic
        sortedArray = fifoSort(sortedArray);
        // await printTree(leaderboard);
        // Verify indices match for all elements
        for (let i = 0; i < sortedArray.length; i++) {
          const treeIndex = await leaderboard.indexOf(
            sortedArray[i].value,
            sortedArray[i].address
          );
          expect(treeIndex).to.equal(i, `Index mismatch at position ${i}`);
        }

        // Randomly remove half of the elements
        const toRemove = [...values]
          .sort(() => random.next() - 0.5)
          .slice(0, Math.floor(size / 2));
        // await printTree(leaderboard);

        for (const { value, address } of toRemove) {
          await leaderboard.remove(value, address);
          const exists = await leaderboard.playerIndex(address);
          expect(exists).to.equal(0, 'Player should not exist');
          // await printTree(leaderboard);

          const leaderboardSize = await leaderboard.getSize();
          sortedArray = sortedArray.filter((v) => !(v.address === address));
          const sortedArraySize = sortedArray.length;
          expect(leaderboardSize).to.equal(sortedArraySize);
        }
        // Verify size matches
        const treeSize = await leaderboard.getSize();
        expect(treeSize).to.equal(
          sortedArray.length,
          'Size mismatch after removal'
        );

        // Verify remaining indices still match
        for (let i = 0; i < sortedArray.length; i++) {
          // await printTree(leaderboard);

          const treeIndex = await leaderboard.indexOf(
            sortedArray[i].value,
            sortedArray[i].address
          );
          expect(treeIndex).to.equal(
            i,
            `Index mismatch after removal at position ${i}`
          );
        }

        // Remove remaining elements
        const remaining = [...sortedArray];
        for (const { value, address } of remaining) {
          await leaderboard.remove(value, address);
        }

        // Verify tree is empty
        expect(await leaderboard.getSize()).to.equal(
          0,
          'Tree should be empty after complete removal'
        );
      }
    } catch (e) {
      console.log({ seed });
      throw e;
    }
  });
});
