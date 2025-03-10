// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract Leaderboard {
    enum Color {
        RED,
        BLACK
    }

    struct Node {
        address player;
        uint256 score;
        uint256 size; // Augmented subtree size
        Color color;
        uint256 left;
        uint256 right;
    }

    Node[] public nodes; // The tree nodes (0 index is unused)
    uint256 public root; // Root index

    mapping(address => uint256) public playerIndex; // Player to node index
    mapping(address => uint256) public playerNonce;

    constructor() {
        nodes.push(); // Placeholder for 1-based indexing
    }

    function insert(uint256 score, address player) public {
        require(player != address(0), "Invalid player");
        require(playerIndex[player] == 0, "Player already exists");
        uint256 newIdx = nodes.length;
        root = insertNode(root, player, score, newIdx);
        nodes[root].color = Color.BLACK; // Root must always be black
    }

    function insertNode(
        uint256 nodeIdx,
        address player,
        uint256 score,
        uint256 playerIdx
    ) internal returns (uint256) {
        if (nodeIdx == 0) {
            nodes.push(Node(player, score, 1, Color.RED, 0, 0));
            // console.log("storing player at playerIdx", playerIdx);
            // console.log("player has score of ", score);
            playerIndex[player] = playerIdx; // Store unique node index
            playerNonce[player] = playerIdx;
            return playerIdx;
        }
        // console.log("player is", player);
        // console.log("inserting node with value", score);
        // console.log("playerIdx is", playerIdx);
        Node storage node = nodes[nodeIdx];
        uint256 nodeNonce = playerNonce[node.player];
        // console.log("looking at node with score", node.score);
        // Unique ordering based on (score, timestamp, player address)
        if (
            score < node.score || (score == node.score && playerIdx < nodeNonce)
        ) {
            node.left = insertNode(node.left, player, score, playerIdx);
        } else {
            node.right = insertNode(node.right, player, score, playerIdx);
        }

        // Rebalancing operations
        if (isRed(node.right) && !isRed(node.left))
            nodeIdx = rotateLeft(nodeIdx);
        if (isRed(node.left) && isRed(nodes[node.left].left))
            nodeIdx = rotateRight(nodeIdx);
        if (isRed(node.left) && isRed(node.right)) flipColors(nodeIdx);

        updateSize(nodeIdx);
        return nodeIdx;
    }

    function isRed(uint256 nodeIdx) private view returns (bool) {
        return (nodeIdx != 0 && nodes[nodeIdx].color == Color.RED);
    }

    function rotateLeft(uint256 nodeIdx) private returns (uint256) {
        Node storage node = nodes[nodeIdx];
        uint256 rightIdx = node.right;
        Node storage rightNode = nodes[rightIdx];

        node.right = rightNode.left;
        rightNode.left = nodeIdx;
        rightNode.color = node.color;
        node.color = Color.RED;

        rightNode.size = node.size;
        updateSize(nodeIdx);
        return rightIdx;
    }

    function rotateRight(uint256 nodeIdx) private returns (uint256) {
        Node storage node = nodes[nodeIdx];
        uint256 leftIdx = node.left;
        Node storage leftNode = nodes[leftIdx];

        node.left = leftNode.right;
        leftNode.right = nodeIdx;
        leftNode.color = node.color;
        node.color = Color.RED;

        leftNode.size = node.size;
        updateSize(nodeIdx);
        return leftIdx;
    }

    function flipColors(uint256 nodeIdx) private {
        Node storage node = nodes[nodeIdx];
        node.color = Color.RED;
        nodes[node.left].color = Color.BLACK;
        nodes[node.right].color = Color.BLACK;
    }

    function updateSize(uint256 nodeIdx) private {
        if (nodeIdx == 0) return;
        nodes[nodeIdx].size =
            1 +
            nodes[nodes[nodeIdx].left].size +
            nodes[nodes[nodeIdx].right].size;
    }

    function findByIndex(uint256 index) public view returns (address, uint256) {
        require(index < nodes[root].size, "Index out of bounds");

        uint256 currentIdx = root;

        while (currentIdx != 0) {
            Node storage currentNode = nodes[currentIdx];
            uint256 leftSize = nodes[currentNode.left].size;

            if (index < leftSize) {
                currentIdx = currentNode.left; // Move left
            } else if (index > leftSize) {
                index = index - leftSize - 1; // Adjust index
                currentIdx = currentNode.right; // Move right
            } else {
                return (currentNode.player, currentNode.score); // Found
            }
        }

        revert("Index not found");
    }

    function indexOf(
        uint256 score,
        address player
    ) public view returns (uint256) {
        uint256 index = 0;
        uint256 currentIdx = root;
        // console.log("player", player);
        uint256 playerIdx = playerNonce[player];
        // console.log("playerIdx", playerIdx);

        while (currentIdx != 0) {
            Node storage node = nodes[currentIdx];
            uint256 nodeNonce = playerNonce[node.player];
            uint256 leftSize = nodes[node.left].size;
            // console.log("searching for score", score);
            // console.log("leftSize", leftSize);
            // console.log("node.score", node.score);
            // console.log("currentIdx", currentIdx);

            if (
                score < node.score ||
                (score == node.score && playerIdx < nodeNonce)
            ) {
                // Move left
                currentIdx = node.left;
            } else if (
                score > node.score ||
                (score == node.score && playerIdx > nodeNonce)
            ) {
                // Add left subtree size + 1 (including this node) and move right
                index += leftSize + 1;
                currentIdx = node.right;
            } else {
                // Found! Add left subtree size to get the index
                return index + leftSize;
            }
        }

        revert("Player not found");
    }

    function remove(uint256 score, address player) public {
        require(playerIndex[player] != 0, "Player not found");
        root = removeNode(root, score, player, playerNonce[player]);
        if (root != 0) nodes[root].color = Color.BLACK;
        delete playerIndex[player];
        delete playerNonce[player];
    }

    function removeNode(
        uint256 nodeIdx,
        uint256 score,
        address player,
        uint256 pNonce
    ) internal returns (uint256) {
        if (nodeIdx == 0) return 0; // Base case: Empty tree

        Node storage node = nodes[nodeIdx];
        uint256 nodeNonce = playerNonce[node.player];

        // Compare by score first
        if (score < node.score || (score == node.score && pNonce < nodeNonce)) {
            node.left = removeNode(node.left, score, player, pNonce);
        } else if (
            score > node.score || (score == node.score && pNonce > nodeNonce)
        ) {
            node.right = removeNode(node.right, score, player, pNonce);
        } else {
            // **Node found! Remove it**
            if (node.right == 0) return node.left;
            if (node.left == 0) return node.right;

            // **Find successor: Smallest node in right subtree**
            uint256 successorIdx = findMin(node.right);
            Node storage successor = nodes[successorIdx];

            // **Copy successor's data into current node**
            node.player = successor.player;
            node.score = successor.score;

            // **Delete successor node from right subtree**
            node.right = removeMin(node.right);
        }

        updateSize(nodeIdx); // **Ensure the size is correctly updated**
        return nodeIdx;
    }

    function findMin(uint256 nodeIdx) internal view returns (uint256) {
        while (nodes[nodeIdx].left != 0) {
            nodeIdx = nodes[nodeIdx].left;
        }
        return nodeIdx;
    }

    function removeMin(uint256 nodeIdx) internal returns (uint256) {
        if (nodes[nodeIdx].left == 0) return nodes[nodeIdx].right;
        nodes[nodeIdx].left = removeMin(nodes[nodeIdx].left);
        updateSize(nodeIdx);
        return nodeIdx;
    }

    function getSize() public view returns (uint256) {
        return nodes[root].size;
    }

    // Helper function to get the maximum depth of the tree
    function maxDepth() public view returns (uint256) {
        return getDepth(root);
    }

    function getDepth(uint256 nodeIdx) private view returns (uint256) {
        if (nodeIdx == 0) return 0;
        return
            1 +
            max(getDepth(nodes[nodeIdx].left), getDepth(nodes[nodeIdx].right));
    }

    function max(uint256 a, uint256 b) private pure returns (uint256) {
        return a > b ? a : b;
    }

    // Print all nodes at a given depth level
    function printDepth(
        uint256 depth
    )
        public
        view
        returns (
            string memory level,
            address[] memory players,
            uint256[] memory scores,
            Color[] memory colors
        )
    {
        uint256 maxNodes = 2 ** depth;
        players = new address[](maxNodes);
        scores = new uint256[](maxNodes);
        colors = new Color[](maxNodes);

        uint256[] memory indices = new uint256[](maxNodes);
        uint256 count = 0;

        getNodesAtDepth(root, 0, depth, indices, count);

        // Convert indices to actual values
        for (uint256 i = 0; i < maxNodes; i++) {
            if (indices[i] != 0) {
                players[i] = nodes[indices[i]].player;
                scores[i] = nodes[indices[i]].score;
                colors[i] = nodes[indices[i]].color;
            }
        }

        return (formatLevel(depth), players, scores, colors);
    }

    function getNodesAtDepth(
        uint256 nodeIdx,
        uint256 currentDepth,
        uint256 targetDepth,
        uint256[] memory indices,
        uint256 position
    ) private view {
        if (nodeIdx == 0) return;

        if (currentDepth == targetDepth) {
            indices[position] = nodeIdx;
            return;
        }

        uint256 nextPos = position * 2;
        if (currentDepth < targetDepth) {
            getNodesAtDepth(
                nodes[nodeIdx].left,
                currentDepth + 1,
                targetDepth,
                indices,
                nextPos
            );
            getNodesAtDepth(
                nodes[nodeIdx].right,
                currentDepth + 1,
                targetDepth,
                indices,
                nextPos + 1
            );
        }
    }

    // Helper function to format level information
    function formatLevel(uint256 depth) private pure returns (string memory) {
        return string(abi.encodePacked("Level ", toString(depth)));
    }

    // Helper function to convert uint to string
    function toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }
}
