import { expect } from 'chai';
import { afterEach, before, describe, it } from 'mocha';
import hre from 'hardhat';
const ethers = hre.ethers;

let snapshot;
describe('TrifleTreeLib Tests', function () {
  this.timeout(500_000);
  let tree;

  before(async function () {
    // Simply deploy TreeTest
    const TreeTest = await ethers.getContractFactory('TreeTest');
    tree = await TreeTest.deploy();
    await tree.waitForDeployment();
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  afterEach(async function () {
    await hre.network.provider.send('evm_revert', [snapshot]);
    snapshot = await hre.network.provider.send('evm_snapshot', []);
  });

  it('should handle basic insertions correctly', async () => {
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 50);
    await tree.insert(ethers.id('key3'), 150);

    expect(await tree.exists(100)).to.be.true;
    expect(await tree.exists(50)).to.be.true;
    expect(await tree.exists(150)).to.be.true;
    expect(await tree.exists(75)).to.be.false;

    expect(await tree.keyExists(ethers.id('key1'), 100)).to.be.true;
    expect(await tree.keyExists(ethers.id('wrongKey'), 100)).to.be.false;

    expect(await tree.first()).to.equal(
      50,
      `First value should be 50 but got ${await tree.first()}`
    );
    expect(await tree.last()).to.equal(150);
  });

  it('should handle removals correctly', async () => {
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 50);
    await tree.insert(ethers.id('key3'), 150);

    await tree.remove(ethers.id('key2'), 50);

    expect(await tree.exists(50)).to.be.false;
    expect(await tree.first()).to.equal(
      100,
      `First value should be 100 but got ${await tree.first()}`
    );
    expect(await tree.last()).to.equal(150);
  });

  it('should calculate findIndexByValue and percentile correctly', async () => {
    // Insert values in order: 50, 100, 150, 200
    for (let i = 0; i < 10; i++) {
      await tree.insert(ethers.id(`key${i}`), 100 * (i + 1));
    }

    // Check ranks (1-based)
    for (let i = 0; i < 10; i++) {
      expect(await tree.findIndexByValue(100 * (i + 1))).to.equal(
        i,
        `${100 * (i + 1)} should be findIndexByValue ${i}`
      );
    }

    // expect(await tree.percentile(100)).to.equal(
    //   10,
    //   '100 should be 10th percentile'
    // );
    // expect(await tree.percentile(200)).to.equal(
    //   20,
    //   '200 should be 20th percentile'
    // );

    // expect(await tree.percentile(800)).to.equal(
    //   80,
    //   '800 should be 80th percentile'
    // );
  });

  it('should handle findValueByIndex queries correctly', async () => {
    await tree.insert(ethers.id('key1'), 50);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 150);
    await tree.insert(ethers.id('key4'), 200);

    expect(await tree.findValueByIndex(0)).to.equal(50);
    const key1Rank = await tree.findIndexByValue(50);
    expect(key1Rank).to.equal(0);
    expect(await tree.findValueByIndex(1)).to.equal(100);
    const key2Rank = await tree.findIndexByValue(100);
    expect(key2Rank).to.equal(1);
    expect(await tree.findValueByIndex(2)).to.equal(150);
    const key3Rank = await tree.findIndexByValue(150);
    expect(key3Rank).to.equal(2);
    expect(await tree.findValueByIndex(3)).to.equal(200);
    const key4Rank = await tree.findIndexByValue(200);
    expect(key4Rank).to.equal(3);
  });

  it('should handle findValueByIndex queries with multiple keys per value', async () => {
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 200);

    expect(await tree.findValueByIndex(0)).to.equal(100);
    expect(await tree.findValueByIndex(1)).to.equal(100);
    expect(await tree.findValueByIndex(2)).to.equal(200);

    const count = await tree.count();
    expect(count).to.equal(3);

    expect(await tree.findValueByIndex(2)).to.equal(200);
    const key3Index = await tree.findIndexByValue(200);
    expect(key3Index).to.equal(2);

    await tree.remove(ethers.id('key1'), 100);
    await tree.remove(ethers.id('key2'), 100);

    expect(await tree.findValueByIndex(0)).to.equal(200);
    const key4Index = await tree.findIndexByValue(200);
    expect(key4Index).to.equal(0);

    await tree.insert(ethers.id('key4'), 400);

    expect(await tree.findValueByIndex(1)).to.equal(400);
    expect(await tree.findValueByIndex(0)).to.equal(200);
    const key4Index2 = await tree.findIndexByValue(400);
    expect(key4Index2).to.equal(1);
  });

  it('should maintain correct count of nodes', async () => {
    expect(await tree.count()).to.equal(0, 'Empty tree should have count 0');

    await tree.insert(ethers.id('key1'), 100);
    expect(await tree.count()).to.equal(
      1,
      'After first insert count should be 1'
    );

    // Insert duplicate value with different key
    await tree.insert(ethers.id('key2'), 100);
    expect(await tree.count()).to.equal(
      2,
      'Duplicate value should increase count'
    );

    // Insert new value
    await tree.insert(ethers.id('key3'), 50);
    expect(await tree.count()).to.equal(3, 'New value should increase count');

    await tree.remove(ethers.id('key1'), 100);
    expect(await tree.count()).to.equal(
      2,
      'Removing one key of duplicate should decrease count'
    );
    await tree.remove(ethers.id('key2'), 100);
    expect(await tree.count()).to.equal(
      1,
      'Removing a key should decrease count'
    );
  });

  it('should handle edge cases correctly', async () => {
    // Test empty tree operations
    await expect(tree.first()).to.be.revertedWith(
      'OrderStatisticsTree(401) - Empty tree'
    );
    await expect(tree.last()).to.be.revertedWith(
      'OrderStatisticsTree(401) - Empty tree'
    );

    // Test invalid operations
    await expect(tree.remove(ethers.id('key1'), 100)).to.be.revertedWith(
      'OrderStatisticsTree(408) - Value to delete does not exist.'
    );

    await expect(tree.insert(ethers.id('key1'), 0)).to.be.revertedWith(
      'OrderStatisticsTree(405) - Value to insert cannot be zero'
    );

    // Test non-existent value operations
    expect(await tree.exists(999)).to.be.false;
    await expect(tree.findIndexByValue(999)).to.be.revertedWith(
      'OrderStatisticsTree(407) - Value does not exist.'
    );
    // await expect(tree.percentile(999)).to.be.revertedWith(
    //   'OrderStatisticsTree(407) - Value does not exist.'
    // );
  });

  it('should handle multiple keys for same value', async () => {
    // Insert same value with different keys
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);

    // Both keys should exist for the value
    const key1Exists = await tree.keyExists(ethers.id('key1'), 100);
    const key2Exists = await tree.keyExists(ethers.id('key2'), 100);

    expect(key1Exists).to.be.true;
    expect(key2Exists).to.be.true;
    expect(await tree.exists(100)).to.be.true;

    // Remove first key
    await tree.remove(ethers.id('key1'), 100);

    // Check state after first removal
    const afterRemovalNode = await tree.getNode(100);

    // First key should be gone, but second should remain
    const key1ExistsAfterRemoval = await tree.keyExists(ethers.id('key1'), 100);
    const key2ExistsAfterRemoval = await tree.keyExists(ethers.id('key2'), 100);

    expect(key1ExistsAfterRemoval).to.be.false;
    expect(key2ExistsAfterRemoval).to.be.true;
    expect(await tree.exists(100)).to.be.true;

    // Remove second key
    await tree.remove(ethers.id('key2'), 100);

    // Final state check
    const finalNode = await tree.getNode(100);

    // Value should no longer exist in tree
    expect(await tree.keyExists(ethers.id('key1'), 100)).to.be.false;
    expect(await tree.keyExists(ethers.id('key2'), 100)).to.be.false;
    expect(await tree.exists(100)).to.be.false;
  });

  it('should handle first() and last() with single node', async () => {
    await tree.insert(ethers.id('key1'), 100);

    expect(await tree.first()).to.equal(100);
    expect(await tree.last()).to.equal(100);
  });

  it('should maintain correct first() and last() after multiple insertions', async () => {
    // Insert in non-sequential order
    await tree.insert(ethers.id('key1'), 100);
    expect(await tree.first()).to.equal(
      100,
      'First should be 100 after initial insert'
    );
    expect(await tree.last()).to.equal(
      100,
      'Last should be 100 after initial insert'
    );

    await tree.insert(ethers.id('key2'), 50);
    expect(await tree.first()).to.equal(50, 'First should update to 50');
    expect(await tree.last()).to.equal(100, 'Last should remain 100');

    await tree.insert(ethers.id('key3'), 150);
    expect(await tree.first()).to.equal(50, 'First should remain 50');
    expect(await tree.last()).to.equal(150, 'Last should update to 150');
  });

  it('should maintain correct first() and last() after removals', async () => {
    // Setup initial tree
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 50);
    await tree.insert(ethers.id('key3'), 150);

    // Remove middle node
    await tree.remove(ethers.id('key1'), 100);
    expect(await tree.first()).to.equal(
      50,
      'First should remain 50 after middle removal'
    );
    const lastValue = await tree.last();
    expect(lastValue).to.equal(
      150,
      `Last should remain 150 after middle removal but got ${lastValue}. ` +
        `Tree state: first=${await tree.first()}, count=${await tree.count()}`
    );
  });

  it('should handle first() and last() with duplicate values', async () => {
    await tree.insert(ethers.id('key1'), 100);

    // Let's check the node structure after first insert
    const node1 = await tree.getNode(100);

    await tree.insert(ethers.id('key2'), 100);

    // Check node structure after second insert
    const node2 = await tree.getNode(100);

    const firstVal = await tree.first();
    // console.log('First value:', firstVal);
    const lastVal = await tree.last();
    // console.log('Last value:', lastVal);

    expect(await tree.first()).to.equal(100);
    expect(await tree.last()).to.equal(100);
  });

  it('should maintain correct order with mixed operations', async () => {
    // Build tree: 50 -> 100 -> 150
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 50);
    await tree.insert(ethers.id('key3'), 150);

    // Remove middle and verify order
    await tree.remove(ethers.id('key1'), 100);
    expect(await tree.first()).to.equal(50);
    expect(await tree.last()).to.equal(150);

    // Add new middle value
    await tree.insert(ethers.id('key4'), 75);
    expect(await tree.first()).to.equal(50);
    expect(await tree.last()).to.equal(150);

    // Remove smallest
    await tree.remove(ethers.id('key2'), 50);
    expect(await tree.first()).to.equal(75);
    expect(await tree.last()).to.equal(150);
  });

  it('should maintain insertion order for equal values', async () => {
    // console.log('Inserting values...');
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 100);

    // Get the node to verify structure
    const node = await tree.getNode(100);
    // Verify initial structure
    expect(node.keyCount).to.equal(3, 'Should have 3 keys');
    expect(await tree.valueKeyAtIndex(100, 0)).to.equal(
      ethers.id('key1'),
      'First key should be key1'
    );
    expect(await tree.valueKeyAtIndex(100, 1)).to.equal(
      ethers.id('key2'),
      'Second key should be key2'
    );
    expect(await tree.valueKeyAtIndex(100, 2)).to.equal(
      ethers.id('key3'),
      'Third key should be key3'
    );
    // Get the first value and verify its key
    // console.log('Getting first value...');
    const first = await tree.first();
    expect(first).to.equal(100, `First value should be 100 but got ${first}`);
  });

  it('should maintain correct node structure', async () => {
    await tree.insert(ethers.id('key1'), 100);

    const [parent, left, right, red, keyCount, nodeCount] =
      await tree.getNode(100);
    expect(keyCount).to.equal(1);
    expect(nodeCount).to.equal(1);

    await tree.insert(ethers.id('key2'), 50);
    const parentNode = await tree.getNode(100);
    const childNode = await tree.getNode(50);

    expect(childNode.parent).to.equal(100);
    expect(parentNode.left).to.equal(50);
  });

  it('should handle next and prev correctly', async () => {
    await tree.insert(ethers.id('key1'), 50);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 150);

    expect(await tree.next(50)).to.equal(
      100,
      `Expected next value after 50 to be 100 but got ${await tree.next(50)}. Current tree state: first=${await tree.first()}, last=${await tree.last()}`
    );
    expect(await tree.next(100)).to.equal(
      150,
      `Expected next value after 100 to be 150 but got ${await tree.next(100)}. Current tree state: first=${await tree.first()}, last=${await tree.last()}`
    );
    expect(await tree.next(150)).to.equal(0); // Should return 0 when no next

    expect(await tree.prev(150)).to.equal(
      100,
      `Expected previous value before 150 to be 100 but got ${await tree.prev(150)}. Current tree state: first=${await tree.first()}, last=${await tree.last()}`
    );
    expect(await tree.prev(100)).to.equal(
      50,
      `Expected previous value before 100 to be 50 but got ${await tree.prev(100)}. Current tree state: first=${await tree.first()}, last=${await tree.last()}`
    );
    expect(await tree.prev(50)).to.equal(0); // Should return 0 when no prev
  });

  it('should maintain tree balance after multiple operations', async () => {
    // Insert values in non-sequential order
    for (let i = 1; i < 11; i++) {
      await tree.insert(ethers.id(`key${i}`), i * 37); // Non-sequential values
    }

    // Verify the tree is balanced by checking some operations are efficient
    await tree.first();
    await tree.last();
    await tree.findIndexByValue(185); // 5 * 37
  });

  it('should maintain FIFO order for duplicate values during insertion and removal', async () => {
    // Insert multiple entries with same value in sequence
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 100);

    // Verify keys are stored in insertion order
    expect(await tree.valueKeyAtIndex(100, 0)).to.equal(
      ethers.id('key1'),
      'First key should be key1'
    );
    expect(await tree.valueKeyAtIndex(100, 1)).to.equal(
      ethers.id('key2'),
      'Second key should be key2'
    );
    expect(await tree.valueKeyAtIndex(100, 2)).to.equal(
      ethers.id('key3'),
      'Third key should be key3'
    );

    // Remove middle key and verify order is maintained
    await tree.remove(ethers.id('key2'), 100);
    expect(await tree.valueKeyAtIndex(100, 0)).to.equal(
      ethers.id('key1'),
      'First key should still be key1 after middle removal'
    );
    expect(await tree.valueKeyAtIndex(100, 1)).to.equal(
      ethers.id('key3'),
      'Second key should now be key3'
    );

    // Remove first key and verify order
    await tree.remove(ethers.id('key1'), 100);
    expect(await tree.valueKeyAtIndex(100, 0)).to.equal(
      ethers.id('key3'),
      'Only remaining key should be key3'
    );

    // Add new keys and verify they append to the end
    await tree.insert(ethers.id('key4'), 100);
    await tree.insert(ethers.id('key5'), 100);
    expect(await tree.valueKeyAtIndex(100, 0)).to.equal(
      ethers.id('key3'),
      'First key should still be key3'
    );
    expect(await tree.valueKeyAtIndex(100, 1)).to.equal(
      ethers.id('key4'),
      'Second key should be key4'
    );
    expect(await tree.valueKeyAtIndex(100, 2)).to.equal(
      ethers.id('key5'),
      'Third key should be key5'
    );

    await tree.insert(ethers.id('key1'), 100);
    expect(await tree.valueKeyAtIndex(100, 0)).to.equal(
      ethers.id('key3'),
      'First key should be key3'
    );
  });

  it('should handle ranks correctly with multiple keys per value', async () => {
    // Insert multiple keys for same values
    await tree.insert(ethers.id('key1'), 150);
    await tree.insert(ethers.id('key2'), 150);
    await tree.insert(ethers.id('key3'), 150);
    await tree.insert(ethers.id('key4'), 100);
    await tree.insert(ethers.id('key5'), 100);
    await tree.insert(ethers.id('key6'), 50);
    // await tree.visualizeTree();
    // Check ranks
    expect(await tree.findIndexByValue(150)).to.equal(
      3,
      '150 should be findIndexByValue 3'
    );
    expect(await tree.findIndexByValue(100)).to.equal(
      1,
      '100 should be findIndexByValue 1 (after 1 keys of 50)'
    );
    expect(await tree.findIndexByValue(50)).to.equal(
      0,
      '50 should be findIndexByValue 0'
    );
  });

  it('should return correct keys for global ranks with multiple keys per value', async () => {
    let keys = [];
    const lookup = {};
    for (let i = 0; i < 100; i++) {
      keys.push(ethers.id(`key${i}`));
      lookup[keys[i]] = keys[i];
    }

    await tree.insert(keys[0], 150);
    await tree.insert(keys[1], 150);
    await tree.insert(keys[2], 150);
    await tree.insert(keys[3], 100);
    await tree.insert(keys[4], 100);
    await tree.insert(keys[5], 50);
    await tree.insert(keys[6], 200);
    await tree.insert(keys[7], 250);
    await tree.insert(keys[8], 300);
    await tree.insert(keys[9], 350);
    await tree.insert(keys[10], 400);
    await tree.insert(keys[11], 450);
    await tree.insert(keys[12], 500);
    await tree.insert(keys[13], 550);
    await tree.insert(keys[14], 600);

    // await tree.visualizeTree();

    // console.log('\nTree structure after insertion:');
    const values = [600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100, 50];
    let totalKeys = 0;
    for (const value of values) {
      const node = await tree.getNode(value);
      totalKeys += parseInt(node.keyCount.toString());
    }

    const totalCount = await tree.count();
    expect(totalCount).to.equal(15);

    // Verify ranks (0-based)
    expect(await tree.findValueByIndex(0)).to.equal(50);
    expect(await tree.findKeyByIndex(0)).to.equal(
      keys[5],
      'Rank 0 should be key5 (50)'
    );
    expect(await tree.findValueByIndex(1)).to.equal(100);
    expect(await tree.findKeyByIndex(1)).to.equal(
      keys[3],
      'Rank 1 should be key3 (100)'
    );
    expect(await tree.findValueByIndex(2)).to.equal(100);
    expect(await tree.findKeyByIndex(2)).to.equal(
      keys[4],
      'Rank 2 should be key4 (100)'
    );
    expect(await tree.findValueByIndex(3)).to.equal(150);
    expect(await tree.findKeyByIndex(3)).to.equal(
      keys[0],
      'Rank 3 should be key0 (150)'
    );
    expect(await tree.findValueByIndex(4)).to.equal(150);
    expect(await tree.findKeyByIndex(4)).to.equal(
      keys[1],
      'Rank 4 should be key1 (150)'
    );
    expect(await tree.findValueByIndex(5)).to.equal(150);
    expect(await tree.findKeyByIndex(5)).to.equal(
      keys[2],
      'Rank 5 should be key2 (150)'
    );
  });

  it('should maintain correct findIndexByValue ordering based on value and insertion order', async () => {
    // Helper function to convert key hash to readable name
    const keyToName = (key) => {
      if (key === ethers.id('key_A')) return 'key_A';
      if (key === ethers.id('key_B')) return 'key_B';
      if (key === ethers.id('key_C')) return 'key_C';
      return 'unknown';
    };

    // First scenario: Add A, B, C with value 100 each
    await tree.insert(ethers.id('key_A'), 100);
    await tree.insert(ethers.id('key_B'), 100);
    await tree.insert(ethers.id('key_C'), 100);

    expect(keyToName(await tree.findKeyByIndex(0))).to.equal('key_A'); // A at 100
    expect(keyToName(await tree.findKeyByIndex(1))).to.equal('key_B'); // B at 100
    expect(keyToName(await tree.findKeyByIndex(2))).to.equal('key_C'); // C at 100

    // Second scenario: Remove C, then add C(200), B(200), A(200)
    await tree.remove(ethers.id('key_C'), 100);
    await tree.insert(ethers.id('key_C'), 200); // CAB
    expect(keyToName(await tree.findKeyByIndex(0))).to.equal('key_A'); // A at 100
    expect(keyToName(await tree.findKeyByIndex(1))).to.equal('key_B'); // B at 100
    expect(keyToName(await tree.findKeyByIndex(2))).to.equal('key_C'); // C at 200

    await tree.remove(ethers.id('key_B'), 100);
    await tree.insert(ethers.id('key_B'), 200); // ABC

    expect(keyToName(await tree.findKeyByIndex(0))).to.equal('key_A'); // A at 100
    expect(keyToName(await tree.findKeyByIndex(1))).to.equal('key_C'); // C at 200
    expect(keyToName(await tree.findKeyByIndex(2))).to.equal('key_B'); // B at 200

    await tree.remove(ethers.id('key_A'), 100);
    await tree.insert(ethers.id('key_A'), 200); // CBA

    expect(keyToName(await tree.findKeyByIndex(0))).to.equal('key_C'); // C at 200
    expect(keyToName(await tree.findKeyByIndex(1))).to.equal('key_B'); // B at 200
    expect(keyToName(await tree.findKeyByIndex(2))).to.equal('key_A'); // A at 200

    // Third scenario: Remove C(200) and add C back with 100
    await tree.remove(ethers.id('key_C'), 200);
    await tree.insert(ethers.id('key_C'), 100); // CBA

    expect(keyToName(await tree.findKeyByIndex(0))).to.equal('key_C'); // C at 100
    expect(keyToName(await tree.findKeyByIndex(1))).to.equal('key_B'); // B at 200
    expect(keyToName(await tree.findKeyByIndex(2))).to.equal('key_A'); // A at 200
  });

  it('should calculate percentiles correctly', async () => {
    // Insert 10 values: 10, 20, 30, ..., 100
    for (let i = 1; i <= 10; i++) {
      await tree.insert(ethers.id(`key${i}`), i * 10);
    }

    // Test various percentiles
    expect(await tree.percentile(10)).to.equal(
      10,
      `10 should be in 10th percentile (100) but got ${await tree.percentile(10)}`
    );

    expect(await tree.percentile(50)).to.equal(
      50,
      `50 should be in 50th percentile (500) but got ${await tree.percentile(50)}`
    );

    expect(await tree.percentile(100)).to.equal(
      100,
      `100 should be in 100th percentile (1000) but got ${await tree.percentile(100)}`
    );

    // Add more values and verify percentiles update
    for (let i = 11; i <= 20; i++) {
      await tree.insert(ethers.id(`key${i}`), i * 10);
    }

    // Now 50 should be in 25th percentile (was in 50th with 10 values)
    expect(await tree.percentile(50)).to.equal(
      25,
      `After adding more values, 50 should be in 25th percentile (250) but got ${await tree.percentile(50)}`
    );
  });

  it('should correctly update node counts', async () => {
    // Test empty tree
    expect(await tree.count()).to.equal(0);

    // Single node
    await tree.insert(ethers.id('key1'), 100);
    expect(await tree.count()).to.equal(1);

    // Multiple keys in same node
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 100);
    expect(await tree.count()).to.equal(3);

    // Multiple nodes with multiple keys
    await tree.insert(ethers.id('key4'), 200);
    await tree.insert(ethers.id('key5'), 200);
    expect(await tree.count()).to.equal(5);

    // Remove key from multi-key node
    await tree.remove(ethers.id('key2'), 100);
    expect(await tree.count()).to.equal(4);

    // Remove node entirely
    await tree.remove(ethers.id('key4'), 200);
    await tree.remove(ethers.id('key5'), 200);
    expect(await tree.count()).to.equal(2);
  });

  it('should handle adding and removing from a single value to ensure keys are in correct order', async () => {
    const total = 50;
    for (let i = 0; i < total; i++) {
      await tree.insert(ethers.id(`key${i}`), 100);
    }

    // await tree.visualizeTree();
    await tree.remove(ethers.id(`key${0}`), 100);
    await tree.insert(ethers.id(`key${0}`), 100);
    let count = await tree.count();
    expect(count).to.equal(total);
    // tree.visualizeTree();
    expect(await tree.findKeyByIndex(count - 1n)).to.equal(
      ethers.id(`key${0}`)
    );

    for (let i = 20; i < 30; i++) {
      await tree.remove(ethers.id(`key${i}`), 100);
    }
    count = await tree.count();
    expect(count).to.equal(total - 10);
    expect(await tree.findKeyByIndex(count - 1n)).to.equal(
      ethers.id(`key${0}`)
    );
    await tree.insert(ethers.id(`key${20}`), 100);
    count = await tree.count();
    expect(count).to.equal(total - 9);
    expect(await tree.findKeyByIndex(count - 1n)).to.equal(
      ethers.id(`key${20}`)
    );
  });

  class DeterministicRandom {
    constructor(seed) {
      this.seed = seed >>> 0; // Ensure 32-bit unsigned integer
      this.state = this.seed;
      this.nonce = 0;
    }

    // MurmurHash3 mixing function
    private_mix(h) {
      h ^= h >>> 16;
      h = (h * 0x85ebca6b) >>> 0;
      h ^= h >>> 13;
      h = (h * 0xc2b2ae35) >>> 0;
      h ^= h >>> 16;
      return h;
    }

    next() {
      // Combine state and nonce
      let h = this.state;
      h = (h * 0x6c078965) >>> 0;
      h = h ^ (this.nonce >>> 0);

      // Multiple rounds of mixing
      h = this.private_mix(h);
      h = this.private_mix(h ^ (h >>> 7));

      // Update state and nonce
      this.state = h;
      this.nonce++;

      // Convert to float between 0 and 1
      return (h >>> 0) / 4294967296;
    }
  }

  it('shoudl handle a fuzzy amount of adds and removes', async () => {
    const seed = Math.floor(Math.random() * 1000000); // 678426
    console.log(`seed: ${seed}`);
    const total = 200;

    const random = new DeterministicRandom(seed);
    try {
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
      const lookup = {};
      for (let i = 0; i < 4; i++) {
        lookup[ethers.id(`key${i}`)] = i;
      }
      let localArray = [];
      for (let i = 0; i < total; i++) {
        const randomInt = 10 + Math.floor(random.next() * 100);
        const entry = {
          key: ethers.id(`key${i}`),
          value: randomInt,
        };
        await tree.insert(entry.key, entry.value);
        localArray.push(entry);
      }
      localArray = sort(localArray);
      console.log({ localArray });
      for (let i = 0; i < localArray.length; i++) {
        console.log('i::', i);
        const [key, value] = await tree.findKeyValueByIndex(i);
        console.log(`${i}: ${key} ${value}`);
      }

      for (let i = 0; i < localArray.length; i++) {
        const entry = localArray[i];
        const key = await tree.findKeyByIndex(i);
        expect(key).to.equal(entry.key, i);
      }
      for (let i = 0; i < total / 2; i++) {
        const randomIndex = Math.floor(random.next() * localArray.length);
        const item = JSON.parse(JSON.stringify(localArray[randomIndex]));

        const valExists = await tree.exists(item.value);
        expect(valExists).to.equal(true, item.key, item.value);
        const keyExists = await tree.keyExists(item.key, item.value);
        expect(keyExists).to.equal(true, item.key, item.value);

        await tree.remove(item.key, item.value);
        const change = 1 + Math.floor(random.next() * 100);
        item.value += change;

        localArray.splice(randomIndex, 1);
        localArray.push(item);
        await tree.insert(item.key, item.value);
      }
      localArray = sort(localArray);

      // console.log('round 2');
      // localArray.forEach((a, i) =>
      //   console.log(`js: ${i}: ${a.key} ${a.value} ${a.i}`)
      // );
      // for (let i = 0; i < localArray.length; i++) {
      //   const [key, value] = await tree.findKeyValueByIndex(i);
      //   console.log(`sol: ${i}: ${key} ${value} ${nonce}`);
      // }
      // await tree.visualizeTree();
      console.dir({ localArray }, { depth: null });
      for (let i = 0; i < localArray.length; i++) {
        const key = await tree.findKeyByIndex(i);
        console.log(`${i}: ${key} ${localArray[i].key}`);
        expect(key).to.equal(localArray[i].key, i);
      }

      for (let i = 0; i < total / 2; i++) {
        const randomIndex = Math.floor(random.next() * localArray.length);
        const item = localArray[randomIndex];
        await tree.remove(item.key, item.value);
        localArray.splice(randomIndex, 1);
      }
      expect(localArray.length).to.equal(total / 2);

      localArray = sort(localArray);
      // console.log({ localArray });

      // for (let i = 0; i < localArray.length; i++) {
      //   console.log({ i });
      //   const [key, value] = await tree.findKeyValueByIndex(i);
      //   console.log(`${i}: ${key} ${value}`);
      // }

      for (let i = 0; i < localArray.length; i++) {
        const key = await tree.findKeyByIndex(i);
        expect(key).to.equal(localArray[i].key, i);
      }
    } catch (e) {
      console.log({ seed });
      throw e;
    }
  });

  it('should have valueKeyAtIndex(value,0) match findKeyByIndex(0) for highest value', async () => {
    // Insert values in non-sequential order with multiple keys per value
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 150);
    await tree.insert(ethers.id('key4'), 150);
    await tree.insert(ethers.id('key5'), 50);

    // Get the highest value's first key using both methods
    const highestValue = await tree.last(); // Should be 150
    expect(highestValue).to.equal(150);
    const lowestValue = await tree.first(); // Should be 50
    expect(lowestValue).to.equal(50);
    const valueFirstKey = await tree.valueKeyAtIndex(lowestValue, 0);
    const globalFirstKey = await tree.findKeyByIndex(0);

    // Verify they match
    expect(valueFirstKey).to.equal(globalFirstKey);
    expect(valueFirstKey).to.equal(ethers.id('key5'));

    // Add a new highest value and verify again
    await tree.insert(ethers.id('key6'), 200);

    const newHighestValue = await tree.last(); // Should be 200
    expect(newHighestValue).to.equal(200);
    const newValueFirstKey = await tree.valueKeyAtIndex(newHighestValue, 0);
    const count = await tree.count();
    const newGlobalLastKey = await tree.findKeyByIndex(count - 1n);

    expect(newValueFirstKey).to.equal(newGlobalLastKey);
    expect(newValueFirstKey).to.equal(ethers.id('key6'));
  });

  it.only('should maintain reasonable gas costs as tree grows', async () => {
    const sampleSizes = [10, 50, 100, 200, 500, 1000];
    const results = {};
    let treeValues = []; // Store all values for cleanup
    const seed = 194575; // Math.floor(Math.random() * 1000000); // 678426
    const random = new DeterministicRandom(seed);

    // for (let i = 0; i < (10 + 50) * 4; i++) {
    //   random.next();
    // }
    try {
      for (const size of sampleSizes) {
        console.log(
          `----------------------------------------------------------------try with size ${size}----------------------------------------------------------------`
        );
        results[size] = {
          insertCosts: [],
          removeCosts: [],
          rankCosts: [],
          atIndexCosts: [],
        };

        // Insert elements in random order
        const values = Array.from({ length: size }, (_, i) => ({
          key: ethers.id(`key${i}`),
          value: Math.floor((random.next() * size) / 3) + 1,
        }));
        treeValues = treeValues.concat(values); // Store for cleanup

        // Measure insert costs
        for (const { key, value } of values) {
          console.log(`inserting ${key} - ${value}`);
          // const valueIndex = await tree.findIndexByValue(value);
          // const keyCount = await tree.getNodeKeysLength(value);
          // for (let i = 0; i < keyCount; i++) {
          //   const key = await tree.valueKeyAtIndex(value, i);
          //   console.log(`${value} - ${i} - ${key}`);
          // }

          const tx = await tree.insert(key, value);
          const receipt = await tx.wait();
          if (
            key ==
              '0x07866cdcaba10ff7ee2dc0e8e2b0e6c9e035c12c00fe61c50c6a42dc8f7ddcef' &&
            value == 13
          ) {
            console.log('LUCKY NUMBER');
            const exists = await tree.keyExists(key, value);
            expect(exists).to.equal(true);
            // const valueIndex = await tree.findIndexByValue(value);
            const keyCount = await tree.getNodeKeysLength(value);
            for (let i = 0; i < keyCount; i++) {
              const key = await tree.valueKeyAtIndex(value, i);
              console.log(`${value} - ${i} - ${key}`);
            }
          }
          results[size].insertCosts.push(receipt.gasUsed);
        }

        // Measure findIndexByValue lookup costs for random elements
        for (let i = 0; i < Math.min(20, size); i++) {
          const randomValue =
            values[Math.floor(random.next() * values.length)].value;
          const gasUsed = await tree.findIndexByValue.estimateGas(randomValue);
          results[size].rankCosts.push(gasUsed);
        }

        // Measure atIndex costs for random indices
        for (let i = 0; i < Math.min(20, size); i++) {
          const randomIndex = Math.floor(random.next() * size);
          const gasUsed = await tree.findValueByIndex.estimateGas(randomIndex);
          results[size].atIndexCosts.push(gasUsed);
        }

        const valuesWithRemovedElements = [...values];

        // Remove random elements and measure costs
        const shuffled = [...values].sort(() => random.next() - 0.5);
        for (let i = 0; i < Math.min(50, size); i++) {
          const { key, value } = shuffled[i];
          console.log(`randomly removing ${key} - ${value}`);
          // if (size == 200) {
          //   const exists = await tree.keyExists(
          //     '0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436',
          //     46
          //   );
          //   expect(exists).to.equal(true);
          //   console.log('it exists');
          // }
          const index = valuesWithRemovedElements.findIndex(
            (v) => v.key == key && v.value == value
          );
          if (index < 0) {
            throw new Error(
              `didn't find ${key} - ${value} in valuesWithRemovedElements`
            );
          }
          valuesWithRemovedElements.splice(index, 1);
          const tx = await tree.remove(key, value);
          const receipt = await tx.wait();
          results[size].removeCosts.push(receipt.gasUsed);
        }

        // Calculate and log averages
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
        const avgRank = Math.floor(
          parseInt(
            results[size].rankCosts.reduce((a, b) => a + b, 0n) /
              BigInt(results[size].rankCosts.length)
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
        const maxRank = Math.max(...results[size].rankCosts.map(Number));
        const maxAtIndex = Math.max(...results[size].atIndexCosts.map(Number));

        const minInsert = Math.min(...results[size].insertCosts.map(Number));
        const minRemove = Math.min(...results[size].removeCosts.map(Number));
        const minRank = Math.min(...results[size].rankCosts.map(Number));
        const minAtIndex = Math.min(...results[size].atIndexCosts.map(Number));

        console.log(`\nTree size: ${size}`);
        console.log(`Average insert gas: ${avgInsert}`);
        console.log(`Average remove gas: ${avgRemove}`);
        console.log(`Average findIndexByValue lookup gas: ${avgRank}`);
        console.log(`Average atIndex lookup gas: ${avgAtIndex}`);
        console.log(`Max insert gas: ${maxInsert}`);
        console.log(`Max remove gas: ${maxRemove}`);
        console.log(`Max findIndexByValue lookup gas: ${maxRank}`);
        console.log(`Max atIndex lookup gas: ${maxAtIndex}`);
        console.log(`Min insert gas: ${minInsert}`);
        console.log(`Min remove gas: ${minRemove}`);
        console.log(`Min findIndexByValue lookup gas: ${minRank}`);
        console.log(`Min atIndex lookup gas: ${minAtIndex}`);

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

        let treeCount = await tree.count();
        expect(treeCount).to.equal(valuesWithRemovedElements.length);

        // Clear the tree
        for (const { key, value } of valuesWithRemovedElements) {
          console.log(`about to systematically remove ${key} - ${value}`);

          if (size == 200) {
            const exists = await tree.keyExists(
              '0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436',
              46
            );
            expect(exists).to.equal(true);
            console.log('it exists before removal!!!');
          }
          try {
            await tree.remove(key, value);
          } catch (e) {
            console.error(e);
            console.log(`error to remove ${key} - ${value}`);
            // Ignore errors for already removed values
          }

          if (size == 200) {
            const exists = await tree.keyExists(
              '0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436',
              46
            );
            expect(exists).to.equal(true);
            console.log('it exists after removal!!!');
          }
        }
        treeCount = await tree.count();
        if (treeCount > 0) {
          for (let j = 0; j < treeCount; j++) {
            const [key, value] = await tree.findKeyValueByIndex(j);
            console.log(`${j}: ${key} ${value}`);
          }
        }
        expect(treeCount).to.equal(0);
      }

      // Test complex sorting scenarios
      console.log('\nTesting complex sorting scenarios...');

      // Test scenario 1: Insert many duplicate values
      console.log('Scenario 1: Multiple keys with same value');
      const tx1Start = await tree.insert(ethers.id('start'), 100);
      const receipt1Start = await tx1Start.wait();
      const gasStart = receipt1Start.gasUsed;

      for (let i = 0; i < 20; i++) {
        const tx = await tree.insert(ethers.id(`dup${i}`), 100);
        const receipt = await tx.wait();
        console.log(`Insert duplicate ${i} gas: ${receipt.gasUsed}`);
        // Gas cost for inserting duplicates should be relatively constant
        expect(receipt.gasUsed).to.be.lessThan(
          Math.floor(parseInt(gasStart) * 1.5)
        );
      }

      // Test scenario 2: Alternating high/low values to force rotations
      console.log('\nScenario 2: Alternating high/low values');
      for (let i = 0; i < 20; i++) {
        const value = i % 2 === 0 ? i * 1000 : i;
        if (value == 0) continue;
        const tx = await tree.insert(ethers.id(`alt${i}`), value);
        const receipt = await tx.wait();
        console.log(
          `Insert alternating ${i} (${value}) gas: ${receipt.gasUsed}`
        );
      }

      // Test scenario 3: Rapid insert/remove operations
      console.log('\nScenario 3: Rapid insert/remove operations');
      const rapidValues = [];
      for (let i = 0; i < 20; i++) {
        const value = Math.floor(random.next() * 1000) + 1;
        rapidValues.push({ index: i, key: ethers.id(`rapid${i}`), value });
        const tx1 = await tree.insert(ethers.id(`rapid${i}`), value);
        const receipt1 = await tx1.wait();
        console.log(`Rapid insert ${i}:${value} gas: ${receipt1.gasUsed}`);
        if (i > 0) {
          const {
            index,
            key: removeKey,
            value: removeValue,
          } = rapidValues[Math.floor(random.next() * rapidValues.length)];
          try {
            const tx2 = await tree.remove(removeKey, removeValue);
            const receipt2 = await tx2.wait();
            console.log(
              `Rapid insert/remove key:${index}'s gas - Insert: ${receipt1.gasUsed}, Remove: ${receipt2.gasUsed}`
            );
            const rapidIndex = rapidValues.findIndex((v) => v.index == index);
            rapidValues.splice(rapidIndex, 1);
          } catch (e) {
            console.error(
              `${index} key and  ${removeValue} value did not exist`
            );
          }
        }
      }
    } catch (e) {
      console.log({ seed });
      throw e;
    }
  });

  it.skip('should repeat the burns from mainnet and check whether theres an error', async () => {
    const url = `https://api.indexsupply.net/query?query=SELECT+%0A+%22to%22%2C+tokenid%2C+points%2C+block_num%2C+log_idx%0AFROM+%0A++pointsrewarded%0AWHERE%0A++address+%3D+0x3CF554831E309Be39A541080b82bD81b6409C012%0AORDER+BY+block_num+ASC%2C+log_idx+ASC%0A&event_signatures=PointsRewarded%28address+indexed+to%2Cuint256+indexed+tokenId%2Cint256+points%29&chain=984122`;
    const response = await fetch(url);
    const data = await response.json();
    const allPoints = data.result[0].splice(1);
    const players = {};
    const addressToBytes32 = (address) => {
      return ethers.zeroPadValue(ethers.getAddress(address), 32);
    };
    const bytes32ToAddress = (bytes32) => {
      // Take the last 40 characters (20 bytes) of the bytes32 value
      const addressHex = bytes32.slice(-40);
      return ('0x' + addressHex).toLowerCase();
    };
    for (let i = 0; i < allPoints.length; i++) {
      const point = allPoints[i];
      const [to, tokenid, points, block_num, log_idx] = point;
      const toKey = addressToBytes32(to);
      if (!players[to]) {
        players[to] = {
          points,
          lastUpdated: i,
        };
      } else {
        const previousPoints = players[to].points;
        console.log(`removing ${to} - ${previousPoints}`);

        await tree.remove(toKey, previousPoints);
        players[to].points = parseInt(players[to].points) + parseInt(points);
        players[to].lastUpdated = i;
      }
      const currentPoints = players[to].points;
      console.log(
        `inserting ${to} - ${currentPoints} - ${i}/${allPoints.length}`
      );
      await tree.insert(toKey, currentPoints);
      if (i > 164 && i % 1000 == 0) {
        const [playerAsBytes32, value] = await tree.findKeyValueByIndex(164);
        const player = bytes32ToAddress(playerAsBytes32);
        const foundPlayer = players[player];
        if (!foundPlayer) {
          console.log(`player not found ${player} with value ${value}`);
          throw new Error('not found');
        }
        expect(foundPlayer.points).to.equal(value);
      }
    }
    const playerCount = Object.keys(players).length;
    for (let i = 0; i < playerCount; i++) {
      try {
        const [playerAsBytes32, value] = await tree.findKeyValueByIndex(i);
        const player = bytes32ToAddress(playerAsBytes32);
        const foundPlayer = players[player];
        if (!foundPlayer) {
          console.log(`player not found ${player} with value ${value}`);
          throw new Error('not found');
        }
        expect(foundPlayer.points).to.equal(value);
      } catch (e) {
        console.log(`error at index ${i}`);
        console.log(e);
      }
    }
  });
});
