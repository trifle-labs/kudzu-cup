// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../HitchensOrderStatisticsTreeLib.sol";
import "hardhat/console.sol";

contract TreeTest {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;
    HitchensOrderStatisticsTreeLib.Tree public tree;
    
    
    constructor() {
        console.log('deploying tree');
    }
    
    function insert(bytes32 key, uint value) public {
        tree.insert(key, value);
    }
    
    function remove(bytes32 key, uint value) public {
        tree.remove(key, value);
    }
    
    function exists(uint value) public view returns (bool) {
        return tree.exists(value);
    }
    
    function keyExists(bytes32 key, uint256 value) public view returns (bool) {
        return tree.keyExists(key, value);
    }
    
    function first() public view returns (uint) {
        return tree.first();
    }
    
    function last() public view returns (uint) {
        return tree.last();
    }
    
    function next(uint value) public view returns (uint) {
        return tree.next(value);
    }
    
    function prev(uint value) public view returns (uint) {
        return tree.prev(value);
    }
    
    function rank(uint value) public view returns (uint) {
        return tree.rank(value);
    }

    function kvAtGlobalRank(uint targetRank) public view returns (bytes32, uint) {
        return tree.keyAtGlobalRank(targetRank);
    }

    function keyAtGlobalRank(uint targetRank) public view returns (bytes32) {
        (bytes32 key, ) = tree.keyAtGlobalRank(targetRank);
        return key;
    }

    function valueAtGlobalRank(uint targetRank) public view returns (uint) {
        (, uint value) = tree.keyAtGlobalIndex(targetRank);
        return value;
    }

    function keyAtGlobalIndex(uint targetIndex) public view returns (bytes32) {
        (bytes32 key, ) = tree.keyAtGlobalIndex(targetIndex);
        return key;
    }
    function kvAtGlobalIndex(uint targetIndex) public view returns (bytes32, uint) {
        return tree.keyAtGlobalIndex(targetIndex);
    }

    // function getCurrentKey(uint value) public view returns (bytes32) {
    //     return tree.getCurrentKey(value);
    // }

    // function getTotalCount() public view returns (uint) {
    //     return tree.getTotalCount();
    // }
    
    function count() public view returns (uint) {
        return tree.count();
    }

    function root() public view returns(uint) {
        return tree.root;
    }
    
    function percentile(uint value) public view returns (uint) {
        return tree.percentile(value);
    }
    
    function atRank(uint _rank) public view returns (uint) {
        return tree.atRank(_rank);
    }

    function valueKeyAtIndex(uint value, uint index) public view returns (bytes32) {
        return tree.valueKeyAtIndex(value, index);
    }
    
    function getNode(uint value) public view returns (
        uint parent,
        uint left,
        uint right,
        bool red,
        uint keyCount,
        uint nodeCount
    ) {
        HitchensOrderStatisticsTreeLib.Node storage node = tree.nodes[value];
        return (
            node.parent,
            node.left,
            node.right,
            node.red,
            node.keys.length,
            node.count
        );
    }

} 