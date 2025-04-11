// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library RedBlackTree {
    enum Color { RED, BLACK }

    struct Node {
        uint256 value;
        Color color;
        uint256 parent;
        uint256 left;
        uint256 right;
    }

    struct Tree {
        mapping(uint256 => Node) nodes;
        uint256 root;
        uint256 NIL;
        uint256 count;
    }

    // Initialize a new tree
    function init(Tree storage self) internal {
        // Create NIL node
        self.NIL = 0;
        self.nodes[self.NIL] = Node({
            value: 0,
            color: Color.BLACK,
            parent: 0,
            left: 0,
            right: 0
        });
        self.root = self.NIL;
        self.count = 0;
    }

    // Insert a new value into the tree
    function insert(Tree storage self, uint256 value) internal {
        uint256 node = _createNode(self, value);
        if (self.root == self.NIL) {
            self.root = node;
            self.nodes[node].color = Color.BLACK;
            self.count++;
            return;
        }

        uint256 parent;
        bool isLeft;
        (parent, isLeft) = _findParent(self, value);
        
        if (parent == 0) return; // Value already exists

        // Link the new node
        self.nodes[node].parent = parent;
        if (isLeft) {
            self.nodes[parent].left = node;
        } else {
            self.nodes[parent].right = node;
        }

        _fixInsertion(self, node);
        self.count++;
    }

    // Internal function to create a new node
    function _createNode(Tree storage self, uint256 value) private returns (uint256) {
        uint256 nodeId = uint256(keccak256(abi.encodePacked(value, block.timestamp, self.count)));
        self.nodes[nodeId] = Node({
            value: value,
            color: Color.RED,
            parent: self.NIL,
            left: self.NIL,
            right: self.NIL
        });
        return nodeId;
    }

    // Find the parent node where a new value should be inserted
    function _findParent(Tree storage self, uint256 value) private view returns (uint256, bool) {
        uint256 current = self.root;
        uint256 parent = self.NIL;
        bool isLeft = false;

        while (current != self.NIL) {
            parent = current;
            if (value < self.nodes[current].value) {
                current = self.nodes[current].left;
                isLeft = true;
            } else if (value > self.nodes[current].value) {
                current = self.nodes[current].right;
                isLeft = false;
            } else {
                return (0, false); // Value already exists
            }
        }

        return (parent, isLeft);
    }

    // Fix the tree after insertion to maintain Red-Black properties
    function _fixInsertion(Tree storage self, uint256 node) private {
        uint256 parent;
        uint256 grandparent;
        uint256 uncle;

        while (self.nodes[self.nodes[node].parent].color == Color.RED) {
            parent = self.nodes[node].parent;
            grandparent = self.nodes[parent].parent;

            if (parent == self.nodes[grandparent].left) {
                uncle = self.nodes[grandparent].right;

                if (self.nodes[uncle].color == Color.RED) {
                    self.nodes[parent].color = Color.BLACK;
                    self.nodes[uncle].color = Color.BLACK;
                    self.nodes[grandparent].color = Color.RED;
                    node = grandparent;
                } else {
                    if (node == self.nodes[parent].right) {
                        node = parent;
                        _leftRotate(self, node);
                        parent = self.nodes[node].parent;
                    }
                    self.nodes[parent].color = Color.BLACK;
                    self.nodes[grandparent].color = Color.RED;
                    _rightRotate(self, grandparent);
                }
            } else {
                uncle = self.nodes[grandparent].left;

                if (self.nodes[uncle].color == Color.RED) {
                    self.nodes[parent].color = Color.BLACK;
                    self.nodes[uncle].color = Color.BLACK;
                    self.nodes[grandparent].color = Color.RED;
                    node = grandparent;
                } else {
                    if (node == self.nodes[parent].left) {
                        node = parent;
                        _rightRotate(self, node);
                        parent = self.nodes[node].parent;
                    }
                    self.nodes[parent].color = Color.BLACK;
                    self.nodes[grandparent].color = Color.RED;
                    _leftRotate(self, grandparent);
                }
            }

            if (node == self.root) break;
        }

        self.nodes[self.root].color = Color.BLACK;
    }

    // Left rotation
    function _leftRotate(Tree storage self, uint256 x) private {
        uint256 y = self.nodes[x].right;
        self.nodes[x].right = self.nodes[y].left;
        
        if (self.nodes[y].left != self.NIL) {
            self.nodes[self.nodes[y].left].parent = x;
        }
        
        self.nodes[y].parent = self.nodes[x].parent;
        
        if (self.nodes[x].parent == self.NIL) {
            self.root = y;
        } else if (x == self.nodes[self.nodes[x].parent].left) {
            self.nodes[self.nodes[x].parent].left = y;
        } else {
            self.nodes[self.nodes[x].parent].right = y;
        }
        
        self.nodes[y].left = x;
        self.nodes[x].parent = y;
    }

    // Right rotation
    function _rightRotate(Tree storage self, uint256 y) private {
        uint256 x = self.nodes[y].left;
        self.nodes[y].left = self.nodes[x].right;
        
        if (self.nodes[x].right != self.NIL) {
            self.nodes[self.nodes[x].right].parent = y;
        }
        
        self.nodes[x].parent = self.nodes[y].parent;
        
        if (self.nodes[y].parent == self.NIL) {
            self.root = x;
        } else if (y == self.nodes[self.nodes[y].parent].right) {
            self.nodes[self.nodes[y].parent].right = x;
        } else {
            self.nodes[self.nodes[y].parent].left = x;
        }
        
        self.nodes[x].right = y;
        self.nodes[y].parent = x;
    }

    // Check if a value exists in the tree
    function contains(Tree storage self, uint256 value) internal view returns (bool) {
        uint256 current = self.root;
        
        while (current != self.NIL) {
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

    // Remove a value from the tree
    function remove(Tree storage self, uint256 value) internal returns (bool) {
        uint256 nodeToRemove = _findNode(self, value);
        if (nodeToRemove == self.NIL) {
            return false;
        }

        uint256 replacementNode = nodeToRemove;
        Color originalColor = self.nodes[replacementNode].color;
        uint256 fixupNode;

        // Case 1: Node to remove has no left child
        if (self.nodes[nodeToRemove].left == self.NIL) {
            fixupNode = self.nodes[nodeToRemove].right;
            _transplant(self, nodeToRemove, self.nodes[nodeToRemove].right);
        }
        // Case 2: Node to remove has no right child
        else if (self.nodes[nodeToRemove].right == self.NIL) {
            fixupNode = self.nodes[nodeToRemove].left;
            _transplant(self, nodeToRemove, self.nodes[nodeToRemove].left);
        }
        // Case 3: Node to remove has both children
        else {
            replacementNode = _findMinimum(self, self.nodes[nodeToRemove].right);
            originalColor = self.nodes[replacementNode].color;
            fixupNode = self.nodes[replacementNode].right;

            if (self.nodes[replacementNode].parent == nodeToRemove) {
                self.nodes[fixupNode].parent = replacementNode;
            } else {
                _transplant(self, replacementNode, self.nodes[replacementNode].right);
                self.nodes[replacementNode].right = self.nodes[nodeToRemove].right;
                self.nodes[self.nodes[replacementNode].right].parent = replacementNode;
            }

            _transplant(self, nodeToRemove, replacementNode);
            self.nodes[replacementNode].left = self.nodes[nodeToRemove].left;
            self.nodes[self.nodes[replacementNode].left].parent = replacementNode;
            self.nodes[replacementNode].color = self.nodes[nodeToRemove].color;
        }

        if (originalColor == Color.BLACK) {
            _fixRemoval(self, fixupNode);
        }

        self.count--;
        return true;
    }

    // Fix the tree after removal to maintain Red-Black properties
    function _fixRemoval(Tree storage self, uint256 node) private {
        uint256 sibling;

        while (node != self.root && self.nodes[node].color == Color.BLACK) {
            if (node == self.nodes[self.nodes[node].parent].left) {
                sibling = self.nodes[self.nodes[node].parent].right;

                // Case 1: Red sibling
                if (self.nodes[sibling].color == Color.RED) {
                    self.nodes[sibling].color = Color.BLACK;
                    self.nodes[self.nodes[node].parent].color = Color.RED;
                    _leftRotate(self, self.nodes[node].parent);
                    sibling = self.nodes[self.nodes[node].parent].right;
                }

                // Case 2: Black sibling with black children
                if (self.nodes[self.nodes[sibling].left].color == Color.BLACK &&
                    self.nodes[self.nodes[sibling].right].color == Color.BLACK) {
                    self.nodes[sibling].color = Color.RED;
                    node = self.nodes[node].parent;
                } else {
                    // Case 3: Black sibling with red left child and black right child
                    if (self.nodes[self.nodes[sibling].right].color == Color.BLACK) {
                        self.nodes[self.nodes[sibling].left].color = Color.BLACK;
                        self.nodes[sibling].color = Color.RED;
                        _rightRotate(self, sibling);
                        sibling = self.nodes[self.nodes[node].parent].right;
                    }

                    // Case 4: Black sibling with red right child
                    self.nodes[sibling].color = self.nodes[self.nodes[node].parent].color;
                    self.nodes[self.nodes[node].parent].color = Color.BLACK;
                    self.nodes[self.nodes[sibling].right].color = Color.BLACK;
                    _leftRotate(self, self.nodes[node].parent);
                    node = self.root;
                }
            } else {
                // Mirror image of above cases for right child
                sibling = self.nodes[self.nodes[node].parent].left;

                if (self.nodes[sibling].color == Color.RED) {
                    self.nodes[sibling].color = Color.BLACK;
                    self.nodes[self.nodes[node].parent].color = Color.RED;
                    _rightRotate(self, self.nodes[node].parent);
                    sibling = self.nodes[self.nodes[node].parent].left;
                }

                if (self.nodes[self.nodes[sibling].right].color == Color.BLACK &&
                    self.nodes[self.nodes[sibling].left].color == Color.BLACK) {
                    self.nodes[sibling].color = Color.RED;
                    node = self.nodes[node].parent;
                } else {
                    if (self.nodes[self.nodes[sibling].left].color == Color.BLACK) {
                        self.nodes[self.nodes[sibling].right].color = Color.BLACK;
                        self.nodes[sibling].color = Color.RED;
                        _leftRotate(self, sibling);
                        sibling = self.nodes[self.nodes[node].parent].left;
                    }

                    self.nodes[sibling].color = self.nodes[self.nodes[node].parent].color;
                    self.nodes[self.nodes[node].parent].color = Color.BLACK;
                    self.nodes[self.nodes[sibling].left].color = Color.BLACK;
                    _rightRotate(self, self.nodes[node].parent);
                    node = self.root;
                }
            }
        }

        self.nodes[node].color = Color.BLACK;
    }

    // Helper function to transplant nodes during removal
    function _transplant(Tree storage self, uint256 u, uint256 v) private {
        if (self.nodes[u].parent == self.NIL) {
            self.root = v;
        } else if (u == self.nodes[self.nodes[u].parent].left) {
            self.nodes[self.nodes[u].parent].left = v;
        } else {
            self.nodes[self.nodes[u].parent].right = v;
        }
        self.nodes[v].parent = self.nodes[u].parent;
    }

    // Find the node with minimum value in a subtree
    function _findMinimum(Tree storage self, uint256 node) private view returns (uint256) {
        uint256 current = node;
        while (self.nodes[current].left != self.NIL) {
            current = self.nodes[current].left;
        }
        return current;
    }

    // Find a node with a specific value
    function _findNode(Tree storage self, uint256 value) private view returns (uint256) {
        uint256 current = self.root;
        while (current != self.NIL) {
            if (value < self.nodes[current].value) {
                current = self.nodes[current].left;
            } else if (value > self.nodes[current].value) {
                current = self.nodes[current].right;
            } else {
                return current;
            }
        }
        return self.NIL;
    }

    // Get the value at a given index in the sorted order (0-based)
    function getValueAtIndex(Tree storage self, uint256 index) internal view returns (uint256) {
        require(index < self.count, "Index out of bounds");
        return _getNodeAtIndex(self, self.root, index).value;
    }

    // Get the index of a value in the sorted order (0-based)
    // Reverts if value is not found
    function getIndexOfValue(Tree storage self, uint256 value) internal view returns (uint256) {
        uint256 node = _findNode(self, value);
        require(node != self.NIL, "Value not found in tree");
        return _getNodeIndex(self, node);
    }

    // Internal helper to get node at index
    function _getNodeAtIndex(
        Tree storage self,
        uint256 node,
        uint256 index
    ) private view returns (Node storage) {
        uint256 leftCount = _getSize(self, self.nodes[node].left);
        
        // If index is in left subtree
        if (index < leftCount) {
            return _getNodeAtIndex(self, self.nodes[node].left, index);
        }
        // If index points to current node
        else if (index == leftCount) {
            return self.nodes[node];
        }
        // If index is in right subtree
        else {
            return _getNodeAtIndex(self, self.nodes[node].right, index - leftCount - 1);
        }
    }

    // Internal helper to get index of a node
    function _getNodeIndex(Tree storage self, uint256 node) private view returns (uint256) {
        uint256 index = _getSize(self, self.nodes[node].left);
        uint256 current = node;
        
        while (self.nodes[current].parent != self.NIL) {
            uint256 parent = self.nodes[current].parent;
            if (current == self.nodes[parent].right) {
                index += _getSize(self, self.nodes[parent].left) + 1;
            }
            current = parent;
        }
        
        return index;
    }

    // Get size of subtree rooted at node
    function _getSize(Tree storage self, uint256 node) private view returns (uint256) {
        if (node == self.NIL) return 0;
        return 1 + _getSize(self, self.nodes[node].left) + _getSize(self, self.nodes[node].right);
    }

    // Get the minimum value in the tree
    function getMin(Tree storage self) internal view returns (uint256) {
        require(self.root != self.NIL, "Tree is empty");
        return self.nodes[_findMinimum(self, self.root)].value;
    }

    // Get the maximum value in the tree
    function getMax(Tree storage self) internal view returns (uint256) {
        require(self.root != self.NIL, "Tree is empty");
        return self.nodes[_findMaximum(self, self.root)].value;
    }

    // Find the node with maximum value in a subtree
    function _findMaximum(Tree storage self, uint256 node) private view returns (uint256) {
        uint256 current = node;
        while (self.nodes[current].right != self.NIL) {
            current = self.nodes[current].right;
        }
        return current;
    }
} 