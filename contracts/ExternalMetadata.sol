//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Strings.sol";
import "base64-sol/base64.sol";

/// @title ExternalMetadata
/// @author @okwme
/// @dev The updateable and replaceable metadata contract for Kudzu
contract ExternalMetadata {
    string[32] public eyes = [
        "worry-sweat",
        "whyyy",
        "upside-down",
        "cool",
        "x-eyes",
        "literally-crying",
        "wink",
        "wworry-sweat",
        "pwease",
        "drunk",
        "mad",
        "rawr",
        "sorrow",
        "wwhyyy",
        "blank",
        "hehe",
        "stress",
        "eye-roll",
        "glasses",
        "wwink",
        "dollar-eyes",
        "surprise",
        "wwwink",
        "eeee",
        "heart",
        "wwwwink",
        "bblank",
        "big-eyes",
        "fml",
        "ugh",
        "bbblank",
        "pleased"
    ];
    string[32] public mouths = [
        "smile",
        "barf",
        "upside-down",
        "ssmile",
        "big-o",
        "big-o-teeth",
        "drunk",
        "hot",
        "small-frown",
        "party",
        "little-mad",
        "wha-wha-wha",
        "whyyy",
        "llittle-mad",
        "big-sad",
        "happy",
        "lllittle-mad",
        "shock",
        "flat",
        "front-teeth",
        "pparty",
        "money-mouth",
        "kiss-heart",
        "small-o",
        "silly",
        "open-smile",
        "small-smile",
        "uh-oh",
        "fflat",
        "big-flat",
        "drool",
        "grimmace"
    ];

    constructor() {}

    /// @dev generates the metadata
    /// @param tokenId the tokenId
    function getMetadata(uint256 tokenId) public view returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(
                        abi.encodePacked(
                            '{"name":"',
                            getName(tokenId),
                            '",',
                            '"description": "',
                            getDescription(tokenId),
                            '",',
                            '"image": "https://virus.folia.app/img/forma/',
                            Strings.toString(tokenId),
                            '",',
                            '"image_url": "https://virus.folia.app/img/forma/',
                            Strings.toString(tokenId),
                            '",',
                            '"home_url": "https://kudzu.christmas",',
                            '"external_url": "https://kudzu.christmas",',
                            '"attributes": ',
                            getAttributes(tokenId),
                            "}"
                        )
                    )
                )
            );
    }

    function getAttributes(
        uint256 tokenId
    ) public view returns (string memory) {
        (uint256 id, uint256 eye, uint256 mouth) = getPiecesOfTokenID(tokenId);

        return
            string(
                abi.encodePacked(
                    "[",
                    '{"trait_type":"mouth","value":"',
                    mouths[mouth],
                    '"},',
                    '{"trait_type":"eyes","value":"',
                    eyes[eye],
                    '"},',
                    '{"trait_type":"index","value":"',
                    Strings.toString(id),
                    '"}',
                    "]"
                )
            );
    }

    function getDescription(
        uint256 tokenId
    ) public view returns (string memory) {
        (uint256 id, uint256 eye, uint256 mouth) = getPiecesOfTokenID(tokenId);
        return
            string(
                abi.encodePacked(
                    "Kudzu is contagious, let the vine grow...\\n\\nThis is the token number ",
                    Strings.toString(id),
                    " but it has ID ",
                    Strings.toString(tokenId),
                    " with ",
                    eyes[eye],
                    " eyes and ",
                    mouths[mouth],
                    " mouth."
                )
            );
    }

    function getName(uint256 tokenId) public view returns (string memory) {
        (uint256 id, uint256 eye, uint256 mouth) = getPiecesOfTokenID(tokenId);
        return
            string(
                abi.encodePacked(
                    "$",
                    eyes[eye],
                    "-",
                    mouths[mouth],
                    " #",
                    Strings.toString(id),
                    ""
                )
            );
    }

    function getPiecesOfTokenID(
        uint256 tokenId
    ) public pure returns (uint256 id, uint256 eye, uint256 mouth) {
        return (tokenId >> 16, ((tokenId >> 8) & 0xFF), tokenId & 0xFF);
    }

    function getEmoji(uint256 tokenId) public view returns (string memory) {
        {
            (, uint256 eye, uint256 mouth) = getPiecesOfTokenID(tokenId);
            return string(abi.encodePacked(eyes[eye], "-", mouths[mouth]));
        }
    }
}
