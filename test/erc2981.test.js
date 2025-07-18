import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { deployERC2981Contracts } from '../scripts/utils.js';

import hre from 'hardhat';
const ethers = hre.ethers;

describe('ERC2981', () => {
  let erc2981, owner, addr1;

  beforeEach(async () => {
    [owner, addr1] = await ethers.getSigners();
    const contracts = await deployERC2981Contracts();
    erc2981 = contracts.ERC2981;
  });

  it('Should set the right owner', async () => {
    expect(await erc2981.owner()).to.equal(owner.address);
  });

  it('Should set default royalty recipient and amount', async () => {
    const royalty = await erc2981.royalty();
    expect(royalty.recipient).to.equal(owner.address);
    expect(royalty.amount).to.equal(1000);
  });

  it('Should allow owner to set token royalty', async () => {
    await erc2981.setTokenRoyalty(addr1.address, 500);
    const royalty = await erc2981.royalty();
    expect(royalty.recipient).to.equal(addr1.address);
    expect(royalty.amount).to.equal(500);
  });

  it('Should revert if non-owner tries to set token royalty', async () => {
    await expect(erc2981.connect(addr1).setTokenRoyalty(addr1.address, 500)).to.be.revertedWith(
      'Ownable: caller is not the owner'
    );
  });

  it('Should revert if royalty value is greater than 10000', async () => {
    await expect(erc2981.setTokenRoyalty(addr1.address, 10001)).to.be.revertedWith(
      'ERC2981: Royalty value should be less than or equal to 10000'
    );
  });

  it('Should return correct royalty info', async () => {
    const salePrice = 10000;
    const royaltyInfo = await erc2981.royaltyInfo(1, salePrice);
    expect(royaltyInfo.receiver).to.equal(owner.address);
    expect(royaltyInfo.royaltyAmount).to.equal((salePrice * 1000) / 10000);
  });

  it('Should support IERC2981 and IERC165 interfaces', async () => {
    expect(await erc2981.supportsInterface('0x2a55205a')).to.be.true; // IERC2981
    expect(await erc2981.supportsInterface('0x01ffc9a7')).to.be.true; // IERC165
  });
});
