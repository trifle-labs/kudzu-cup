const hre = require("hardhat");

async function main() {
  const accounts = await hre.ethers.getSigners();
  const [deployer] = accounts;
  console.log({ deployer: deployer.address });

  // Get chain ID
  const networkinfo = await hre.network.provider.send("eth_chainId");
  const chainId = BigInt(networkinfo);
  console.log("Chain ID:", chainId);

  // Initialize contracts
  const { initContracts } = await import("./utils.js");
  const { KudzuBurn } = await initContracts(["KudzuBurn"]);

  // Fetch owners from API
  const apiUrl = "https://api.indexsupply.net/query?query=SELECT+DISTINCT+%22to%22+as+owner%0AFROM+transfer+t1%0AWHERE+address+%3D+%270xbE25A97896b9CE164a314C70520A4df55979a0c6%27%0AAND+%28block_num%2C+log_idx%29+%3D+%28%0A++++SELECT+block_num%2C+MAX%28log_idx%29%0A++++FROM+transfer+t2%0A++++WHERE+t2.tokenId+%3D+t1.tokenId+%0A++++AND+t2.address+%3D+%270xbE25A97896b9CE164a314C70520A4df55979a0c6%27%0A++++AND+t2.block_num+%3D+%28%0A++++++++SELECT+MAX%28block_num%29%0A++++++++FROM+transfer+t3%0A++++++++WHERE+t3.tokenId+%3D+t1.tokenId%0A++++++++AND+t3.address+%3D+%270xbE25A97896b9CE164a314C70520A4df55979a0c6%27%0A++++++++AND+block_num+%3C%3D+9420311%0A++++%29%0A++++GROUP+BY+block_num%0A%29%3B&event_signatures=Transfer%28address+indexed+from%2C+address+indexed+to%2C+uint+indexed+tokenId%29&event_signatures=&chain=984122";

  const response = await fetch(apiUrl);
  const data = await response.json();

  // Extract addresses from the response
  const addresses = data.result[0]
    .slice(1) // Skip the header row
    .map(row => row[0]); // Get the first (and only) element of each row


  const chunk = false
  if (chunk) {
    // Split addresses into chunks of 100 to avoid gas limits
    const chunkSize = 100;
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);

      try {
        console.log(`Processing chunk ${i / chunkSize + 1}, addresses ${i} to ${i + chunk.length}`);
        const tx = await KudzuBurn.massAdminReward(chunk, 15);
        await tx.wait();
        console.log(`Successfully processed chunk. TX: ${tx.hash}`);
      } catch (e) {
        console.error(`Error processing chunk starting at index ${i}:`, e);
        // Decrease i to retry this chunk
        i -= chunkSize;
        continue;
      }
    }
  } else {
    for (const address of addresses) {
      const tx = await KudzuBurn.adminReward(address, 15);
      await tx.wait();
      console.log(`Successfully processed address ${address}. TX: ${tx.hash}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 