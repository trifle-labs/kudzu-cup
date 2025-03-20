// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title AugmentedLLRBTree
 * @dev Implementation of Left-Leaning Red-Black Tree with the following characteristics:
 * - Values are sorted in increasing order (smallest at index 0)
 * - Each node stores a value and an associated address
 * - Each address can only have one entry at a time
 * - Nodes can be queried by sorted index
 * - When two nodes have the same value, the older node is given the higher index
 * - Age of nodes is tracked using an insertion nonce and cleaned up on removal
 */
contract AugmentedLLRBTree {
    enum Color {
        RED,
        BLACK
    }

    struct Node {
        uint256 value; // The value to be sorted
        address owner; // The address associated with this value
        uint256 nonce; // Insertion nonce (for breaking ties)
        uint256 size; // Size of the subtree (augmentation for index queries)
        Color color; // Color of the node
        uint256 left; // Index of left child
        uint256 right; // Index of right child
    }

    // Storage variables
    mapping(uint256 => Node) private nodes; // Node storage by node ID
    mapping(address => uint256) private ownerToNode; // Maps owner address to their node ID
    uint256 private root; // Root node ID
    uint256 private NIL; // Sentinel NIL node ID
    uint256 private nodeCount; // Total number of nodes in the tree
    uint256 private insertionNonce; // Monotonically increasing nonce for insertion order

    // Events
    event NodeInserted(address indexed owner, uint256 value, uint256 nonce);
    event NodeRemoved(address indexed owner, uint256 value);

    /**
     * @dev Constructor to initialize the tree
     */
    constructor() {
        // Initialize NIL sentinel node
        NIL = 0;
        nodes[NIL] = Node({
            value: 0,
            owner: address(0),
            nonce: 0,
            size: 0,
            color: Color.BLACK,
            left: 0,
            right: 0
        });
        root = NIL;
        nodeCount = 0;
        insertionNonce = 0;
    }

    /**
     * @dev Get the number of nodes in the tree
     * @return The total number of nodes
     */
    function size() public view returns (uint256) {
        return nodeCount;
    }

    /**
     * @dev Check if the tree contains a node for the given address
     * @param owner The address to check
     * @return True if the address has a node in the tree
     */
    function contains(address owner) public view returns (bool) {
        return ownerToNode[owner] != 0;
    }

    /**
     * @dev Get the value associated with an address
     * @param owner The address to look up
     * @return The value associated with the address
     */
    function getValue(address owner) public view returns (uint256) {
        uint256 nodeId = ownerToNode[owner];
        require(nodeId != 0, "Owner does not exist in the tree");
        return nodes[nodeId].value;
    }

    /**
     * @dev Insert a new value with associated address
     * @param value The value to insert
     * @param owner The address to associate with the value
     */
    function insert(uint256 value, address owner) public {
        require(owner != address(0), "Cannot insert zero address");

        // If owner already exists, remove their current node first
        if (ownerToNode[owner] != 0) {
            remove(owner);
        }

        // Create a new node with increasing nonce
        uint256 nonce = insertionNonce++;
        uint256 nodeId = _createNode(value, owner, nonce);

        // Insert the node into the tree
        root = _insert(root, nodeId);
        nodes[root].color = Color.BLACK;

        // Update mappings
        ownerToNode[owner] = nodeId;
        nodeCount++;

        emit NodeInserted(owner, value, nonce);
    }

    /**
     * @dev Remove a node by owner address
     * @param owner The address whose node should be removed
     */
    function remove(address owner) public {
        uint256 nodeId = ownerToNode[owner];
        require(nodeId != 0, "Owner does not exist in the tree");

        uint256 value = nodes[nodeId].value;

        // If the tree becomes 2-3-4 tree (temporarily)
        if (!_isRed(nodes[root].left) && !_isRed(nodes[root].right)) {
            nodes[root].color = Color.RED;
        }

        root = _remove(root, nodeId);

        if (root != NIL) {
            nodes[root].color = Color.BLACK;
        }

        // Clean up mappings
        delete ownerToNode[owner];
        nodeCount--;

        emit NodeRemoved(owner, value);
    }

    /**
     * @dev Get the value and owner address at a specific rank in the sorted order
     * @param rank The rank (0 is largest value)
     * @return The value and owner address at the given rank
     */
    function getValueAndOwnerAtRank(
        uint256 rank
    ) public view returns (uint256, address) {
        require(rank < nodeCount, "Rank out of bounds");
        uint256 index = nodeCount - rank - 1;
        uint256 nodeId = _findByIndex(root, index);
        return (nodes[nodeId].value, nodes[nodeId].owner);
    }

    /**
     * @dev Get the value at a specific rank in the sorted order
     * @param rank The rank (0 is largest value)
     * @return The value at the given rank
     */
    function getValueAtRank(uint256 rank) public view returns (uint256) {
        require(rank < nodeCount, "Rank out of bounds");
        uint256 index = nodeCount - rank - 1;
        uint256 nodeId = _findByIndex(root, index);
        return nodes[nodeId].value;
    }

    /**
     * @dev Get the owner address at a specific rank in the sorted order
     * @param rank The rank (0 is largest value)
     * @return The owner address at the given rank
     */
    function getOwnerAtRank(uint256 rank) public view returns (address) {
        require(rank < nodeCount, "Rank out of bounds");
        uint256 index = nodeCount - rank - 1;
        uint256 nodeId = _findByIndex(root, index);
        return nodes[nodeId].owner;
    }

    /**
     * @dev Get the value and owner address at a specific index in the sorted order
     * @param index The index (0 is smallest value)
     * @return The value and owner address at the given index
     */
    function getValueAndOwnerAtIndex(
        uint256 index
    ) public view returns (uint256, address) {
        require(index < nodeCount, "Index out of bounds");
        uint256 nodeId = _findByIndex(root, index);
        return (nodes[nodeId].value, nodes[nodeId].owner);
    }

    /**
     * @dev Get the value at a specific index in the sorted order
     * @param index The index (0 is smallest value)
     * @return The value at the given index
     */
    function getValueAtIndex(uint256 index) public view returns (uint256) {
        require(index < nodeCount, "Index out of bounds");
        uint256 nodeId = _findByIndex(root, index);
        return nodes[nodeId].value;
    }

    /**
     * @dev Get the owner address at a specific index in the sorted order
     * @param index The index (0 is smallest value)
     * @return The owner address at the given index
     */
    function getOwnerAtIndex(uint256 index) public view returns (address) {
        require(index < nodeCount, "Index out of bounds");
        uint256 nodeId = _findByIndex(root, index);
        return nodes[nodeId].owner;
    }

    /**
     * @dev Get the index of a node for a given owner
     * @param owner The address to find
     * @return The index of the owner's node
     */
    function getIndexOfOwner(address owner) public view returns (uint256) {
        uint256 nodeId = ownerToNode[owner];
        require(nodeId != 0, "Owner does not exist in the tree");
        return _getNodeIndex(nodeId);
    }

    /**
     * @dev Get the nonce of a node for a given owner
     * @param owner The address to find
     * @return The nonce of when the owner's node was inserted
     */
    function getNonce(address owner) public view returns (uint256) {
        uint256 nodeId = ownerToNode[owner];
        require(nodeId != 0, "Owner does not exist in the tree");
        return nodes[nodeId].nonce;
    }

    // INTERNAL FUNCTIONS

    /**
     * @dev Creates a new node with the given values
     */
    function _createNode(
        uint256 value,
        address owner,
        uint256 nonce
    ) private returns (uint256) {
        // Use keccak256 to generate a unique ID for the node
        uint256 nodeId = uint256(
            keccak256(abi.encodePacked(value, owner, nonce, nodeCount))
        );

        // Create the node
        nodes[nodeId] = Node({
            value: value,
            owner: owner,
            nonce: nonce,
            size: 1,
            color: Color.RED, // New nodes are always red
            left: NIL,
            right: NIL
        });

        return nodeId;
    }

    /**
     * @dev Internal function to insert a node
     */
    function _insert(uint256 h, uint256 nodeId) private returns (uint256) {
        if (h == NIL) {
            return nodeId;
        }

        // Compare value and nonce for insertion order:
        // - First by value (ascending)
        // - Then by nonce (descending, lower nonce is older and should be higher in tree for same value)
        Node storage node = nodes[nodeId];
        Node storage hNode = nodes[h];

        if (
            node.value < hNode.value ||
            (node.value == hNode.value && node.nonce > hNode.nonce)
        ) {
            // Insert to the left
            hNode.left = _insert(hNode.left, nodeId);
        } else {
            // Insert to the right
            hNode.right = _insert(hNode.right, nodeId);
        }

        // Fix Right-leaning red nodes (LLRB property)
        if (_isRed(hNode.right) && !_isRed(hNode.left)) {
            h = _rotateLeft(h);
            hNode = nodes[h]; // Update hNode after rotation
        }

        // Fix two consecutive red nodes
        if (_isRed(hNode.left) && _isRed(nodes[hNode.left].left)) {
            h = _rotateRight(h);
            hNode = nodes[h]; // Update hNode after rotation
        }

        // Split 4-nodes
        if (_isRed(hNode.left) && _isRed(hNode.right)) {
            _flipColors(h);
        }

        // Update the size
        _updateSize(h);

        return h;
    }

    /**
     * @dev Internal function to remove a node
     */
    function _remove(uint256 h, uint256 nodeId) private returns (uint256) {
        Node storage hNode = nodes[h];
        Node storage target = nodes[nodeId];

        if (
            target.value < hNode.value ||
            (target.value == hNode.value && target.nonce > hNode.nonce)
        ) {
            // Target is to the left
            if (!_isRed(hNode.left) && !_isRed(nodes[hNode.left].left)) {
                h = _moveRedLeft(h);
                hNode = nodes[h]; // Update hNode after move
            }
            hNode.left = _remove(hNode.left, nodeId);
        } else {
            // Target is this node or to the right
            if (_isRed(hNode.left)) {
                h = _rotateRight(h);
                hNode = nodes[h]; // Update hNode after rotation
            }

            if (nodeId == h && hNode.right == NIL) {
                // TODO: check what happens when _remove returns NIL;
                return NIL;
            }

            if (!_isRed(hNode.right) && !_isRed(nodes[hNode.right].left)) {
                h = _moveRedRight(h);
                hNode = nodes[h]; // Update hNode after move
            }

            if (nodeId == h) {
                // Find the minimum node in the right subtree
                uint256 minRightId = _findMin(hNode.right);
                Node storage minRight = nodes[minRightId];

                // Copy data from successor
                hNode.value = minRight.value;
                hNode.owner = minRight.owner;
                hNode.nonce = minRight.nonce;

                // Update the reference in ownerToNode
                ownerToNode[hNode.owner] = h;

                // Remove the successor
                hNode.right = _removeMin(hNode.right);
            } else {
                hNode.right = _remove(hNode.right, nodeId);
            }
        }

        return _balance(h);
    }

    /**
     * @dev Remove the minimum node in a subtree
     */
    function _removeMin(uint256 h) private returns (uint256) {
        if (nodes[h].left == NIL) {
            return NIL;
        }

        Node storage hNode = nodes[h];
        if (!_isRed(hNode.left) && !_isRed(nodes[hNode.left].left)) {
            h = _moveRedLeft(h);
            hNode = nodes[h]; // Update hNode after move
        }

        hNode.left = _removeMin(hNode.left);

        return _balance(h);
    }

    /**
     * @dev Balance a node after removal operations
     */
    function _balance(uint256 h) private returns (uint256) {
        Node storage hNode = nodes[h];

        if (_isRed(hNode.right)) {
            h = _rotateLeft(h);
            hNode = nodes[h]; // Update hNode after rotation
        }

        if (_isRed(hNode.left) && _isRed(nodes[hNode.left].left)) {
            h = _rotateRight(h);
            hNode = nodes[h]; // Update hNode after rotation
        }

        if (_isRed(hNode.left) && _isRed(hNode.right)) {
            _flipColors(h);
        }

        _updateSize(h);
        return h;
    }

    /**
     * @dev Move a red node from the right to the left
     */
    function _moveRedLeft(uint256 h) private returns (uint256) {
        _flipColors(h);

        Node storage hNode = nodes[h];
        if (_isRed(nodes[hNode.right].left)) {
            hNode.right = _rotateRight(hNode.right);
            h = _rotateLeft(h);
            _flipColors(h);
        }

        return h;
    }

    /**
     * @dev Move a red node from the left to the right
     */
    function _moveRedRight(uint256 h) private returns (uint256) {
        _flipColors(h);

        Node storage hNode = nodes[h];
        if (_isRed(nodes[hNode.left].left)) {
            h = _rotateRight(h);
            _flipColors(h);
        }

        return h;
    }

    /**
     * @dev Rotate a node to the left
     */
    function _rotateLeft(uint256 h) private returns (uint256) {
        Node storage hNode = nodes[h];
        uint256 x = hNode.right;
        Node storage xNode = nodes[x];

        hNode.right = xNode.left;
        xNode.left = h;
        xNode.color = hNode.color;
        hNode.color = Color.RED;

        xNode.size = hNode.size;
        _updateSize(h);

        return x;
    }

    /**
     * @dev Rotate a node to the right
     */
    function _rotateRight(uint256 h) private returns (uint256) {
        Node storage hNode = nodes[h];
        uint256 x = hNode.left;
        Node storage xNode = nodes[x];

        hNode.left = xNode.right;
        xNode.right = h;
        xNode.color = hNode.color;
        hNode.color = Color.RED;

        xNode.size = hNode.size;
        _updateSize(h);

        return x;
    }

    /**
     * @dev Flip the colors of a node and its children
     */
    function _flipColors(uint256 h) private {
        Node storage hNode = nodes[h];
        hNode.color = hNode.color == Color.RED ? Color.BLACK : Color.RED;
        nodes[hNode.left].color = nodes[hNode.left].color == Color.RED
            ? Color.BLACK
            : Color.RED;
        nodes[hNode.right].color = nodes[hNode.right].color == Color.RED
            ? Color.BLACK
            : Color.RED;
    }

    /**
     * @dev Update the size of a node based on its children
     */
    function _updateSize(uint256 h) private {
        Node storage hNode = nodes[h];
        hNode.size = _getSize(hNode.left) + _getSize(hNode.right) + 1;
    }

    /**
     * @dev Get the size of a subtree
     */
    function _getSize(uint256 h) private view returns (uint256) {
        if (h == NIL) return 0;
        return nodes[h].size;
    }

    /**
     * @dev Check if a node is red
     */
    function _isRed(uint256 h) private view returns (bool) {
        if (h == NIL) return false;
        return nodes[h].color == Color.RED;
    }

    /**
     * @dev Find the node at a specific index
     */
    function _findByIndex(
        uint256 h,
        uint256 index
    ) private view returns (uint256) {
        if (h == NIL) {
            revert("Index out of bounds");
        }

        uint256 leftSize = _getSize(nodes[h].left);

        if (index < leftSize) {
            // The node is in the left subtree
            return _findByIndex(nodes[h].left, index);
        } else if (index > leftSize) {
            // The node is in the right subtree
            return _findByIndex(nodes[h].right, index - leftSize - 1);
        } else {
            // This is the node we're looking for
            return h;
        }
    }

    /**
     * @dev Find the index of a specific node
     */
    function _getNodeIndex(uint256 nodeId) private view returns (uint256) {
        uint256 index = _getSize(nodes[nodeId].left);
        uint256 current = nodeId;
        uint256 parent;

        while (current != root) {
            parent = _findParent(current);
            if (nodes[parent].right == current) {
                index += _getSize(nodes[parent].left) + 1;
            }
            current = parent;
        }

        return index;
    }

    /**
     * @dev Find the parent of a node
     */
    function _findParent(uint256 nodeId) private view returns (uint256) {
        if (nodeId == root) return NIL;
        return _findParentTraverse(root, nodeId);
    }

    /**
     * @dev Recursive helper to find parent node
     */
    function _findParentTraverse(
        uint256 curr,
        uint256 target
    ) private view returns (uint256) {
        if (curr == NIL) return NIL;
        if (nodes[curr].left == target || nodes[curr].right == target)
            return curr;

        uint256 found = _findParentTraverse(nodes[curr].left, target);
        if (found != NIL) return found;

        return _findParentTraverse(nodes[curr].right, target);
    }

    /**
     * @dev Find the minimum node in a subtree
     */
    function _findMin(uint256 h) private view returns (uint256) {
        if (h == NIL) return NIL;
        if (nodes[h].left == NIL) return h;
        return _findMin(nodes[h].left);
    }

    // TEST HELPER FUNCTIONS - ONLY FOR TESTING, CAN BE REMOVED IN PRODUCTION

    /**
     * @dev Get the color of a node - for testing only
     */
    function _testGetNodeColor(uint256 nodeId) public view returns (Color) {
        return nodes[nodeId].color;
    }

    /**
     * @dev Get the root node ID - for testing only
     */
    function _testGetRoot() public view returns (uint256) {
        return root;
    }

    /**
     * @dev Check if the tree is a valid LLRB tree - for testing only
     */
    function _testIsValidTree() public view returns (bool) {
        // 1. Root is black
        if (root != NIL && nodes[root].color != Color.BLACK) {
            return false;
        }

        // 2. No consecutive red nodes
        // 3. Perfect black balance
        uint256 blackCount = type(uint256).max; // Use max value as sentinel
        return _testIsValidNode(root, Color.BLACK, 0, blackCount);
    }

    function _testIsValidNode(
        uint256 nodeId,
        Color parentColor,
        uint256 blackHeight,
        uint256 blackCount
    ) private view returns (bool) {
        if (nodeId == NIL) {
            // First NIL node will set the expected black count
            if (blackCount == type(uint256).max) {
                // Check against sentinel value
                blackCount = blackHeight;
                return true;
            }
            // All paths must have the same number of black nodes
            return blackHeight == blackCount;
        }

        Node storage node = nodes[nodeId];

        // No consecutive red nodes
        if (parentColor == Color.RED && node.color == Color.RED) {
            return false;
        }

        // Accumulate black height if this node is black
        uint256 nextBlackHeight = blackHeight;
        if (node.color == Color.BLACK) {
            nextBlackHeight++;
        }

        // Check left and right subtrees
        return
            _testIsValidNode(
                node.left,
                node.color,
                nextBlackHeight,
                blackCount
            ) &&
            _testIsValidNode(
                node.right,
                node.color,
                nextBlackHeight,
                blackCount
            );
    }
}
