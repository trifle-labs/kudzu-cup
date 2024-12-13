export const eyes = {
  0: "worry-sweat",
  1: "whyyy",
  2: "upside-down",
  3: "cool",
  4: "x-eyes",
  5: "literally-crying",
  6: "wink",
  7: "wworry-sweat",
  8: "pwease",
  9: "drunk",
  10: "mad",
  11: "rawr",
  12: "sorrow",
  13: "wwhyyy",
  14: "blank",
  15: "hehe",
  16: "stress",
  17: "eye-roll",
  18: "glasses",
  19: "wwink",
  20: "dollar-eyes",
  21: "surprise",
  22: "wwwink",
  23: "eeee",
  24: "heart",
  25: "wwwwink",
  26: "bblank",
  27: "big-eyes",
  28: "fml",
  29: "ugh",
  30: "bbblank",
  31: "pleased",
};
export const mouths = {
  0: "smile",
  1: "barf",
  2: "upside-down",
  3: "ssmile",
  4: "big-o",
  5: "big-o-teeth",
  6: "drunk",
  7: "hot",
  8: "small-frown",
  9: "party",
  10: "little-mad",
  11: "wha-wha-wha",
  12: "whyyy",
  13: "llittle-mad",
  14: "big-sad",
  15: "happy",
  16: "lllittle-mad",
  17: "shock",
  18: "flat",
  19: "front-teeth",
  20: "pparty",
  21: "money-mouth",
  22: "kiss-heart",
  23: "small-o",
  24: "silly",
  25: "open-smile",
  26: "small-smile",
  27: "uh-oh",
  28: "fflat",
  29: "big-flat",
  30: "drool",
  31: "grimmace",
};

export const kudzuName = (tokenId) => {
  const { index, eye, mouth } = getEmoji(tokenId);
  return `$${eye}-${mouth}-${index}`;
};

export const getEmoji = (tokenId) => {
  const bigTokenId = BigInt(tokenId);
  const id = bigTokenId >> 16n;
  const mouth = bigTokenId & 31n;
  const eye = (bigTokenId >> 8n) & 31n;
  return {
    id,
    index: id,
    indexEye: eye,
    indexMouth: mouth,
    eye: eyes[Number(eye)],
    mouth: mouths[Number(mouth)],
  };
};
