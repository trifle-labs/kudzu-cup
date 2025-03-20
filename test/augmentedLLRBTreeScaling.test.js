import { expect } from 'chai';
import hre from 'hardhat';
import { before, describe, it } from 'mocha';

const ethers = hre.ethers;

describe.skip('AugmentedLLRBTree Robust Scaling Tests', function () {
  this.timeout(900_000); // Extended timeout for very large scale tests

  let tree;
  let accounts;
  let treeFactory;

  // Helper class to track expected tree state in JavaScript
  class TreeTracker {
    constructor() {
      this.entries = []; // Array of {address, value, nonce} objects
      this.addressMap = new Map(); // Map of address -> entry index
    }

    // Add/update an entry
    addEntry(address, value, nonce) {
      // Remove existing entry if any
      if (this.addressMap.has(address)) {
        this.removeEntry(address);
      }

      // Add new entry
      const entry = { address, value, nonce };
      this.entries.push(entry);
      this.addressMap.set(address, this.entries.length - 1);

      // Sort entries by value, then by nonce (descending for same values)
      this.entries.sort((a, b) => {
        if (a.value !== b.value) {
          return a.value - b.value; // Sort by value first (ascending)
        }
        return b.nonce - a.nonce; // Then by nonce (ascending - lower nonce is older)
      });

      // Update address mapping after sorting
      this.updateAddressMap();
    }

    // Remove an entry
    removeEntry(address) {
      if (!this.addressMap.has(address)) return;

      const index = this.addressMap.get(address);
      this.entries.splice(index, 1);
      this.addressMap.delete(address);

      // Update address mapping after removal
      this.updateAddressMap();
    }

    // Update the address -> index mapping after sorting/removal
    updateAddressMap() {
      this.addressMap.clear();
      this.entries.forEach((entry, index) => {
        this.addressMap.set(entry.address, index);
      });
    }

    // Get entry by index
    getByIndex(index) {
      return this.entries[index];
    }

    // Get index of address
    getIndexOf(address) {
      return this.addressMap.get(address);
    }

    // Get the size
    get size() {
      return this.entries.length;
    }
  }

  before(async function () {
    // Get test accounts
    accounts = await ethers.getSigners();

    // Deploy the contract
    treeFactory = await ethers.getContractFactory('AugmentedLLRBTree');
    tree = await treeFactory.deploy();
    await tree.waitForDeployment();
  });

  describe('Large Scale Random Operations', function () {
    it('should handle hundreds of random inserts and removals correctly', async function () {
      // Reset tree
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      const tracker = new TreeTracker();
      const NUM_OPERATIONS = 1000;
      const wallets = [];

      // Create wallets up front
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        wallets.push(ethers.Wallet.createRandom().connect(ethers.provider));
      }

      // Perform random operations
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        const operationType = Math.random() < 0.8 ? 'insert' : 'remove'; // 80% inserts, 20% removals

        if (operationType === 'insert') {
          const wallet = wallets[Math.floor(Math.random() * wallets.length)];
          const value = Math.floor(Math.random() * 1000000);

          await tree.insert(value, wallet.address);

          // Update JavaScript tracker
          tracker.addEntry(
            wallet.address,
            value,
            (await ethers.provider.getBlock('latest')).timestamp
          );
        } else if (operationType === 'remove' && tracker.size > 0) {
          // Select a random address to remove
          const addressesArray = Array.from(tracker.addressMap.keys());
          if (addressesArray.length === 0) continue;

          const addressToRemove =
            addressesArray[Math.floor(Math.random() * addressesArray.length)];

          await tree.remove(addressToRemove);

          // Update JavaScript tracker
          tracker.removeEntry(addressToRemove);
        }

        // Perform periodic validation every 100 operations
        if ((i + 1) % 100 === 0 || i === NUM_OPERATIONS - 1) {
          // Check tree size
          const treeSize = await tree.size();
          expect(treeSize).to.equal(tracker.size);

          // Validate a sample of indices
          if (tracker.size > 0) {
            const numToValidate = Math.min(20, tracker.size);
            const step = Math.max(1, Math.floor(tracker.size / numToValidate));

            for (let j = 0; j < tracker.size; j += step) {
              const treeValue = await tree.getValueAtIndex(j);
              const treeOwner = await tree.getOwnerAtIndex(j);

              const trackerEntry = tracker.getByIndex(j);

              expect(treeValue).to.equal(trackerEntry.value);
              expect(treeOwner).to.equal(trackerEntry.address);
            }
          }
        }
      }

      console.log(`Final size after random operations: ${tracker.size}`);
    });
  });

  describe('Successive Value Insertions', function () {
    it('should handle hundreds of successively increasing insertions', async function () {
      // Reset tree
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      const tracker = new TreeTracker();
      const NUM_OPERATIONS = 1000;
      const wallets = [];

      // Create wallets up front
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        wallets.push(ethers.Wallet.createRandom().connect(ethers.provider));
      }

      // Insert values in increasing order
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        const value = i * 10; // Increasing values
        const wallet = wallets[i];

        await tree.insert(value, wallet.address);

        // Update JavaScript tracker
        tracker.addEntry(
          wallet.address,
          value,
          (await ethers.provider.getBlock('latest')).timestamp
        );

        // Perform validation every 100 operations
        if ((i + 1) % 100 === 0 || i === NUM_OPERATIONS - 1) {
          // Check tree size
          const treeSize = await tree.size();
          expect(treeSize).to.equal(tracker.size);

          // Validate first, middle, and last indices
          if (tracker.size > 0) {
            // Check beginning
            await validateIndex(0);

            // Check middle
            if (tracker.size > 1) {
              await validateIndex(Math.floor(tracker.size / 2));
            }

            // Check end
            await validateIndex(tracker.size - 1);
          }
        }
      }

      // Validate entire structure
      await validateCompleteStructure();

      async function validateIndex(index) {
        const treeValue = await tree.getValueAtIndex(index);
        const treeOwner = await tree.getOwnerAtIndex(index);
        const trackerEntry = tracker.getByIndex(index);

        expect(treeValue).to.equal(trackerEntry.value);
        expect(treeOwner).to.equal(trackerEntry.address);
      }

      async function validateCompleteStructure() {
        // Verify entire structure
        for (let i = 0; i < tracker.size; i++) {
          const treeValue = await tree.getValueAtIndex(i);
          const trackerEntry = tracker.getByIndex(i);
          expect(treeValue).to.equal(trackerEntry.value);

          const treeOwner = await tree.getOwnerAtIndex(i);
          expect(treeOwner).to.equal(trackerEntry.address);
        }
      }
    });

    it('should handle hundreds of successively decreasing insertions', async function () {
      // Reset tree
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      const tracker = new TreeTracker();
      const NUM_OPERATIONS = 1000;
      const wallets = [];

      // Create wallets up front
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        wallets.push(ethers.Wallet.createRandom().connect(ethers.provider));
      }

      // Insert values in decreasing order
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        const value = (NUM_OPERATIONS - i) * 10; // Decreasing values
        const wallet = wallets[i];

        await tree.insert(value, wallet.address);

        // Update JavaScript tracker
        tracker.addEntry(
          wallet.address,
          value,
          (await ethers.provider.getBlock('latest')).timestamp
        );

        // Perform validation every 100 operations
        if ((i + 1) % 100 === 0 || i === NUM_OPERATIONS - 1) {
          // Check tree size
          const treeSize = await tree.size();
          expect(treeSize).to.equal(tracker.size);

          // Validate specific indices
          if (tracker.size > 0) {
            // Sample validation at strategic points
            const indicesToCheck = [
              0,
              Math.floor(tracker.size / 4),
              Math.floor(tracker.size / 2),
              Math.floor((3 * tracker.size) / 4),
              tracker.size - 1,
            ];

            for (const idx of indicesToCheck) {
              if (idx >= 0 && idx < tracker.size) {
                const treeValue = await tree.getValueAtIndex(idx);
                const trackerEntry = tracker.getByIndex(idx);
                expect(treeValue).to.equal(trackerEntry.value);
              }
            }
          }
        }
      }

      // Final validation of the entire structure
      for (let i = 0; i < Math.min(tracker.size, 100); i++) {
        // Check up to 100 entries for time
        const treeValue = await tree.getValueAtIndex(i);
        const treeOwner = await tree.getOwnerAtIndex(i);
        const trackerEntry = tracker.getByIndex(i);

        expect(treeValue).to.equal(trackerEntry.value);
        expect(treeOwner).to.equal(trackerEntry.address);
      }
    });
  });

  describe('Same Value Insertions', function () {
    it('should handle hundreds of same-value insertions with correct nonce ordering', async function () {
      // Reset
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      const tracker = new TreeTracker();
      const NUM_OPERATIONS = 1000;
      const wallets = [];
      const nonces = [];
      const SAME_VALUE = 1000;

      // Create wallets up front
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        wallets.push(ethers.Wallet.createRandom().connect(ethers.provider));
      }

      // Insert same value multiple times with increasing timestamps
      for (let i = 0; i < NUM_OPERATIONS; i++) {
        const wallet = wallets[i];

        // Insert same value
        await tree.insert(SAME_VALUE, wallet.address);

        // Get nonce (incrementing value)
        const nonce = i;
        nonces.push(nonce);

        // Insert into tracker for validation
        tracker.addEntry(wallet.address, SAME_VALUE, nonce);

        // Validate periodically
        if ((i + 1) % 50 === 0 || i === NUM_OPERATIONS - 1) {
          // Check size
          const treeSize = await tree.size();
          expect(treeSize).to.equal(tracker.size);

          // Check a few entries to ensure nonce ordering is correct
          // For same values, newest entries should be at lowest indices
          if (i >= 2) {
            // Check that first entry is newest (highest nonce)
            const newest = await tree.getOwnerAtIndex(0);
            const middle = await tree.getOwnerAtIndex(Math.floor(i / 2));
            const oldest = await tree.getOwnerAtIndex(i);

            // Get the addresses from our tracker at same positions
            const newestExpected = tracker.getByIndex(0).address;
            const middleExpected = tracker.getByIndex(
              Math.floor(i / 2)
            ).address;
            const oldestExpected = tracker.getByIndex(i).address;

            expect(newest).to.equal(newestExpected);
            expect(middle).to.equal(middleExpected);
            expect(oldest).to.equal(oldestExpected);

            // // Additionally check that newest has highest timestamp and oldest has lowest
            const newestNonce = await tree.getNonce(newest);
            const oldestNonce = await tree.getNonce(oldest);
            expect(newestNonce).to.be.greaterThan(oldestNonce);
          }
        }
      }

      // Verify size
      const size = await tree.size();
      expect(size).to.equal(NUM_OPERATIONS);

      // Verify the entire structure is properly ordered by timestamp (descending)
      for (let i = 0; i < tracker.size - 1; i++) {
        const current = await tree.getOwnerAtIndex(i);
        const next = await tree.getOwnerAtIndex(i + 1);

        const currentNonce = await tree.getNonce(current);
        const nextNonce = await tree.getNonce(next);

        // For same values, newer timestamp should come first (lower index)
        expect(currentNonce).to.be.greaterThan(nextNonce);
      }
    });
  });

  describe('Specific Sequence Tests', function () {
    it('should maintain correct structure after specific insert/remove sequences', async function () {
      // Reset tree
      tree = await treeFactory.deploy();
      await tree.waitForDeployment();

      const tracker = new TreeTracker();
      const NUM_INITIAL = 1000;
      const NUM_WALLETS = NUM_INITIAL + 50;
      const wallets = [];

      // Generate wallets
      for (let i = 0; i < NUM_WALLETS; i++) {
        wallets.push(ethers.Wallet.createRandom().connect(ethers.provider));
      }

      // First, create a tree with 100 nodes in a specific pattern
      // Insert in a "sawtooth" pattern to stress balancing
      for (let i = 0; i < NUM_INITIAL; i++) {
        let value;
        if (i % 2 === 0) {
          value = i * 10; // Even indexes get increasing values
        } else {
          value = (NUM_INITIAL - i) * 10; // Odd indexes get decreasing values
        }

        await tree.insert(value, wallets[i].address);
        tracker.addEntry(
          wallets[i].address,
          value,
          (await ethers.provider.getBlock('latest')).timestamp
        );
      }

      // Now perform 50 removals and 50 insertions to stress the tree structure
      // 1. Remove 50 random nodes
      for (let i = 0; i < 50; i++) {
        // Select random address to remove from our tracker
        const addresses = Array.from(tracker.addressMap.keys());
        const randomIndex = Math.floor(Math.random() * addresses.length);
        const addressToRemove = addresses[randomIndex];

        await tree.remove(addressToRemove);
        tracker.removeEntry(addressToRemove);

        // Occasional validations during the process
        if (i % 10 === 0) {
          const treeSize = await tree.size();
          expect(treeSize).to.equal(tracker.size);
        }
      }

      // 2. Add 50 new nodes with new values
      for (let i = 0; i < 50; i++) {
        const value = 5000 + i * 7; // New range of values
        const wallet = wallets[NUM_INITIAL + i];

        await tree.insert(value, wallet.address);
        tracker.addEntry(
          wallet.address,
          value,
          (await ethers.provider.getBlock('latest')).timestamp
        );

        // Occasional validations
        if (i % 10 === 0) {
          const treeSize = await tree.size();
          expect(treeSize).to.equal(tracker.size);
        }
      }

      // Now validate the final structure thoroughly
      const treeSize = await tree.size();
      expect(treeSize).to.equal(tracker.size);

      // Check tree is valid (using tree's validation function)
      const isValid = await tree._testIsValidTree();
      expect(isValid).to.be.true;

      // Check 20 random indices for correct values and owners
      for (let i = 0; i < tracker.size; i++) {
        const treeValue = await tree.getValueAtIndex(i);
        const treeOwner = await tree.getOwnerAtIndex(i);

        const trackerEntry = tracker.getByIndex(i);
        expect(treeValue).to.equal(trackerEntry.value);
        expect(treeOwner).to.equal(trackerEntry.address);
      }

      // Verify indices are correct for 20 random addresses
      const addresses = Array.from(tracker.addressMap.keys());
      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];

        const treeIndex = await tree.getIndexOfOwner(address);
        const trackerIndex = tracker.getIndexOf(address);

        expect(treeIndex).to.equal(trackerIndex);
      }
    });
  });
});
