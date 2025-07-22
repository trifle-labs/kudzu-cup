# Reward rewardIds

<!-- Table with the rewardIds and the corresponding rewards and description -->

Contract expects at most 10,000 rewardIds in the `PointsRewarded(address indexed to, uint256 indexed tokenId, int256 points)` event.

| Reward ID | Reward  | Description                                                                                                                                                                                                           |
| --------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | -?      | This is the rewardID used for when a winner has all of their points removed at the end of a round                                                                                                                     |
| 2         | 15      | This is the rewardID used for the Mamo holder bonus as of 2/23/25 at 4:20pm UTC                                                                                                                                       |
| 3         | 5       | This is the rewardID for twitter users that quote tweeted the announcement of the Kudzu burn                                                                                                                          |
| 4         | various | This is the rewardID used to make up for the incorrectly calculated burn points in the first [burnController contract](https://explorer.forma.art/address/0xE30cef8e99A6eEbE3CBF2862641337f57830FbeE)                 |
| 5         | various | This is the rewardID used for bonus points during bonfires                                                                                                                                                            |
| 6         | migrate | This is the rewardID used for migrating the points from the previous [KudzuBurn contract](https://explorer.forma.art/address/0x0000000000000000000000000000000000000000) (should be ignored in frontend points graph) |
| 7         | 5       | This is the rewardID for new strain bonuses going forward after upgrade on March 14                                                                                                                                   |
| 8         | 5       | Bug Bounty, Medium Severity                                                                                                                                                                                           |
| 9         | -783    | Used to correct BurnItAll Bug for player 0x918316cc8b00d2602336eac8b080a63afb6970fa                                                                                                                                   |
| 10        | 50      | Bug Bounty, Critical Severity                                                                                                                                                                                         |
| 11        | 10      | People who burned within 7 days of end of round 2 when an error occurred that prevented play at the end.                                                                                                              |
| 12        | 25      | People who reported in the discord that there was an error at the end of round 2.                                                                                                                                     |
| 13        | 2       | vncnt.eth tried to manually burn when round 2 had an error at the end.                                                                                                                                                |

<!-- Table with bonfire start times and burn quantity multipliers -->

# Bonfire Schedule

For **60 minutes** after the start time of each bonfire, there are **bonus points** awarded when a user burns a number of Kudzu. For each bonfire, that number is different. To calculate the number of bonus points a user gets, use the following formula:

```js
const bonus = Math.floor(totalBurned / bonfireMultiplier);
```

> Example:  
> If a user burns 15 kudzu during the bonfire on 2025-03-03 16:20 GMT when the bonfireMultiplier is 2, they would get 7 bonus points because 15 / 2 = 7.5, and Math.floor(7.5) = 7

| Bonfire Start Time   | Burn X get 1 Free |
| -------------------- | ----------------- |
| 2025-03-03 16:20 GMT | 2                 |
| 2025-03-11 16:20 PST | 3                 |
| 2025-03-19 16:20 CST | 4                 |
| 2025-03-27 16:20 GMT | 5                 |
| 2025-04-04 16:20 PST | 6                 |
| 2025-04-12 16:20 CST | 7                 |
