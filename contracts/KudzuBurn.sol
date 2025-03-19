// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Leaderboard.sol";
import "./Kudzu.sol";
import "hardhat/console.sol";

/*

KUDZU BURN

*/

contract KudzuBurn is Ownable, Leaderboard {
    bool public paused = false;
    Kudzu public kudzu;
    address payable public prevKudzuBurn;
    address public kudzuBurnController;
    uint256 public currentRound = 0;

    mapping(address => uint256) public burnerPoints;
    uint256 trackingTopGroupOf = 10;

    struct Round {
        uint256 order;
        uint256 endDate;
        uint256 payoutToRecipient;
    }

    Round[13] public rounds = [
        Round({
            order: 1,
            endDate: 1745166000, // 4-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 2,
            endDate: 1753028400, // 7-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 3,
            endDate: 1760977200, // 10-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 4,
            endDate: 1768929600, // 1-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 5,
            endDate: 1776702000, // 4-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 6,
            endDate: 1784564400, // 7-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 7,
            endDate: 1792513200, // 10-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 8,
            endDate: 1800465600, // 1-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 9,
            endDate: 1808238000, // 4-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 10,
            endDate: 1816100400, // 7-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 11,
            endDate: 1824049200, // 10-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 12,
            endDate: 1832001600, // 1-20-28
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 13,
            endDate: 1839860400, // 4-20-28
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
        int256 points
    );

    constructor(Kudzu kudzu_, address payable prevKudzuBurn_) {
        kudzu = kudzu_;
        prevKudzuBurn = prevKudzuBurn_;
    }

    modifier onlyController() {
        require(
            msg.sender == kudzuBurnController,
            "Only KudzuBurnController can call this function"
        );
        _;
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
        (firstPlace, ) = findByIndex(getSize() - 1);
    }

    function batchUpdateTreeOnlyController(
        address burner,
        uint256[3] memory quantities,
        bool add,
        uint256[3] memory rewardIds
    ) public onlyController {
        uint256 total = 0;
        for (uint256 i = 0; i < 3; i++) {
            total += quantities[i];
            emit PointsRewarded(burner, rewardIds[i], int256(quantities[i]));
        }
        updateTree(burner, total, add, 0, false);
    }

    function updateTreeOnlyController(
        address burner,
        uint256 quantity,
        bool add,
        uint256 tokenId
    ) public onlyController {
        updateTree(burner, quantity, add, tokenId, true);
    }

    // function remove(
    //     uint256 prevValue,
    //     address burner
    // ) public override onlyOwner {
    //     remove(prevValue, burner);
    // }

    // function insert(
    //     uint256 newValue,
    //     address burner
    // ) public override onlyOwner {
    //     insert(newValue, burner);
    // }

    // NOTE: tokenId when a token is involved, rewardId when it is not
    // NOTE: rewardId 1 == remove round winner balance
    // NOTE: rewardId 2 == mamo bonus
    // NOTE: rewardId 3 == pre-game retweet bonus
    function updateTree(
        address burner,
        uint256 quantity,
        bool add,
        uint256 tokenId,
        bool emitEvents
    ) private {
        require(!paused, "Contract is paused");
        uint256 prevValue = burnerPoints[burner];
        uint256 newValue;
        int256 pointsChange;
        if (add) {
            newValue = prevValue + quantity;
            pointsChange = int256(quantity);
        } else {
            if (quantity > prevValue) {
                newValue = 0;
                pointsChange = -1 * int256(prevValue);
            } else {
                newValue = prevValue - quantity;
                pointsChange = -1 * int256(quantity);
            }
        }

        // bool maxNotReached = getSize() < trackingTopGroupOf;
        // bool addToTree = false;
        // address previousPlayer;
        // uint256 previousPoints;
        // if (maxNotReached) {
        //     addToTree = true;
        // } else {
        //     (previousPlayer, previousPoints) = findByIndex(
        //         getSize() - trackingTopGroupOf
        //     );
        //     if (previousPoints < newValue) {
        //         addToTree = true;
        //     }
        // }
        // if (addToTree) {
        //     console.log("addToTree", addToTree);
        //     console.logAddress(burner);
        //     // if key exists, remove it
        //     // TODO: need better way to check whether player is in tree or not
        if (prevValue != 0) {
            console.log("remove");
            console.logAddress(burner);
            console.log(prevValue);
            remove(prevValue, burner);
        }
        if (newValue != 0) {
            console.log("insert");
            console.logAddress(burner);
            console.log(newValue);
            // add key with new value
            insert(newValue, burner);
        }
        // }
        burnerPoints[burner] = newValue;
        if (emitEvents) {
            emit PointsRewarded(burner, tokenId, pointsChange);
        }
    }

    function getPoints(address burner) public view returns (uint256) {
        return burnerPoints[burner];
    }

    function adminReward(
        address burner,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        updateTree(burner, quantity, true, rewardId, true);
    }

    function adminPunish(
        address burner,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        updateTree(burner, quantity, false, rewardId, true);
    }

    function adminMassRewardSingleQuantity(
        address[] memory burners,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        for (uint256 i = 0; i < burners.length; i++) {
            adminReward(burners[i], quantity, rewardId);
        }
    }

    function adminMassRewardSingleID(
        address[] memory burners,
        uint256[] memory quantities,
        uint256 rewardId
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminReward(burners[i], quantities[i], rewardId);
        }
    }

    function adminMassReward(
        address[] memory burners,
        uint256[] memory quantities,
        uint256[] memory rewardIds
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        require(
            burners.length == rewardIds.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminReward(burners[i], quantities[i], rewardIds[i]);
        }
    }

    function adminMassPunishSingleQuantity(
        address[] memory burners,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        for (uint256 i = 0; i < burners.length; i++) {
            adminPunish(burners[i], quantity, rewardId);
        }
    }

    function adminMassPunishSingleID(
        address[] memory burners,
        uint256[] memory quantities,
        uint256 rewardId
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminPunish(burners[i], quantities[i], rewardId);
        }
    }

    function adminMassPunish(
        address[] memory burners,
        uint256[] memory quantities,
        uint256[] memory rewardIds
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        require(
            burners.length == rewardIds.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminPunish(burners[i], quantities[i], rewardIds[i]);
        }
    }

    function isOver() public view returns (bool) {
        if (currentRound > 12) revert("All rounds are over");
        return block.timestamp > rounds[currentRound].endDate;
    }

    function rewardWinner() public {
        if (!isOver()) return;
        require(!paused, "Contract is paused");
        address winner = getWinningAddress();
        uint256 points = burnerPoints[winner];
        // NOTE: remove winner's points with rewardId 1
        updateTree(winner, points, false, 1, true);
        uint256 payout = rounds[currentRound].payoutToRecipient;
        currentRound += 1;
        // TODO: make sure this doesn't go below 0
        trackingTopGroupOf -= 1;
        (bool success, bytes memory data) = winner.call{value: payout}("");
        emit EthMoved(winner, success, data, payout);
    }

    function updateKudzuBurnController(
        address kudzuBurnController_
    ) public onlyOwner {
        kudzuBurnController = kudzuBurnController_;
    }

    function updateEndDate(uint256 round, uint256 endDate) public onlyOwner {
        rounds[round].endDate = endDate;
    }

    function recoverFunds(uint256 roundIndex, uint256 amount) public onlyOwner {
        (bool success, bytes memory data) = owner().call{value: amount}("");
        emit EthMoved(owner(), success, data, amount);
        rounds[roundIndex].payoutToRecipient -= amount;
    }

    function updatePaused(bool paused_) public onlyOwner {
        paused = paused_;
    }
}
