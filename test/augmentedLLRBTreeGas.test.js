import { expect } from 'chai';
import hre from 'hardhat';
import { before, describe, it } from 'mocha';

const ethers = hre.ethers;

describe('AugmentedLLRBTree Gas Analysis', function () {
  this.timeout(500_000); // Extended timeout for large tree tests

  let tree;
  let accounts;
  let treeFactory;

  before(async function () {
    // Get test accounts
    accounts = await ethers.getSigners();

    // Deploy the contract
    treeFactory = await ethers.getContractFactory('AugmentedLLRBTree');
    tree = await treeFactory.deploy();
    await tree.waitForDeployment();
  });

  // Helper function to deploy a fresh tree
  async function deployFreshTree() {
    tree = await treeFactory.deploy();
    await tree.waitForDeployment();
    return tree;
  }

  // Helper function to create test wallets
  async function generateWallets(count) {
    const wallets = [];
    for (let i = 0; i < count; i++) {
      wallets.push(ethers.Wallet.createRandom().connect(ethers.provider));
    }
    return wallets;
  }

  // Helper function to track gas usage
  async function trackGasUsage(tx) {
    const receipt = await tx.wait();
    return receipt.gasUsed;
  }

  describe('Insert Operations Gas Usage', function () {
    it('should measure gas for first insertion (empty tree)', async function () {
      const tree = await deployFreshTree();
      const tx = await tree.insert(100, accounts[1].address);
      const gasUsed = await trackGasUsage(tx);

      console.log(`Gas used for first insertion: ${gasUsed}`);
      expect(gasUsed).to.be.gt(0);
    });

    it('should compare gas usage for insertions at different tree sizes', async function () {
      const treeDepths = [10, 50, 100, 200, 500];
      const results = {};

      for (const size of treeDepths) {
        const tree = await deployFreshTree();
        const wallets = await generateWallets(size + 1);

        // Fill the tree with initial nodes
        for (let i = 0; i < size; i++) {
          await tree.insert(i * 10, wallets[i].address);
        }

        // Measure insertion into tree of various sizes
        const tx = await tree.insert(size * 10, wallets[size].address);
        const gasUsed = await trackGasUsage(tx);

        results[size] = gasUsed;
        console.log(
          `Gas used for insertion into tree with ${size} nodes: ${gasUsed}`
        );
      }

      // Expect reasonable gas scaling (not too steep)
      const gasRatio = Number(results[500]) / Number(results[10]);
      console.log(`Gas usage ratio (500 nodes / 10 nodes): ${gasRatio}`);

      // Since tree operations are O(log n), we expect the ratio to be less than 50x
      // log2(500) ≈ 9, log2(10) ≈ 3.3, so ratio should be less than 3x theoretical increase
      expect(gasRatio).to.be.lt(5);
    });

    it('should measure gas for insertion with same value (nonce tie-breaking)', async function () {
      const tree = await deployFreshTree();
      const wallets = await generateWallets(5);

      // Insert first with value 100
      await tree.insert(100, wallets[0].address);

      // Insert second with same value - will trigger nonce comparison (uses auto-incrementing nonce)
      const tx = await tree.insert(100, wallets[1].address);
      const gasUsed = await trackGasUsage(tx);

      console.log(`Gas used for insertion with nonce tie-breaking: ${gasUsed}`);
    });

    it('should measure gas for replacing an existing address', async function () {
      const tree = await deployFreshTree();

      // Insert initial value for address
      await tree.insert(100, accounts[1].address);

      // Replace with new value
      const tx = await tree.insert(200, accounts[1].address);
      const gasUsed = await trackGasUsage(tx);

      console.log(`Gas used for replacing existing address: ${gasUsed}`);
    });
  });

  describe('Remove Operations Gas Usage', function () {
    it('should measure gas for removal operations at different tree positions', async function () {
      // Test removal from beginning, middle, and end of tree
      const size = 100;
      const tree = await deployFreshTree();
      const wallets = await generateWallets(size);

      // Create a balanced tree with sorted values
      for (let i = 0; i < size; i++) {
        await tree.insert(i * 10, wallets[i].address);
      }

      // Measure removal from beginning (smallest value)
      const txBegin = await tree.remove(wallets[0].address);
      const gasBegin = await trackGasUsage(txBegin);

      // Measure removal from middle
      const txMiddle = await tree.remove(wallets[50].address);
      const gasMiddle = await trackGasUsage(txMiddle);

      // Measure removal from end (largest value)
      const txEnd = await tree.remove(wallets[99].address);
      const gasEnd = await trackGasUsage(txEnd);

      console.log(`Gas used for removal from beginning: ${gasBegin}`);
      console.log(`Gas used for removal from middle: ${gasMiddle}`);
      console.log(`Gas used for removal from end: ${gasEnd}`);

      // The gas costs should be roughly within a reasonable range of each other
      // since LLRB trees have balanced paths
      const maxGas = Math.max(
        Number(gasBegin),
        Number(gasMiddle),
        Number(gasEnd)
      );
      const minGas = Math.min(
        Number(gasBegin),
        Number(gasMiddle),
        Number(gasEnd)
      );

      // Max/min ratio should be reasonable for a balanced tree
      expect(maxGas / minGas).to.be.lt(2.0);
    });

    it('should compare gas usage for removal at different tree sizes', async function () {
      const treeDepths = [10, 50, 100, 200, 500];
      const results = {};

      for (const size of treeDepths) {
        const tree = await deployFreshTree();
        const wallets = await generateWallets(size);

        // Fill the tree with initial nodes
        for (let i = 0; i < size; i++) {
          await tree.insert(i * 10, wallets[i].address);
        }

        // Measure removal from middle
        const midIndex = Math.floor(size / 2);
        const tx = await tree.remove(wallets[midIndex].address);
        const gasUsed = await trackGasUsage(tx);

        results[size] = gasUsed;
        console.log(
          `Gas used for removal from tree with ${size} nodes: ${gasUsed}`
        );
      }

      // Check for logarithmic scaling
      const gasRatio = Number(results[500]) / Number(results[10]);
      console.log(
        `Gas usage ratio for removal (500 nodes / 10 nodes): ${gasRatio}`
      );

      // Similar expectation as with insertion
      expect(gasRatio).to.be.lt(5);
    });
  });

  describe('Query Operations Gas Usage', function () {
    let balancedTree;
    let queryWallets;
    const queryTreeSize = 100;

    beforeEach(async function () {
      balancedTree = await deployFreshTree();
      queryWallets = await generateWallets(queryTreeSize);

      // Create a balanced tree with sorted values
      for (let i = 0; i < queryTreeSize; i++) {
        await balancedTree.insert(i * 10, queryWallets[i].address);
      }
    });

    it('should measure gas estimations for index queries', async function () {
      // Test getValueAtIndex and getOwnerAtIndex
      const indexToQuery = [0, 25, 50, 75, 99]; // Beginning, 1/4, middle, 3/4, end

      for (const idx of indexToQuery) {
        // getValueAtIndex - Gas estimation for view function
        const valueGas = await balancedTree.getValueAtIndex.estimateGas(idx);

        // getOwnerAtIndex - Gas estimation for view function
        const ownerGas = await balancedTree.getOwnerAtIndex.estimateGas(idx);

        console.log(`Estimated gas for getValueAtIndex(${idx}): ${valueGas}`);
        console.log(`Estimated gas for getOwnerAtIndex(${idx}): ${ownerGas}`);
      }
    });

    it('should measure gas estimations for owner-based queries', async function () {
      // Test getValue and getIndexOfOwner
      const indices = [0, 25, 50, 75, 99]; // Beginning, 1/4, middle, 3/4, end

      for (const idx of indices) {
        const owner = queryWallets[idx].address;

        // getValue - Gas estimation for view function
        const valueGas = await balancedTree.getValue.estimateGas(owner);

        // getIndexOfOwner - Gas estimation for view function
        const indexGas = await balancedTree.getIndexOfOwner.estimateGas(owner);

        console.log(
          `Estimated gas for getValue(owner) at index ${idx}: ${valueGas}`
        );
        console.log(
          `Estimated gas for getIndexOfOwner(owner) at index ${idx}: ${indexGas}`
        );

        // Compare the two - we expect getIndexOfOwner to be more expensive
        // because it requires tree traversal, while getValue is a simple mapping lookup
        console.log(
          `  Ratio (getIndexOfOwner/getValue): ${indexGas / valueGas}`
        );
      }

      // Additionally, compare cost of index-based vs owner-based retrieval
      const middleOwner = queryWallets[50].address;
      const valueByIndexGas =
        await balancedTree.getValueAtIndex.estimateGas(50);
      const valueByOwnerGas =
        await balancedTree.getValue.estimateGas(middleOwner);

      console.log(`\nComparing retrieval methods for middle element:`);
      console.log(`  Gas for getValueAtIndex: ${valueByIndexGas}`);
      console.log(`  Gas for getValue by owner: ${valueByOwnerGas}`);
      console.log(`  Ratio: ${valueByIndexGas / valueByOwnerGas}`);
    });
  });

  describe('Batch Operations Comparison', function () {
    it('should compare gas efficiency of batch operations vs individual operations', async function () {
      const batchSizes = [5, 10, 20, 50];

      for (const batchSize of batchSizes) {
        // Individual operations
        const individualTree = await deployFreshTree();
        const wallets = await generateWallets(batchSize);

        let totalIndividualGas = BigInt(0);
        for (let i = 0; i < batchSize; i++) {
          const tx = await individualTree.insert(i * 10, wallets[i].address);
          totalIndividualGas += BigInt(await trackGasUsage(tx));
        }

        // Batch operations (multiple transactions in a single test)
        const batchTree = await deployFreshTree();
        let totalBatchGas = BigInt(0);

        // Send all operations and track gas
        for (let i = 0; i < batchSize; i++) {
          const tx = await batchTree.insert(i * 10, wallets[i].address);
          totalBatchGas += BigInt(await trackGasUsage(tx));
        }

        console.log(`Batch size ${batchSize}:`);
        console.log(
          `  Total gas for individual operations: ${totalIndividualGas}`
        );
        console.log(`  Total gas for batch operations: ${totalBatchGas}`);
        console.log(
          `  Gas saved with batching: ${Number(totalIndividualGas - totalBatchGas)}`
        );
        console.log(
          `  Efficiency ratio: ${Number(totalIndividualGas) / Number(totalBatchGas)}`
        );

        // In practice, there should be almost no difference since we're not using
        // any batching in the contract itself
      }
    });
  });

  describe('Pattern-Based Analysis', function () {
    it('should compare gas usage patterns for different insertion orders', async function () {
      const size = 100;
      const patterns = ['increasing', 'decreasing', 'random'];
      const results = {};

      for (const pattern of patterns) {
        const tree = await deployFreshTree();
        const wallets = await generateWallets(size);

        let totalGas = BigInt(0);

        for (let i = 0; i < size; i++) {
          let value;

          // Generate value based on pattern
          if (pattern === 'increasing') {
            value = i * 10;
          } else if (pattern === 'decreasing') {
            value = (size - i) * 10;
          } else {
            value = Math.floor(Math.random() * size * 10);
          }

          const tx = await tree.insert(value, wallets[i].address);
          const gas = await trackGasUsage(tx);
          totalGas += BigInt(gas);

          // Log intermediate points
          if (i === 0 || i === Math.floor(size / 2) || i === size - 1) {
            console.log(`${pattern} pattern: Gas for insert #${i + 1}: ${gas}`);
          }
        }

        results[pattern] = totalGas;
        console.log(
          `Total gas for ${pattern} pattern (${size} inserts): ${totalGas}`
        );
        console.log(
          `Average gas per insert for ${pattern} pattern: ${Math.floor(Number(totalGas) / size)}`
        );
      }

      // Red-black trees should perform reasonably well across all patterns
      // due to self-balancing, but we may see slight differences

      // Calculate maximum difference across patterns
      const maxGas = Math.max(
        ...Object.values(results).map((gas) => Number(gas))
      );
      const minGas = Math.min(
        ...Object.values(results).map((gas) => Number(gas))
      );
      const ratio = maxGas / minGas;

      console.log(`Pattern efficiency ratio (max/min): ${ratio}`);

      // The ratio should be reasonably close to 1 for a self-balancing tree
      expect(ratio).to.be.lt(1.5);
    });
  });
});
