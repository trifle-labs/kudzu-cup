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
    
    // Add a global nonce to track insertion order
    uint private constant GLOBAL_NONCE_SLOT = uint(keccak256("envelop.ost.global.nonce"));
    
    struct Node {
        uint parent;
        uint left;
        uint right;
        bool red;
        bytes32[] keys;
        mapping(bytes32 => uint) keyMap;
        mapping(bytes32 => uint) joinNonces; // Changed from joinTimes to joinNonces
        uint count;
    }
    
    struct Tree {
        uint root;
        mapping(uint => Node) nodes;
        // We'll track the next nonce at the tree level
        uint nextNonce;
    }

    // Helper function to get the next nonce value
    function getNextNonce(Tree storage self) private returns (uint) {
        uint nonce = self.nextNonce;
        self.nextNonce += 1;
        return nonce;
    }

    function first(Tree storage self) internal view returns (uint _value) {
        _value = self.root;
        require(_value != EMPTY, "OrderStatisticsTree(401) - Empty tree");
        while (self.nodes[_value].left != EMPTY) {
            _value = self.nodes[_value].left;
        }
    }

    function last(Tree storage self) internal view returns (uint _value) {
        _value = self.root;
        require(_value != EMPTY, "OrderStatisticsTree(401) - Empty tree");
        while (self.nodes[_value].right != EMPTY) {
            _value = self.nodes[_value].right;
        }
    }

    function next(
        Tree storage self,
        uint value
    ) internal view returns (uint _cursor) {
        require(
            value != EMPTY,
            "OrderStatisticsTree(401) - Starting value cannot be zero"
        );
        if (self.nodes[value].right != EMPTY) {
            _cursor = treeMinimum(self, self.nodes[value].right);
        } else {
            _cursor = self.nodes[value].parent;
            while (_cursor != EMPTY && value == self.nodes[_cursor].right) {
                value = _cursor;
                _cursor = self.nodes[_cursor].parent;
            }
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
        if (self.nodes[value].parent != EMPTY) return true;
        return false;
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
            gn.keys.length + gn.count
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

    function getNodeCount(
        Tree storage self,
        uint value
    ) internal view returns (uint _count) {
        Node storage gn = self.nodes[value];
        return gn.keys.length + gn.count;
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

    function count(Tree storage self) internal view returns (uint _count) {
        return getNodeCount(self, self.root);
    }

    function percentile(
        Tree storage self,
        uint value
    ) internal view returns (uint _percentile) {
        uint denominator = count(self);
        uint numerator = rank(self, value);
        _percentile =
            ((uint(1000) * numerator) / denominator + (uint(5))) /
            uint(10);
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

    // New method for FIFO order access - returns key at global rank with FIFO ordering
    function keyAtGlobalIndex(
        Tree storage self,
        uint targetRank
    ) internal view returns (bytes32 _key, uint cursor) {
        uint adjusted = targetRank;
        bool finished;
        cursor = self.root;
        uint counted = 0;
        
        while (!finished) {
            if (cursor == EMPTY) {
                revert("OrderStatisticsTree(409) - Index out of bounds");
            }
            
            Node storage c = self.nodes[cursor];
            uint rightCount = getNodeCount(self, c.right);
            uint keys = c.keys.length;
            
            if (adjusted < counted + rightCount + keys) {
                console.log('a');
                if (adjusted < counted + rightCount) {
                    console.log('b');
                    cursor = c.right;
                } else {
                    console.log('c');
                    // Keys are already in order, just return the correct index
                    uint keyIndex = adjusted - counted - rightCount;
                    if (keyIndex < keys) {
                        _key = c.keys[keyIndex];
                        finished = true;
                    } else {
                        revert("OrderStatisticsTree(411) - Invalid key index");
                    }
                }
            } else {
                console.log('l');
                counted += rightCount + keys;
                cursor = c.left;
            }
        }
    }

    function rank(
        Tree storage self,
        uint value
    ) internal view returns (uint _rank) {
        require(
            exists(self, value),
            "OrderStatisticsTree(407) - Value does not exist."
        );
        
        if (count(self) > 0) {
            bool finished;
            uint cursor = self.root;
            Node storage c = self.nodes[cursor];
            uint smaller = getNodeCount(self, c.left);
            while (!finished) {
                uint keyCount = c.keys.length;
                if (cursor == value) {
                    finished = true;
                } else {
                    if (cursor < value) {
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
            return smaller + 1;
        }
        revert("OrderStatisticsTree(407) - Value to delete does not exist.");
    }

    function atIndex(Tree storage self, uint _index) internal view returns (uint _value) {
        uint _rank = count(self) - _index;
        return atRank(self, _rank);
    }

    function atRank(
        Tree storage self,
        uint _rank
    ) internal view returns (uint _value) {
        require(_rank > 0, "OrderStatisticsTree(414) - Rank must be greater than 0");
        require(_rank <= count(self), "OrderStatisticsTree(415) - Rank exceeds tree size");

        bool finished;
        uint cursor = self.root;
        Node storage c = self.nodes[cursor];
        
        // Case when only one node exists
        if (c.parent == 0 && c.left == 0 && c.right == 0) {
            _value = cursor;
            return _value;
        }
        
        int smaller = int(getNodeCount(self, c.left));
        while (!finished) {
            _value = cursor;
            c = self.nodes[cursor];
            uint keyCount = c.keys.length;
            
            // If rank falls within current node's range
            if (smaller < int(_rank) && smaller + int(keyCount) >= int(_rank)) {
                _value = cursor;
                finished = true;
            } else {
                if (smaller + int(keyCount) < int(_rank)) {
                    // Rank is in right subtree
                    cursor = c.right;
                    c = self.nodes[cursor];
                    smaller += int(keyCount) + int(getNodeCount(self, c.left));
                } else {
                    // Rank is in left subtree
                    cursor = c.left;
                    c = self.nodes[cursor];
                    smaller = smaller - int(getNodeCount(self, c.right)) - int(keyCount);
                    if (smaller < 0) smaller = 0;
                }
            }
            if (!exists(self, cursor)) {
                finished = true;
            }
        }
    }

    function insert(Tree storage self, bytes32 key, uint value) internal {
        require(
            value != EMPTY,
            "OrderStatisticsTree(405) - Value to insert cannot be zero"
        );
        require(
            !keyExists(self, key, value),
            "OrderStatisticsTree(406) - Value and Key pair exists. Cannot be inserted again."
        );
        uint cursor;
        uint probe = self.root;
        while (probe != EMPTY) {
            cursor = probe;
            if (value < probe) {
                probe = self.nodes[probe].left;
            } else if (value > probe) {
                probe = self.nodes[probe].right;
            } else if (value == probe) {
                self.nodes[probe].keys.push(key);
                self.nodes[probe].keyMap[key] =
                    self.nodes[probe].keys.length -
                    uint256(1);
                return;
            }
            self.nodes[cursor].count++;
        }
        Node storage nValue = self.nodes[value];
        nValue.parent = cursor;
        nValue.left = EMPTY;
        nValue.right = EMPTY;
        nValue.red = true;
        nValue.keys.push(key);
        nValue.keyMap[key] = nValue.keys.length - uint256(1);
        if (cursor == EMPTY) {
            self.root = value;
        } else if (value < cursor) {
            self.nodes[cursor].left = value;
        } else {
            self.nodes[cursor].right = value;
        }
        insertFixup(self, value);
    }

    function remove(Tree storage self, bytes32 key, uint value) internal {
        require(
            value != EMPTY,
            "OrderStatisticsTree(407) - Value to delete cannot be zero"
        );
        require(
            keyExists(self, key, value),
            "OrderStatisticsTree(408) - Value to delete does not exist."
        );
        
        Node storage nValue = self.nodes[value];
        uint rowToDelete = nValue.keyMap[key];

        // Instead of swapping with last element, shift all elements after rowToDelete left by one
        for (uint i = rowToDelete; i < nValue.keys.length - 1; i++) {
            console.log('i is', i);
            nValue.keys[i] = nValue.keys[i + 1];
            nValue.keyMap[nValue.keys[i]] = i;  // Update mapping for shifted keys
        }
        nValue.keys.pop();
        delete nValue.keyMap[key];

        // FIX: Update count if we're just removing a key but keeping the node
        if (nValue.keys.length > 0) {
            fixCountRecurse(self, value);
            return;
        }

        // If we reach here, we're removing the entire node
        uint probe;
        uint cursor;
        
        if (self.nodes[value].left == EMPTY || self.nodes[value].right == EMPTY) {
            cursor = value;
        } else {
            cursor = self.nodes[value].right;
            while (self.nodes[cursor].left != EMPTY) {
                cursor = self.nodes[cursor].left;
            }
        }
        
        if (self.nodes[cursor].left != EMPTY) {
            probe = self.nodes[cursor].left;
        } else {
            probe = self.nodes[cursor].right;
        }
        
        uint cursorParent = self.nodes[cursor].parent;
        self.nodes[probe].parent = cursorParent;
        
        if (cursorParent != EMPTY) {
            if (cursor == self.nodes[cursorParent].left) {
                self.nodes[cursorParent].left = probe;
            } else {
                self.nodes[cursorParent].right = probe;
            }
        } else {
            self.root = probe;
        }
        
        bool doFixup = !self.nodes[cursor].red;
        
        if (cursor != value) {
            replaceParent(self, cursor, value);
            self.nodes[cursor].left = self.nodes[value].left;
            self.nodes[self.nodes[cursor].left].parent = cursor;
            self.nodes[cursor].right = self.nodes[value].right;
            self.nodes[self.nodes[cursor].right].parent = cursor;
            self.nodes[cursor].red = self.nodes[value].red;
            
            // FIX: Since cursor is taking value's place, update counts for cursor
            self.nodes[cursor].count = 
                getNodeCount(self, self.nodes[cursor].left) +
                getNodeCount(self, self.nodes[cursor].right);
                
            (cursor, value) = (value, cursor);
        }
        
        if (doFixup) {
            removeFixup(self, probe);
        }
        
        // FIX: We need to update counts starting from where the restructuring happened
        // This should be either the probe's parent or cursorParent
        uint updateStart = self.nodes[probe].parent != EMPTY ? self.nodes[probe].parent : cursorParent;
        fixCountRecurse(self, updateStart);
        
        delete self.nodes[cursor];
    }

    function fixCountRecurse(Tree storage self, uint value) private {
        while (value != EMPTY) {
            self.nodes[value].count =
                getNodeCount(self, self.nodes[value].left) +
                getNodeCount(self, self.nodes[value].right);
            value = self.nodes[value].parent;
        }
    }

    function treeMinimum(
        Tree storage self,
        uint value
    ) private view returns (uint) {
        while (self.nodes[value].left != EMPTY) {
            value = self.nodes[value].left;
        }
        return value;
    }

    function treeMaximum(
        Tree storage self,
        uint value
    ) private view returns (uint) {
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
            getNodeCount(self, self.nodes[value].right);
        self.nodes[cursor].count =
            getNodeCount(self, self.nodes[cursor].left) +
            getNodeCount(self, self.nodes[cursor].right);
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
            getNodeCount(self, self.nodes[value].right);
        self.nodes[cursor].count =
            getNodeCount(self, self.nodes[cursor].left) +
            getNodeCount(self, self.nodes[cursor].right);
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

    // Helper function to get the earliest key by join nonce for a given node
    function getEarliestKey(Tree storage self, uint value) internal view returns (bytes32) {
        require(exists(self, value), "OrderStatisticsTree(407) - Value does not exist.");
        Node storage node = self.nodes[value];
        require(node.keys.length > 0, "OrderStatisticsTree(412) - Node has no keys");
        
        bytes32 earliestKey = node.keys[0];
        uint earliestNonce = node.joinNonces[earliestKey];
        
        for (uint i = 1; i < node.keys.length; i++) {
            bytes32 currentKey = node.keys[i];
            uint currentNonce = node.joinNonces[currentKey];
            
            if (currentNonce < earliestNonce) {
                earliestNonce = currentNonce;
                earliestKey = currentKey;
            }
        }
        
        return earliestKey;
    }
    
    // Helper function to get the nonce for a specific key
    function getKeyJoinNonce(Tree storage self, bytes32 key, uint value) internal view returns (uint) {
        require(keyExists(self, key, value), "OrderStatisticsTree(413) - Key does not exist.");
        return self.nodes[value].joinNonces[key];
    }
}