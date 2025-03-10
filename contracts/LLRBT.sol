// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.0;

import "hardhat/console.sol";

library LLRBT {
    // Node structure for the tree
    struct Node {
        uint256 value;     // The value used for ordering (previously key/item)
        uint256 left;      // Index of left child in the nodes array
        uint256 right;     // Index of right child in the nodes array
        bool black;        // Color of the node
        bytes32 data;      // Associated data (can be address or other data types)
        uint256 seq;       // Sequence number for FIFO ordering
    }

    // Tree structure
    struct Tree {
        bool initialized;
        Node[] nodes;      // Array to store all nodes
        uint256 root;      // Index of root node
        uint256 count;     // Number of nodes in the tree
        uint256 sequence;  // Global sequence counter
        mapping(uint256 => bool) used; // Track used array indices
        mapping(bytes32 => uint256) dataToSeq;
    }

    // Initialize a new tree
    function init(Tree storage self) internal {
        require(!self.initialized, "Tree already initialized");
        self.initialized = true;
        self.nodes.push(Node(0, 0, 0, true, bytes32(0), 0)); // Push dummy node at index 0
    }

    // Helper function to create a new node
    function newNode(Tree storage self, uint256 value, bytes32 data) private returns (uint256) {
        uint256 index = self.nodes.length;
        self.nodes.push(Node(value, 0, 0, false, data, 0));
        self.used[index] = true;
        return index;
    }

    // Check if a node is red
    function isRed(Tree storage self, uint256 nodeIndex) private view returns (bool) {
        if (nodeIndex == 0 || !self.used[nodeIndex]) return false;
        return !self.nodes[nodeIndex].black;
    }

    // Rotate left
    function rotateLeft(Tree storage self, uint256 h) private returns (uint256) {
        uint256 x = self.nodes[h].right;
        require(!self.nodes[x].black, "Rotating a black link");
        
        self.nodes[h].right = self.nodes[x].left;
        self.nodes[x].left = h;
        self.nodes[x].black = self.nodes[h].black;
        self.nodes[h].black = false;
        
        return x;
    }

    // Rotate right
    function rotateRight(Tree storage self, uint256 h) private returns (uint256) {
        uint256 x = self.nodes[h].left;
        require(!self.nodes[x].black, "Rotating a black link");
        
        self.nodes[h].left = self.nodes[x].right;
        self.nodes[x].right = h;
        self.nodes[x].black = self.nodes[h].black;
        self.nodes[h].black = false;
        
        return x;
    }

    // Flip colors
    function flip(Tree storage self, uint256 h) private {
        self.nodes[h].black = !self.nodes[h].black;
        self.nodes[self.nodes[h].left].black = !self.nodes[self.nodes[h].left].black;
        self.nodes[self.nodes[h].right].black = !self.nodes[self.nodes[h].right].black;
    }


    // Check if an item exists in the tree
    function contains(Tree storage self, uint256 value) internal view returns (bool) {
        uint256 current = self.root;
        while (current != 0 && self.used[current]) {
            if (value < self.nodes[current].value) {
                current = self.nodes[current].left;
            } else if (value > self.nodes[current].value) {
                current = self.nodes[current].right;
            } else {
                return true;
            }
        }
        return false;
    }

    // Get the number of nodres in the tree
    function size(Tree storage self) internal view returns (uint256) {
        return self.count;
    }

    // Get minimum element
    function min(Tree storage self) internal view returns (uint256) {
        uint256 h = self.root;
        if (h == 0 || !self.used[h]) {
            revert("Empty tree");
        }
        while (self.nodes[h].left != 0 && self.used[self.nodes[h].left]) {
            h = self.nodes[h].left;
        }
        return self.nodes[h].value;
    }

    // Get maximum element
    function max(Tree storage self) internal view returns (uint256) {
        uint256 h = self.root;
        if (h == 0 || !self.used[h]) {
            revert("Empty tree");
        }
        while (self.nodes[h].right != 0 && self.used[self.nodes[h].right]) {
            h = self.nodes[h].right;
        }
        return self.nodes[h].value;
    }

    // Delete specific item -> Remove specific item
    function remove(Tree storage self, uint256 value, bytes32 data) internal {
        if (!contains(self, value)) {
            return;
        }
        self.root = removeHelper(self, self.root, value, data);
        if (self.root != 0 && self.used[self.root]) {
            self.nodes[self.root].black = true;
        }
    }

    function removeHelper(Tree storage self, uint256 h, uint256 value, bytes32 data) private returns (uint256) {
        if (h == 0 || !self.used[h]) {
            return 0;
        }

        if (value < self.nodes[h].value) {
            if (self.nodes[h].left == 0 || !self.used[self.nodes[h].left]) {
                return h;
            }
            if (!isRed(self, self.nodes[h].left) && !isRed(self, self.nodes[self.nodes[h].left].left)) {
                h = moveRedLeft(self, h);
            }
            self.nodes[h].left = removeHelper(self, self.nodes[h].left, value, data);
        } else {
            if (isRed(self, self.nodes[h].left)) {
                h = rotateRight(self, h);
            }
            // If this is our target node (matching both value and data)
            if (value == self.nodes[h].value && data == self.nodes[h].data) {
                if (self.nodes[h].right == 0 || !self.used[self.nodes[h].right]) {
                    // If no right child, just remove this node
                    self.used[h] = false;
                    self.count--;
                    delete self.dataToSeq[self.nodes[h].data];
                    return 0;
                }
                // If has right child, replace with successor
                uint256 successor = findMin(self, self.nodes[h].right);
                self.nodes[h].value = self.nodes[successor].value;
                self.nodes[h].data = self.nodes[successor].data;
                self.nodes[h].seq = self.nodes[successor].seq;
                // Now remove the successor
                self.nodes[h].right = removeHelper(self, self.nodes[h].right, self.nodes[successor].value, self.nodes[successor].data);
            } else if (value == self.nodes[h].value) {
                // Same value but different data, keep searching in right subtree
                if (self.nodes[h].right != 0 && self.used[self.nodes[h].right] &&
                    !isRed(self, self.nodes[h].right) && 
                    !isRed(self, self.nodes[self.nodes[h].right].left)) {
                    h = moveRedRight(self, h);
                }
                self.nodes[h].right = removeHelper(self, self.nodes[h].right, value, data);
            } else {
                // Value is greater, continue in right subtree
                if (self.nodes[h].right != 0 && self.used[self.nodes[h].right] &&
                    !isRed(self, self.nodes[h].right) && 
                    !isRed(self, self.nodes[self.nodes[h].right].left)) {
                    h = moveRedRight(self, h);
                }
                self.nodes[h].right = removeHelper(self, self.nodes[h].right, value, data);
            }
        }

        return fixUp(self, h);
    }

    // Add helper function to find minimum node in a subtree
    function findMin(Tree storage self, uint256 h) private view returns (uint256) {
        if (h == 0 || !self.used[h]) {
            return 0;
        }
        while (self.nodes[h].left != 0 && self.used[self.nodes[h].left]) {
            h = self.nodes[h].left;
        }
        return h;
    }

    // Helper functions for deletion operations
    function moveRedLeft(Tree storage self, uint256 h) private returns (uint256) {
        flip(self, h);
        if (isRed(self, self.nodes[self.nodes[h].right].left)) {
            self.nodes[h].right = rotateRight(self, self.nodes[h].right);
            h = rotateLeft(self, h);
            flip(self, h);
        }
        return h;
    }

    function moveRedRight(Tree storage self, uint256 h) private returns (uint256) {
        flip(self, h);
        if (isRed(self, self.nodes[self.nodes[h].left].left)) {
            h = rotateRight(self, h);
            flip(self, h);
        }
        return h;
    }

    function fixUp(Tree storage self, uint256 h) private returns (uint256) {
        if (isRed(self, self.nodes[h].right)) {
            h = rotateLeft(self, h);
        }
        if (isRed(self, self.nodes[h].left) && isRed(self, self.nodes[self.nodes[h].left].left)) {
            h = rotateRight(self, h);
        }
        if (isRed(self, self.nodes[h].left) && isRed(self, self.nodes[h].right)) {
            flip(self, h);
        }
        return h;
    }

    // Add these new functions to handle data association:

    function replace(Tree storage self, uint256 value, bytes32 data) internal {
        require(contains(self, value), "Value does not exist");
        self.root = replaceHelper(self, self.root, value, data);
        self.nodes[self.root].black = true;
    }

    function replaceBulk(Tree storage self, uint256[] memory values, bytes32[] memory data) internal {
        require(values.length == data.length, "Values and data arrays must have the same length");
        for (uint256 i = 0; i < values.length; i++) {
            replace(self, values[i], data[i]);
        }
    }

    function replaceHelper(
        Tree storage self,
        uint256 h,
        uint256 value,
        bytes32 data
    ) private returns (uint256) {
        if (h == 0 || !self.used[h]) {
            uint256 index = self.nodes.length;
            self.nodes.push(Node({
                value: value,
                left: 0,
                right: 0,
                black: false,
                data: data,
                seq: 0
            }));
            self.used[index] = true;
            return index;
        }

        if (value < self.nodes[h].value) {
            self.nodes[h].left = replaceHelper(self, self.nodes[h].left, value, data);
        } else if (value > self.nodes[h].value) {
            self.nodes[h].right = replaceHelper(self, self.nodes[h].right, value, data);
        } else {
            self.nodes[h].data = data; // Update data if value exists
        }

        // Fix-up any right-leaning links
        if (isRed(self, self.nodes[h].right) && !isRed(self, self.nodes[h].left)) {
            h = rotateLeft(self, h);
        }
        if (isRed(self, self.nodes[h].left) && isRed(self, self.nodes[self.nodes[h].left].left)) {
            h = rotateRight(self, h);
        }
        if (isRed(self, self.nodes[h].left) && isRed(self, self.nodes[h].right)) {
            flip(self, h);
        }

        return h;
    }

    // Get data associated with a value
    function getIndex(Tree storage self, uint256 value, bytes32 data) internal view returns (uint256 h) {
        uint256 index = self.dataToSeq[data];
        h = self.root;
        while (h != 0 && self.used[h]) {
            console.log("checking h", h);
            console.log("value", self.nodes[h].value);
            console.log("data");
            console.logBytes32(self.nodes[h].data);
            if (value < self.nodes[h].value) {
                h = self.nodes[h].left;
            } else if (value > self.nodes[h].value) {
                h = self.nodes[h].right;
            } else {
                if (index < self.nodes[h].seq) {
                    h = self.nodes[h].left;
                } else if (index > self.nodes[h].seq) {
                    h = self.nodes[h].right;
                } else {
                    return h;
                }
            }
        }
        revert("Value not found");
    }

    // Get data by node index
    function getDataByIndex(Tree storage self, uint256 index) internal view returns (bytes32) {
        index += 1; // 0 based index but index 0 is root
        require(index < self.nodes.length && self.used[index], "Invalid node index");
        return self.nodes[index].data;
    }

    // For handling addresses specifically, you can add these convenience functions:
    function replaceWithAddress(Tree storage self, uint256 value, address addr) internal {
        replace(self, value, bytes32(uint256(uint160(addr))));
    }

    function getAddressByIndex(Tree storage self, uint256 index) internal view returns (address) {
        bytes32 data = getDataByIndex(self, index);
        return address(uint160(uint256(data)));
    }

    // Add new insert function
    function insert(Tree storage self, uint256 value, bytes32 data) internal {
        self.root = insertHelper(self, self.root, value, data);
        self.nodes[self.root].black = true;
        self.count++;
    }

    function insertBulk(Tree storage self, uint256[] memory values, bytes32[] memory data) internal {
        require(values.length == data.length, "Values and data arrays must have the same length");
        for (uint256 i = 0; i < values.length; i++) {
            insert(self, values[i], data[i]);
        }
    }

    function insertHelper(
        Tree storage self,
        uint256 h,
        uint256 value,
        bytes32 data
    ) private returns (uint256) {
        if (h == 0 || !self.used[h]) {
            uint256 index = self.nodes.length;
            self.sequence++;  // Increment global sequence
            self.dataToSeq[data] = self.sequence;
            self.nodes.push(Node({
                value: value,
                left: 0,
                right: 0,
                black: false,
                data: data,
                seq: self.sequence
            }));
            self.used[index] = true;
            return index;
        }

        // For equal values, compare sequence numbers
        if (value < self.nodes[h].value) {
            self.nodes[h].left = insertHelper(self, self.nodes[h].left, value, data);
        } else if (value > self.nodes[h].value) {
            self.nodes[h].right = insertHelper(self, self.nodes[h].right, value, data);
        } else {
            // For equal values, newer items (higher sequence) go to the right
            self.nodes[h].right = insertHelper(self, self.nodes[h].right, value, data);
        }

        // Fix-up any right-leaning links
        if (isRed(self, self.nodes[h].right) && !isRed(self, self.nodes[h].left)) {
            h = rotateLeft(self, h);
        }
        if (isRed(self, self.nodes[h].left) && isRed(self, self.nodes[self.nodes[h].left].left)) {
            h = rotateRight(self, h);
        }
        if (isRed(self, self.nodes[h].left) && isRed(self, self.nodes[h].right)) {
            flip(self, h);
        }

        return h;
    }

    // Update convenience functions for addresses
    function insertWithAddress(Tree storage self, uint256 value, address addr) internal {
        insert(self, value, bytes32(uint256(uint160(addr))));
    }
} 