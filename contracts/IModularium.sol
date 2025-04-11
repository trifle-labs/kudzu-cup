// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IModularium {
    struct BulkTakeOrderParams {
        uint256[] orderIds;
        uint256[] qty;
        address recipient;
    }

    function bulkTakeSellOrders(
        BulkTakeOrderParams calldata _params
    ) external payable;
}
