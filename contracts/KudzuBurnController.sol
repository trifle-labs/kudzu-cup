
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

    constructor(Kudzu _kudzu, KudzuBurn _kudzuBurn){
      kudzu = _kudzu;
      kudzuBurn = _kudzuBurn;
    }

    receive() external payable {}
    // assumes that setApprovalForAll has already been called
    function burn(uint256 tokenId, uint256 quantity) public {
        if (kudzuBurn.isOver()) {
            kudzuBurn.rewardWinner();
        }
        kudzu.safeTransferFrom(msg.sender, burnAddress, tokenId, quantity, "");
        kudzuBurn.updateTreeOnlyController(msg.sender, quantity * burnPoint, true, tokenId);

        if (hasBurned[msg.sender][tokenId] == false) {
            hasBurned[msg.sender][tokenId] = true;
            kudzuBurn.updateTreeOnlyController(msg.sender, newStrainBonus, true, tokenId); // bonus
        }
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
