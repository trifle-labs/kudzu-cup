// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.0;

import "../LLRBT.sol";
import "hardhat/console.sol";
contract LLRBTTest {
    using LLRBT for LLRBT.Tree;
    
    LLRBT.Tree private tree;

    function init() public {
        tree.init();
    }

    function getDataByIndex(uint256 index) public view returns (bytes32) {
        return tree.getDataByIndex(index);
    }

    function replace(uint256 value, bytes32 data) public {
        tree.replace(value, data);
    }

    function replaceBulk(uint256[] memory values, bytes32[] memory data) public {
        tree.replaceBulk(values, data);
    }

    function insert(uint256 value, bytes32 data) public {
        tree.insert(value, data);
    }

    function insertBulk(uint256[] memory values, bytes32[] memory data) public {
        tree.insertBulk(values, data);
    }

    function insertWithAddress(uint256 value, address addr) public {
        tree.insertWithAddress(value, addr);
    }

    function remove(uint256 value, bytes32 data) public {
        tree.remove(value, data);
    }

    function contains(uint256 value) public view returns (bool) {
        return tree.contains(value);
    }

    function getIndex(uint256 value, bytes32 data) public view returns (uint256) {
        return tree.getIndex(value, data);
    }

    function min() public view returns (uint256) {
        return tree.min();
    }

    function max() public view returns (uint256) {
        return tree.max();
    }



    function size() public view returns (uint256) {
        return tree.size();
    }
} 