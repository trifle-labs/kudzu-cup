// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.0;

library LLRBT {
    // Node structure for the tree
    struct Node {
        uint256 item;      // Key for ordering
        uint256 left;      // Index of left child in the nodes array
        uint256 right;     // Index of right child in the nodes array
        bool black;        // Color of the node
        bytes32 data;      // Associated data (can be address or other data types)
    }

    // Tree structure
    struct Tree {
        Node[] nodes;      // Array to store all nodes
        uint256 root;      // Index of root node
        uint256 count;     // Number of nodes in the tree
        mapping(uint256 => bool) used; // Track used array indices
    }

    // Initialize a new tree
    function init(Tree storage self) internal {
        self.nodes.push(Node(0, 0, 0, true, bytes32(0))); // Push dummy node at index 0
        self.root = 0;
        self.count = 0;
    }

    // Helper function to create a new node
    function newNode(Tree storage self, uint256 item, bytes32 data) private returns (uint256) {
        uint256 index = self.nodes.length;
        self.nodes.push(Node(item, 0, 0, false, data));
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

    // Insert a new item
    function insert(Tree storage self, uint256 item) internal {
        self.root = insertRecursive(self, self.root, item);
        self.nodes[self.root].black = true;
        self.count++;
    }

    // Recursive insert helper
    function insertRecursive(Tree storage self, uint256 h, uint256 item) private returns (uint256) {
        if (h == 0 || !self.used[h]) {
            return newNode(self, item, bytes32(0));
        }

        if (item < self.nodes[h].item) {
            self.nodes[h].left = insertRecursive(self, self.nodes[h].left, item);
        } else if (item > self.nodes[h].item) {
            self.nodes[h].right = insertRecursive(self, self.nodes[h].right, item);
        } else {
            self.nodes[h].item = item;
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

    // Insert without replacing existing items (allows duplicates)
    function insertNoReplace(Tree storage self, uint256 item) internal {
        self.root = insertNoReplaceHelper(self, self.root, item);
        self.nodes[self.root].black = true;
        self.count++;
    }

    function insertNoReplaceHelper(Tree storage self, uint256 h, uint256 item) private returns (uint256) {
        if (h == 0 || !self.used[h]) {
            return newNode(self, item, bytes32(0));
        }

        // Always insert to the right if equal
        if (item < self.nodes[h].item) {
            self.nodes[h].left = insertNoReplaceHelper(self, self.nodes[h].left, item);
        } else {
            self.nodes[h].right = insertNoReplaceHelper(self, self.nodes[h].right, item);
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

    // Bulk insert functions
    function insertBulk(Tree storage self, uint256[] memory items) internal {
        for (uint i = 0; i < items.length; i++) {
            insert(self, items[i]);
        }
    }

    function insertNoReplaceBulk(Tree storage self, uint256[] memory items) internal {
        for (uint i = 0; i < items.length; i++) {
            insertNoReplace(self, items[i]);
        }
    }

    // Check if an item exists in the tree
    function contains(Tree storage self, uint256 item) internal view returns (bool) {
        uint256 current = self.root;
        while (current != 0 && self.used[current]) {
            if (item < self.nodes[current].item) {
                current = self.nodes[current].left;
            } else if (item > self.nodes[current].item) {
                current = self.nodes[current].right;
            } else {
                return true;
            }
        }
        return false;
    }

    // Get the number of nodes in the tree
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
        return self.nodes[h].item;
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
        return self.nodes[h].item;
    }

    // Delete minimum element
    function deleteMin(Tree storage self) internal returns (uint256) {
        require(self.root != 0 && self.used[self.root], "Empty tree");
        uint256 deleted;
        (self.root, deleted) = deleteMinHelper(self, self.root);
        if (self.root != 0) {
            self.nodes[self.root].black = true;
        }
        if (deleted != 0) {
            self.count--;
        }
        return deleted;
    }

    function deleteMinHelper(Tree storage self, uint256 h) private returns (uint256 node, uint256 deleted) {
        if (h == 0 || !self.used[h]) {
            return (0, 0);
        }
        if (self.nodes[h].left == 0 || !self.used[self.nodes[h].left]) {
            return (0, self.nodes[h].item);
        }

        if (!isRed(self, self.nodes[h].left) && !isRed(self, self.nodes[self.nodes[h].left].left)) {
            h = moveRedLeft(self, h);
        }

        (self.nodes[h].left, deleted) = deleteMinHelper(self, self.nodes[h].left);
        return (fixUp(self, h), deleted);
    }

    // Delete maximum element
    function deleteMax(Tree storage self) internal returns (uint256) {
        require(self.root != 0 && self.used[self.root], "Empty tree");
        uint256 deleted;
        (self.root, deleted) = deleteMaxHelper(self, self.root);
        if (self.root != 0) {
            self.nodes[self.root].black = true;
        }
        if (deleted != 0) {
            self.count--;
        }
        return deleted;
    }

    function deleteMaxHelper(Tree storage self, uint256 h) private returns (uint256 node, uint256 deleted) {
        if (isRed(self, self.nodes[h].left)) {
            h = rotateRight(self, h);
        }
        if (self.nodes[h].right == 0 || !self.used[self.nodes[h].right]) {
            return (0, self.nodes[h].item);
        }
        if (!isRed(self, self.nodes[h].right) && !isRed(self, self.nodes[self.nodes[h].right].left)) {
            h = moveRedRight(self, h);
        }
        (self.nodes[h].right, deleted) = deleteMaxHelper(self, self.nodes[h].right);
        return (fixUp(self, h), deleted);
    }

    // Delete specific item -> Remove specific item
    function remove(Tree storage self, uint256 item) internal returns (uint256) {
        uint256 deleted;
        (self.root, deleted) = removeHelper(self, self.root, item);
        if (self.root != 0) {
            self.nodes[self.root].black = true;
        }
        if (deleted != 0) {
            self.count--;
        }
        return deleted;
    }

    function removeHelper(Tree storage self, uint256 h, uint256 item) private returns (uint256 node, uint256 deleted) {
        if (h == 0 || !self.used[h]) {
            return (0, 0);
        }

        if (item < self.nodes[h].item) {
            if (self.nodes[h].left == 0 || !self.used[self.nodes[h].left]) {
                return (h, 0);
            }
            if (!isRed(self, self.nodes[h].left) && !isRed(self, self.nodes[self.nodes[h].left].left)) {
                h = moveRedLeft(self, h);
            }
            (self.nodes[h].left, deleted) = removeHelper(self, self.nodes[h].left, item);
        } else {
            if (isRed(self, self.nodes[h].left)) {
                h = rotateRight(self, h);
            }
            if (item == self.nodes[h].item && (self.nodes[h].right == 0 || !self.used[self.nodes[h].right])) {
                return (0, self.nodes[h].item);
            }
            if (self.nodes[h].right != 0 && !isRed(self, self.nodes[h].right) && !isRed(self, self.nodes[self.nodes[h].right].left)) {
                h = moveRedRight(self, h);
            }
            if (item == self.nodes[h].item) {
                uint256 subDeleted;
                (self.nodes[h].right, subDeleted) = deleteMinHelper(self, self.nodes[h].right);
                require(subDeleted != 0, "Logic error");
                deleted = self.nodes[h].item;
                self.nodes[h].item = subDeleted;
            } else {
                (self.nodes[h].right, deleted) = removeHelper(self, self.nodes[h].right, item);
            }
        }

        return (fixUp(self, h), deleted);
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

    function insertWithData(Tree storage self, uint256 key, bytes32 data) internal {
        self.root = insertWithDataHelper(self, self.root, key, data);
        self.nodes[self.root].black = true;
        self.count++;
    }

    function insertWithDataHelper(
        Tree storage self, 
        uint256 h, 
        uint256 key, 
        bytes32 data
    ) private returns (uint256) {
        if (h == 0 || !self.used[h]) {
            uint256 index = self.nodes.length;
            self.nodes.push(Node({
                item: key,
                left: 0,
                right: 0,
                black: false,
                data: data
            }));
            self.used[index] = true;
            return index;
        }

        if (key < self.nodes[h].item) {
            self.nodes[h].left = insertWithDataHelper(self, self.nodes[h].left, key, data);
        } else if (key > self.nodes[h].item) {
            self.nodes[h].right = insertWithDataHelper(self, self.nodes[h].right, key, data);
        } else {
            self.nodes[h].data = data; // Update data if key already exists
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

    // Get data associated with a key
    function getData(Tree storage self, uint256 key) internal view returns (bytes32) {
        uint256 h = self.root;
        while (h != 0 && self.used[h]) {
            if (key < self.nodes[h].item) {
                h = self.nodes[h].left;
            } else if (key > self.nodes[h].item) {
                h = self.nodes[h].right;
            } else {
                return self.nodes[h].data;
            }
        }
        revert("Key not found");
    }

    // Get data by node index directly
    function getDataByIndex(Tree storage self, uint256 index) internal view returns (bytes32) {
        require(index < self.nodes.length && self.used[index], "Invalid node index");
        return self.nodes[index].data;
    }

    // For handling addresses specifically, you can add these convenience functions:
    function insertWithAddress(Tree storage self, uint256 key, address addr) internal {
        insertWithData(self, key, bytes32(uint256(uint160(addr))));
    }

    function getAddress(Tree storage self, uint256 key) internal view returns (address) {
        bytes32 data = getData(self, key);
        return address(uint160(uint256(data)));
    }

    function getAddressByIndex(Tree storage self, uint256 index) internal view returns (address) {
        bytes32 data = getDataByIndex(self, index);
        return address(uint160(uint256(data)));
    }
} 