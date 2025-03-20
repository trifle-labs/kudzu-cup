// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./KudzuBurn.sol";
import "./Kudzu.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract KudzuBurnController is Ownable {
    Kudzu public kudzu;
    KudzuBurn public kudzuBurn;
    address public burnAddress = 0x000000000000000000000000000000000000dEaD;

    uint256 public burnPoint = 1;
    uint256 public newStrainBonus = 5;
    mapping(address => mapping(uint256 => bool)) public hasBurned;
    address[] public prevControllers;
    uint256 public prevControllerIndex = 0;

    constructor(Kudzu _kudzu, KudzuBurn _kudzuBurn) {
        kudzu = _kudzu;
        kudzuBurn = _kudzuBurn;
    }

    uint256 public bonfireDelay = 200 * 60 * 60;
    uint256 public bonfireDuration = 60 * 60;
    uint256 public firstBonfireStart = 1741191600; // Wednesday Mar 05 2025 16:20:00 GMT+0000

    uint256 public bonfireQuotient = 5;

    mapping(address => uint256) public bonfireCounts;

    receive() external payable {}

    function addPrevController(address controller) public onlyOwner {
        prevControllers.push(controller);
        prevControllerIndex++;
    }

    function hasAlreadyBurned(
        address burner,
        uint256 tokenId
    ) public returns (bool) {
        if (hasBurned[burner][tokenId]) return true;
        for (uint256 i = 0; i < prevControllerIndex; i++) {
            (bool success, bytes memory data) = prevControllers[i].call(
                abi.encodeWithSignature(
                    "hasBurned(address,uint256)",
                    burner,
                    tokenId
                )
            );
            if (success && data.length >= 32) {
                bool burned = abi.decode(data, (bool));
                if (burned) return true;
            }
        }
        return false;
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
            hasBurned[msg.sender][tokenId] = true;
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

    function batchBurn(
        uint256[] memory tokenIds,
        uint256[] memory quantities
    ) public {
        require(
            tokenIds.length == quantities.length,
            "tokenIds and quantities must have the same length"
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
            totalQuantity += quantities[i];

            // Regular burn points
            pointQuantities[index] = quantities[i] * burnPoint;
            rewardIds[index] = tokenIds[i];
            index++;

            // New strain bonus if applicable
            if (!hasAlreadyBurned(msg.sender, tokenIds[i])) {
                hasBurned[msg.sender][tokenIds[i]] = true;
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
        uint256 moduloBonfireDelay = timeSinceFirstBonfire % bonfireDelay;
        if (isSpecialBurn(timestamp)) return true;
        return moduloBonfireDelay < bonfireDuration;
    }

    function getBonfirePhase(
        uint256 phase
    ) public view returns (uint256 startTime) {
        return firstBonfireStart + phase * bonfireDelay;
    }

    function getQuotient(
        uint256 timestamp
    ) public view returns (uint256 bonus) {
        if (timestamp < firstBonfireStart) return bonfireQuotient;
        uint256 timeSinceFirstBonfire = timestamp - firstBonfireStart;
        uint256 moduloBonfireDelay = timeSinceFirstBonfire % bonfireDelay;
        uint256 maxPhase = 11;
        uint256 phase = ((timeSinceFirstBonfire - moduloBonfireDelay) /
            bonfireDelay) % maxPhase;
        bonus = bonfireQuotient + phase;
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
