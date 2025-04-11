// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@trifle/leaderboard/contracts/Leaderboard.sol";
import "./Kudzu.sol";
import "hardhat/console.sol";

/*

KUDZU BURN
                                                                  
                        %@:                                       
                      @*=#                                        
           =###%:#*+++%+=+@:+%%#%=@%#%.:%%##-#%##++%%#:           
         +#+=====+----::-#*=+======+=++#+++===========+#          
        %+=======------:-+=======+===:+================++         
       +*++=======:--:+*===================+===========+-         
       @. =+====++-=++=======================+=========+          
         -+========-+==========================+=======++         
          +===========-=:++====================+========+         
          +=========+#@@@++=========+===================+*=       
         -+========:#@--==============-----=============+*#@      
          +=====+*++%.+===--=========@@@@@@%============.         
          +====*::::-+++=*@@+========-:::=+#*+==========+#        
         -*===:------::+*@@@@-=====--+#%++=============++#%@      
          *====*:----:-++@@@%-====*@@@@@@@*============+          
          *=====+*-:-#==-%@@@======-------=============++%        
         -+=======*+---------==========--==============++##@      
          +========*@@@#***+====+##**+*%@#======+======+          
          #++=======@@@@@@@@@@@@@@@@@@@@@+======+======+          
         --:+=======+@@@@@@%@@@@%@@@@@@@*======++======++         
          *#+========-*@@@*++-==-==@@@#=-=======+======+-         
          +============-=@%+******+@+=-=+++-+==========+          
         -+=============+@%+**::**+#*+=================++         
          +==============+%+-====-*@++:================+          
          +======+========+@@+*+*@% *==+===+===========+          
         -*==================:::=+-:+.+================+#         
          #+===++=====++=======++:+===================+#          
           -%@%+.@##%#.*+=+**%%#-+%##%+@%#%%=%##@+%###%           
                        ++#                                       
                       =@                                         
                                                                  
*/

contract KudzuBurn is Ownable {
    using Leaderboard for Leaderboard.s;
    Leaderboard.s private leaderboard;
    bool public paused = true;
    Kudzu public kudzu;
    address payable public prevKudzuBurn;
    address public kudzuBurnController;
    uint256 public currentRound = 0;

    mapping(address => uint256) public burnerPoints;
    mapping(address => mapping(uint256 => bool)) public alreadyBurned;

    struct Round {
        uint256 order;
        uint256 endDate;
        uint256 payoutToRecipient;
    }

    Round[13] public rounds = [
        Round({
            order: 1,
            endDate: 1745166000, // 4-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 2,
            endDate: 1753028400, // 7-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 3,
            endDate: 1760977200, // 10-20-25
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 4,
            endDate: 1768929600, // 1-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 5,
            endDate: 1776702000, // 4-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 6,
            endDate: 1784564400, // 7-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 7,
            endDate: 1792513200, // 10-20-26
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 8,
            endDate: 1800465600, // 1-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 9,
            endDate: 1808238000, // 4-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 10,
            endDate: 1816100400, // 7-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 11,
            endDate: 1824049200, // 10-20-27
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 12,
            endDate: 1832001600, // 1-20-28
            payoutToRecipient: 0 ether
        }),
        Round({
            order: 13,
            endDate: 1839860400, // 4-20-28
            payoutToRecipient: 0 ether
        })
    ];

    event EthMoved(
        address indexed to,
        bool indexed success,
        bytes returnData,
        uint256 amount
    );

    event PointsRewarded(
        address indexed to,
        uint256 indexed tokenId,
        int256 points
    );

    constructor(Kudzu kudzu_, address payable prevKudzuBurn_) {
        kudzu = kudzu_;
        prevKudzuBurn = prevKudzuBurn_;
        leaderboard.init(true);
    }

    modifier onlyController() {
        require(
            msg.sender == kudzuBurnController,
            "Only KudzuBurnController can call this function"
        );
        _;
    }

    receive() external payable {
        if (isOver()) {
            rewardWinner();
        }
        emit EthMoved(msg.sender, true, "", msg.value);
        rounds[currentRound].payoutToRecipient += msg.value;
    }

    function fundRound(uint256 roundIndex) public payable {
        require(roundIndex < 13, "Invalid round index");
        require(roundIndex >= currentRound, "Round already over");
        rounds[roundIndex].payoutToRecipient += msg.value;
    }

    function getWinningAddress() public view returns (address firstPlace) {
        firstPlace = leaderboard.getOwnerAtRank(0);
    }

    function batchUpdateTreeOnlyController(
        address burner,
        uint256[] memory quantities,
        bool add,
        uint256[] memory rewardIds
    ) public onlyController {
        require(!paused, "Contract is paused");
        uint256 total = 0;
        for (uint256 i = 0; i < quantities.length; i++) {
            if (quantities[i] == 0) continue;
            total += quantities[i];

            if (
                !alreadyBurned[burner][rewardIds[i]] && rewardIds[i] >= 10000 // 10,000 maximum reward Ids
            ) {
                alreadyBurned[burner][rewardIds[i]] = true;
            }
            emit PointsRewarded(burner, rewardIds[i], int256(quantities[i]));
        }
        updateTree(burner, total, add, 0, false);
    }

    function updateTreeOnlyController(
        address burner,
        uint256 quantity,
        bool add,
        uint256 tokenId
    ) public onlyController {
        require(!paused, "Contract is paused");
        updateTree(burner, quantity, add, tokenId, true);
    }

    function remove(address burner) public onlyOwner {
        leaderboard.remove(burner);
    }

    function insert(uint256 newValue, address burner) public onlyOwner {
        leaderboard.insert(newValue, burner);
    }

    // NOTE: tokenId when a token is involved, rewardId when it is not
    // NOTE: rewardId 1 == remove round winner balance
    // NOTE: rewardId 2 == mamo bonus
    // NOTE: rewardId 3 == pre-game retweet bonus
    function updateTree(
        address burner,
        uint256 quantity,
        bool add,
        uint256 tokenId,
        bool emitEvents
    ) private {
        uint256 prevValue = burnerPoints[burner];
        uint256 newValue;
        int256 pointsChange;
        if (add) {
            newValue = prevValue + quantity;
            pointsChange = int256(quantity);
        } else {
            if (quantity > prevValue) {
                newValue = 0;
                pointsChange = -1 * int256(prevValue);
            } else {
                newValue = prevValue - quantity;
                pointsChange = -1 * int256(quantity);
            }
        }
        if (newValue == 0) {
            leaderboard.remove(burner);
        } else {
            leaderboard.insert(newValue, burner);
        }

        burnerPoints[burner] = newValue;
        if (emitEvents) {
            if (
                !alreadyBurned[burner][tokenId] && tokenId >= 203284 // 203284 is the smallest tokenId
            ) {
                alreadyBurned[burner][tokenId] = true;
            }
            emit PointsRewarded(burner, tokenId, pointsChange);
        }
    }

    function getPoints(address burner) public view returns (uint256) {
        return burnerPoints[burner];
    }

    function massBatchTransferTokens(
        address from,
        address[] memory to,
        uint256[][] memory tokenIds,
        uint256[][] memory quantities
    ) public onlyOwner {
        for (uint256 i = 0; i < to.length; i++) {
            kudzu.safeBatchTransferFrom(
                from,
                to[i],
                tokenIds[i],
                quantities[i],
                ""
            );
        }
    }

    function adminReward(
        address burner,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        updateTree(burner, quantity, true, rewardId, true);
    }

    function adminPunish(
        address burner,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        updateTree(burner, quantity, false, rewardId, true);
    }

    function adminMassRewardSingleQuantity(
        address[] memory burners,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        for (uint256 i = 0; i < burners.length; i++) {
            adminReward(burners[i], quantity, rewardId);
        }
    }

    function adminMassRewardSingleID(
        address[] memory burners,
        uint256[] memory quantities,
        uint256 rewardId
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminReward(burners[i], quantities[i], rewardId);
        }
    }

    function adminMassReward(
        address[] memory burners,
        uint256[] memory quantities,
        uint256[] memory rewardIds
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        require(
            burners.length == rewardIds.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminReward(burners[i], quantities[i], rewardIds[i]);
        }
    }

    function adminMassPunishSingleQuantity(
        address[] memory burners,
        uint256 quantity,
        uint256 rewardId
    ) public onlyOwner {
        for (uint256 i = 0; i < burners.length; i++) {
            adminPunish(burners[i], quantity, rewardId);
        }
    }

    function adminMassPunishSingleID(
        address[] memory burners,
        uint256[] memory quantities,
        uint256 rewardId
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminPunish(burners[i], quantities[i], rewardId);
        }
    }

    function adminMassPunish(
        address[] memory burners,
        uint256[] memory quantities,
        uint256[] memory rewardIds
    ) public onlyOwner {
        require(
            burners.length == quantities.length,
            "Arrays must be same length"
        );
        require(
            burners.length == rewardIds.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            adminPunish(burners[i], quantities[i], rewardIds[i]);
        }
    }

    function updateBurnedTokens(
        address burner,
        uint256 tokenId,
        bool value
    ) public onlyOwner {
        alreadyBurned[burner][tokenId] = value;
    }

    function massUpdateBurnedTokens(
        address[] memory burners,
        uint256[] memory tokenIds,
        bool value
    ) public onlyOwner {
        require(
            burners.length == tokenIds.length,
            "Arrays must be same length"
        );
        for (uint256 i = 0; i < burners.length; i++) {
            updateBurnedTokens(burners[i], tokenIds[i], value);
        }
    }

    function isOver() public view returns (bool) {
        if (currentRound > 12) revert("All rounds are over");
        return block.timestamp > rounds[currentRound].endDate;
    }

    function rewardWinner() public {
        if (!isOver()) return;
        require(!paused, "Contract is paused");
        address winner = getWinningAddress();
        uint256 points = burnerPoints[winner];
        // NOTE: remove winner's points with rewardId 1
        updateTree(winner, points, false, 1, true);
        uint256 payout = rounds[currentRound].payoutToRecipient;
        currentRound += 1;
        (bool success, bytes memory data) = winner.call{value: payout}("");
        emit EthMoved(winner, success, data, payout);
    }

    function updateKudzuBurnController(
        address kudzuBurnController_
    ) public onlyOwner {
        kudzuBurnController = kudzuBurnController_;
    }

    function updateEndDate(uint256 round, uint256 endDate) public onlyOwner {
        rounds[round].endDate = endDate;
    }

    function recoverFunds(
        address payable to,
        uint256 roundIndex,
        uint256 amount
    ) public onlyOwner {
        (bool success, bytes memory data) = to.call{value: amount}("");
        emit EthMoved(to, success, data, amount);
        rounds[roundIndex].payoutToRecipient -= amount;
    }

    function updatePaused(bool paused_) public onlyOwner {
        paused = paused_;
    }

    function size() public view returns (uint256) {
        return leaderboard.size();
    }

    function contains(address owner) public view returns (bool) {
        return leaderboard.contains(owner);
    }

    function getValue(address owner) public view returns (uint256) {
        return leaderboard.getValue(owner);
    }

    function getValueAndOwnerAtRank(
        uint256 rank
    ) public view returns (uint256, address) {
        return leaderboard.getValueAndOwnerAtRank(rank);
    }

    function getValueAtRank(uint256 rank) public view returns (uint256) {
        return leaderboard.getValueAtRank(rank);
    }

    function getOwnerAtRank(uint256 rank) public view returns (address) {
        return leaderboard.getOwnerAtRank(rank);
    }

    function getValueAndOwnerAtIndex(
        uint256 index
    ) public view returns (uint256, address) {
        return leaderboard.getValueAndOwnerAtIndex(index);
    }

    function getValueAtIndex(uint256 index) public view returns (uint256) {
        return leaderboard.getValueAtIndex(index);
    }

    function getOwnerAtIndex(uint256 index) public view returns (address) {
        return leaderboard.getOwnerAtIndex(index);
    }

    function getIndexOfOwner(address owner) public view returns (uint256) {
        return leaderboard.getIndexOfOwner(owner);
    }

    function getRankOfOwner(address owner) public view returns (uint256) {
        return leaderboard.getRankOfOwner(owner);
    }

    function getNonce(address owner) public view returns (uint256) {
        return leaderboard.getNonce(owner);
    }

    function getNode(
        uint256 nodeId
    ) public view returns (Leaderboard.Node memory) {
        return leaderboard.nodes[nodeId];
    }

    function getOwnerToNode(address owner) public view returns (uint256) {
        return leaderboard.ownerToNode[owner];
    }

    function getTreeStorage()
        public
        view
        returns (
            uint256 root,
            uint256 NIL,
            uint256 nodeCount,
            uint256 insertionNonce,
            bool ascending
        )
    {
        return (
            leaderboard.root,
            leaderboard.NIL,
            leaderboard.nodeCount,
            leaderboard.insertionNonce,
            leaderboard.ascending
        );
    }
}
