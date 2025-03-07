// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/* 
Trifle Tree by @okwme at https://github.com/trifle-labs

A Solidity Red-Black Tree library to store and maintain a sorted data
structure in a Red-Black binary search tree, with O(log 2n) insert, remove
and search time (and gas, approximately). Furthermore maintains FIFO order
for items with the same value making it appropriate for use as a leaderboard.

Based on:
https://github.com/rob-Hitchens/OrderStatisticsTree
https://github.com/bokkypoobah/BokkyPooBahsRedBlackTreeLibrary

Copyright (c) William Rennekamp. the MIT License

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

Significant portions from HitchensOrderStatisticsTreeLib, 
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

THIS SOFTWARE IS NOT OR AUDITED. USE AT YOUR OWN RISK.
*/

import "hardhat/console.sol";

library TrifleTreeLib {
    uint private constant EMPTY = 0;
    
    struct Node {
        uint parent;
        uint left;
        uint right;
        bool red;
        Tree keyTree;  // Secondary tree to store keys ordered by nonce
        mapping(bytes32 => uint) keyToNonce;  // Map keys to their nonces for removal
        uint count;
        bytes32 singleKey; // Single key for when node is part of a keyTree
    }
    
    struct Tree {
        uint root;
        mapping(uint => Node) nodes;
        uint nextNonce;  // Track next nonce at tree level
        uint _count;
    }

    // Helper function to get the next nonce value
    function getNextNonce(Tree storage self) internal returns (uint) {
        if (self.nextNonce == 0) {
            self.nextNonce = 1;
        }
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
        if (value == EMPTY) {
            return false;
        }
        if (value == self.root) {
            return true;
        }
        if (self.nodes[value].parent != EMPTY) {
            return true;
        }
        return false;
    }

    function keyExists(
        Tree storage self,
        bytes32 key,
        uint value
    ) internal view returns (bool _exists) {
        bool specialCase = key == 0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436 && value == 46;
        if (specialCase) {
            console.log("specialCase");
        }
        if (!exists(self, value)) return false;
        if (specialCase) {
            console.log("exists(self, value)", exists(self, value));
        }
        if (self.nodes[value].singleKey == key) {
            if (specialCase) {
                console.log("self.nodes[value].singleKey == key");
            }
            return true;
        }
        if (specialCase) {
            console.log("key");
            console.logBytes32(key);
            console.log("value",  value);
            console.log("self.nodes[value].keyToNonce[key]", self.nodes[value].keyToNonce[key]);
        }
        return self.nodes[value].keyToNonce[key] != 0;
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
            gn.keyTree._count,
            gn.keyTree._count + gn.count // TODO: I don't understand this
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
        bool isKeyTreeNode = gn.singleKey != bytes32(0);
        // console.log("isKeyTreeNode", isKeyTreeNode);
        uint keyTreeCount = isKeyTreeNode ? 1 : gn.keyTree._count;
        // if (value == 108) {
            // console.log("gn.count", gn.count);
            // console.log("keyTreeCount", keyTreeCount);
        // } else {
            // console.log("value is ", value);
        // }
        return keyTreeCount + gn.count;
    }

    function getNodeKeysLength(
        Tree storage self,
        uint value
    ) internal view returns (uint _count) {
        return self.nodes[value].keyTree._count;
    }
    // TODO: is this redundant?
    function valueKeyAtIndex(
        Tree storage self,
        uint value,
        uint index
    ) internal view returns (bytes32 _key) {
        require(
            exists(self, value),
            "OrderStatisticsTree(404) - Value does not exist."
        );
        if (self.nodes[value].singleKey != bytes32(0)) {
            require(index == 0, "OrderStatisticsTree(404) - Index out of bounds");
            return self.nodes[value].singleKey;
        }
        (_key,) = TrifleTreeLib.findKeyValueByIndex(self.nodes[value].keyTree, index, false); // TODO: check this works
        return _key;
    }

    function count(Tree storage self) internal view returns (uint _count) {
        return self._count;
    }

    function percentile(
        Tree storage self,
        uint value
    ) internal view returns (uint _percentile) {
        uint denominator = count(self);
        uint numerator = findIndexByValue(self, value) + 1;
        _percentile =
            ((uint(1000) * numerator) / denominator + (uint(5))) /
            uint(10);
    }

    function permil(
        Tree storage self,
        uint value
    ) internal view returns (uint _permil) {
        uint denominator = count(self);
        uint numerator = findIndexByValue(self, value) + 1;
        _permil =
            ((uint(10000) * numerator) / denominator + (uint(5))) /
            uint(10);
    }

    // function atPercentile(
    //     Tree storage self,
    //     uint _percentile
    // ) internal view returns (uint _value) {
    //     uint findRank = (((_percentile * count(self)) / uint(10)) + uint(5)) /
    //         uint(10);
    //     return atRank(self, findRank);
    // }

    // function atPermil(
    //     Tree storage self,
    //     uint _permil
    // ) internal view returns (uint _value) {
    //     uint findRank = (((_permil * count(self)) / uint(100)) + uint(5)) /
    //         uint(10);
    //     return atRank(self, findRank);
    // }

    // function median(Tree storage self) internal view returns (uint value) {
    //     return atPercentile(self, 50);
    // }

    function below(
        Tree storage self,
        uint value
    ) internal view returns (uint _below) {
        if (count(self) > 0 && value > 0) _below = findIndexByValue(self, value);
    }

    function above(
        Tree storage self,
        uint value
    ) internal view returns (uint _above) {
        if (count(self) > 0) _above = count(self) - findIndexByValue(self, value) - 1;
    }


    // function keyAtGlobalIndex(Tree storage self, uint index) internal view 
    //     returns (bytes32 keyValue, uint nodeValue) 
    // {   
    //     (keyValue,  nodeValue) = findKeyValueByIndex(self, index);
    //     // console.log("nodeValue", nodeValue);
    //     // console.log("local index", localIndex);
    //     // Get the key at localIndex from the node's keyTree
    //     // bytes32 foundKey;
    //     // uint foundValue;
    //     // (foundKey, foundValue) = TrifleTreeLib.atIndexInKeyTree(self.nodes[nodeValue].keyTree, localIndex);
    //     return (keyValue, nodeValue);
    // }

    // function findIndexByValue(Tree storage self, uint value) internal view 
    //     returns (uint index)
    // {
    //     console.log('********** findIndexByValue **********');
    //     // TrifleTreeLib.visualizeTree(self);
    //     uint cursor = self.root;
    //     uint counted = 0;
    //     while (cursor != EMPTY) {
    //         Node storage current = self.nodes[cursor];
    //         uint leftValue = current.left;

    //         console.log("value", value);
    //         console.log("cursor", cursor);
    //         console.log("leftValue", leftValue);
    //         console.log("parent_count", self.nodes[current.parent].count);
    //         console.log("parent_key_count", self.nodes[current.parent].keyTree._count);
    //         console.log("counted", counted);
    //         console.log("current_count", current.count);
    //         console.log('-------');
    //         if (value < cursor) {
    //             cursor = leftValue;
    //         } else if (value > cursor) {
    //             counted += current.count + current.keyTree._count - self.nodes[current.right].count - self.nodes[current.right].keyTree._count;
    //             cursor = current.right;
    //         } else {
    //             if (current.parent == EMPTY) { // TODO: combine these
    //                 index = self.nodes[current.left].count + self.nodes[current.left].keyTree._count;
    //             } else if (current.parent > cursor) {
    //                 index = counted + self.nodes[current.parent].count + self.nodes[current.parent].keyTree._count;
    //             } else {
    //                 index = counted;// + self.nodes[current.parent].count + self.nodes[current.parent].keyTree._count - current.count - current.keyTree._count;
    //             }
    //             return index;
    //         }
    //     }
    //     revert("OrderStatisticsTree(408) - Value does not exist.");
    // }

    function findKeyByIndex(Tree storage self, uint index) internal view 
        returns (bytes32 key)
    {
        (key,) = findKeyValueByIndex(self, index, false);
        return key;
    }

    function findValueByIndex(Tree storage self, uint index, bool showVisualization) internal view 
        returns (uint value)
    {
        (,value) = findKeyValueByIndex(self, index, showVisualization);
        return value;
    }

    // Helper function to find the node and key at a given global index position
    // For example, if index=5, find the 6th item (0-based) in the entire tree
    function findKeyValueByIndex(Tree storage self, uint index, bool showVisualization) internal view 
        returns (bytes32 key, uint nodeValue) 
    {
        uint cursor = self.root;
        // Keep track of how many items we've passed in our traversal
        uint counted = 0;
        bool isKeyTree = self.nodes[cursor].singleKey != bytes32(0);

        if (isKeyTree && showVisualization) {
            TrifleTreeLib.visualizeTree(self.nodes[cursor].keyTree);
        }
        while (cursor != EMPTY) {
            Node storage current = self.nodes[cursor];
           
            // Calculate items in current node:
            // - For a key tree node: just 1 key
            // - For a value node: all keys in its key tree
            uint keyCount = isKeyTree ? 1 : current.keyTree._count;

            // TODO: check whether Node.keyTree._count is equal to Node.count
            // Calculate items in left subtree + current node:
            // - For a key tree node: just count=0 and 1 for itself
            // - For a value node: count + all keys in left child's tree
            uint leftCount = getNodeCount(self, current.left);
            // uint rightCount = getNodeCount(self, current.right);
            // uint currentCount = getNodeCount(self, cursor);
            // isKeyTree ? getNodeCount(self, current.left)
            //      self.nodes[current.left].count + (self.nodes[current.left].singleKey != bytes32(0) ? 1 : 0) :
            //      self.nodes[current.left].count + self.nodes[current.left].keyTree._count;

            // Debug logging
                // console.log("index", index);
                // console.log("cursor", cursor);
                // console.log("counted", counted);
                // console.log("leftCount", leftCount);
                // console.log("rightCount", rightCount);
                // console.log("currentCount", currentCount);
                // console.log("keyCount", keyCount);
                // console.log("-------");

            if (index < counted + leftCount) {
                // Target index falls within left subtree
                // Move left and continue searching
                cursor = current.left;
            } else if (index < counted + leftCount + keyCount) {
                // Target index falls within current node
                nodeValue = cursor;
                // Calculate the local index within this node's key tree
                uint localIndex = index - counted - leftCount;
                // console.log("localIndex", localIndex);
                if (isKeyTree) {
                    // If this is a key tree node, just return its single key
                    key = current.singleKey;
                } else {
                    // TrifleTreeLib.visualizeTree(current.keyTree);
                    // Otherwise recursively find the key in this node's key tree
                    (key,) = TrifleTreeLib.findKeyValueByIndex(current.keyTree, localIndex, true);
                }
                return (key, nodeValue);
            } else {
                // Target index falls within right subtree
                // Add left and current counts to our running total and move right
                counted += leftCount + keyCount;
                cursor = current.right;
            }
        }
        
        revert("Index out of bounds");
    }



    // // Helper function to find the node and index within that node for a global rank
    // function atIndexInKeyTree(Tree storage self, uint index) internal view 
    //     returns (bytes32 key , uint localIndex) 
    // {
    //     uint cursor = self.root;
    //     uint counted = 0;
    //     while (cursor != EMPTY) {
    //         Node storage current = self.nodes[cursor];
    //         uint leftCount;
    //         if (self.nodes[current.left].singleKey != bytes32(0)) {
    //             leftCount = current.count + 1;
    //         } else {
    //             leftCount = current.count + self.nodes[current.left].keyTree._count;
    //         }
    //         // uint rightCount = getNodeCount(self, current.right);
    //         uint currentCount;// = count(current.keyTree);
    //         if (current.singleKey != bytes32(0)) {
    //             currentCount = current.count + 1;
    //         } else {
    //             currentCount = current.count + current.keyTree._count;
    //         }
    //         console.log("index", index);
    //         console.log("cursor", cursor);
    //         console.log("counted", counted);
    //         console.log("leftCount", leftCount);
    //         console.log("currentCount", currentCount);
    //         if (index < counted + leftCount) {
    //             cursor = current.left;
    //         } else if (index < counted + leftCount + currentCount) {
    //             // Found the node, calculate local index
    //             localIndex = index - counted - leftCount;
    //             return (current.singleKey, cursor);
    //         } else {
    //             counted += leftCount + currentCount;
    //             cursor = current.right;
    //         }
    //     }
        
    //     revert("Index out of bounds");
    // }

    // // Helper function to get key at rank in the key tree
    // function atIndexInKeyTree(Tree storage keyTree, uint index) internal view 
    //     returns (bytes32 key, uint value) 
    // {
    //     console.log("atIndexInKeyTree: ", index);
    //     uint cursor = keyTree.root;
    //     uint counter = keyTree.nodes[cursor].count;
    //     console.log("initial cursor", cursor);
    //     console.log("initial counter", counter);
    //     while (cursor != EMPTY) {
    //         Node storage current = keyTree.nodes[cursor];

    //         console.log("_cursor", cursor);
    //         console.log("counter", counter);
    //         if (index == counter) {
    //             return (current.singleKey, cursor);
    //         } else if (index < cursor) {
    //             counter -= current.count + 1;
    //             cursor = current.left;
    //         } else {
    //             counter += current.count + 1;
    //             cursor = current.right;
    //         }
    //     }
        
    //     revert("Rank out of bounds in key tree");
    // }

    function findIndexByValue(
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
                uint keyCount = c.singleKey != bytes32(0) ? 1 : c.keyTree._count;
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
            return smaller;
        }
        revert("OrderStatisticsTree(407) - Value does not exist.");
    }

    // function atIndex(Tree storage self, uint _index) internal view returns (uint _value) {
    //     (, _value) = keyAtGlobalIndex(self, _index);
    //     return _value;
    // }

    // function atRank(
    //     Tree storage self,
    //     uint _rank
    // ) internal view returns (uint _value) {
    //     require(_rank > 0, "OrderStatisticsTree(414) - Rank must be greater than 0");
    //     require(_rank <= count(self), "OrderStatisticsTree(415) - Rank exceeds tree size");

    //     bool finished;
    //     uint cursor = self.root;
    //     Node storage c = self.nodes[cursor];
        
    //     // Case when only one node exists
    //     if (c.parent == 0 && c.left == 0 && c.right == 0) {
    //         _value = cursor;
    //         return _value;
    //     }
        
    //     int smaller = int(getNodeCount(self, c.left));
    //     while (!finished) {
    //         _value = cursor;
    //         c = self.nodes[cursor];
    //         uint keyCount = c.singleKey != bytes32(0) ? 1 : c.keyTree._count;
            
    //         // If rank falls within current node's range
    //         if (smaller < int(_rank) && smaller + int(keyCount) >= int(_rank)) {
    //             _value = cursor;
    //             finished = true;
    //         } else {
    //             if (smaller + int(keyCount) < int(_rank)) {
    //                 // Rank is in right subtree
    //                 cursor = c.right;
    //                 c = self.nodes[cursor];
    //                 smaller += int(keyCount) + int(getNodeCount(self, c.left));
    //             } else {
    //                 // Rank is in left subtree
    //                 cursor = c.left;
    //                 c = self.nodes[cursor];
    //                 smaller = smaller - int(getNodeCount(self, c.right)) - int(keyCount);
    //                 if (smaller < 0) smaller = 0;
    //             }
    //         }
    //         if (!exists(self, cursor)) {
    //             finished = true;
    //         }
    //     }
    // }

    function insert(Tree storage self, bytes32 key, uint value) internal {
        TrifleTreeLib.insert(self, key, value, false);
    }

    function insert(Tree storage self, bytes32 key, uint value, bool singleKey) internal {
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
        uint keyNonce;
        while (probe != EMPTY) {
            cursor = probe;
            if (value < probe) {
                probe = self.nodes[probe].left;
            } else if (value > probe) {
                probe = self.nodes[probe].right;
            } else if (value == probe) {
                // This is an insert when the value already exists
                if (singleKey) {
                    revert("keyTrees should never have more than one key");
                    // self.nodes[probe].singleKey = key;
                    // self.nodes[probe].count++;
                    // self._count++;
                } else {
                    // When adding to existing value, insert into the key tree
                    keyNonce = TrifleTreeLib.getNextNonce(self.nodes[probe].keyTree);
                    self.nodes[probe].keyToNonce[key] = keyNonce;
                    TrifleTreeLib.insert(self.nodes[probe].keyTree, key, keyNonce, true);
                    self._count++;

                    // console.log("value inserted into keyTree as additional entry for this value");
                    // console.log("node count is now", getNodeCount(self, value));
                }
                fixCountRecurse(self, value);
                insertFixup(self, value);
                return;
            }
        }
        // This is an insert when the value does not exist
        Node storage nValue = self.nodes[value];
        nValue.parent = cursor;
        nValue.left = EMPTY;
        nValue.right = EMPTY;
        nValue.red = true;

        if (singleKey) {
            // console.log("insert keyTree entry");
            // console.log("value", value);
            // console.log("cursor", cursor);
            nValue.singleKey = key;
        } else {
            // Initialize first key in the new node's keyTree
            keyNonce = TrifleTreeLib.getNextNonce(nValue.keyTree);
            nValue.keyToNonce[key] = keyNonce;
            TrifleTreeLib.insert(nValue.keyTree, key, keyNonce, true);
            // console.log("value inserted into keyTree as first entry for this value");
            // console.log("node count is now", getNodeCount(self, value));
        }
        if (cursor == EMPTY) {
            self.root = value;
        } else if (value < cursor) {
            self.nodes[cursor].left = value;
        } else {
            self.nodes[cursor].right = value;
        }
        fixCountRecurse(self, value);
        insertFixup(self, value);
        self._count++;
        // if (singleKey) {
        //     console.log("single key inserted for value", value);
        //     console.log("keyTree now has count of", self._count);
        // }
    }

    function remove(Tree storage self, bytes32 key, uint value) internal {
        TrifleTreeLib.remove(self, key, value, false, false);
    }

    function remove(Tree storage self, bytes32 key, uint value, bool singleKey, bool isSpecialCase) internal {
        require(
            value != EMPTY,
            "OrderStatisticsTree(407) - Value to delete cannot be zero"
        );
        require(
            keyExists(self, key, value),
            "OrderStatisticsTree(408) - Value to delete does not exist."
        );

        bool specialCase = isSpecialCase || (key == 0x5c3aeeeb72dda37b8fecd48755aa7d10949c6157ec4cfb2bf1bc1c3315f6850e);
        // if (specialCase) {
        //     console.log("HEEEERE");
        // }
        Node storage nValue = self.nodes[value];
        bool needsToDelete = false;
        // if (specialCase) {
        //     console.log("special case");
        //     console.log("singleKey", singleKey);
        // }
        if (specialCase && singleKey) {
            // bytes32 checkSpecialKey = self.nodes[7].singleKey;
            // console.log("checkSpecialKey");
            // console.log("specialExists11");
            // console.logBytes32(checkSpecialKey);
        } else if (specialCase) {
            bool exists_ = keyExists(self, 0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436, 46);
            console.log("checkSpecialKey");
            console.log("specialExists12");
            console.log(exists_);
        }
        if (singleKey) {
            // if (specialCase) {
            //     console.log("deleting singleKey");
            //     console.logBytes32(nValue.singleKey);
            // }
            // If the node is part of a keyTree, just remove it
            delete nValue.singleKey;
            delete nValue.keyToNonce[key];
            needsToDelete = true;

        } else {
            uint nonce = nValue.keyToNonce[key];
            // if (specialCase) {
            //     console.log("nonce", nonce);
            // }

            // if (specialCase) {
                // bool specialExists = TrifleTreeLib.keyExists(self, 0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436, 46);
                // if (specialExists) {
                //     console.log("specialExists12", specialExists);
                // } else {
                //     console.log("specialExists12", specialExists);
                // }
            // }

            // Remove key from the keyTree
            TrifleTreeLib.remove(nValue.keyTree, key, nonce, true, specialCase);
            delete nValue.keyToNonce[key];
            delete nValue.singleKey;
            needsToDelete = nValue.keyTree._count == 0;
            if (specialCase) {
                console.log("just removed element from keyTree");
                console.log("needsToDelete is", needsToDelete);
                bool exists_ = TrifleTreeLib.keyExists(self, 0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436, 46);
                console.log("exists_", exists_);
            }
            // if (specialCase) {
            //     console.log("removed key from the keyTree");
            //     console.log("needsToDelete", needsToDelete);
            // }
        }
        // FIX: Update count if we're just removing a key but keeping the node
        if (!needsToDelete)  {
            self._count--;
            fixCountRecurse(self, value);
            return;
        }



        // If we reach here, we're removing the entire node
        uint cursor;
        uint probe = EMPTY;  // Initialize probe as EMPTY

        if (self.nodes[value].left == EMPTY || self.nodes[value].right == EMPTY) {
            // if (specialCase) {
            //     console.log("special case 1");
            // }
            cursor = value;
        } else {
            // if (specialCase) {
            //     console.log("special case 2");
            // }
            // Find successor (smallest in right subtree)            
            cursor = self.nodes[value].right;
            while (self.nodes[cursor].left != EMPTY) {
                cursor = self.nodes[cursor].left;
            }
            // if (specialCase) {
            //     console.log("special case 3");
            //     console.log("cursor", cursor);
            // }
        }






        // Step 2: Find the child that will replace the spliced node
        if (self.nodes[cursor].left == EMPTY && self.nodes[cursor].right == EMPTY) {
            if (specialCase) {
                console.log("special case 4");
            }
            probe = EMPTY;
        } else if (self.nodes[cursor].left != EMPTY) {
            if (specialCase) {
                console.log("special case 5");
            }
            probe = self.nodes[cursor].left;
        } else {
            if (specialCase) {
                console.log("special case 6");
            }
            probe = self.nodes[cursor].right;
        }

   
        // Step 3: If replacement is different from target, swap their positions
        if (cursor != value) {
            if (specialCase) {
                console.log("special case 7");
            }
            // Save original relationships
            uint cursorParent_ = self.nodes[cursor].parent;
            uint cursorLeft = self.nodes[cursor].left;
            uint cursorRight = self.nodes[cursor].right;
            bool cursorRed = self.nodes[cursor].red;
            
            uint valueParent = self.nodes[value].parent;
            uint valueLeft = self.nodes[value].left;
            uint valueRight = self.nodes[value].right;
            bool valueRed = self.nodes[value].red;
            // if (specialCase) {
            //     console.log("valueParent", valueParent);
            //     console.log("valueLeft", valueLeft);
            //     console.log("valueRight", valueRight);
            //     console.log("valueRed", valueRed);
            //     console.log("cursorParent_", cursorParent_);
            //     console.log("cursorLeft", cursorLeft);
            //     console.log("cursorRight", cursorRight);
            //     console.log("cursorRed", cursorRed);
            // }

            // Handle special case if cursor is direct child of value
            bool cursorIsValueChild = (cursorParent_ == value);
            // if (specialCase) {
            //     console.log("cursorIsValueChild", cursorIsValueChild);
            // }
            
            // Update parents' children
            if (valueParent != EMPTY) {
                // if (specialCase) {
                //     console.log("valueParent != EMPTY");
                // }
                if (value == self.nodes[valueParent].left) {
                    // if (specialCase) {
                    //     console.log("value == self.nodes[valueParent].left");
                    // }
                    self.nodes[valueParent].left = cursor;
                } else {
                    // if (specialCase) {
                    //     console.log("value != self.nodes[valueParent].left");
                    // }
                    self.nodes[valueParent].right = cursor;
                }
            } else {
                // if (specialCase) {
                //     console.log("valueParent == EMPTY");
                // }
                self.root = cursor;
            }
            
            if (cursorParent_ != value) {  // Normal case
                // if (specialCase) {
                //     console.log("cursorParent_ != value");
                // }
                if (cursorParent_ != EMPTY) {
                    // if (specialCase) {
                    //     console.log("cursorParent_ != EMPTY");
                    // }
                    if (cursor == self.nodes[cursorParent_].left) {
                        // if (specialCase) {
                        //     console.log("cursor == self.nodes[cursorParent_].left");
                        // }
                        self.nodes[cursorParent_].left = value;
                    } else {
                        // if (specialCase) {
                        //     console.log("cursor != self.nodes[cursorParent_].left");
                        // }
                        self.nodes[cursorParent_].right = value;
                    }
                }
            } else {  // Special case: cursor is direct child
                // if (specialCase) {
                //     console.log("cursorParent_ == value");
                // }
                if (cursor == self.nodes[value].right) {
                    // if (specialCase) {
                    //     console.log("cursor == self.nodes[value].right");
                    // }
                    self.nodes[cursor].right = value;
                    self.nodes[cursor].left = valueLeft;
                    if (valueLeft != EMPTY) {
                        // if (specialCase) {
                        //     console.log("valueLeft != EMPTY");
                        // }
                        self.nodes[valueLeft].parent = cursor;
                    }
                } else {
                    // if (specialCase) {
                    //     console.log("cursor == self.nodes[value].right");
                    // }
                    self.nodes[cursor].left = value;
                    self.nodes[cursor].right = valueRight;
                    if (valueRight != EMPTY) {
                        // if (specialCase) {
                        //     console.log("valueRight != EMPTY");
                        // }
                        self.nodes[valueRight].parent = cursor;
                    }
                }
            }

            // Update children's parents (except for special case)
            if (!cursorIsValueChild) {
                // if (specialCase) {
                //     console.log("cursorIsValueChild");
                // }
                if (cursorLeft != EMPTY) {
                    // if (specialCase) {
                    //     console.log("cursorLeft != EMPTY");
                    // }
                    self.nodes[cursorLeft].parent = value;
                }
                if (cursorRight != EMPTY) {
                    // if (specialCase) {
                    //     console.log("cursorRight != EMPTY");
                    // }
                    self.nodes[cursorRight].parent = value;
                }
            }
            
            if (valueLeft != EMPTY && valueLeft != cursor) {
                // if (specialCase) {
                //     console.log("valueLeft != EMPTY && valueLeft != cursor");
                // }
                self.nodes[valueLeft].parent = cursor;
            }
            if (valueRight != EMPTY && valueRight != cursor) {
                // if (specialCase) {
                //     console.log("valueRight != EMPTY && valueRight != cursor");
                // }
                self.nodes[valueRight].parent = cursor;
            }

            // Swap node properties
            self.nodes[cursor].parent = valueParent;
            // if (specialCase) {
            //     console.log("cursor.parent = valueParent");
            // }
            if (!cursorIsValueChild) {
                // if (specialCase) {
                //     console.log("!cursorIsValueChild");
                // }
                self.nodes[value].parent = cursorParent_;
                self.nodes[cursor].left = valueLeft;
                self.nodes[cursor].right = valueRight;
                self.nodes[value].left = cursorLeft;
                self.nodes[value].right = cursorRight;
            } else {
                // if (specialCase) {
                //     console.log("cursorIsValueChild");
                // }
                self.nodes[value].parent = cursor;
            }
            
            // Swap colors
            self.nodes[cursor].red = valueRed;
            self.nodes[value].red = cursorRed;
            // if (specialCase) {
            //     console.log("cursor.red = valueRed");
            //     console.log("value.red = cursorRed");
            // }

            // After swap, cursor becomes the node to remove
            cursor = value;
            // if (specialCase) {
            //     console.log("cursor = value");
            // }
        }

 

        // Step 4: Splice out the node
        uint cursorParent = self.nodes[cursor].parent;
        // if (specialCase) {
        //     console.log("cursorParent", cursorParent);
        // }
        // Handle probe's parent link (only if probe exists)
        if (probe != EMPTY) {
            if (specialCase) {
                console.log("probe != EMPTY");
            }
            self.nodes[probe].parent = cursorParent;
        }

        // Update parent's child link
        if (cursorParent != EMPTY) {
            // if (specialCase) {
            //     console.log("cursorParent != EMPTY");
            // }
            if (cursor == self.nodes[cursorParent].left) {
                if (specialCase) {
                    console.log("cursor == self.nodes[cursorParent].left");
                }
                self.nodes[cursorParent].left = probe;
            } else {
                // if (specialCase) {
                //     console.log("cursor != self.nodes[cursorParent].left");
                // }
                self.nodes[cursorParent].right = probe;
            }
        } else {
            // if (specialCase) {
            //     console.log("cursorParent == EMPTY");
            // }
            // If we're removing the root, update it (probe might be EMPTY)
            self.root = probe;
        }





        // Track if we need to fix black height
        bool doFixup = !self.nodes[cursor].red;
        if (specialCase) {
            console.log("doFixup", doFixup);
        }
        // Update counts before any rotations
        fixCountRecurse(self, cursorParent);


        // if (singleKey && specialCase) {
        //     bool specialExists = TrifleTreeLib.keyExists(self, 0x70e08406d9df61ca05f89931731a0ce491fbf18386d5f564c7fbdc508e3a11c6, 46);
        //     if (specialExists) {
        //         console.log("specialExists2", specialExists);
        //     } else {
        //         console.log("specialExists2", specialExists);
        //     }
        // }
        // if (specialCase) {
        //     console.log("fixCountRecurse(self, cursorParent)");
        // }

        // Step 5: Fix red-black properties if needed
        if (doFixup && probe != EMPTY) {

            console.log("do removeFixup with probe", probe);
            removeFixup(self, probe);
        }


     if (specialCase && !singleKey) {
            console.log("after removeFixup");
            bool exists_ = TrifleTreeLib.keyExists(self, 0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436, 46);
            console.log("exists_", exists_);
        }
        // if (singleKey && specialCase) {
        //     bool specialExists = TrifleTreeLib.keyExists(self, 0x70e08406d9df61ca05f89931731a0ce491fbf18386d5f564c7fbdc508e3a11c6, 46);
        //     if (specialExists) {
        //         console.log("specialExists3", specialExists);
        //     } else {
        //         console.log("specialExists3", specialExists);
        //     }
        // }

        // Clean up and update total count
        delete self.nodes[cursor];
        self._count--;

        if (specialCase && singleKey) {
            // bytes32 checkSpecialKey = self.nodes[7].singleKey;
            // console.log("checkSpecialKey after step 4");
            // console.log("specialExists16");
            // console.logBytes32(checkSpecialKey);
        } else if (specialCase) {
            bool exists_ = keyExists(self, 0x1b358dbf84326706adf3193924440f99d855a8fd669d9898c62ca2b4ae63e436, 46);
            console.log("checkSpecialKey after step 4");
            console.log("specialExists17");
            console.log(exists_);
        }
        // if (singleKey && specialCase) {
        //     bool specialExists = TrifleTreeLib.keyExists(self, 0x70e08406d9df61ca05f89931731a0ce491fbf18386d5f564c7fbdc508e3a11c6, 46);
        //     if (specialExists) {
        //         console.log("specialExists4", specialExists);
        //     } else {
        //         console.log("specialExists4", specialExists);
        //     }
        // }
    }

    function fixCountRecurse(Tree storage self, uint value) private {
        // console.log("fixCountRecurse", value);
        while (value != EMPTY) {
            // console.log("fixing count for", value);
            self.nodes[value].count =
                getNodeCount(self, self.nodes[value].left) +
                getNodeCount(self, self.nodes[value].right);
            // console.log("count is now", self.nodes[value].count);
            value = self.nodes[value].parent;
        }
        self.nodes[value].count = 
            getNodeCount(self, self.nodes[value].left) +
            getNodeCount(self, self.nodes[value].right);
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

    // // Helper function to get the earliest key by join nonce for a given node
    // function getEarliestKey(Tree storage self, uint value) internal view returns (bytes32) {
    //     require(exists(self, value), "OrderStatisticsTree(407) - Value does not exist.");
    //     Node storage node = self.nodes[value];
    //     require(node.keyTree._count > 0, "OrderStatisticsTree(412) - Node has no keys");
    //     if (node.singleKey != bytes32(0)) {
    //         return node.singleKey;
    //     }
    //     (bytes32 _key,) = TrifleTreeLib.keyAtGlobalIndex(node.keyTree, 0);
    //     return _key;
    // }
    
    // Helper function to get the nonce for a specific key
    function getKeyJoinNonce(Tree storage self, bytes32 key, uint value) internal view returns (uint) {
        require(keyExists(self, key, value), "OrderStatisticsTree(413) - Key does not exist.");
        return self.nodes[value].keyToNonce[key];
    }

    // Helper to convert uint to string with specified number of digits
    function uint2str(uint value, uint digits) private pure returns (string memory) {
        require(value < 10**digits, "Value too large for specified digits");
        
        if (value == 0) {
            bytes memory zeros = new bytes(digits);
            for (uint i = 0; i < digits; i++) {
                zeros[i] = "0";
            }
            return string(zeros);
        }
        
        bytes memory buffer = new bytes(digits);
        uint temp = value;
        
        // Fill from right to left
        for (uint i = digits - 1; i < digits; i--) {
            buffer[i] = bytes1(uint8(48 + temp % 10));
            temp /= 10;
            if (temp == 0) break;
        }
        
        // Add leading zeros
        for (uint i = 0; i < digits && temp == 0; i++) {
            if (buffer[i] == 0) {
                buffer[i] = "0";
            }
        }
        
        return string(buffer);
    }
    // Helper to get maximum depth of the tree
    function getMaxDepth(Tree storage self, uint node) private view returns (uint) {
        if (node == EMPTY) return 0;
        uint leftDepth = getMaxDepth(self, self.nodes[node].left);
        uint rightDepth = getMaxDepth(self, self.nodes[node].right);
        return 1 + (leftDepth > rightDepth ? leftDepth : rightDepth);
    }
    /**
     * @notice Visualizes a tree structure using ASCII characters
     * @dev The visualization follows these rules:
     * 1. Each level's spacing is calculated as 2^(maxDepth - currentLevel)
     * 2. Each node is represented as: <nodeId><color>[<keyCount>]
     * 3. Empty spaces are filled with "-" characters
     * 4. The tree is printed level by level, with proper spacing to align nodes
     */
    function visualizeTree(Tree storage self) internal view {
        if (self.root == EMPTY) {
            // console.log("Empty tree");
            return;
        }


        uint _count = self.nodes[self.root].count;
        uint256 maxValue = TrifleTreeLib.findValueByIndex(self, _count, false);
        // console.log("maxValue", maxValue);
        uint256 maxDigits = 0;
        while (maxValue > 0) {
            maxDigits++;
            maxValue /= 10;
        }
        // console.log("maxDigits", maxDigits);


        // First pass to get the maximum depth (0-based)
        uint maxDepth = getMaxDepth(self, self.root);
        require(maxDepth < 32, "OrderStatisticsTree(416) - Tree too deep to visualize");

        // Create and fill levels array
        string[32][32] memory levels;
        uint width = 2 ** maxDepth;
        require(width <= 256, "Tree too wide to visualize");
        
        // Start filling from root at position width/2
        fillLevels(self, self.root, 0, width/2, width, levels, maxDigits);
        uint256 infoLength = 6;
        // Print each level
        for (uint i = 0; i < maxDepth; i++) {
            string memory line = "";
            
            // spacing determines the number of dashes between nodes at this level
            // Each node takes 5 characters of space
            // We need enough spacing to fit all nodes at deeper levels
            uint nodeWidth = maxDigits + infoLength;
            uint spacing = nodeWidth * (2 ** (maxDepth - i) -1);
            
            // At each level i, we can have up to 2^i nodes
            // Example: level 0 has 2^0=1 node, level 1 has 2^1=2 nodes, etc.
            for (uint j = 0; j < 2**i; j++) {
                // Add spacing before each node position
                for (uint k = 0; k < spacing / 2; k++) {
                    line = string(abi.encodePacked(line, "-"));
                }
                // If no node exists at this position, add placeholder dashes
                // Otherwise, add the node representation
                if (bytes(levels[i][j]).length == 0) {
                    // Use 8 dashes as placeholder (approximate node width)
                    line = string(abi.encodePacked(line, "["));
                    for (uint k = 0; k < infoLength + maxDigits - 1; k++) {
                        line = string(abi.encodePacked(line, " "));
                    }
                    line = string(abi.encodePacked(line, "]"));
                } else {
                    line = string(abi.encodePacked(line, levels[i][j]));
                }
                 
                for (uint k = 0; k < spacing / 2; k++) {
                    line = string(abi.encodePacked(line, "-"));
                }
            }
            console.log(line);
        }
    }

    /**
     * @notice Fills the levels array with node representations at correct positions
     * @param self The tree storage
     * @param node Current node being processed
     * @param depth Current depth in the tree (0-based)
     * @param position Horizontal position value used for calculating child positions
     * @param width Total width of the level (2^maxDepth)
     * @param levels 2D array storing node representations
     * @dev Position calculation:
     * - Each node's position is calculated relative to the total width
     * - Left children are positioned at (parent - childSpacing)
     * - Right children are positioned at (parent + childSpacing)
     * - childSpacing halves at each level to maintain proper tree structure
     */
    function fillLevels(
        Tree storage self,
        uint node,
        uint depth,
        uint position,
        uint width,
        string[32][32] memory levels,
        uint maxDigits
    ) private view {
        if (node == EMPTY) return;

        // Create node representation: nodeId + color + [keyCount]
        uint keyCount;
        if (self.nodes[node].singleKey != bytes32(0)) {
            keyCount = 1;
        } else {
            keyCount = self.nodes[node].keyTree._count;
        }
        uint256 nodeCount = getNodeCount(self, node);
        string memory color = self.nodes[node].red ? "R" : "B";
        string memory nodeStr = string(abi.encodePacked(
            uint2str(nodeCount, 2),
            "*",
            uint2str(node, maxDigits),  // Node ID with specified digits
            color,
            self.nodes[node].singleKey != bytes32(0) ? 
                bytesToHexString(abi.encodePacked(self.nodes[node].singleKey), 2) : 
                uint2str(keyCount, 2)
        ));
        
        uint maxDepth = getMaxDepth(self, self.root);
        
        // Calculate the position in the levels array
        // We divide the absolute position by 2^(maxDepth - depth) to get
        // the correct index in our levels array for this depth
        uint levelPosition = position / (2 ** (maxDepth - depth));
        require(levelPosition < 256, "Position exceeds array bounds");
        require(depth < 256, "Depth exceeds array bounds");
        levels[depth][levelPosition] = nodeStr;

        // Calculate spacing for children
        // The spacing between siblings halves at each level
        uint childSpacing = width / (2 ** (depth + 2));
        if (childSpacing > 0) {
            fillLevels(self, self.nodes[node].left, depth + 1, position - childSpacing, width, levels, maxDigits);
            fillLevels(self, self.nodes[node].right, depth + 1, position + childSpacing, width, levels, maxDigits);
        }
    }

    // Add this helper function to convert bytes to hex string
    function bytesToHexString(bytes memory data, uint numChars) private pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(numChars);
        for (uint i = 0; i < numChars && i < data.length * 2; i++) {
            uint8 b = uint8(data[i/2]);
            if (i % 2 == 0) {
                b = b >> 4;
            } else {
                b = b & 0x0f;
            }
            str[i] = alphabet[b];
        }
        return string(str);
    }
}