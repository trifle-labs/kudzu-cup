import { expect } from 'chai';
import hre from 'hardhat';
import { before, describe, it } from 'mocha';

const ethers = hre.ethers;

describe('AugmentedLLRBTree', function () {
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

  describe('Basic Operations', function () {
    it('should start with an empty tree', async function () {
      const size = await tree.size();
      expect(size).to.equal(0);
    });

    it('should insert and retrieve values correctly', async function () {
      await tree.insert(100, accounts[1].address);

      const size = await tree.size();
      expect(size).to.equal(1);

      const value = await tree.getValueAtIndex(0);
      expect(value).to.equal(100);

      const owner = await tree.getOwnerAtIndex(0);
      expect(owner).to.equal(accounts[1].address);

      const ownerValue = await tree.getValue(accounts[1].address);
      expect(ownerValue).to.equal(100);
    });

    it('should handle multiple insertions in ascending order', async function () {
      // Reset by redeploying
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert values in increasing order
      await tree.insert(100, accounts[1].address);
      await tree.insert(200, accounts[2].address);
      await tree.insert(300, accounts[3].address);

      // Check size
      const size = await tree.size();
      expect(size).to.equal(3);

      // Check order
      const value1 = await tree.getValueAtIndex(0);
      const value2 = await tree.getValueAtIndex(1);
      const value3 = await tree.getValueAtIndex(2);

      expect(value1).to.equal(100);
      expect(value2).to.equal(200);
      expect(value3).to.equal(300);

      // Check owners
      const owner1 = await tree.getOwnerAtIndex(0);
      const owner2 = await tree.getOwnerAtIndex(1);
      const owner3 = await tree.getOwnerAtIndex(2);

      expect(owner1).to.equal(accounts[1].address);
      expect(owner2).to.equal(accounts[2].address);
      expect(owner3).to.equal(accounts[3].address);
    });

    it('should handle multiple insertions in descending order', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert values in decreasing order
      await tree.insert(300, accounts[1].address);
      await tree.insert(200, accounts[2].address);
      await tree.insert(100, accounts[3].address);

      // Check size
      const size = await tree.size();
      expect(size).to.equal(3);

      // Check order (should still be sorted in ascending order)
      const value1 = await tree.getValueAtIndex(0);
      const value2 = await tree.getValueAtIndex(1);
      const value3 = await tree.getValueAtIndex(2);

      expect(value1).to.equal(100);
      expect(value2).to.equal(200);
      expect(value3).to.equal(300);

      // Check owners (order should be reversed from insertion order)
      const owner1 = await tree.getOwnerAtIndex(0);
      const owner2 = await tree.getOwnerAtIndex(1);
      const owner3 = await tree.getOwnerAtIndex(2);

      expect(owner1).to.equal(accounts[3].address);
      expect(owner2).to.equal(accounts[2].address);
      expect(owner3).to.equal(accounts[1].address);
    });

    it('should handle multiple insertions in random order', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert values in random order
      await tree.insert(200, accounts[1].address);
      await tree.insert(100, accounts[2].address);
      await tree.insert(300, accounts[3].address);

      // Check size
      const size = await tree.size();
      expect(size).to.equal(3);

      // Check order
      const value1 = await tree.getValueAtIndex(0);
      const value2 = await tree.getValueAtIndex(1);
      const value3 = await tree.getValueAtIndex(2);

      expect(value1).to.equal(100);
      expect(value2).to.equal(200);
      expect(value3).to.equal(300);

      // Check owners
      const owner1 = await tree.getOwnerAtIndex(0);
      const owner2 = await tree.getOwnerAtIndex(1);
      const owner3 = await tree.getOwnerAtIndex(2);

      expect(owner1).to.equal(accounts[2].address);
      expect(owner2).to.equal(accounts[1].address);
      expect(owner3).to.equal(accounts[3].address);
    });

    it('should handle removal correctly', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert values
      await tree.insert(100, accounts[1].address);
      await tree.insert(200, accounts[2].address);
      await tree.insert(300, accounts[3].address);

      // Remove middle value
      await tree.remove(accounts[2].address);

      // Check size
      const size = await tree.size();
      expect(size).to.equal(2);

      // Check remaining values
      const value1 = await tree.getValueAtIndex(0);
      const value2 = await tree.getValueAtIndex(1);

      expect(value1).to.equal(100);
      expect(value2).to.equal(300);

      // Check remaining owners
      const owner1 = await tree.getOwnerAtIndex(0);
      const owner2 = await tree.getOwnerAtIndex(1);

      expect(owner1).to.equal(accounts[1].address);
      expect(owner2).to.equal(accounts[3].address);

      // Verify the removed address is truly gone
      await expect(tree.getValue(accounts[2].address)).to.be.revertedWith(
        'Owner does not exist in the tree'
      );
    });

    it('should handle replacing an existing address entry', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert initial value
      await tree.insert(100, accounts[1].address);

      // Replace with new value
      await tree.insert(200, accounts[1].address);

      // Check size (should still be 1)
      const size = await tree.size();
      expect(size).to.equal(1);

      // Check updated value
      const value = await tree.getValueAtIndex(0);
      expect(value).to.equal(200);

      const ownerValue = await tree.getValue(accounts[1].address);
      expect(ownerValue).to.equal(200);
    });
  });

  describe('Tie-Breaking Logic', function () {
    it('should handle same values with older nodes having higher indices', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert same value for different accounts (will get automatically assigned increasing nonces)
      await tree.insert(100, accounts[1].address);
      await tree.insert(100, accounts[2].address);
      await tree.insert(100, accounts[3].address);

      // Check size
      const size = await tree.size();
      expect(size).to.equal(3);

      // Check order by nonce (oldest first - highest index)
      const owner1 = await tree.getOwnerAtIndex(0);
      const owner2 = await tree.getOwnerAtIndex(1);
      const owner3 = await tree.getOwnerAtIndex(2);

      expect(owner3).to.equal(accounts[1].address); // Oldest entry at highest index
      expect(owner2).to.equal(accounts[2].address); // Middle entry
      expect(owner1).to.equal(accounts[3].address); // Newest entry at lowest index

      // Verify we can get correct indices
      const index1 = await tree.getIndexOfOwner(accounts[1].address);
      const index2 = await tree.getIndexOfOwner(accounts[2].address);
      const index3 = await tree.getIndexOfOwner(accounts[3].address);

      expect(index1).to.equal(2); // Oldest at highest index
      expect(index2).to.equal(1);
      expect(index3).to.equal(0); // Newest at lowest index
    });
  });

  describe('Scale Tests', function () {
    // Helper function to create a large tree
    async function createLargeTree(numNodes, pattern) {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      const addresses = [];

      // Generate unique addresses
      for (let i = 0; i < numNodes; i++) {
        // Use accounts[0] to create wallet with different private key
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        addresses.push(wallet.address);
      }

      // Insert values based on pattern
      for (let i = 0; i < numNodes; i++) {
        let value;

        if (pattern === 'increasing') {
          value = i;
        } else if (pattern === 'decreasing') {
          value = numNodes - i;
        } else if (pattern === 'random') {
          value = Math.floor(Math.random() * numNodes * 10);
        }

        await tree.insert(value, addresses[i]);
      }

      return { addresses, numNodes };
    }

    // Reference array implementation to verify tree behavior
    function getExpectedSortedArray(addresses, values) {
      // Create array of [address, value, nonce] entries
      const entries = addresses.map((addr, i) => ({
        address: addr,
        value: values[i],
        nonce: i, // We use the index as a proxy for nonce (lower = older)
      }));

      // Sort by value, then by nonce (older/lower nonce gets higher index)
      return entries.sort((a, b) => {
        if (a.value !== b.value) {
          return a.value - b.value; // Sort by value first
        }
        return b.nonce - a.nonce; // Then by nonce (decreasing)
      });
    }

    it('should handle 1,000 nodes with increasing values', async function () {
      const numNodes = 1000;
      const { addresses } = await createLargeTree(numNodes, 'increasing');

      // Verify size
      const size = await tree.size();
      expect(size).to.equal(numNodes);

      // Check some random indices
      const indices = [0, 100, 500, 999];

      for (const idx of indices) {
        const value = await tree.getValueAtIndex(idx);
        expect(value).to.equal(idx);
      }

      // Verify a few random removals
      await tree.remove(addresses[500]);
      await tree.remove(addresses[750]);
      await tree.remove(addresses[250]);

      const newSize = await tree.size();
      expect(newSize).to.equal(numNodes - 3);
    });

    it('should handle 1,000 nodes with decreasing values', async function () {
      const numNodes = 1000;
      const { addresses } = await createLargeTree(numNodes, 'decreasing');

      // Verify size
      const size = await tree.size();
      expect(size).to.equal(numNodes);

      // Check some random indices
      const indices = [0, 100, 500, 999];

      for (const idx of indices) {
        const value = await tree.getValueAtIndex(idx);
        expect(value).to.equal(idx + 1);
      }

      // Verify a few random removals
      await tree.remove(addresses[300]);
      await tree.remove(addresses[600]);
      await tree.remove(addresses[900]);

      const newSize = await tree.size();
      expect(newSize).to.equal(numNodes - 3);
    });

    it('should handle 1,000 nodes with random values', async function () {
      const numNodes = 1000;
      const { addresses } = await createLargeTree(numNodes, 'random');

      // Verify size
      const size = await tree.size();
      expect(size).to.equal(numNodes);

      // Check that values are sorted in ascending order
      let prevValue = await tree.getValueAtIndex(0);

      // Check sequential indices to ensure proper sorting
      for (let i = 1; i < 10; i++) {
        const value = await tree.getValueAtIndex(i);
        expect(value).to.be.at.least(prevValue);
        prevValue = value;
      }

      // Verify a few random removals
      await tree.remove(addresses[Math.floor(Math.random() * numNodes)]);
      await tree.remove(addresses[Math.floor(Math.random() * numNodes)]);
      await tree.remove(addresses[Math.floor(Math.random() * numNodes)]);

      const newSize = await tree.size();
      expect(newSize).to.be.at.most(numNodes - 1);
    });
  });

  describe('Internal Implementation Tests', function () {
    // These tests target the internal implementation to verify correctness

    it('should maintain LLRB tree properties', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert some values
      for (let i = 0; i < 20; i++) {
        await tree.insert(i * 10, accounts[1 + (i % 9)].address);
      }

      // Check if tree is valid (using test helper)
      const isValid = await tree._testIsValidTree();
      expect(isValid).to.be.true;
    });

    it('should correctly maintain size property', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      // Insert and remove values while checking size
      await tree.insert(100, accounts[1].address);
      await tree.insert(200, accounts[2].address);
      await tree.insert(300, accounts[3].address);

      let size = await tree.size();
      expect(size).to.equal(3);

      await tree.remove(accounts[2].address);
      size = await tree.size();
      expect(size).to.equal(2);

      await tree.insert(400, accounts[4].address);
      size = await tree.size();
      expect(size).to.equal(3);

      // Test replacing an existing value
      await tree.insert(500, accounts[1].address);
      size = await tree.size();
      expect(size).to.equal(3);
    });
  });
});
