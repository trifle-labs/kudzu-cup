// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;
import "./Kudzu.sol";

contract KudzuMock is Kudzu {
    constructor(ExternalMetadata externalMetadata) Kudzu(externalMetadata) {}

    function updateStartDate(uint256 _startDate) public onlyOwner {
        startDate = _startDate;
    }

    function updateEndDate(uint256 _endDate) public onlyOwner {
        endDate = _endDate;
    }

    function updateClaimDelay(uint256 _claimDelay) public onlyOwner {
        claimDelay = _claimDelay;
    }

    function updateForfeitClaim(uint256 _forfeitClaim) public onlyOwner {
        forfeitClaim = _forfeitClaim;
    }

    function updatePrices(
        uint256 _createPrice,
        uint256 _airdropPrice
    ) public onlyOwner {
        createPrice = _createPrice;
        airdropPrice = _airdropPrice;
    }

    function updatePercentages(
        uint256 _percentOfCreate,
        uint256 _percentOfAirdrop
    ) public onlyOwner {
        require(
            (_percentOfCreate <= DENOMINATOR) &&
                (_percentOfAirdrop <= DENOMINATOR),
            "INVALID PERCENTAGE"
        );
        percentOfCreate = _percentOfCreate;
        percentOfAirdrop = _percentOfAirdrop;
    }

    function userExists(
        address user,
        bytes32 root,
        bytes memory _proofRlpBytes
    ) public pure override returns (bool, uint256) {
        return (true, 0);
    }
}
