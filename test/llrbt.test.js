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

const sort = (ar) => {
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

let snapshot;
describe('LLRBT Tests', function () {
  this.timeout(500_000);
  let llrbt;

  before(async function () {
    // Deploy test contract that uses LLRBT
    const LLRBTTest = await ethers.getContractFactory('LLRBTTest');
    llrbt = await LLRBTTest.deploy();
    await llrbt.waitForDeployment();

    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  afterEach(async function () {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('should handle basic insertions correctly', async () => {
    await llrbt.init();
    await llrbt.insert(100, ethers.id('0'));
    await llrbt.insert(50, ethers.id('1'));
    await llrbt.insert(150, ethers.id('2'));

    expect(await llrbt.contains(100)).to.be.true;
    expect(await llrbt.contains(50)).to.be.true;
    expect(await llrbt.contains(150)).to.be.true;
    expect(await llrbt.contains(75)).to.be.false;

    expect(await llrbt.min()).to.equal(50);
    expect(await llrbt.max()).to.equal(150);
  });

  it('should handle removals correctly', async () => {
    await llrbt.init();
    await llrbt.insert(100, ethers.id('0'));
    await llrbt.insert(50, ethers.id('1'));
    await llrbt.insert(150, ethers.id('2'));

    await llrbt.remove(50, ethers.id('1'));

    expect(await llrbt.contains(50)).to.be.false;
    expect(await llrbt.min()).to.equal(100);
    expect(await llrbt.max()).to.equal(150);
  });

  it('should handle edge cases correctly', async () => {
    await llrbt.init();

    // Test empty tree operations
    await expect(llrbt.min()).to.be.revertedWith('Empty tree');
    await expect(llrbt.max()).to.be.revertedWith('Empty tree');

    // Test deleteMin/deleteMax on empty tree
    await expect(llrbt.deleteMin()).to.be.revertedWith('Empty tree');
    await expect(llrbt.deleteMax()).to.be.revertedWith('Empty tree');
  });

  it('should maintain correct order with mixed operations', async () => {
    await llrbt.init();

    // Build tree: 50 -> 100 -> 150
    await llrbt.insert(100, ethers.id('0'));
    await llrbt.insert(50, ethers.id('1'));
    await llrbt.insert(150, ethers.id('2'));

    // Remove middle and verify order
    await llrbt.remove(100, ethers.id('0'));
    expect(await llrbt.min()).to.equal(50);
    expect(await llrbt.max()).to.equal(150);

    // Add new middle value
    await llrbt.insert(75, ethers.id('3'));
    expect(await llrbt.min()).to.equal(50);
    expect(await llrbt.max()).to.equal(150);

    // Remove smallest
    await llrbt.remove(50, ethers.id('1'));
    expect(await llrbt.min()).to.equal(75);
    expect(await llrbt.max()).to.equal(150);
  });

  it('should handle data association correctly', async () => {
    await llrbt.init();

    const value = 100;
    const data = ethers.id('testdata');

    await llrbt.insert(value, data);

    expect(await llrbt.contains(value)).to.be.true;
    expect(await llrbt.getData(value)).to.equal(data);
  });

  it('should handle address data correctly', async () => {
    await llrbt.init();

    const value = 100;
    const addr = '0x1234567890123456789012345678901234567890';

    await llrbt.insertWithAddress(value, addr);

    expect(await llrbt.contains(value)).to.be.true;
    expect(await llrbt.retrieveAddress(value)).to.equal(addr);
  });

  it('should handle bulk insertions correctly', async () => {
    await llrbt.init();

    const values = [100, 50, 150, 25, 75, 125, 175];
    const data = values.map((v, i) => ethers.id(i.toString()));
    await llrbt.insertBulk(values, data);

    for (const value of values) {
      expect(await llrbt.contains(value)).to.be.true;
    }

    expect(await llrbt.min()).to.equal(25);
    expect(await llrbt.max()).to.equal(175);
  });

  it('should handle bulk insertions with duplicates correctly', async () => {
    await llrbt.init();

    const values = [100, 100, 100, 50, 50, 150, 150];
    const data = values.map((v, i) => ethers.id(i.toString()));
    await llrbt.insertBulk(values, data);

    expect(await llrbt.size()).to.equal(values.length);

    // Verify ordering through size checks and min values
    const initialSize = await llrbt.size();
    let lastValue = await llrbt.min();

    for (let i = 1; i < initialSize; i++) {
      await llrbt.deleteMin();
      const currentValue = await llrbt.min();
      expect(currentValue).to.be.greaterThanOrEqual(lastValue);
      lastValue = currentValue;
    }
  });

  it('should test thorough adding and removing and compare results to a js array that is sorted using FIFO logic', async () => {
    await llrbt.init();

    const values = [100, 50, 150, 25, 75, 125, 175];
    const data = values.map((v, i) => ethers.id(i.toString()));
    await llrbt.insertBulk(values, data);

    for (const value of values) {
      expect(await llrbt.contains(value)).to.be.true;
    }

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      await llrbt.remove(value, data[i]);
    }

    expect(await llrbt.size()).to.equal(0);
  });

  it.only('should maintain correct indices across operations with array comparison', async () => {
    await llrbt.init();
    const batchSizes = [10, 20, 50, 100, 200, 500];
    const seed = 12345;
    const random = new DeterministicRandom(seed);

    for (const size of batchSizes) {
      console.log(`Testing batch size: ${size}`);

      // Generate random values with incrementing keys
      const values = Array.from({ length: size }, (_, i) => ({
        value: Math.floor(random.next() * 100) + 1,
        data: ethers.id(`key${i}`),
        i: i,
      }));

      // Keep a sorted array representation
      let sortedArray = [...values];

      // Insert all values into tree
      for (const { value, data } of values) {
        await llrbt.insert(value, data);
      }

      // Sort array using FIFO logic
      sortedArray = sort(sortedArray);

      console.log({ sortedArray });

      // Verify indices match for all elements
      for (let i = 0; i < sortedArray.length; i++) {
        const treeIndex = await llrbt.getIndex(
          sortedArray[i].value,
          sortedArray[i].data
        );
        expect(treeIndex).to.equal(i, `Index mismatch at position ${i}`);
      }

      // Randomly remove half of the elements
      const toRemove = [...values]
        .sort(() => random.next() - 0.5)
        .slice(0, Math.floor(size / 2));

      for (const { value, data } of toRemove) {
        await llrbt.remove(value, data);
        sortedArray = sortedArray.filter(
          (v) => !(v.value === value && v.data === data)
        );
      }

      // Verify size matches
      const treeSize = await llrbt.size();
      expect(treeSize).to.equal(
        sortedArray.length,
        'Size mismatch after removal'
      );

      // Verify remaining indices still match
      for (let i = 0; i < sortedArray.length; i++) {
        const treeIndex = await llrbt.indexOf(
          sortedArray[i].value,
          sortedArray[i].data
        );
        expect(treeIndex).to.equal(
          i,
          `Index mismatch after removal at position ${i}`
        );
      }

      // Remove remaining elements
      const remaining = [...sortedArray];
      for (const { value, data } of remaining) {
        await llrbt.remove(value, data);
      }

      // Verify tree is empty
      expect(await llrbt.size()).to.equal(
        0,
        'Tree should be empty after complete removal'
      );
    }
  });

  it.skip('should maintain reasonable gas costs as tree grows', async () => {
    const sampleSizes = [10, 50, 100, 200, 500, 1000];
    const results = {};
    const seed = 194575;
    const random = new DeterministicRandom(seed);
    await llrbt.init(); // Reset tree for each sample size

    try {
      for (const size of sampleSizes) {
        console.log(
          `----------------------------------------------------------------try with size ${size}----------------------------------------------------------------`
        );
        results[size] = {
          insertCosts: [],
          removeCosts: [],
          atIndexCosts: [], // Added for index lookups
        };

        // Insert elements in random order
        const values = Array.from({ length: size }, (_, i) => ({
          value: Math.floor((random.next() * size) / 3) + 1,
          data: ethers.id(`key${i}`),
        }));

        console.log({ values: sort(values) });

        // Measure insert costs
        for (const { value, data } of values) {
          console.log(`inserting ${value} - ${data}`);
          const tx = await llrbt.insert(value, data);
          const receipt = await tx.wait();
          results[size].insertCosts.push(receipt.gasUsed);
        }

        // Measure getDataByIndex costs for random indices
        for (let i = 0; i < Math.min(20, size); i++) {
          const randomIndex = Math.floor(random.next() * size);
          console.log('getting data at index', randomIndex);
          const data = await llrbt.getDataByIndex(randomIndex);
          console.log(`data at index ${randomIndex} is ${data}`);
          const gasUsed = await llrbt.getDataByIndex.estimateGas(randomIndex);
          results[size].atIndexCosts.push(gasUsed);
        }

        const valuesWithRemovedElements = [...values];

        // Remove random elements and measure costs
        const shuffled = [...values].sort(() => random.next() - 0.5);
        for (let i = 0; i < Math.min(50, size); i++) {
          const { value, data } = shuffled[i];
          console.log(`randomly removing ${value} - ${data}`);
          const index = valuesWithRemovedElements.findIndex(
            (v) => v.value === value && v.data === data
          );
          if (index < 0) {
            throw new Error(
              `didn't find ${value} - ${data} in valuesWithRemovedElements`
            );
          }
          const length = valuesWithRemovedElements.length;
          valuesWithRemovedElements.splice(index, 1);
          const lengthAfter = valuesWithRemovedElements.length;
          expect(lengthAfter).to.equal(length - 1);
          const tx = await llrbt.remove(value, data);
          const receipt = await tx.wait();
          const treeSize = await llrbt.size();
          expect(treeSize).to.equal(valuesWithRemovedElements.length);
          results[size].removeCosts.push(receipt.gasUsed);
        }

        // Calculate averages including atIndex
        const avgInsert = Math.floor(
          parseInt(
            results[size].insertCosts.reduce((a, b) => a + b, 0n) /
              BigInt(results[size].insertCosts.length)
          )
        );

        const avgRemove = Math.floor(
          parseInt(
            results[size].removeCosts.reduce((a, b) => a + b, 0n) /
              BigInt(results[size].removeCosts.length)
          )
        );

        const avgAtIndex = Math.floor(
          parseInt(
            results[size].atIndexCosts.reduce((a, b) => a + b, 0n) /
              BigInt(results[size].atIndexCosts.length)
          )
        );

        const maxInsert = Math.max(...results[size].insertCosts.map(Number));
        const maxRemove = Math.max(...results[size].removeCosts.map(Number));
        const maxAtIndex = Math.max(...results[size].atIndexCosts.map(Number));

        const minInsert = Math.min(...results[size].insertCosts.map(Number));
        const minRemove = Math.min(...results[size].removeCosts.map(Number));
        const minAtIndex = Math.min(...results[size].atIndexCosts.map(Number));

        console.log(`\nTree size: ${size}`);
        console.log(`Average insert gas: ${avgInsert}`);
        console.log(`Average remove gas: ${avgRemove}`);
        console.log(`Average getDataByIndex lookup gas: ${avgAtIndex}`);
        console.log(`Max insert gas: ${maxInsert}`);
        console.log(`Max remove gas: ${maxRemove}`);
        console.log(`Max getDataByIndex lookup gas: ${maxAtIndex}`);
        console.log(`Min insert gas: ${minInsert}`);
        console.log(`Min remove gas: ${minRemove}`);
        console.log(`Min getDataByIndex lookup gas: ${minAtIndex}`);

        // Verify gas costs grow logarithmically
        if (size > sampleSizes[0]) {
          const prevSize = sampleSizes[sampleSizes.indexOf(size) - 1];
          const ratio = BigInt(avgInsert) / results[prevSize].insertCosts[0];
          // For a balanced tree, we expect the ratio to be less than 2
          // when the size doubles (logarithmic growth)
          expect(ratio).to.be.lte(
            2,
            `Gas cost ratio (${ratio}) for size ${size} vs ${prevSize} is higher than expected`
          );
        }

        let treeSize = await llrbt.size();
        console.log('treeSize', treeSize);
        expect(treeSize).to.equal(valuesWithRemovedElements.length);

        // Clear the tree
        for (const { value, data } of valuesWithRemovedElements) {
          console.log(`about to systematically remove ${value} - ${data}`);
          try {
            await llrbt.remove(value, data);
          } catch (e) {
            console.error(e);
            console.log(`error to remove ${value} - ${data}`);
          }
        }

        treeSize = await llrbt.size();
        expect(treeSize).to.equal(0);
      }
    } catch (e) {
      console.log({ seed });
      throw e;
    }
  });
});
