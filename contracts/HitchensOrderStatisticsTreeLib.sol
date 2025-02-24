// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/* 
Order Statistics Tree by Envelop 
Based on
Hitchens Order Statistics Tree v0.99

A Solidity Red-Black Tree library to store and maintain a sorted data
structure in a Red-Black binary search tree, with O(log 2n) insert, remove
and search time (and gas, approximately)

https://github.com/rob-Hitchens/OrderStatisticsTree

Copyright (c) Rob Hitchens. the MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Significant portions from BokkyPooBahsRedBlackTreeLibrary, 
https://github.com/bokkypoobah/BokkyPooBahsRedBlackTreeLibrary

THIS SOFTWARE IS NOT TESTED OR AUDITED. DO NOT USE FOR PRODUCTION.
*/
import "hardhat/console.sol";

library HitchensOrderStatisticsTreeLib {
    uint private constant EMPTY = 0;
    uint private constant NEXT_STEP = type(uint).max;
    struct Node {
        uint parent;
        uint left;
        uint right;
        bool red;
        bytes32[] keys;
        mapping(bytes32 => uint) keyMap;
        mapping(bytes32 => uint) joinTimes;
        uint count;
        uint value;      // The actual points value
    }
    struct Tree {
        uint root;
        mapping(uint => Node) nodes;
    }

    /**
     * @dev Returns the smallest value in the tree
     * @param self The tree to query
     * @return _value The smallest value in the tree
     * Requirements:
     * - The tree must not be empty
     */
    function first(Tree storage self) internal view returns (uint _value) {
        require(self.root != EMPTY, "OrderStatisticsTree(401) - Empty tree");
        _value = self.root;
        while (self.nodes[_value].left != EMPTY) {
            _value = self.nodes[_value].left;
        }
        return _value;
    }

    /**
     * @dev Returns the largest value in the tree
     * @param self The tree to query
     * @return _value The largest value in the tree
     * Requirements:
     * - The tree must not be empty
     */
    function last(Tree storage self) internal view returns (uint _value) {
        require(self.root != EMPTY, "OrderStatisticsTree(401) - Empty tree");
        _value = self.root;
        while (self.nodes[_value].right != EMPTY) {
            _value = self.nodes[_value].right;
        }
        return _value;
    }

    function next(
        Tree storage self,
        uint value
    ) internal view returns (uint _cursor) {
        require(value != EMPTY, "OrderStatisticsTree(401) - Starting value cannot be zero");
        require(exists(self, value), "OrderStatisticsTree(407) - Value does not exist.");

        Node storage node = self.nodes[value];
        
        // If this is a duplicate value node, check if we've seen all keys
        if (node.keys.length > 1) {
            // Get the current key's index from the value
            uint currentIndex = node.value == value ? node.keyMap[node.keys[0]] : 0;
            
            // If we haven't seen all keys yet
            if (currentIndex < node.keys.length - 1) {
                return value;  // Return same value to indicate more keys exist
            }
        }

        // If we've seen all keys or there's only one key, move to next value
        if (node.right != EMPTY) {
            return treeMinimum(self, node.right);
        } else {
            _cursor = node.parent;
            while (_cursor != EMPTY && value == self.nodes[_cursor].right) {
                value = _cursor;
                _cursor = self.nodes[_cursor].parent;
            }
            return _cursor;
        }
    }

    function prev(
        Tree storage self,
        uint value
    ) internal view returns (uint _cursor) {
        require(
            value != EMPTY,
            "OrderStatisticsTree(402) - Starting value cannot be zero"
        );
        if (self.nodes[value].left != EMPTY) {
            _cursor = treeMaximum(self, self.nodes[value].left);
        } else {
            _cursor = self.nodes[value].parent;
            while (_cursor != EMPTY && value == self.nodes[_cursor].left) {
                value = _cursor;
                _cursor = self.nodes[_cursor].parent;
            }
        }
    }

    function exists(
        Tree storage self,
        uint value
    ) internal view returns (bool _exists) {
        if (value == EMPTY) return false;
        if (value == self.root) return true;
        
        // Check if the node exists and has valid data
        Node storage node = self.nodes[value];
        if (node.parent == EMPTY && value != self.root) return false;
        if (node.keys.length == 0) return false;  // A valid node must have at least one key
        
        return true;
    }

    function getRoot(Tree storage self) internal view returns (uint) {
        return self.root;
    }

    function keyExists(
        Tree storage self,
        bytes32 key,
        uint value
    ) internal view returns (bool _exists) {
        if (!exists(self, value)) return false;
        return self.nodes[value].keys[self.nodes[value].keyMap[key]] == key;
    }

    function getNode(
        Tree storage self,
        uint value
    )
        internal
        view
        returns (
            uint _parent,
            uint _left,
            uint _right,
            bool _red,
            uint keyCount,
            uint _count
        )
    {
        require(
            exists(self, value),
            "OrderStatisticsTree(403) - Value does not exist."
        );
        Node storage gn = self.nodes[value];
        return (
            gn.parent,
            gn.left,
            gn.right,
            gn.red,
            gn.keys.length,
            gn.count
        );
    }

    function getNode2(
        Tree storage self,
        uint value
    ) internal view returns (Node storage node) {
        require(
            exists(self, value),
            "OrderStatisticsTree(403) - Value does not exist."
        );
        node = self.nodes[value];
    }

    function getNodeCount(Tree storage self, uint value) private view returns (uint) {
        if (value == EMPTY) return 0;
        Node storage node = self.nodes[value];
        uint count_ = node.keys.length;
        
        // Add counts from left and right subtrees
        if (node.left != EMPTY) {
            count_ += getNodeCount(self, node.left);
        }
        if (node.right != EMPTY) {
            count_ += getNodeCount(self, node.right);
        }
        
        return count_;
    }

    function getNodeKeysLength(
        Tree storage self,
        uint value
    ) internal view returns (uint _count) {
        self.nodes[value];
        return self.nodes[value].keys.length;
    }

    function valueKeyAtIndex(
        Tree storage self,
        uint value,
        uint index
    ) internal view returns (bytes32 _key) {
        require(
            exists(self, value),
            "OrderStatisticsTree(404) - Value does not exist."
        );
        return self.nodes[value].keys[index];
    }

    function count(Tree storage self) internal view returns (uint) {
        if (self.root == EMPTY) {
            return 0;
        }
        return self.nodes[self.root].count;
    }

    /**
     * @dev Calculates the percentile of a given value in the tree (0-1000)
     * @param self The tree to query
     * @param value The value to find the percentile for
     * @return result The percentile of the value (0-1000)
     */
    function percentile(Tree storage self, uint value) internal view returns (uint) {
        require(exists(self, value), "OrderStatisticsTree(407) - Value does not exist.");
        uint _rank = rank(self, value);
        
        // Calculate percentile (0-1000 scale)
        // For n items, we want:
        // rank 1 → 200 (20%)
        // rank 2 → 400 (40%)
        // rank 3 → 600 (60%)
        // rank 4 → 800 (80%)
        return _rank * 200;
    }

    function permil(
        Tree storage self,
        uint value
    ) internal view returns (uint _permil) {
        uint denominator = count(self);
        uint numerator = rank(self, value);
        _permil =
            ((uint(10000) * numerator) / denominator + (uint(5))) /
            uint(10);
    }

    function atPercentile(
        Tree storage self,
        uint _percentile
    ) internal view returns (uint _value) {
        uint findRank = (((_percentile * count(self)) / uint(10)) + uint(5)) /
            uint(10);
        return atRank(self, findRank);
    }

    function atPermil(
        Tree storage self,
        uint _permil
    ) internal view returns (uint _value) {
        uint findRank = (((_permil * count(self)) / uint(100)) + uint(5)) /
            uint(10);
        return atRank(self, findRank);
    }

    function median(Tree storage self) internal view returns (uint value) {
        return atPercentile(self, 50);
    }

    function below(
        Tree storage self,
        uint value
    ) internal view returns (uint _below) {
        if (count(self) > 0 && value > 0) _below = rank(self, value) - uint(1);
    }

    function above(
        Tree storage self,
        uint value
    ) internal view returns (uint _above) {
        if (count(self) > 0) _above = count(self) - rank(self, value);
    }

    // function keyAtGlobalIndex(
    //     Tree storage self,
    //     uint index
    // ) internal view returns (bytes32 _key) {
    //     bool finished;
    //     uint cursor = self.root;
    //     uint counted = 0;
    //     while (!finished) {
    //         if (cursor == EMPTY) {
    //             revert("OrderStatisticsTree(409) - Index out of bounds");
    //         }
    //         Node storage c = self.nodes[cursor];
    //         uint rightCount = getNodeCount(self, c.right);
    //         uint keys = c.keys.length;
    //         if (index < counted + rightCount + keys) {
    //             if (index < counted + rightCount) {
    //                 cursor = c.right;
    //             } else {
    //                 _key = c.keys[index - counted - rightCount];
    //                 finished = true;
    //             }
    //         } else {
    //             counted += rightCount + keys;
    //             cursor = c.left;
    //         }
    //     }
    // }

    /**
     * @dev Returns the rank of a value in the tree (1-based)
     * @param self The tree to query
     * @param value The value to find the rank for
     * @return _rank The rank of the value (1-based)
     */
    function rank(Tree storage self, uint value) internal view returns (uint _rank) {
        require(exists(self, value), "OrderStatisticsTree(407) - Value does not exist.");
        _rank = 1;
        uint cursor = self.root;
        
        while (cursor != EMPTY) {
            Node storage currentNode = self.nodes[cursor];
            
            if (value == cursor) {
                // If we're at root, return 1
                if (cursor == self.root) {
                    return 1;
                }
                // Otherwise, we've accumulated the correct rank
                return _rank;
            } else if (value < cursor) {
                // When going left, add all keys of current node
                // (because these are higher values)
                _rank += currentNode.keys.length;
                cursor = currentNode.left;
            } else { // value > cursor
                // When going right, add current node and its left subtree
                _rank += currentNode.keys.length;
                if (currentNode.left != EMPTY) {
                    _rank += self.nodes[currentNode.left].count;
                }
                cursor = currentNode.right;
            }
        }
        return _rank;
    }

    /**
     * @dev Helper function to count keys in a node
     */
    function countKeys(Tree storage self, uint node) internal view returns (uint) {
        return self.nodes[node].keys.length;
    }

    function atRank(
        Tree storage self,
        uint _rank
    ) internal view returns (uint _value) {
        bool finished;
        uint cursor = self.root;
        Node storage c = self.nodes[cursor];
        // Case when only one node exist
        if (c.parent == 0 && c.left == 0 && c.right == 0) {
            _value = cursor;
            return _value;
        }
        uint smaller = getNodeCount(self, c.left);
        while (!finished) {
            _value = cursor;
            c = self.nodes[cursor];
            uint keyCount = c.keys.length;
            if (smaller + 1 >= _rank && smaller + keyCount <= _rank) {
                _value = cursor;
                finished = true;
            } else {
                if (smaller + keyCount <= _rank) {
                    cursor = c.right;
                    c = self.nodes[cursor];
                    smaller += keyCount + getNodeCount(self, c.left);
                } else {
                    cursor = c.left;
                    c = self.nodes[cursor];
                    if (smaller >= (keyCount + getNodeCount(self, c.right))) {
                        smaller -= (keyCount + getNodeCount(self, c.right));
                    } else {
                        smaller = 0;
                        finished = true;
                    }
                }
            }
            if (!exists(self, cursor)) {
                finished = true;
            }
        }
    }

    function insert(Tree storage self, bytes32 key, uint value) internal {
        require(value != EMPTY, "OrderStatisticsTree(405) - Value to insert cannot be zero");
        require(!keyExists(self, key, value), "OrderStatisticsTree(406) - Value and Key pair exists. Cannot be inserted again.");

        // If the value already exists in the tree, add the key to that node
        if (exists(self, value)) {
            Node storage existingNode = self.nodes[value];
            uint keyIndex = existingNode.keys.length;
            existingNode.keys.push(key);
            existingNode.keyMap[key] = keyIndex;
            existingNode.joinTimes[key] = block.timestamp;
            return;
        }

        // Create new node for new value
        Node storage node = self.nodes[value];
        node.value = value;
        node.keys.push(key);
        node.keyMap[key] = 0;
        node.joinTimes[key] = block.timestamp;
        node.count = 1;

        uint cursor;
        uint probe = self.root;

        // If tree is empty, make this the root
        if (probe == EMPTY) {
            self.root = value;
            node.red = false;
            return;
        }

        // Find insertion point
        while (probe != EMPTY) {
            cursor = probe;
            if (value < probe) {
                probe = self.nodes[probe].left;
            } else {
                probe = self.nodes[probe].right;
            }
            self.nodes[cursor].count++;
        }

        // Insert new node
        node.parent = cursor;
        if (value < cursor) {
            self.nodes[cursor].left = value;
        } else {
            self.nodes[cursor].right = value;
        }

        // Rebalance tree
        insertFixup(self, value);
    }

    function remove(Tree storage self, bytes32 key, uint value) internal {
        require(value != EMPTY, "OrderStatisticsTree(407) - Value to delete cannot be zero");
        require(keyExists(self, key, value), "OrderStatisticsTree(408) - Value to delete does not exist.");
        
        Node storage nValue = self.nodes[value];
        uint rowToDelete = nValue.keyMap[key];
        
        // Handle key removal
        if (nValue.keys.length > 1) {
            // Move last key to the position of the deleted key
            nValue.keys[rowToDelete] = nValue.keys[nValue.keys.length - 1];
            nValue.keyMap[nValue.keys[rowToDelete]] = rowToDelete;
            nValue.keys.pop();
            delete nValue.keyMap[key];
            delete nValue.joinTimes[key];  // Clean up joinTimes mapping
            return; // Exit early if we still have keys
        }
        
        // Remove the last/only key
        nValue.keys.pop();
        delete nValue.keyMap[key];
        delete nValue.joinTimes[key];  // Clean up joinTimes mapping

        uint x;
        uint y = value;
        bool yOriginallyRed = self.nodes[y].red;

        if (self.nodes[value].left == EMPTY) {
            x = self.nodes[value].right;
            replaceParent(self, x, value);
        } else if (self.nodes[value].right == EMPTY) {
            x = self.nodes[value].left;
            replaceParent(self, x, value);
        } else {
            // Find successor (smallest in right subtree)
            y = treeMinimum(self, self.nodes[value].right);
            yOriginallyRed = self.nodes[y].red;
            x = self.nodes[y].right;

            if (self.nodes[y].parent == value) {
                if (x != EMPTY) {
                    self.nodes[x].parent = y;
                }
            } else {
                replaceParent(self, x, y);
                self.nodes[y].right = self.nodes[value].right;
                self.nodes[self.nodes[y].right].parent = y;
            }

            replaceParent(self, y, value);
            self.nodes[y].left = self.nodes[value].left;
            self.nodes[self.nodes[y].left].parent = y;
            self.nodes[y].red = self.nodes[value].red;
        }

        // Fix counts
        fixCountRecurse(self, self.nodes[value].parent);

        // Clean up the removed node
        delete self.nodes[value];

        if (!yOriginallyRed && x != EMPTY) {
            removeFixup(self, x);
        }
    }

    function fixCountRecurse(Tree storage self, uint value) private {
        while (value != EMPTY) {
            self.nodes[value].count =
                getNodeCount(self, self.nodes[value].left) +
                getNodeCount(self, self.nodes[value].right);
            value = self.nodes[value].parent;
        }
    }

    function treeMinimum(Tree storage self, uint value) private view returns (uint) {
        while (self.nodes[value].left != EMPTY) {
            value = self.nodes[value].left;
        }
        return value;
    }

    function treeMaximum(Tree storage self, uint value) private view returns (uint) {
        while (self.nodes[value].right != EMPTY) {
            value = self.nodes[value].right;
        }
        return value;
    }

    function rotateLeft(Tree storage self, uint value) private {
        uint cursor = self.nodes[value].right;
        uint parent = self.nodes[value].parent;
        uint cursorLeft = self.nodes[cursor].left;
        self.nodes[value].right = cursorLeft;
        if (cursorLeft != EMPTY) {
            self.nodes[cursorLeft].parent = value;
        }
        self.nodes[cursor].parent = parent;
        if (parent == EMPTY) {
            self.root = cursor;
        } else if (value == self.nodes[parent].left) {
            self.nodes[parent].left = cursor;
        } else {
            self.nodes[parent].right = cursor;
        }
        self.nodes[cursor].left = value;
        self.nodes[value].parent = cursor;
        self.nodes[value].count =
            getNodeCount(self, self.nodes[value].left) +
            getNodeCount(self, self.nodes[value].right) +
            self.nodes[value].keys.length;
        self.nodes[cursor].count =
            getNodeCount(self, self.nodes[cursor].left) +
            getNodeCount(self, self.nodes[cursor].right) +
            self.nodes[cursor].keys.length;
    }

    function rotateRight(Tree storage self, uint value) private {
        uint cursor = self.nodes[value].left;
        uint parent = self.nodes[value].parent;
        uint cursorRight = self.nodes[cursor].right;
        self.nodes[value].left = cursorRight;
        if (cursorRight != EMPTY) {
            self.nodes[cursorRight].parent = value;
        }
        self.nodes[cursor].parent = parent;
        if (parent == EMPTY) {
            self.root = cursor;
        } else if (value == self.nodes[parent].right) {
            self.nodes[parent].right = cursor;
        } else {
            self.nodes[parent].left = cursor;
        }
        self.nodes[cursor].right = value;
        self.nodes[value].parent = cursor;
        self.nodes[value].count =
            getNodeCount(self, self.nodes[value].left) +
            getNodeCount(self, self.nodes[value].right) +
            self.nodes[value].keys.length;
        self.nodes[cursor].count =
            getNodeCount(self, self.nodes[cursor].left) +
            getNodeCount(self, self.nodes[cursor].right) +
            self.nodes[cursor].keys.length;
    }

    function insertFixup(Tree storage self, uint value) private {
        uint cursor;
        while (value != self.root && self.nodes[self.nodes[value].parent].red) {
            uint valueParent = self.nodes[value].parent;
            if (
                valueParent == self.nodes[self.nodes[valueParent].parent].left
            ) {
                cursor = self.nodes[self.nodes[valueParent].parent].right;
                if (self.nodes[cursor].red) {
                    self.nodes[valueParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    value = self.nodes[valueParent].parent;
                } else {
                    if (value == self.nodes[valueParent].right) {
                        value = valueParent;
                        rotateLeft(self, value);
                    }
                    valueParent = self.nodes[value].parent;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    rotateRight(self, self.nodes[valueParent].parent);
                }
            } else {
                cursor = self.nodes[self.nodes[valueParent].parent].left;
                if (self.nodes[cursor].red) {
                    self.nodes[valueParent].red = false;
                    self.nodes[cursor].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    value = self.nodes[valueParent].parent;
                } else {
                    if (value == self.nodes[valueParent].left) {
                        value = valueParent;
                        rotateRight(self, value);
                    }
                    valueParent = self.nodes[value].parent;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[valueParent].parent].red = true;
                    rotateLeft(self, self.nodes[valueParent].parent);
                }
            }
        }
        self.nodes[self.root].red = false;
    }

    function replaceParent(Tree storage self, uint a, uint b) private {
        uint bParent = self.nodes[b].parent;
        self.nodes[a].parent = bParent;
        if (bParent == EMPTY) {
            self.root = a;
        } else {
            if (b == self.nodes[bParent].left) {
                self.nodes[bParent].left = a;
            } else {
                self.nodes[bParent].right = a;
            }
        }
    }

    function removeFixup(Tree storage self, uint value) private {
        uint cursor;
        while (value != self.root && !self.nodes[value].red) {
            uint valueParent = self.nodes[value].parent;
            if (value == self.nodes[valueParent].left) {
                cursor = self.nodes[valueParent].right;
                if (self.nodes[cursor].red) {
                    self.nodes[cursor].red = false;
                    self.nodes[valueParent].red = true;
                    rotateLeft(self, valueParent);
                    cursor = self.nodes[valueParent].right;
                }
                if (
                    !self.nodes[self.nodes[cursor].left].red &&
                    !self.nodes[self.nodes[cursor].right].red
                ) {
                    self.nodes[cursor].red = true;
                    value = valueParent;
                } else {
                    if (!self.nodes[self.nodes[cursor].right].red) {
                        self.nodes[self.nodes[cursor].left].red = false;
                        self.nodes[cursor].red = true;
                        rotateRight(self, cursor);
                        cursor = self.nodes[valueParent].right;
                    }
                    self.nodes[cursor].red = self.nodes[valueParent].red;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[cursor].right].red = false;
                    rotateLeft(self, valueParent);
                    value = self.root;
                }
            } else {
                cursor = self.nodes[valueParent].left;
                if (self.nodes[cursor].red) {
                    self.nodes[cursor].red = false;
                    self.nodes[valueParent].red = true;
                    rotateRight(self, valueParent);
                    cursor = self.nodes[valueParent].left;
                }
                if (
                    !self.nodes[self.nodes[cursor].right].red &&
                    !self.nodes[self.nodes[cursor].left].red
                ) {
                    self.nodes[cursor].red = true;
                    value = valueParent;
                } else {
                    if (!self.nodes[self.nodes[cursor].left].red) {
                        self.nodes[self.nodes[cursor].right].red = false;
                        self.nodes[cursor].red = true;
                        rotateLeft(self, cursor);
                        cursor = self.nodes[valueParent].left;
                    }
                    self.nodes[cursor].red = self.nodes[valueParent].red;
                    self.nodes[valueParent].red = false;
                    self.nodes[self.nodes[cursor].left].red = false;
                    rotateRight(self, valueParent);
                    value = self.root;
                }
            }
        }
        self.nodes[value].red = false;
    }

    function getCurrentKey(Tree storage self, uint value) internal view returns (bytes32) {
        require(exists(self, value), "OrderStatisticsTree(407) - Value does not exist.");
        Node storage node = self.nodes[value];
        require(node.keys.length > 0, "OrderStatisticsTree(407) - No keys exist for value.");
        return node.keys[0];
    }

    function updateNodeCounts(Tree storage self, uint value) private {
        if (value == EMPTY) return;
        
        Node storage node = self.nodes[value];
        uint leftCount = self.nodes[node.left].count;
        uint rightCount = self.nodes[node.right].count;
        
        node.count = node.keys.length + leftCount + rightCount;
    }

    function keyAtGlobalRank(Tree storage self, uint targetRank) internal view returns (bytes32) {
        uint totalCount = getNodeCount(self, self.root);
        require(targetRank < totalCount, "OrderStatisticsTree(406) - Rank out of bounds");
        
        uint cursor = self.root;
        // uint currentRank = 0;
        
        while (cursor != EMPTY) {
            Node storage currentNode = self.nodes[cursor];
            // uint leftCount = getNodeCount(self, currentNode.left);
            uint rightCount = getNodeCount(self, currentNode.right);
            
            // Calculate position considering right subtree first (for descending order)
            if (targetRank < rightCount) {
                // Target is in right subtree (higher values)
                cursor = currentNode.right;
                continue;
            }
            
            // Adjust target rank to account for right subtree
            uint adjustedRank = targetRank - rightCount;
            
            // Check if target is in current node
            if (adjustedRank < currentNode.keys.length) {
                // Find the key with the earliest joinTime
                bytes32 earliestKey = currentNode.keys[0];
                uint earliestTime = currentNode.joinTimes[earliestKey];
                uint earliestIndex = 0;
                
                for (uint i = 1; i < currentNode.keys.length; i++) {
                    bytes32 currentKey = currentNode.keys[i];
                    uint currentTime = currentNode.joinTimes[currentKey];
                    
                    if (currentTime < earliestTime) {
                        earliestTime = currentTime;
                        earliestKey = currentKey;
                        earliestIndex = i;
                    }
                }
                
                if (adjustedRank == 0) {
                    return earliestKey;
                }
                
                // For subsequent ranks, find the next earliest key
                bytes32[] memory remainingKeys = new bytes32[](currentNode.keys.length - 1);
                uint nextIndex = 0;
                for (uint i = 0; i < currentNode.keys.length; i++) {
                    if (i != earliestIndex) {
                        remainingKeys[nextIndex] = currentNode.keys[i];
                        nextIndex++;
                    }
                }
                
                for (uint r = 1; r <= adjustedRank; r++) {
                    earliestKey = remainingKeys[0];
                    earliestTime = currentNode.joinTimes[earliestKey];
                    earliestIndex = 0;
                    
                    for (uint i = 1; i < remainingKeys.length; i++) {
                        bytes32 currentKey = remainingKeys[i];
                        uint currentTime = currentNode.joinTimes[currentKey];
                        
                        if (currentTime < earliestTime) {
                            earliestTime = currentTime;
                            earliestKey = currentKey;
                            earliestIndex = i;
                        }
                    }
                    
                    if (r == adjustedRank) {
                        return earliestKey;
                    }
                    
                    // Remove the found key for next iteration
                    bytes32[] memory newRemaining = new bytes32[](remainingKeys.length - 1);
                    nextIndex = 0;
                    for (uint i = 0; i < remainingKeys.length; i++) {
                        if (i != earliestIndex) {
                            newRemaining[nextIndex] = remainingKeys[i];
                            nextIndex++;
                        }
                    }
                    remainingKeys = newRemaining;
                }
            }
            
            // Target must be in left subtree
            targetRank = adjustedRank - currentNode.keys.length;
            cursor = currentNode.left;
        }
        
        revert("OrderStatisticsTree(406) - Rank out of bounds");
    }
}
