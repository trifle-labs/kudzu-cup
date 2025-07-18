// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import './KudzuBurn.sol';
import './Kudzu.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './IModularium.sol';
import 'hardhat/console.sol';

contract KudzuBurnController is Ownable {
  Kudzu public kudzu;
  KudzuBurn public kudzuBurn;
  IModularium public modularium;
  address public chimeraContract;
  address public burnAddress = 0x000000000000000000000000000000000000dEaD;

  uint256 public burnPoint = 1;
  uint256 public newStrainBonus = 5;
  address[] public prevControllers;
  uint256 public prevControllerIndex = 0;

  constructor(
    Kudzu _kudzu,
    KudzuBurn _kudzuBurn,
    IModularium _modularium,
    address _chimeraContract
  ) {
    kudzu = _kudzu;
    kudzuBurn = _kudzuBurn;
    modularium = _modularium;
    chimeraContract = _chimeraContract;
  }

  receive() external payable {}

  function addPrevController(address controller) public onlyOwner {
    prevControllers.push(controller);
    prevControllerIndex++;
  }

  function hasAlreadyBurned(address burner, uint256 tokenId) public view returns (bool) {
    return kudzuBurn.alreadyBurned(burner, tokenId);
  }

  // chimera burn
  function burnHook(address _from, uint256 _tokenId, uint256 _amount) public {
    require(msg.sender == chimeraContract, 'Only chimera contract can call this function');
    kudzuBurn.rewardWinner();
    _afterBurn(_from, _tokenId, _amount);
  }

  function _afterBurn(address _from, uint256 tokenId, uint256 quantity) internal {
    // Prepare arrays for batch update
    uint256[] memory quantities = new uint256[](3);
    uint256[] memory rewardIds = new uint256[](3);
    uint256 index = 0;

    // Base burn points
    quantities[index] = quantity * burnPoint;
    rewardIds[index] = tokenId;
    index++;

    // New strain bonus if applicable
    if (!hasAlreadyBurned(_from, tokenId)) {
      quantities[index] = newStrainBonus;
      rewardIds[index] = 7; // new strain bonus rewardId
      index++;
    }

    // Send batch update
    kudzuBurn.batchUpdateTreeOnlyController(_from, quantities, true, rewardIds);
  }

  // assumes that setApprovalForAll has already been called
  function burn(uint256 tokenId, uint256 quantity) public {
    kudzuBurn.rewardWinner();
    kudzu.safeTransferFrom(msg.sender, burnAddress, tokenId, quantity, '');
    _afterBurn(msg.sender, tokenId, quantity);
  }

  function batchBuyAndBurn(
    uint256[] memory orderIds,
    uint256[] memory qtys,
    uint256[] memory tokenIds,
    uint256[] memory tokenQtys
  ) public payable {
    if (orderIds.length > 0) {
      modularium.bulkTakeSellOrders{ value: msg.value }(
        IModularium.BulkTakeOrderParams({ orderIds: orderIds, qty: qtys, recipient: msg.sender })
      );
    }
    batchBurn(tokenIds, tokenQtys);
  }

  mapping(bytes32 => mapping(uint256 => bool)) usedTokenIdsPerBatch;

  function batchBurn(uint256[] memory tokenIds, uint256[] memory quantities) public {
    require(
      tokenIds.length == quantities.length,
      'tokenIds and quantities must have the same length'
    );
    bytes32 burnId = keccak256(abi.encodePacked(block.timestamp, msg.sender, tokenIds, quantities));
    kudzuBurn.rewardWinner();

    // Calculate the maximum possible size needed (base points + potential new strain bonus)
    uint256 maxArraySize = tokenIds.length * 2;
    uint256[] memory pointQuantities = new uint256[](maxArraySize);
    uint256[] memory rewardIds = new uint256[](maxArraySize);

    // Transfer all tokens at once
    kudzu.safeBatchTransferFrom(msg.sender, burnAddress, tokenIds, quantities, '');

    // Process each token individually for base points and new strain bonus
    uint256 totalQuantity = 0;
    uint256 index = 0;
    for (uint256 i = 0; i < tokenIds.length; i++) {
      // hasAlreadyBurned is not updated until batch is submitted
      // so batch can't contain the same tokenId, otherwise each will receive the new strain bonus
      require(!usedTokenIdsPerBatch[burnId][tokenIds[i]], 'DO NOT BATCH BURN THE SAME TOKEN ID');

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
    // Send batch update for this token's points
    kudzuBurn.batchUpdateTreeOnlyController(msg.sender, pointQuantities, true, rewardIds);
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

  function updateChimeraContract(address chimeraContract_) public onlyOwner {
    chimeraContract = chimeraContract_;
  }

  function recoverFunds(uint256 amount) public onlyOwner {
    (bool success, bytes memory data) = owner().call{ value: amount }('');
    emit KudzuBurn.EthMoved(owner(), success, data, amount);
  }
}
