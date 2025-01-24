// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

contract ERC2981 is IERC2981, Ownable {
    RoyaltyInfo public royalty;

    struct RoyaltyInfo {
        address recipient;
        uint256 amount;
    }

    constructor() {
        royalty.recipient = msg.sender;
        royalty.amount = 1000; // 10%
    }

    function setTokenRoyalty(
        address recipient,
        uint256 value
    ) public onlyOwner {
        require(
            value <= 10000,
            "ERC2981: Royalty value should be less than or equal to 10000"
        );
        royalty = RoyaltyInfo(recipient, value);
    }

    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) external view override returns (address receiver, uint256 royaltyAmount) {
        receiver = royalty.recipient;
        royaltyAmount = (salePrice * royalty.amount) / 10000;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(IERC165) returns (bool) {
        return
            interfaceId == type(IERC2981).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
