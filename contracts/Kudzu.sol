// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ExternalMetadata.sol";
import "./ITokenMetadata.sol";
import "./IERC1155MintablePayable.sol";

import {StateProofVerifier as Verifier} from "./StateProofVerifier.sol";
import {RLPReader} from "solidity-rlp/contracts/RLPReader.sol";

/*

KUDZU CUP: AIRDROP TOURNAMENT

MINT A TEAM
AIRDROP TOKENS
TEAM WITH MOST TOKENS WINS
ENDS JAN 1 2025 00:00 UTC

---

MINT - 1 TIA
AIRDROP - 0.1 TIA

PRIZE: 80% OF FEES + 100% OF GAS

*/

// TODO:
/*
 - onchain metadata
 - possibly open up external approval mechanism

*/

contract Kudzu is ERC1155, Ownable, ITokenMetadata, IERC1155MintablePayable {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    //
    // Constants
    bytes32 public constant STATE_ROOT =
        0x376ed3ba55cc553c2bf651460471f44ecb604216d3eec20eda1a099b5a5f2d0f; // Homestead
    uint256 public constant BLOCK_NUMBER = 21303934; // Dec-01-2024 12:00:11 AM +UTC

    bytes32 public constant STATE_ROOT_FORMA =
        0x780dc28ebe79f860695b488b6618c167a3f7d8bcbd0a88b3f8f22cd7e7c7f444; // Forma
    uint256 public constant BLOCK_NUMBER_FORMA = 7065245; // Dec-01-2024 12:00:00 AM +UTC

    uint256 public constant DENOMINATOR = 1000;
    uint256 public constant FIRST_PLACE_PERCENT = 600; // 60%
    uint256 public constant SECOND_PLACE_PERCENT = 300; // 30%
    uint256 public constant THIRD_PLACE_PERCENT = 100; // 10%

    //
    // Variables
    ExternalMetadata public metadata;
    uint256 public startDate = 1733669972; // TODO: replace before mainnet //1733767200; // Mon Dec 09 2024 18:00:00 GMT+0000
    uint256 public endDate = 1735689600; // Wed Jan 01 2025 00:00:00 GMT+0000
    uint256 public christmas = 1735171200; // Fri Dec 26 2024 00:00:00 GMT+0000
    uint256 public claimDelay = 3 days; // Allow 3 days for additional prize contributions
    uint256 public forfeitClaim = 90 days; // Forfeit ability to claim prize after 90 days

    address public recipient;

    uint256 public createPrice = 0.001 ether; // TODO: replace before mainnet // 1 ether; // TIA ~$8
    uint256 public airdropPrice = 0.0001 ether; // TODO: replace before mainnet // 0.1 ether; // TIA ~$1

    uint256 public percentOfCreate = 200; // 200 / 1000 = 20%
    uint256 public percentOfAirdrop = 200; // 200 / 1000 = 20%

    //
    // State
    uint256 public totalSquads;
    uint256 public prizePoolFinal;
    uint256 public claimedAmount;
    mapping(uint256 => mapping(address => uint256)) public claimed; // tokenId => address => quantity
    mapping(uint256 => bool) public exists;
    mapping(uint256 => uint256) public squadSupply;
    mapping(address => bool) public accountExists;
    struct Record {
        uint256 tokenId;
        uint256 supply;
    }
    Record[3] public topSquads;

    // Events
    event Created(uint256 tokenId, address buyer);
    event Airdrop(uint256 tokenId, address from, address to);
    event ClaimedPrize(uint256 tokenId, address claimer, uint256 prizeAmount);
    event EthMoved(
        address indexed to,
        bool indexed success,
        bytes returnData,
        uint256 amount
    );
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    //
    // Constructor

    constructor(ExternalMetadata _metadata) ERC1155("") {
        metadata = _metadata;
        recipient = msg.sender;
    }

    receive() external payable {
        emit EthMoved(address(this), true, "", msg.value);
    }

    //
    // Read Functions

    function blocktimestamp() public view returns (uint256) {
        return block.timestamp;
    }

    function getWinningToken(
        uint256 place
    ) public view returns (uint256 tokenId) {
        return topSquads[place].tokenId;
    }

    function getPiecesOfTokenID(
        uint256 tokenId
    ) public pure returns (uint256 id, uint256 eyes, uint256 mouth) {
        return (tokenId >> 16, ((tokenId >> 8) & 0xFF), tokenId & 0xFF);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        return uri(tokenId);
    }

    function uri(
        uint256 tokenId
    )
        public
        view
        virtual
        override(ERC1155, ITokenMetadata)
        returns (string memory)
    {
        return metadata.getMetadata(tokenId);
    }

    function getTokenMetadata(
        uint256 tokenId
    ) public view override returns (string memory) {
        return uri(tokenId);
    }

    function pseudoRNG(uint modulo, uint nonce) private view returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.prevrandao,
                        block.timestamp,
                        totalSquads,
                        nonce
                    )
                )
            ) % modulo;
    }

    function userExists(
        address user,
        bytes32 root,
        bytes memory _proofRlpBytes
    ) public pure returns (bool, uint256) {
        RLPReader.RLPItem[] memory proofs = _proofRlpBytes.toRlpItem().toList();
        bytes32 addressHash = keccak256(abi.encodePacked(user));
        Verifier.Account memory accountPool = Verifier.extractAccountFromProof(
            addressHash,
            root,
            proofs[0].toList()
        );
        return (accountPool.exists, accountPool.balance);
    }

    //
    // Write Functions

    function create(address _to, uint256 quantity) public payable {
        require(quantity > 0, "CANT CREATE 0");
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == (createPrice * quantity), "INSUFFICIENT FUNDS");

        uint256 creatorQuantity = 10;
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = totalSquads + 1;
            totalSquads++;
            tokenId = tokenId << 8;
            tokenId = tokenId | pseudoRNG(32, 1);
            exists[tokenId] = true;
            _mint(_to, tokenId, creatorQuantity, "");
            squadSupply[tokenId] += creatorQuantity;
            tallyLeaderboard(tokenId);
            emit Created(tokenId, _to);
        }

        uint256 payoutToRecipient = (msg.value * percentOfCreate) / DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    uint256 public constant ONE_PER_NUM_BLOCKS = 26; // ~1 per minute per family
    mapping(uint256 => uint256) public rateLimit; // tokenId => timestamp

    function airdrop(
        address _to,
        uint256 tokenId,
        bytes memory _proofRlpBytes,
        bool isForma
    ) public payable {
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == airdropPrice, "INSUFFICIENT FUNDS");
        require(msg.sender == tx.origin, "NO SMART CONTRACTS");
        require(balanceOf(msg.sender, tokenId) > 0, "NOT A HOLDER");
        require(balanceOf(_to, tokenId) == 0, "ALREADY INFECTED");
        if (!accountExists[_to]) {
            (bool doesExist, ) = userExists(
                _to,
                isForma ? STATE_ROOT_FORMA : STATE_ROOT,
                _proofRlpBytes
            );
            require(doesExist, "USER DOES NOT EXIST ON SPECIFIED CHAIN");
            accountExists[_to] = true;
        }

        if (block.timestamp > christmas) {
            require(
                rateLimit[tokenId] < block.timestamp - ONE_PER_NUM_BLOCKS,
                "CHRISTMAS RATE LIMIT EXCEEDED"
            );
            rateLimit[tokenId] = block.timestamp;
        }

        squadSupply[tokenId] += 1;
        tallyLeaderboard(tokenId);
        _mint(_to, tokenId, 1, "");

        emit Airdrop(tokenId, msg.sender, _to);

        uint256 payoutToRecipient = (msg.value * percentOfAirdrop) /
            DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    function isWinningtoken(uint256 tokenId) public view returns (bool) {
        return
            tokenId == getWinningToken(0) ||
            tokenId == getWinningToken(1) ||
            tokenId == getWinningToken(2);
    }

    function infect(uint256 tokenId, address _to) public {
        require(block.timestamp > endDate, "GAME NOT ENDED");
        if (isWinningtoken(tokenId)) {
            require(
                (block.timestamp > (endDate + forfeitClaim)) ||
                    (claimed[tokenId][msg.sender] ==
                        balanceOf(msg.sender, tokenId)),
                "WINNERS CANT INFECT UNTIL THEY CLAIM OR CLAIM PERIOD IS OVER"
            );
            // prevent new owner from claiming prize
            claimed[tokenId][_to] = 1;
        }
        require(balanceOf(msg.sender, tokenId) > 0, "NOT A HOLDER");
        require(balanceOf(_to, tokenId) == 0, "ALREADY INFECTED");
        _mint(_to, tokenId, 1, "");
    }

    function claimPrize(uint256 place) public {
        require(block.timestamp > endDate, "GAME NOT ENDED");
        require(
            block.timestamp > (endDate + claimDelay),
            "CLAIM DELAY NOT ENDED"
        );
        require(
            block.timestamp < (endDate + forfeitClaim),
            "CLAIM PERIOD ENDED"
        );

        // if contest is over calculate prize pool
        if (claimedAmount == 0) {
            prizePoolFinal = address(this).balance;
        }

        uint256 tokenId = getWinningToken(place);

        require(claimed[tokenId][msg.sender] == 0, "ALREADY CLAIMED");

        uint256 tokenBalance = balanceOf(msg.sender, tokenId);
        require(tokenBalance > 0, "INSUFFICIENT FUNDS");

        uint256 placePercentage = (prizePoolFinal *
            (
                place == 0 ? FIRST_PLACE_PERCENT : place == 1
                    ? SECOND_PLACE_PERCENT
                    : THIRD_PLACE_PERCENT
            )) / DENOMINATOR;

        uint256 proportionalPrize = (placePercentage * tokenBalance) /
            squadSupply[tokenId];

        claimedAmount += proportionalPrize;
        claimed[tokenId][msg.sender] = tokenBalance;

        (bool success, bytes memory data) = msg.sender.call{
            value: proportionalPrize
        }("");
        require(success, "TRANSFER FAILED");
        emit EthMoved(msg.sender, success, data, proportionalPrize);
        emit ClaimedPrize(tokenId, msg.sender, proportionalPrize);
    }

    //
    // Internal Functions

    function tallyLeaderboard(uint256 tokenId) internal {
        uint256 supply = squadSupply[tokenId];
        bool leader;
        uint256 leaderIndex;
        for (uint256 i = 0; i < 3; i++) {
            if (topSquads[i].tokenId == tokenId) {
                leader = true;
                leaderIndex = i;
                break;
            }
        }
        if (!leader) {
            if (supply > topSquads[0].supply) {
                topSquads[2] = topSquads[1];
                topSquads[1] = topSquads[0];
                topSquads[0] = Record({tokenId: tokenId, supply: supply});
            } else if (
                supply > topSquads[1].supply && topSquads[0].tokenId != tokenId
            ) {
                topSquads[2] = topSquads[1];
                topSquads[1] = Record({tokenId: tokenId, supply: supply});
            } else if (
                supply > topSquads[2].supply &&
                topSquads[0].tokenId != tokenId &&
                topSquads[1].tokenId != tokenId
            ) {
                topSquads[2].tokenId = tokenId;
            }
        } else {
            topSquads[leaderIndex].supply = supply;
            // sort the array
            for (uint256 i = 0; i < 3; i++) {
                for (uint256 j = i + 1; j < 3; j++) {
                    if (topSquads[i].supply < topSquads[j].supply) {
                        Record memory temp = topSquads[i];
                        topSquads[i] = topSquads[j];
                        topSquads[j] = temp;
                    }
                }
            }
        }
    }

    //
    // Admin Functions

    function emitBatchMetadataUpdate() public onlyOwner {
        emit BatchMetadataUpdate(1, totalSquads);
    }

    function updateMetadata(ExternalMetadata _metadata) public onlyOwner {
        metadata = _metadata;
    }

    function updateRecipient(address _recipient) public onlyOwner {
        recipient = _recipient;
    }

    function collectForfeitPrizeAfterDelay(
        address payable _to,
        uint256 amount
    ) public onlyOwner {
        require(
            block.timestamp > (endDate + forfeitClaim),
            "REMAINING PRIZE IS FORFEIT ONLY AFTER DELAY PERIOD"
        );
        (bool sent, bytes memory data) = _to.call{value: amount}("");
        emit EthMoved(_to, sent, data, amount);
    }

    // Overrides

    function mint(
        address _to,
        uint256 _tokenId,
        uint256 _amount
    ) external payable override {
        require(_tokenId == 0, "MINT ONLY FOR NEW TOKENS");
        create(_to, _amount);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public virtual override {
        infect(id, to);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) public virtual override {
        for (uint256 i = 0; i < ids.length; i++) {
            infect(ids[i], to);
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC1155MetadataURI).interfaceId ||
            interfaceId == bytes4(0x49064906) || // IERC4906 MetadataUpdate
            super.supportsInterface(interfaceId);
    }
}
