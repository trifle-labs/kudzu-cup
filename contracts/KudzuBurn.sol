// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./HitchensOrderStatisticsTreeLib.sol";
import "./Kudzu.sol";
import "hardhat/console.sol";

/*

KUDZU BURN

*/

contract KudzuBurn is Ownable {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;
    HitchensOrderStatisticsTreeLib.Tree tree;

    Kudzu public kudzu;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;
    uint256 public burnPoint = 1;
    uint256 public newStrainBonus = 5;
    uint256 public currentRound = 0;

    mapping(address => uint256) public burnerPoints;

    struct Round {
        uint256 order;
        uint256 endDate;
        uint256 payoutToRecipient;
    }

    mapping(address => mapping(uint256 => bool)) public hasBurned;

    Round[13] public rounds = [
        Round({
            order: 1,
            endDate: 1745107200, // 4-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 2,
            endDate: 1752969600, // 7-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 3,
            endDate: 1760918400, // 10-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 4,
            endDate: 1768870800, // 1-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 5,
            endDate: 1776643200, // 4-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 6,
            endDate: 1784505600, // 7-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 7,
            endDate: 1792454400, // 10-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 8,
            endDate: 1800406800, // 1-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 9,
            endDate: 1808179200, // 4-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 10,
            endDate: 1816041600, // 7-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 11,
            endDate: 1823990400, // 10-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 12,
            endDate: 1831942800, // 1-20-28
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 13,
            endDate: 1839801600, // 4-20-28
            payoutToRecipient: 0 ether
        })
    ];

    event EthMoved(
        address indexed to,
        bool indexed success,
        bytes returnData,
        uint256 amount
    );

    event PointsRewarded(
        address indexed to,
        uint256 indexed tokenId,
        uint256 points
    );

    constructor(Kudzu kudzu_) {
        kudzu = kudzu_;
    }

    receive() external payable {
        if (isOver()) {
            rewardWinner();
        }
        emit EthMoved(msg.sender, true, "", msg.value);
        rounds[currentRound].payoutToRecipient += msg.value;
    }

    function fundRound(uint256 roundIndex) public payable {
        require(roundIndex < 13, "Invalid round index");
        require(roundIndex >= currentRound, "Round already over");
        rounds[roundIndex].payoutToRecipient += msg.value;
    }

    function getWinningAddress() public view returns (address firstPlace) {
        uint256 value = tree.last();
        bytes32 key = tree.valueKeyAtIndex(value, 0);
        return address(uint160(uint256(key)));
    }

    function updateTree(address burner, uint256 quantity, bool add) private {
        uint256 prevValue = burnerPoints[burner];
        uint256 newValue = add ? prevValue + quantity : prevValue - quantity;

        // if key exists, remove it
        bytes32 addressAsKey = bytes32(uint256(uint160(burner)));
        if (prevValue != 0) {
            tree.remove(addressAsKey, prevValue);
        }
        if (newValue != 0) {
            // add key with new value
            tree.insert(addressAsKey, newValue);
        }
        burnerPoints[burner] = newValue;
    }

    function getPoints(address burner) public view returns (uint256) {
        return burnerPoints[burner];
    }

    function getRank(uint256 rank) public view returns (address) {
        bytes32 key = tree.keyAtGlobalIndex(rank);
        return address(uint160(uint256(key)));
    }

    // assumes that setApprovalForAll has already been called
    function burn(uint256 tokenId) public {
        if (isOver()) {
            rewardWinner();
        }
        uint256 startingBalance = kudzu.balanceOf(msg.sender, tokenId);
        kudzu.safeTransferFrom(msg.sender, burnAddress, tokenId, 1, "");
        uint256 endingBalance = kudzu.balanceOf(msg.sender, tokenId);
        require(startingBalance - endingBalance == 1, "Burn failed");
        updateTree(msg.sender, burnPoint, true);
        emit PointsRewarded(msg.sender, tokenId, burnPoint);

        if (hasBurned[msg.sender][tokenId] == false) {
            hasBurned[msg.sender][tokenId] = true;
            updateTree(msg.sender, newStrainBonus, true); // bonus
            emit PointsRewarded(msg.sender, tokenId, newStrainBonus);
        }
    }

    function adminReward(address burner, uint256 quantity) public onlyOwner {
        updateTree(burner, quantity, true);
    }

    function adminPunish(address burner, uint256 quantity) public onlyOwner {
        updateTree(burner, quantity, false);
    }

    function isOver() public view returns (bool) {
        if (currentRound > 12) revert("All rounds are over");
        return block.timestamp > rounds[currentRound].endDate;
    }

    function rewardWinner() public {
        require(isOver(), "Current round is not over");
        address winner = getWinningAddress();
        uint256 points = burnerPoints[winner];
        tree.remove(bytes32(uint256(uint160(winner))), points);
        uint256 payout = rounds[currentRound].payoutToRecipient;
        currentRound += 1;
        (bool success, bytes memory data) = winner.call{value: payout}("");
        emit EthMoved(winner, success, data, payout);
    }

    function updateBurnAddress(address burnAddress_) public onlyOwner {
        burnAddress = burnAddress_;
    }

    function updateBurnPoint(uint256 burnPoint_) public onlyOwner {
        burnPoint = burnPoint_;
    }

    function updateNewStrainBonus(uint256 newStrainBonus_) public onlyOwner {
        newStrainBonus = newStrainBonus_;
    }

    function updateEndDate(uint256 round, uint256 endDate) public onlyOwner {
        rounds[round].endDate = endDate;
    }

    function recoverFunds(uint256 roundIndex, uint256 amount) public onlyOwner {
        (bool success, bytes memory data) = owner().call{value: amount}("");
        emit EthMoved(owner(), success, data, amount);
        rounds[roundIndex].payoutToRecipient -= amount;
    }
}
