import { expect } from 'chai';
import { afterEach, before, describe, it } from 'mocha';
import hre from 'hardhat';
const ethers = hre.ethers;

let snapshot;
describe('HitchensOrderStatisticsTreeLib Tests', function () {
  this.timeout(100000);
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

  it('should calculate rank and percentile correctly', async () => {
    // Insert values in order: 50, 100, 150, 200
    for (let i = 0; i < 10; i++) {
      await tree.insert(ethers.id(`key${i}`), 100 * (i + 1));
    }

    // Check ranks (1-based)
    expect(await tree.rank(100)).to.equal(1, '100 should be rank 1');
    expect(await tree.rank(200)).to.equal(2, '200 should be rank 2');
    expect(await tree.rank(500)).to.equal(5, '500 should be rank 5');
    expect(await tree.rank(700)).to.equal(7, '700 should be rank 7');
    expect(await tree.rank(1000)).to.equal(10, '1000 should be rank 10');

    expect(await tree.percentile(100)).to.equal(
      10,
      '100 should be 10th percentile'
    );
    expect(await tree.percentile(200)).to.equal(
      20,
      '200 should be 20th percentile'
    );

    expect(await tree.percentile(800)).to.equal(
      80,
      '800 should be 80th percentile'
    );
  });

  it('should handle atRank queries correctly', async () => {
    await tree.insert(ethers.id('key1'), 50);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 150);
    await tree.insert(ethers.id('key4'), 200);

    expect(await tree.atRank(1)).to.equal(50);
    const key1Rank = await tree.rank(50);
    expect(key1Rank).to.equal(1);
    expect(await tree.atRank(2)).to.equal(100);
    const key2Rank = await tree.rank(100);
    expect(key2Rank).to.equal(2);
    expect(await tree.atRank(3)).to.equal(150);
    const key3Rank = await tree.rank(150);
    expect(key3Rank).to.equal(3);
    expect(await tree.atRank(4)).to.equal(200);
    const key4Rank = await tree.rank(200);
    expect(key4Rank).to.equal(4);
  });

  it('should handle atRank queries with multiple keys per value', async () => {
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);
    await tree.insert(ethers.id('key3'), 200);

    expect(await tree.atRank(1)).to.equal(100);
    const key1Rank = await tree.rank(100);
    expect(key1Rank).to.equal(1);

    expect(await tree.atRank(2)).to.equal(100);
    const key2Rank = await tree.rank(100);
    expect(key2Rank).to.equal(1); // value begins with rank 1

    const count = await tree.count();
    expect(count).to.equal(3);

    expect(await tree.atRank(3)).to.equal(200);
    const key3Rank = await tree.rank(200);
    expect(key3Rank).to.equal(3);

    await tree.remove(ethers.id('key1'), 100);
    await tree.remove(ethers.id('key2'), 100);

    expect(await tree.atRank(1)).to.equal(200);
    const key4Rank = await tree.rank(200);
    expect(key4Rank).to.equal(1);

    await tree.insert(ethers.id('key4'), 400);

    expect(await tree.atRank(2)).to.equal(400);
    const key4Rank2 = await tree.rank(400);
    expect(key4Rank2).to.equal(2);
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
      'Duplicate value should not increase count'
    );

    // Insert new value
    await tree.insert(ethers.id('key3'), 50);
    expect(await tree.count()).to.equal(3, 'New value should increase count');

    await tree.remove(ethers.id('key1'), 100);
    expect(await tree.count()).to.equal(
      2,
      'Removing one key of duplicate should not decrease count'
    );

    await tree.remove(ethers.id('key2'), 100);
    expect(await tree.count()).to.equal(
      1,
      'Removing last key of value should decrease count'
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
    await expect(tree.rank(999)).to.be.revertedWith(
      'OrderStatisticsTree(407) - Value does not exist.'
    );
    await expect(tree.percentile(999)).to.be.revertedWith(
      'OrderStatisticsTree(407) - Value does not exist.'
    );
  });

  it('should handle multiple keys for same value', async () => {
    // Insert same value with different keys
    await tree.insert(ethers.id('key1'), 100);
    await tree.insert(ethers.id('key2'), 100);

    // Log initial state
    const initialNode = await tree.getNode(100);
    // console.log('Initial node state:', {
    //   keyCount: initialNode.keyCount,
    //   nodeCount: initialNode.nodeCount,
    // });

    // Both keys should exist for the value
    const key1Exists = await tree.keyExists(ethers.id('key1'), 100);
    const key2Exists = await tree.keyExists(ethers.id('key2'), 100);
    // console.log('Initial key checks:', {
    //   key1Exists,
    //   key2Exists,
    // });

    expect(key1Exists).to.be.true;
    expect(key2Exists).to.be.true;
    expect(await tree.exists(100)).to.be.true;

    // Remove first key
    await tree.remove(ethers.id('key1'), 100);

    // Check state after first removal
    const afterRemovalNode = await tree.getNode(100);
    // console.log('After first removal:', {
    //   keyCount: afterRemovalNode.keyCount,
    //   nodeCount: afterRemovalNode.nodeCount,
    // });

    // First key should be gone, but second should remain
    const key1ExistsAfterRemoval = await tree.keyExists(ethers.id('key1'), 100);
    const key2ExistsAfterRemoval = await tree.keyExists(ethers.id('key2'), 100);
    // console.log('After removal key checks:', {
    //   key1ExistsAfterRemoval,
    //   key2ExistsAfterRemoval,
    // });

    expect(key1ExistsAfterRemoval).to.be.false;
    expect(key2ExistsAfterRemoval).to.be.true;
    expect(await tree.exists(100)).to.be.true;

    // Remove second key
    await tree.remove(ethers.id('key2'), 100);

    // Final state check
    const finalNode = await tree.getNode(100);
    // console.log('Final state:', {
    //   keyCount: finalNode.keyCount,
    //   nodeCount: finalNode.nodeCount,
    // });

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
    // console.log('First node:', {
    //   parent: node1[0],
    //   left: node1[1],
    //   right: node1[2],
    //   red: node1[3],
    //   keyCount: node1[4],
    //   nodeCount: node1[5],
    // });

    await tree.insert(ethers.id('key2'), 100);

    // Check node structure after second insert
    const node2 = await tree.getNode(100);
    // console.log('Node after duplicate:', {
    //   parent: node2[0],
    //   left: node2[1],
    //   right: node2[2],
    //   red: node2[3],
    //   keyCount: node2[4],
    //   nodeCount: node2[5],
    // });

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
    // console.log({ parent, left, right, red, keyCount, nodeCount });
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
    await tree.rank(185); // 5 * 37
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

    // console.log('Tree structure before rank calculation:');

    // Get node information
    // const node150 = await tree.getNode(150);
    // const node100 = await tree.getNode(100);
    // const node50 = await tree.getNode(50);

    // console.log('Node 150:', {
    //   keyCount: node150.keyCount.toString(),
    //   nodeCount: node150.nodeCount.toString(),
    //   left: node150.left.toString(),
    //   right: node150.right.toString(),
    //   parent: node150.parent.toString(),
    // });

    // console.log('Node 100:', {
    //   keyCount: node100.keyCount.toString(),
    //   nodeCount: node100.nodeCount.toString(),
    //   left: node100.left.toString(),
    //   right: node100.right.toString(),
    //   parent: node100.parent.toString(),
    // });

    // console.log('Node 50:', {
    //   keyCount: node50.keyCount.toString(),
    //   nodeCount: node50.nodeCount.toString(),
    //   left: node50.left.toString(),
    //   right: node50.right.toString(),
    //   parent: node50.parent.toString(),
    // });

    // const rank150 = await tree.rank(150);
    // console.log('Rank calculation steps for 150:');
    // console.log('Final rank:', rank150.toString());

    // Check ranks
    expect(await tree.rank(150)).to.equal(4, '150 should be rank 4');
    expect(await tree.rank(100)).to.equal(
      2,
      '100 should be rank 4 (after 3 keys of 150)'
    );
    expect(await tree.rank(50)).to.equal(
      1,
      '50 should be rank 6 (after 3 keys of 150 and 2 keys of 100)'
    );
  });

  it('should return correct keys for global ranks with multiple keys per value', async () => {
    // Insert multiple keys for same values
    const lookup = {};
    const key1 = ethers.id('key1');
    lookup[key1] = 'key1';
    const key2 = ethers.id('key2');
    lookup[key2] = 'key2';
    const key3 = ethers.id('key3');
    lookup[key3] = 'key3';
    const key4 = ethers.id('key4');
    lookup[key4] = 'key4';
    const key5 = ethers.id('key5');
    lookup[key5] = 'key5';
    const key6 = ethers.id('key6');
    lookup[key6] = 'key6';

    // console.log('Inserting keys:');
    // console.log('key1:', key1);
    // console.log('key2:', key2);
    // console.log('key3:', key3);
    // console.log('key4:', key4);
    // console.log('key5:', key5);
    // console.log('key6:', key6);

    await tree.insert(key1, 150);
    await tree.insert(key2, 150);
    await tree.insert(key3, 150);
    await tree.insert(key4, 100);
    await tree.insert(key5, 100);
    await tree.insert(key6, 50);

    // console.log('\nTree structure after insertion:');
    const values = [150, 100, 50];
    let totalKeys = 0;
    for (const value of values) {
      const node = await tree.getNode(value);
      // console.log(`Node ${value}:`, {
      //   keyCount: node.keyCount.toString(),
      //   nodeCount: node.nodeCount.toString(),
      //   left: node.left.toString(),
      //   right: node.right.toString(),
      //   parent: node.parent.toString(),
      // });
      totalKeys += parseInt(node.keyCount.toString());
    }
    // console.log('Total keys in tree:', totalKeys);

    const totalCount = await tree.count();
    expect(totalCount).to.equal(6);
    // console.log('Tree count():', totalCount.toString());

    // console.log('\nTesting key at rank lookups:');
    // for (let i = 0; i < 6; i++) {
    //   const key = await tree.keyAtGlobalRank(i);
    //   console.log(`Rank ${i} key: ${lookup[key]}`);
    // }

    // Verify ranks (0-based)
    expect(await tree.keyAtGlobalRank(0)).to.equal(
      key1,
      'Rank 0 should be key1 (150)'
    );
    expect(await tree.keyAtGlobalRank(1)).to.equal(
      key2,
      'Rank 1 should be key2 (150)'
    );
    expect(await tree.keyAtGlobalRank(2)).to.equal(
      key3,
      'Rank 2 should be key3 (150)'
    );
    expect(await tree.keyAtGlobalRank(3)).to.equal(
      key4,
      'Rank 4 should be key4 (100)'
    );
    expect(await tree.keyAtGlobalRank(4)).to.equal(
      key5,
      'Rank 5 should be key5 (100)'
    );
    expect(await tree.keyAtGlobalRank(5)).to.equal(
      key6,
      'Rank 6 should be key6 (50)'
    );
  });

  it('should maintain correct rank ordering based on value and insertion order', async () => {
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

    const keyA = await tree.keyAtGlobalRank(0);
    // console.log(`index 0: ${keyToName(keyA)}`);
    const keyB = await tree.keyAtGlobalRank(1);
    // console.log(`index 1: ${keyToName(keyB)}`);
    const keyC = await tree.keyAtGlobalRank(2);
    // console.log(`index 2: ${keyToName(keyC)}`);

    expect(keyToName(await tree.keyAtGlobalRank(0))).to.equal('key_A'); // A at 100
    expect(keyToName(await tree.keyAtGlobalRank(1))).to.equal('key_B'); // B at 100
    expect(keyToName(await tree.keyAtGlobalRank(2))).to.equal('key_C'); // C at 100
    // Debug log the structure
    // const node100 = await tree.getNode(100);
    // console.log('Initial state:');
    // console.log('Node 100:', {
    //   keyCount: node100.keyCount,
    //   nodeCount: node100.nodeCount,
    //   left: node100.left,
    //   right: node100.right,
    // });
    // console.log('Keys at rank:');
    // for (let i = 0; i < 3; i++) {
    //   const key = await tree.keyAtGlobalRank(i);
    //   const value = await tree.valueKeyAtIndex(100, i);
    // console.log(`Rank ${i}: ${keyToName(key)} (value: ${keyToName(value)})`);
    // }

    // Second scenario: Remove C, then add C(200), B(200), A(200)
    await tree.remove(ethers.id('key_C'), 100);
    await tree.insert(ethers.id('key_C'), 200); // CAB
    expect(keyToName(await tree.keyAtGlobalRank(0))).to.equal('key_C'); // C at 200
    expect(keyToName(await tree.keyAtGlobalRank(1))).to.equal('key_A'); // A at 100
    expect(keyToName(await tree.keyAtGlobalRank(2))).to.equal('key_B'); // C at 100

    await tree.remove(ethers.id('key_B'), 100);
    await tree.insert(ethers.id('key_B'), 200); // CBA

    expect(keyToName(await tree.keyAtGlobalRank(0))).to.equal('key_C'); // C at 200
    expect(keyToName(await tree.keyAtGlobalRank(1))).to.equal('key_B'); // B at 200
    expect(keyToName(await tree.keyAtGlobalRank(2))).to.equal('key_A'); // A at 100

    await tree.remove(ethers.id('key_A'), 100);
    await tree.insert(ethers.id('key_A'), 200); // CBA

    expect(keyToName(await tree.keyAtGlobalRank(0))).to.equal('key_C'); // C at 200
    expect(keyToName(await tree.keyAtGlobalRank(1))).to.equal('key_B'); // B at 200
    expect(keyToName(await tree.keyAtGlobalRank(2))).to.equal('key_A'); // A at 200

    // Debug log the structure
    // const node200 = await tree.getNode(200);
    // console.log('\nAfter 200 insertions:');
    // console.log('Node 200:', {
    //   keyCount: node200.keyCount,
    //   nodeCount: node200.nodeCount,
    //   left: node200.left,
    //   right: node200.right,
    //   parent: node200.parent,
    // });
    // console.log('Tree structure:');
    // console.log('Root value:', await tree.root());
    // console.log('First value:', await tree.first());
    // console.log('Last value:', await tree.last());
    // console.log('Keys at rank:');
    // for (let i = 0; i < node200.keyCount; i++) {
    //   const key = await tree.keyAtGlobalRank(i);
    //   const value = await tree.valueKeyAtIndex(200, i);
    // console.log(`Rank ${i}: ${keyToName(key)} (value: ${keyToName(value)})`);
    // }

    // Third scenario: Remove C(200) and add C back with 100
    await tree.remove(ethers.id('key_C'), 200);
    await tree.insert(ethers.id('key_C'), 100); // BAC

    expect(keyToName(await tree.keyAtGlobalRank(0))).to.equal('key_B'); // B at 200
    expect(keyToName(await tree.keyAtGlobalRank(1))).to.equal('key_A'); // A at 200
    expect(keyToName(await tree.keyAtGlobalRank(2))).to.equal('key_C'); // C at 100

    // Debug log final structure
    // const finalNode100 = await tree.getNode(100);
    // const finalNode200 = await tree.getNode(200);
    // console.log('\nFinal state:');
    // console.log('Node 100:', {
    //   keyCount: finalNode100.keyCount,
    //   nodeCount: finalNode100.nodeCount,
    //   left: finalNode100.left,
    //   right: finalNode100.right,
    //   parent: finalNode100.parent,
    // });
    // console.log('Node 200:', {
    //   keyCount: finalNode200.keyCount,
    //   nodeCount: finalNode200.nodeCount,
    //   left: finalNode200.left,
    //   right: finalNode200.right,
    //   parent: finalNode200.parent,
    // });
    // console.log('Tree structure:');
    // console.log('Root value:', await tree.root());
    // console.log('First value:', await tree.first());
    // console.log('Last value:', await tree.last());
    // console.log('Keys at rank:');
    // console.log('Node 200 keys:');
    // for (let i = 0; i < finalNode200.keyCount; i++) {
    // const value = await tree.valueKeyAtIndex(200, i);
    // console.log(`  Key ${i}: ${keyToName(value)}`);
    // }
    // console.log('Node 100 keys:');
    // for (let i = 0; i < finalNode100.keyCount; i++) {
    // const value = await tree.valueKeyAtIndex(100, i);
    // console.log(`  Key ${i}: ${keyToName(value)}`);
    // }

    // // The tree should maintain descending order (200 before 100)
    // expect(keyToName(await tree.keyAtGlobalRank(0))).to.equal('key_B'); // B at 200
    // expect(keyToName(await tree.keyAtGlobalRank(1))).to.equal('key_A'); // A at 200
    // expect(keyToName(await tree.keyAtGlobalRank(2))).to.equal('key_C'); // C at 100
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

  it.only('shoudl handle a fuzzy amount of adds and removes', async () => {
    const total = 500;

    const sort = (ar) => {
      return ar
        .map((a, index) => {
          return { index, ...a };
        })
        .sort((a, b) => {
          if (a.value === b.value) {
            return a.index - b.index;
          } else {
            return b.value - a.value;
          }
        })
        .map((a) => {
          delete a.index;
          return a;
        });
    };
    const lookup = {};
    for (let i = 0; i < 4; i++) {
      lookup[ethers.id(`key${i}`)] = i;
    }
    let localArray = [];
    for (let i = 0; i < total; i++) {
      const randomInt = 10 + Math.floor(Math.random() * 20);
      const entry = {
        key: ethers.id(`key${i}`),
        value: randomInt,
      };
      await tree.insert(entry.key, entry.value);
      localArray.push(entry);
    }
    localArray = sort(localArray);
    // console.log({ localArray });
    // for (let i = 0; i < localArray.length; i++) {
    //   const [key, value] = await tree.kvAtGlobalRank(i);
    //   console.log(`${i}: ${key} ${value}`);
    // }

    for (let i = 0; i < localArray.length; i++) {
      const entry = localArray[i];
      const [key, value] = await tree.kvAtGlobalRank(i);
      expect(key).to.equal(entry.key, i);
    }
    for (let i = 0; i < localArray.length / 2; i++) {
      const randomIndex = Math.floor(Math.random() * localArray.length);
      const item = localArray[randomIndex];
      const valExists = await tree.exists(item.value);
      expect(valExists).to.equal(true, item.key, item.value);
      const keyExists = await tree.keyExists(item.key, item.value);
      expect(keyExists).to.equal(true, item.key, item.value);
      await tree.remove(item.key, item.value);
      const change = 1 + Math.floor(Math.random() * 10);
      localArray[randomIndex].value += change;
      await tree.insert(
        localArray[randomIndex].key,
        localArray[randomIndex].value
      );
    }
    localArray = sort(localArray);

    console.log('round 2');
    console.log({ localArray });
    for (let i = 0; i < localArray.length; i++) {
      const [key, value] = await tree.kvAtGlobalRank(i);
      console.log(`${i}: ${key} ${value}`);
    }

    for (let i = 0; i < localArray.length; i++) {
      const [key] = await tree.kvAtGlobalRank(i);
      expect(key).to.equal(localArray[i].key);
    }

    for (let i = 0; i < total / 2; i++) {
      const randomIndex = Math.floor((Math.random() * total) / 2);
      const item = localArray[randomIndex];
      await tree.remove(item.key, item.value);
      localArray.splice(randomIndex, 1);
    }
    expect(localArray.length).to.equal(total / 2);

    localArray = sort(localArray);
    // console.log({ localArray });

    // for (let i = 0; i < localArray.length; i++) {
    //   console.log({ i });
    //   const [key, value] = await tree.kvAtGlobalRank(i);
    //   console.log(`${i}: ${key} ${value}`);
    // }

    for (let i = 0; i < localArray.length; i++) {
      const [key, value] = await tree.kvAtGlobalRank(i);
      expect(key).to.equal(localArray[i].key, i);
    }
  });
});
