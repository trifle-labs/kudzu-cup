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

    // assumes that setApprovalForAll has already been called
    function burn(uint256 tokenId, uint256 quantity) public {
        if (kudzuBurn.isOver()) {
            kudzuBurn.rewardWinner();
        }
        kudzu.safeTransferFrom(msg.sender, burnAddress, tokenId, quantity, "");
        kudzuBurn.updateTreeOnlyController(
            msg.sender,
            quantity * burnPoint,
            true,
            tokenId
        );

        if (hasBurned[msg.sender][tokenId] == false) {
            hasBurned[msg.sender][tokenId] = true;
            kudzuBurn.updateTreeOnlyController(
                msg.sender,
                newStrainBonus,
                true,
                tokenId
            ); // bonus
        }

        if (isBonfireActive(block.timestamp)) {
            uint256 remainder = bonfireCounts[msg.sender];
            uint256 divider = getQuotient(block.timestamp);
            uint256 bonus = (quantity + remainder) / divider;
            uint256 newRemainder = (quantity + remainder) % divider;
            bonfireCounts[msg.sender] = newRemainder;
            kudzuBurn.updateTreeOnlyController(msg.sender, bonus, true, 5); // bonusId 5 for bonfire
        }
    }

    function batchBurn(
        uint256[] memory tokenIds,
        uint256[] memory quantities
    ) public {
        require(
            tokenIds.length == quantities.length,
            "tokenIds and quantities must have the same length"
        );
        if (kudzuBurn.isOver()) {
            kudzuBurn.rewardWinner();
        }
        uint256 totalQuantity = 0;
        kudzu.safeBatchTransferFrom(
            msg.sender,
            burnAddress,
            tokenIds,
            quantities,
            ""
        );
        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalQuantity += quantities[i];
            kudzuBurn.updateTreeOnlyController(
                msg.sender,
                quantities[i] * burnPoint,
                true,
                tokenIds[i]
            );
            if (!hasBurned[msg.sender][tokenIds[i]]) {
                hasBurned[msg.sender][tokenIds[i]] = true;
                kudzuBurn.updateTreeOnlyController(
                    msg.sender,
                    newStrainBonus,
                    true,
                    tokenIds[i]
                ); // bonus
            }
        }

        if (isBonfireActive(block.timestamp)) {
            uint256 remainder = bonfireCounts[msg.sender];
            uint256 divider = getQuotient(block.timestamp);
            uint256 bonus = (totalQuantity + remainder) / divider;
            uint256 newRemainder = (totalQuantity + remainder) % divider;
            bonfireCounts[msg.sender] = newRemainder;
            kudzuBurn.updateTreeOnlyController(msg.sender, bonus, true, 5); // bonusId 5 for bonfire
        }
    }

    function isBonfireActive(uint256 timestamp) public view returns (bool) {
        if (timestamp < firstBonfireStart) return true;
        uint256 timeSinceFirstBonfire = timestamp - firstBonfireStart;
        uint256 moduloBonfireDelay = timeSinceFirstBonfire % bonfireDelay;
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

    function updateBurnAddress(address burnAddress_) public onlyOwner {
        burnAddress = burnAddress_;
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
