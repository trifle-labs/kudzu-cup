// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IModularium.sol";

contract ModulariumMock is IModularium {
    // struct BulkTakeOrderParams {
    //     uint256[] orderIds;
    //     uint256[] qty;
    //     address recipient;
    // }
    constructor() {}

    string public gasEater = "";

    function bulkTakeSellOrders(
        BulkTakeOrderParams calldata _params
    ) external payable {
        // do nothing
        uint256 targetGasUsage = 123430 + 79335 * _params.orderIds.length - 1;
        uint256 gasStart = gasleft();
        uint256 gasUsed = 0;
        uint256 biggestNumber = uint256(
            0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
        );
        while (gasUsed < targetGasUsage) {
            // do nothing
            // burn gas
            gasEater = string(abi.encodePacked(biggestNumber));
            biggestNumber--;
            gasUsed = gasStart - gasleft();
        }
    }
}
