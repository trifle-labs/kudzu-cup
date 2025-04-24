// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./KudzuBurn.sol";
import "./Kudzu.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IModularium.sol";
import "hardhat/console.sol";

contract KudzuBurnController is Ownable {
    Kudzu public kudzu;
    KudzuBurn public kudzuBurn;
    IModularium public modularium;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 public burnPoint = 1;
    uint256 public newStrainBonus = 5;
    address[] public prevControllers;
    uint256 public prevControllerIndex = 0;

    constructor(Kudzu _kudzu, KudzuBurn _kudzuBurn, IModularium _modularium) {
        kudzu = _kudzu;
        kudzuBurn = _kudzuBurn;
        modularium = _modularium;
    }

    uint256 public bonfireInterval = 200 * 60 * 60;
    uint256 public bonfireDuration = 60 * 60;
    uint256 public firstBonfireStart = 1741191600; // Wednesday Mar 05 2025 16:20:00 GMT+0000

    uint256 public bonfireQuotient = 5;
    uint256 public bonfireQuotientAfter = 2;

    mapping(address => uint256) public bonfireCounts;

    receive() external payable {}

    function addPrevController(address controller) public onlyOwner {
        prevControllers.push(controller);
        prevControllerIndex++;
    }

    function hasAlreadyBurned(
        address burner,
        uint256 tokenId
    ) public view returns (bool) {
        return kudzuBurn.alreadyBurned(burner, tokenId);
    }

    // assumes that setApprovalForAll has already been called
    function burn(uint256 tokenId, uint256 quantity) public {
        kudzuBurn.rewardWinner();
        kudzu.safeTransferFrom(msg.sender, burnAddress, tokenId, quantity, "");

        // Prepare arrays for batch update
        uint256[] memory quantities = new uint256[](3);
        uint256[] memory rewardIds = new uint256[](3);
        uint256 index = 0;

        // Base burn points
        quantities[index] = quantity * burnPoint;
        rewardIds[index] = tokenId;
        index++;

        // New strain bonus if applicable
        if (!hasAlreadyBurned(msg.sender, tokenId)) {
            quantities[index] = newStrainBonus;
            rewardIds[index] = 7; // new strain bonus rewardId
            index++;
        }

        // Bonfire bonus if active
        if (isBonfireActive(block.timestamp)) {
            uint256 remainder = bonfireCounts[msg.sender];
            uint256 divider = getQuotient(block.timestamp);
            uint256 bonus = (quantity + remainder) / divider;
            uint256 newRemainder = (quantity + remainder) % divider;
            bonfireCounts[msg.sender] = newRemainder;

            if (bonus > 0) {
                quantities[index] = bonus;
                rewardIds[index] = 5; // bonfire rewardId
                index++;
            }
        }

        // Send batch update
        kudzuBurn.batchUpdateTreeOnlyController(
            msg.sender,
            quantities,
            true,
            rewardIds
        );
    }

    function batchBuyAndBurn(
        uint256[] memory orderIds,
        uint256[] memory qtys,
        uint256[] memory tokenIds,
        uint256[] memory tokenQtys
    ) public payable {
        if (orderIds.length > 0) {
            modularium.bulkTakeSellOrders{value: msg.value}(
                IModularium.BulkTakeOrderParams({
                    orderIds: orderIds,
                    qty: qtys,
                    recipient: msg.sender
                })
            );
        }
        batchBurn(tokenIds, tokenQtys);
    }

    mapping(bytes32 => mapping(uint256 => bool)) usedTokenIdsPerBatch;

    function batchBurn(
        uint256[] memory tokenIds,
        uint256[] memory quantities
    ) public {
        require(
            tokenIds.length == quantities.length,
            "tokenIds and quantities must have the same length"
        );
        bytes32 burnId = keccak256(
            abi.encodePacked(block.timestamp, msg.sender, tokenIds, quantities)
        );
        kudzuBurn.rewardWinner();

        // Calculate the maximum possible size needed (base points + potential new strain bonus + potential bonfire bonus)
        uint256 maxArraySize = tokenIds.length * 2 + 1; // +1 for potential bonfire bonus
        uint256[] memory pointQuantities = new uint256[](maxArraySize);
        uint256[] memory rewardIds = new uint256[](maxArraySize);

        // Transfer all tokens at once
        kudzu.safeBatchTransferFrom(
            msg.sender,
            burnAddress,
            tokenIds,
            quantities,
            ""
        );

        // Process each token individually for base points and new strain bonus
        uint256 totalQuantity = 0;
        uint256 index = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            // hasAlreadyBurned is not updated until batch is submitted
            // so batch can't contain the same tokenId, otherwise each will receive the new strain bonus
            require(
                !usedTokenIdsPerBatch[burnId][tokenIds[i]],
                "DO NOT BATCH BURN THE SAME TOKEN ID"
            );

            usedTokenIdsPerBatch[burnId][tokenIds[i]] = true;
            totalQuantity += quantities[i];

            // Regular burn points
            pointQuantities[index] = quantities[i] * burnPoint;
            rewardIds[index] = tokenIds[i];
            index++;

            // New strain bonus if applicable
            if (!hasAlreadyBurned(msg.sender, tokenIds[i])) {
                pointQuantities[index] = newStrainBonus;
                rewardIds[index] = 7; // new strain bonus rewardId
                index++;
            }
        }

        // Then handle bonfire bonus separately as one update
        if (isBonfireActive(block.timestamp)) {
            uint256 remainder = bonfireCounts[msg.sender];
            uint256 divider = getQuotient(block.timestamp);
            uint256 bonus = (totalQuantity + remainder) / divider;
            uint256 newRemainder = (totalQuantity + remainder) % divider;
            bonfireCounts[msg.sender] = newRemainder;

            if (bonus > 0) {
                pointQuantities[index] = bonus;
                rewardIds[index] = 5; // bonfire rewardId
            }
        }
        // Send batch update for this token's points
        kudzuBurn.batchUpdateTreeOnlyController(
            msg.sender,
            pointQuantities,
            true,
            rewardIds
        );
    }

    function isSpecialBurn(uint256 timestamp) public view returns (bool) {
        uint256 specialBurnStart = 1741998000;
        return
            timestamp >= specialBurnStart &&
            timestamp < specialBurnStart + bonfireDuration;
    }

    function isBonfireActiveNow() public view returns (bool) {
        return isBonfireActive(block.timestamp);
    }

    function isBonfireActive(uint256 timestamp) public view returns (bool) {
        if (timestamp < firstBonfireStart) return true;
        uint256 timeSinceFirstBonfire = timestamp - firstBonfireStart;
        uint256 moduloBonfireInterval = timeSinceFirstBonfire % bonfireInterval;
        if (isSpecialBurn(timestamp)) return true;
        return moduloBonfireInterval < bonfireDuration;
    }

    function getBonfireStartByPhase(
        uint256 phase
    ) public view returns (uint256 startTime) {
        return firstBonfireStart + phase * bonfireInterval;
    }

    // function getBonfireStartByPhase(
    //     uint256 phase
    // ) public view returns (uint256 startTime) {
    //     uint256 round = 0;
    //     uint256 sinceStart = firstBonfireStart;
    //     for (uint256 i = 0; i < phase; i++) {
    //         sinceStart += bonfireInterval;
    //         (, uint256 endTime, ) = kudzuBurn.rounds(round);
    //         if (sinceStart > endTime) {
    //             round++;
    //             sinceStart = endTime;
    //         }
    //     }
    //     return sinceStart;
    // }

    // function getQuotient(
    //     uint256 timestamp
    // ) public view returns (uint256 bonus) {
    //     if (timestamp < firstBonfireStart) return bonfireQuotient;

    //     uint256 currentRound = kudzuBurn.currentRound();
    //     (, uint endDate, ) = kudzuBurn.rounds(currentRound);
    //     uint256 startTime = currentRound == 0 ? firstBonfireStart : endDate;

    //     uint256 timeSinceFirstBonfire = timestamp - startTime;
    //     uint256 moduloBonfireInterval = timeSinceFirstBonfire % bonfireInterval;
    //     uint256 maxPhase = 11;
    //     uint256 bonfireIndex = ((timeSinceFirstBonfire -
    //         moduloBonfireInterval) / bonfireInterval);

    //     uint256 base = currentRound == 0
    //         ? bonfireQuotient
    //         : bonfireQuotientAfter;

    //     console.log("bonfireIndex", bonfireIndex);
    //     uint256 phase = bonfireIndex % maxPhase;
    //     console.log("phase", phase);
    //     bonus = base + phase;
    //     console.log("bonus", bonus);
    // }

    function getQuotient(
        uint256 timestamp
    ) public view returns (uint256 bonus) {
        if (timestamp < firstBonfireStart) return bonfireQuotient;
        uint256 timeSinceFirstBonfire = timestamp - firstBonfireStart;
        uint256 moduloBonfireDelay = timeSinceFirstBonfire % bonfireInterval;
        uint256 maxPhase = 11;
        uint256 actualPhase = (timeSinceFirstBonfire - moduloBonfireDelay) /
            bonfireInterval;
        uint256 base = bonfireQuotient;
        if (actualPhase > 5) {
            actualPhase -= 6;
            base = bonfireQuotientAfter;
        }
        uint256 phase = actualPhase % maxPhase;
        bonus = base + phase;
    }

    function updateBonfireTime(uint256 timestamp) public onlyOwner {
        firstBonfireStart = timestamp;
    }

    function updateBurnAddress(KudzuBurn kudzuBurn_) public onlyOwner {
        kudzuBurn = kudzuBurn_;
    }

    function updateBurnPoint(uint256 burnPoint_) public onlyOwner {
        burnPoint = burnPoint_;
    }

    function updateNewStrainBonus(uint256 newStrainBonus_) public onlyOwner {
        newStrainBonus = newStrainBonus_;
    }

    function recoverFunds(uint256 amount) public onlyOwner {
        (bool success, bytes memory data) = owner().call{value: amount}("");
        emit KudzuBurn.EthMoved(owner(), success, data, amount);
    }
}
