// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./HitchensOrderStatisticsTreeLib.sol";
import "./ExternalMetadata.sol";

/*

KUDZU CUP: AIRDROP TOURNAMENT

MINT A TEAM
AIRDROP TOKENS
CLAIM 
or SELF-INFECT

TEAM WITH MOST CLAIMS WINS
ENDS JAN 1 2025 00:00 UTC

---

MINT - 1 TIA
AIRDROP - 0.25 TIA
CLAIM - 0.25 TIA
SELF-INFECT - 0.5 TIA

PRIZE: HALF THE FEES, ALL THE GAS

*/

contract Kudzu is ERC1155, Ownable {
    using HitchensOrderStatisticsTreeLib for HitchensOrderStatisticsTreeLib.Tree;

    //
    // Variables
    ExternalMetadata public metadata;
    uint256 public startDate = 1733767200; // Mon Dec 09 2024 18:00:00 GMT+0000
    uint256 public endDate = 1735689600; // Wed Jan 01 2025 00:00:00 GMT+0000
    address public recipient;
    bool public oKtoClaim = false;
    bool public enableAttack = false;

    uint256 public createPrice = 1 ether; // TIA ~$8
    uint256 public buyPrice = 1 ether; // TIA ~$8
    uint256 public airdropPrice = 0.5 ether; // TIA ~$2
    uint256 public claimPrice = 0.5 ether; // TIA ~$2
    uint256 public attackPrice = 1 ether; // TIA ~$8

    uint256 public percentOfCreate = 500; // 500 / 1000 = 50%
    uint256 public percentOfBuy = 500; // 500 / 1000 = 50%
    uint256 public percentOfAirdrop = 500; // 500 / 1000 = 50%
    uint256 public percentOfClaim = 500; // 500 / 1000 = 50%
    uint256 public percentOfAttack = 500; // 500 / 1000 = 50%
    uint256 public constant DENOMINATOR = 1000;

    //
    // State
    HitchensOrderStatisticsTreeLib.Tree tree;
    uint256 public totalSquads;
    mapping(uint256 => mapping(address => uint256)) public airdrops;
    mapping(uint256 => bool) public exists;
    mapping(uint256 => uint256) public squadPoints;
    mapping(uint256 => uint256) public squadSupply;
    uint256 public winningSquad;

    // Events
    event Buy(uint256 tokenId, uint256 quantity, address buyer);
    event Airdrop(
        uint256 tokenId,
        uint256 quantity,
        address airdropper,
        address airdropee
    );
    event Claim(uint256 tokenId, uint256 quantity, address claimer);
    event Attack(uint256 tokenId, uint256 quantity, address attacker);

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

    receive() external payable {}

    //
    // Read Functions

    function getWinningToken() public view returns (uint256 tokenId) {
        uint256 last = tree.last();
        bytes32 key = tree.valueKeyAtIndex(last, 0);
        return uint256(key);
    }

    function getPiecesOfTokenID(
        uint256 tokenId
    ) public pure returns (uint256 id, uint256 eyes, uint256 mouth) {
        return (tokenId >> 16, ((tokenId >> 8) & 0xFF), tokenId & 0xFF);
    }

    function uri(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        return metadata.getMetadata(tokenId);
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

    function addressToKey(address addr) public pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    function keyToAddress(bytes32 key) public pure returns (address) {
        return address(uint160(uint256(key)));
    }

    //
    // Write Functions

    // TODO: maybe combine create price and buy price
    function create(uint256 quantity) public payable {
        require(quantity > 0, "CANT CREATE 0");
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == createPrice * quantity, "INSUFFICIENT FUNDS");
        require(msg.sender == tx.origin, "NO SMART CONTRACTS");
        uint256 tokenId = totalSquads + 1;
        totalSquads++;
        tokenId = tokenId << 8;
        tokenId = tokenId | pseudoRNG(32, 1);
        exists[tokenId] = true;

        _mint(msg.sender, tokenId, quantity, "");
        squadSupply[tokenId] += quantity;

        emit Buy(tokenId, quantity, msg.sender);

        uint256 payoutToRecipient = (msg.value * percentOfCreate) / DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    function buy(uint256 tokenId, uint256 quantity) public payable {
        require(quantity > 0, "CANT BUY 0");
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == buyPrice * quantity, "INSUFFICIENT FUNDS");
        require(msg.sender == tx.origin, "NO SMART CONTRACTS");
        require(exists[tokenId], "TOKEN DOES NOT EXIST");

        _mint(msg.sender, tokenId, quantity, "");
        squadSupply[tokenId] += quantity;

        emit Buy(tokenId, quantity, msg.sender);

        uint256 payoutToRecipient = (msg.value * percentOfBuy) / DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    function airdrop(
        address airdropee,
        uint256 tokenId,
        uint256 quantity
    ) public payable {
        require(quantity > 0, "CANT AIRDROP 0");
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == airdropPrice * quantity, "INSUFFICIENT FUNDS");
        require(msg.sender == tx.origin, "NO SMART CONTRACTS");
        require(exists[tokenId], "TOKEN DOES NOT EXIST");
        require(balanceOf(msg.sender, tokenId) > 0, "NOT A HOLDER");

        airdrops[tokenId][airdropee] += quantity;

        emit Airdrop(tokenId, quantity, msg.sender, airdropee);

        uint256 payoutToRecipient = (msg.value * percentOfAirdrop) /
            DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    function claimAirdrop(uint256 tokenId, uint256 quantity) public payable {
        require(quantity > 0, "CANT CLAIM 0");
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == claimPrice * quantity, "INSUFFICIENT FUNDS");
        require(msg.sender == tx.origin, "NO SMART CONTRACTS");
        require(exists[tokenId], "TOKEN DOES NOT EXIST");
        require(
            airdrops[tokenId][msg.sender] >= quantity,
            "INSUFFICIENT AIRDROPS"
        );

        airdrops[tokenId][msg.sender] -= quantity;
        updateTree(tokenId, true, quantity);
        squadPoints[tokenId] += quantity;

        _mint(msg.sender, tokenId, quantity, "");
        squadSupply[tokenId] += quantity;

        emit Claim(tokenId, quantity, msg.sender);

        uint256 payoutToRecipient = (msg.value * percentOfClaim) / DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    function attack(uint256 tokenId, uint256 quantity) public payable {
        require(enableAttack, "ATTACK DISABLED");
        require(quantity > 0, "CANT ATTACK 0");
        require(block.timestamp > startDate, "GAME HASN'T STARTED");
        require(block.timestamp < endDate, "GAME ENDED");
        require(msg.value == attackPrice * quantity, "INSUFFICIENT FUNDS");
        require(msg.sender == tx.origin, "NO SMART CONTRACTS");
        require(exists[tokenId], "TOKEN DOES NOT EXIST");
        require(squadPoints[tokenId] >= quantity, "INSUFFICIENT SQUAD POINTS");

        updateTree(tokenId, false, quantity);
        squadPoints[tokenId] -= quantity;

        emit Attack(tokenId, quantity, msg.sender);

        uint256 payoutToRecipient = (msg.value * percentOfAttack) / DENOMINATOR;
        (bool success, bytes memory data) = recipient.call{
            value: payoutToRecipient
        }("");
        emit EthMoved(recipient, success, data, payoutToRecipient);
        require(success, "TRANSFER FAILED");
        emit EthMoved(address(this), true, "", msg.value - payoutToRecipient);
    }

    function claimPrize(uint256 tokenId, uint256 quantity) public {
        require(quantity > 0, "CANT CLAIM 0");
        require(block.timestamp > endDate, "GAME NOT ENDED");
        require(oKtoClaim, "NOT OK TO CLAIM YET");
        uint256 winningTokenId = getWinningToken();
        require(tokenId == winningTokenId, "NOT WINNING TOKEN");
        require(
            balanceOf(msg.sender, tokenId) >= quantity,
            "INSUFFICIENT FUNDS"
        );
        uint256 proportionalPrize = (address(this).balance * quantity) /
            squadSupply[tokenId];
        squadSupply[tokenId] -= quantity;
        _burn(msg.sender, tokenId, quantity);
        (bool success, bytes memory data) = msg.sender.call{
            value: proportionalPrize
        }("");
        require(success, "TRANSFER FAILED");
        emit EthMoved(msg.sender, success, data, proportionalPrize);
    }

    //
    // Internal Functions
    function updateTree(uint256 tokenId, bool add, uint256 quantity) private {
        uint256 newValue = (
            add
                ? squadPoints[tokenId] + quantity
                : squadPoints[tokenId] - quantity
        );
        // if key exists, remove it
        bytes32 tokenIdAsKey = bytes32(tokenId);
        if (squadPoints[tokenId] != 0) {
            tree.remove(tokenIdAsKey, squadPoints[tokenId]);
        }
        if (newValue != 0) {
            // add key with new value
            tree.insert(tokenIdAsKey, newValue);
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

    function updateStartDate(uint256 _startDate) public onlyOwner {
        startDate = _startDate;
    }

    function updateEndDate(uint256 _endDate) public onlyOwner {
        endDate = _endDate;
    }

    function updateRecipient(address _recipient) public onlyOwner {
        recipient = _recipient;
    }

    function updateOKtoClaim(bool _oKtoClaim) public onlyOwner {
        oKtoClaim = _oKtoClaim;
    }

    function updateAttack(bool _enableAttack) public onlyOwner {
        enableAttack = _enableAttack;
    }

    function updatePrices(
        uint256 _createPrice,
        uint256 _buyPrice,
        uint256 _airdropPrice,
        uint256 _claimPrice,
        uint256 _attackPrice
    ) public onlyOwner {
        createPrice = _createPrice;
        buyPrice = _buyPrice;
        airdropPrice = _airdropPrice;
        claimPrice = _claimPrice;
        attackPrice = _attackPrice;
    }

    function updatePercentages(
        uint256 _percentOfCreate,
        uint256 _percentOfBuy,
        uint256 _percentOfAirdrop,
        uint256 _percentOfClaim,
        uint256 _percentOfAttack
    ) public onlyOwner {
        require(
            _percentOfCreate <= DENOMINATOR &&
                _percentOfBuy <= DENOMINATOR &&
                _percentOfAirdrop <= DENOMINATOR &&
                _percentOfClaim <= DENOMINATOR &&
                _percentOfAttack <= DENOMINATOR,
            "INVALID PERCENTAGE"
        );
        percentOfCreate = _percentOfCreate;
        percentOfBuy = _percentOfBuy;
        percentOfAirdrop = _percentOfAirdrop;
        percentOfClaim = _percentOfClaim;
        percentOfAttack = _percentOfAttack;
    }

    /// @dev if mint fails to send eth to splitter, admin can recover
    // This should not be necessary but Berlin hardfork broke split before so this
    // is extra precaution.
    function recoverLockedETH(
        address payable _to,
        uint256 amount
    ) public onlyOwner {
        (bool sent, bytes memory data) = _to.call{value: amount}("");
        emit EthMoved(_to, sent, data, amount);
    }

    // Overrides

    function supportsInterface(
        bytes4 interfaceId
    ) public pure override returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(IERC1155).interfaceId ||
            interfaceId == type(IERC1155MetadataURI).interfaceId ||
            interfaceId == bytes4(0x49064906); // IERC4906 MetadataUpdate
    }
}
