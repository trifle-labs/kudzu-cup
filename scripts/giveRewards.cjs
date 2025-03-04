const hre = require('hardhat');
const fs = require('fs');

async function processAddressBatch(
  KudzuBurn,
  addresses,
  quantities,
  rewardIds,
  retryCount = 0
) {
  const maxRetries = 3;
  try {
    const result = await KudzuBurn.adminMassReward(
      addresses,
      quantities,
      rewardIds
    );
    await result.wait();
    return true;
  } catch (error) {
    console.error(`Error processing batch (attempt ${retryCount + 1}):`, error);

    if (retryCount < maxRetries) {
      console.log(`Retrying batch in 5 seconds... (attempt ${retryCount + 2})`);
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
      return processAddressBatch(
        KudzuBurn,
        addresses,
        quantities,
        rewardIds,
        retryCount + 1
      );
    } else {
      console.error('Max retries reached for batch:', {
        addresses,
        quantities,
        rewardIds,
      });
      return false;
    }
  }
}

async function main() {
  const accounts = await hre.ethers.getSigners();
  const [deployer] = accounts;
  console.log({ deployer: deployer.address });

  // Get chain ID
  const networkinfo = await hre.network.provider.send('eth_chainId');
  const chainId = BigInt(networkinfo);
  console.log('Chain ID:', chainId);

  // Initialize contracts
  const { initContracts } = await import('./utils.js');
  const { Kudzu, KudzuBurn } = await initContracts(['Kudzu', 'KudzuBurn']);
  const updateBlockNum = 999999999999; // TODO: Change this to the block number of the update

  const isPaused = await KudzuBurn.paused();
  if (isPaused) {
    const tx = await KudzuBurn.updatePaused(false);
    await tx.wait();
  }

  const addresses = await getThirdGroup(updateBlockNum, Kudzu.target, chainId);
  // const addresses = await getSecondGroup();
  // cosnt addresses = await getFirstGroup()
  console.log({ addresses });
  if (updateBlockNum == 999999999999) {
    if (chainId == 984122) {
      throw new Error('This is using a test block number ' + updateBlockNum);
    } else {
      console.error(
        'This is using a test block number ' +
          updateBlockNum +
          ' on chain ' +
          chainId
      );
    }
  }

  const batchSize = 100;
  const failedBatches = [];

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batchAddresses = addresses
      .slice(i, i + batchSize)
      .map((a) => a.address);
    const batchQuantities = addresses
      .slice(i, i + batchSize)
      .map((a) => a.points);
    const batchRewardIds = addresses
      .slice(i, i + batchSize)
      .map((a) => a.rewardId);

    console.log(
      `Processing batch ${i / batchSize + 1} of ${Math.ceil(addresses.length / batchSize)}`
    );

    const success = await processAddressBatch(
      KudzuBurn,
      batchAddresses,
      batchQuantities,
      batchRewardIds
    );

    if (!success) {
      failedBatches.push({
        addresses: batchAddresses,
        quantities: batchQuantities,
        rewardIds: batchRewardIds,
        startIndex: i,
      });
    }
  }

  // Handle any failed batches
  if (failedBatches.length > 0) {
    console.log('\nAttempting to process failed batches...');
    for (const batch of failedBatches) {
      console.log(`Retrying batch starting at index ${batch.startIndex}`);
      const success = await processAddressBatch(
        KudzuBurn,
        batch.addresses,
        batch.quantities,
        batch.rewardIds
      );
      if (!success) {
        console.error(
          `Failed to process batch starting at index ${batch.startIndex} after all retries`
        );
        // Could write failed batches to a file for manual processing later
        fs.appendFileSync('failed_batches.json', JSON.stringify(batch) + '\n');
      }
    }
  }

  console.log('Finished processing all batches');
  if (failedBatches.length > 0) {
    console.log(
      `${failedBatches.length} batches failed and were saved to failed_batches.json`
    );
  }
}

async function getThirdGroup(updateBlockNum, kudzuContract, chainId) {
  const url = `https://api.indexsupply.net/query?query=SELECT+%0A++t.from+as+%22burner%22%2C+SUM%28t.value%29+as+%22total%22%0AFROM+%0A++transfersingle+as+t%0AWHERE%0A++address+%3D+${kudzuContract}%0AAND%0A++t.to+%3D+0x000000000000000000000000000000000000deAd%0AAND%0A++t.from+%21%3D+0x0000000000000000000000000000000000000000%0AAND%0A++t.block_num+%3C%3D+${updateBlockNum}%0AGROUP+BY+%22burner%22%0AORDER+BY+%22total%22+DESC%0A&event_signatures=TransferSingle%28address+indexed+operator%2C+address+indexed+from%2C+address+indexed+to%2C+uint256+id%2C+uint256+value%29&event_signatures=&chain=${chainId}`;
  console.log({ url });
  const response = await fetch(url);
  const data = await response.json();
  const quotient = 5;
  const addresses = data.result[0]
    .slice(1) // Skip the header row
    .map((row) => {
      console.log(
        `${row[0]} gets ${Math.ceil(row[1] / quotient)} points for ${row[1]} total burns`
      );
      return {
        address: row[0],
        points: Math.ceil(row[1] / quotient), // This means early birds are rewarded even a bit more than those in normal bonfire
        rewardId: 5, // rewardID 5 is for bonfire points
      };
    });
  return addresses;
}

// rewardID 4
async function getSecondGroup() {
  const url = `https://api.indexsupply.net/query?query=SELECT+%0A++t.from+as+%22burner%22%2C+t.value%0AFROM+%0A++transfersingle+as+t%0AWHERE%0A++address+%3D+0x18130De989d8883c18e0bdBBD3518b4ec1F28f7E%0AAND%0A++t.to+%3D+0x000000000000000000000000000000000000dEad%0AAND%0A++t.from+%21%3D+0x0000000000000000000000000000000000000000%0AAND%0A++t.block_num+%3C%3D+10211963%0AAND%0A++t.value+%3E+1%0A&event_signatures=TransferSingle%28address+indexed+operator%2C+address+indexed+from%2C+address+indexed+to%2C+uint256+id%2C+uint256+value%29&event_signatures=&chain=984122`;
  const response = await fetch(url);
  const data = await response.json();
  const addresses = data.result[0]
    .slice(1) // Skip the header row
    .map((row) => {
      return {
        address: row[0],
        points: row[1] - 1,
        rewardId: 4,
      };
    });

  return addresses;
}

// rewardID 2 and 3
async function getFirstGroup() {
  const retweeters = [
    {
      address: '0xc5695857c34C7E2084e0580E53eA05A6637D4897',
      link: 'https://x.com/zmzrprimo/status/1884363068957728843',
    },
    {
      address: '0xad1591e08c5b1b03677C18e480588DE78f48F1B8',
      link: 'https://x.com/stonewithsoul1/status/1884279982710743169',
    },
    {
      address: '0x4Bd072aB36F5D983fF39B18c3668C5D78960794b',
      link: 'https://x.com/omusubibi_9/status/1884177025327599804',
    },
    {
      address: '0xf4c7De72E73D1125832c9b6cDCfEd70e585572Dc',
      link: 'https://x.com/Young0xxx/status/1883938915360620598',
    },
    {
      address: '0xe12F2918B51820EF9914E6135A6638A1A9D3bdC2',
      link: 'https://x.com/Podgornyj90/status/1883943319644037171',
    },
    {
      address: '0x7Dc1F6B92f57bbFeB874b0c9a29A30f42214a102',
      link: 'https://x.com/djerelopa/status/1883951543621411201',
    },
    {
      address: '0x9bC184985C75B062FB1F5143938103bCEEb20691',
      link: 'https://x.com/JordiCots83/status/1885959314759618681',
    },
    {
      address: '0xe656179eFff775A795173081552B34bFA27BFE5e',
      link: 'https://x.com/ArseniyRadgabov/status/1883997121420091873',
    },
    {
      address: '0xACc2C59c954048fE4FC8D9f1C5dCc8B93AFe53bf',
      link: 'https://x.com/DmitryRZN/status/1884353504820748469',
    },
    {
      address: '0x4555DdF20DD9091FA7AA7CEfA426a14Cbbab4876',
      link: 'https://x.com/ahbetemis76032/status/1885250121685770719',
    },
    {
      address: '0x109C33C472F26176cA22c32c03FB6Cfe17755358',
      link: 'https://x.com/Lojom53/status/1883950285950964177',
    },
    {
      address: '0x0c30d634e081ee1a66b51aa8066f9ce254a102a0',
      link: 'https://x.com/tejerillo20/status/1883964205537411575',
    },
    {
      address: '0x53Fa1285447f0e5c4123bAfc889bC6e0a1eDB476',
      link: 'https://x.com/ojami1001/status/1884109744652398658',
    },
    {
      address: '0xcBd08A5F071a2Ed53A57dfcebEfAc997d647DE9f',
      link: 'https://x.com/lordsnowone/status/1884047760753832170',
    },
    {
      address: '0x5B7D2BA411E629718eF51fa6670784D1d7368615',
      link: 'https://x.com/Istinye/status/1885742713414299922',
    },
    {
      address: '0x2457C54C2B31625eF6b80175d06B07Bd7CAAfA38',
      link: 'https://x.com/Coin_Chaser1/status/1885466274278314200',
    },
    {
      address: '0xe7c6253522F12eEd6aDd15BbAEDee7B269c348D2',
      link: 'https://x.com/Ekrem_369/status/1883924770322067577',
    },
    {
      address: '0xF89Be7F8e9b3e5bdE7C17781C6b0263e1b76ccDF',
      link: 'https://x.com/KserxB/status/1885794609684496840',
    },
    {
      address: '0x7B8f0B8E09ca522Ad3418fb89B9176f1bc74644c',
      link: 'https://x.com/riyankartal78/status/1886423269655355700',
    },
    {
      address: '0x2F199AE0aD0b265E70FdA8182ff3cdcfc479f767',
      link: 'https://x.com/bektassahmettt/status/1883984555222413693',
    },
    {
      address: '0xdf8C014A6b68c66d5c774f3097EDbC917944bAA0',
      link: 'https://x.com/hansoloreturns/status/1883939499618754639',
    },
    {
      address: '0x68D07775d9c0978753EDc76f2Dc32c4a8cb2c7Db',
      link: 'https://x.com/0xredstorm/status/1883933490607206667',
    },
    {
      address: '0x636cCdD38DfBFDf18eFA63C72ecCC5dA300c46E4',
      link: 'https://x.com/azuji0398582/status/1885626852683002245',
    },
    {
      address: '0xE0D8fD312d7bd72D7de328923d7Dcf08340C0F83',
      link: 'https://x.com/CryptSoupi/status/1883935025701203996',
    },
    {
      address: '0xdff029667aa9ab088cc06824868e2880f61d0beb',
      link: 'https://x.com/LuckyOG81/status/1885741509481238908',
    },
    {
      address: '0xc113e1be40d50e533cb7a69b77948ce841e1c90b',
      link: 'https://x.com/Father_Web3/status/1883931876265714026',
    },
    {
      address: '0x4630aa58b61098b47b7d83d170631d2037aeb246',
      link: 'https://x.com/PuckTheDragon/status/1885201623749926955',
    },
    {
      address: '0x918316Cc8b00D2602336eAC8B080a63AFb6970fA',
      link: 'https://x.com/thegamebegins25/status/1883977813860180474',
    },
    {
      address: '0x29B30C572baB86332EE17A9b5Ae871A11376d1bD',
      link: 'https://x.com/Oou_oou/status/1883943286974652584',
    },
    {
      address: '0x530be2a42309cb99874cf3ddb5853db2575f5235',
      link: 'https://x.com/seuncoded/status/1883939493289549856',
    },
    {
      address: '0x97e867aD24bdF2DBcf7B4bFF180B6F7FF1BdBF9a',
      link: 'https://x.com/tekatlihll/status/1884159278480777481',
    },
    {
      address: '0x82bF8E18ECbB8cF609d3f399e868412feE529DBd',
      link: 'https://x.com/livingd94974542/status/1883940448412262426',
    },
  ];

  // Fetch owners from API
  const apiUrl =
    'https://api.indexsupply.net/query?query=SELECT+DISTINCT+%22to%22+as+owner%0AFROM+transfer+t1%0AWHERE+address+%3D+%270xbE25A97896b9CE164a314C70520A4df55979a0c6%27%0AAND+%28block_num%2C+log_idx%29+%3D+%28%0A++++SELECT+block_num%2C+MAX%28log_idx%29%0A++++FROM+transfer+t2%0A++++WHERE+t2.tokenId+%3D+t1.tokenId+%0A++++AND+t2.address+%3D+%270xbE25A97896b9CE164a314C70520A4df55979a0c6%27%0A++++AND+t2.block_num+%3D+%28%0A++++++++SELECT+MAX%28block_num%29%0A++++++++FROM+transfer+t3%0A++++++++WHERE+t3.tokenId+%3D+t1.tokenId%0A++++++++AND+t3.address+%3D+%270xbE25A97896b9CE164a314C70520A4df55979a0c6%27%0A++++++++AND+block_num+%3C%3D+9420311%0A++++%29%0A++++GROUP+BY+block_num%0A%29%3B&event_signatures=Transfer%28address+indexed+from%2C+address+indexed+to%2C+uint+indexed+tokenId%29&event_signatures=&chain=984122';

  const response = await fetch(apiUrl);
  const data = await response.json();

  // Extract addresses from the response
  let addresses = data.result[0]
    .slice(1) // Skip the header row
    .map((row) => {
      return { address: row[0], points: 15 };
    }); // Get the first (and only) element of each row
  addresses.push(
    ...retweeters.map((obj) => {
      return {
        ...obj,
        points: 5,
      };
    })
  );
  const uniqueAddresses = [
    ...new Set(addresses.map((address) => address.address + address.points)),
  ];
  if (uniqueAddresses.length !== addresses.length) {
    console.error('Duplicate addresses found');
    return;
  }

  addresses = addresses.map((address) => {
    address.rewardId = address.points == 15 ? 2 : 3;
    return address;
  });
  return addresses;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
