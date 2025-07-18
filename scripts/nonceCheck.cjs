const { ethers } = require('ethers');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Configuration
const RPC_URL = 'https://rpc.forma.art';
const API_URL =
  'https://api.indexsupply.net/query?query=%0ASELECT+%0A+++%22to%22%0AFROM+transfersingle+%0AWHERE+address+%3D+0x18130De989d8883c18e0bdBBD3518b4ec1F28f7E%0AGROUP+BY+%22to%22%0A&event_signatures=TransferSingle%28address+indexed+operator%2C+address+indexed+from%2C+address+indexed+to%2C+uint256+id%2C+uint256+value%29&chain=984122';
const BATCH_SIZE = 50; // Adjust based on RPC rate limits

/**
 * Fetches addresses from the API endpoint
 */
async function fetchAddressesFromAPI() {
  try {
    console.log('Fetching addresses from API endpoint...');
    const response = await fetch(API_URL);
    const data = await response.json();

    // Extract addresses from the response
    // Based on the provided sample, addresses are in data.result[0][1:] (skipping the header)
    const addresses = data.result[0].slice(1).map((item) => item[0]);
    console.log(`Successfully extracted ${addresses.length} addresses from API`);

    return addresses;
  } catch (error) {
    console.error('Error fetching addresses from API:', error);

    // If API call fails, try to use sample data
    console.log('Using sample data as fallback...');
    return fallbackExtractAddresses();
  }
}

/**
 * Extract addresses from sample data as fallback
 */
function fallbackExtractAddresses() {
  const sampleResponse =
    '{"block_height":10203065,"result":[[["to"],["0xb051a733027c357568eeb953cddabe851c4f2202"],["0x77cf01ceb8f5abeaaefd93eb3865aa2703b892c0"],["0xd52d86fe3369b80041d4f17b4906adec3ce4929e"],["0x3af99b245330e231ce32c2b22b4ad45bc27e18cb"],["0x216597e0b5242cf114a860ff1d72ad1a5fd8ba1a"],["0x4989e1ab5e7cd00746b3938ef0f0d064a2025ba5"],["0x90c86fa959d30efdc4e9214267b1308aab648abb"],["0x37927607f2dc04dc7f46e8d86f41c72d06078b3d"],["0x6cdf68c9f08e79ec5f8834b183308a7781ce8ef1"],["0x1014a66402ff5b51d86a527da1dbe96343bd9d95"],["0x9090f58e39f6e861eecf2d8906151679b7dbc515"],["0x3533d1bc188a5501e40b1738743e5f2eccbfd5a1"],["0xde002f99afc3a281edff5970ccb1d8df3928602d"],["0x35ac0df50efea3246c0f9b69d23be607102a1200"],["0x2ac6d841a579fba2cc6fac1c310b9a48cb042cdd"],["0x87e8bdb9eef226fb28818c4e3b6ae8f6d7245e0e"],["0xf9ce5d5ba957d6ce22c1f74ba27ab93f453d2909"],["0xfae6b1d71c483241b61e386b40bfc64aaa644602"],["0x97d82e19eb8f4dd3eb2d10a31c4618ee9dedf375"]]]}';

  try {
    const data = JSON.parse(sampleResponse);
    const addresses = data.result[0].slice(1).map((item) => item[0]);
    console.log(`Extracted ${addresses.length} addresses from sample data`);
    return addresses;
  } catch (error) {
    console.error('Error parsing sample data:', error);
    return [];
  }
}

async function processBatch(provider, batch, retryCount = 0) {
  const maxRetries = 3;
  try {
    // Create batch of promises
    const promises = batch.map(
      (address) =>
        provider
          .getTransactionCount(address)
          .then((nonce) => ({ address, nonce }))
          .catch((err) => {
            throw { address, error: err.message };
          }) // Throw to trigger batch retry
    );

    // Wait for all promises in this batch
    const batchResults = await Promise.all(promises);
    return { success: true, results: batchResults };
  } catch (error) {
    console.error(`Error processing batch (attempt ${retryCount + 1}):`, error);

    if (retryCount < maxRetries) {
      console.log(`Retrying batch in 5 seconds... (attempt ${retryCount + 2})`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return processBatch(provider, batch, retryCount + 1);
    }

    console.error('Max retries reached for batch:', batch);
    return { success: false, batch };
  }
}

/**
 * Checks nonces for a list of addresses using ethers.js
 */
async function checkAddressesWithNonce(addresses) {
  if (!addresses || addresses.length === 0) {
    console.error('No addresses to check');
    return;
  }

  // Initialize provider
  console.log(`Connecting to RPC endpoint: ${RPC_URL}`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    // Check connection
    const network = await provider.getNetwork();
    console.log(`Connected to network with chainId: ${network.chainId}`);
  } catch (error) {
    console.error(`Error connecting to RPC endpoint: ${error.message}`);
    console.log('Trying alternative RPC connection method...');
    return await checkAddressesWithDirectRPC(addresses);
  }

  // Process in batches
  const results = {
    activeAddresses: [],
    inactiveAddresses: [],
  };
  const failedBatches = [];

  console.log(`Checking ${addresses.length} addresses in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(addresses.length / BATCH_SIZE)}`
    );

    const {
      success,
      results: batchResults,
      batch: failedBatch,
    } = await processBatch(provider, batch);

    if (!success) {
      failedBatches.push({ batch: failedBatch, startIndex: i });
      console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed, will retry later...`);
      continue;
    }

    // Process successful results
    batchResults.forEach((result) => {
      if (result.nonce > 0) {
        results.activeAddresses.push({
          address: result.address,
          nonce: result.nonce,
        });
      } else {
        results.inactiveAddresses.push(result.address);
      }
    });

    // Add delay between batches
    if (i + BATCH_SIZE < addresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Retry failed batches
  if (failedBatches.length > 0) {
    console.log('\nRetrying failed batches...');
    for (const { batch, startIndex } of failedBatches) {
      console.log(`Retrying batch starting at index ${startIndex}`);
      const { success, results: batchResults } = await processBatch(provider, batch);

      if (!success) {
        console.error(`Permanently failed to process batch starting at index ${startIndex}`);
        fs.appendFileSync(
          'failed_batches.json',
          `${JSON.stringify({
            batch,
            startIndex,
            timestamp: new Date().toISOString(),
          })}\n`
        );
        continue;
      }

      // Process successful retry results
      batchResults.forEach((result) => {
        if (result.nonce > 0) {
          results.activeAddresses.push({
            address: result.address,
            nonce: result.nonce,
          });
        } else {
          results.inactiveAddresses.push(result.address);
        }
      });
    }
  }

  // Report and save results
  console.log('\nResults Summary:');
  console.log(`Found ${results.activeAddresses.length} active addresses (nonce > 0)`);
  console.log(`Found ${results.inactiveAddresses.length} inactive addresses (nonce = 0)`);

  fs.writeFileSync('active_addresses.json', JSON.stringify(results.activeAddresses, null, 2));
  fs.writeFileSync('inactive_addresses.txt', results.inactiveAddresses.join('\n'));

  return results;
}

/**
 * Alternative method using direct JSON-RPC calls
 * Used as a fallback if ethers.js has issues
 */
async function checkAddressesWithDirectRPC(addresses) {
  const results = {
    activeAddresses: [],
    inactiveAddresses: [],
  };

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    console.log(
      `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(addresses.length / BATCH_SIZE)}`
    );

    const promises = batch.map((address) => checkNonceWithRPC(address, RPC_URL));
    const batchResults = await Promise.all(promises);

    batchResults.forEach((result) => {
      if (result.error) {
        console.error(`Error checking ${result.address}: ${result.error}`);
      } else if (result.nonce > 0) {
        results.activeAddresses.push({
          address: result.address,
          nonce: result.nonce,
        });
      } else {
        results.inactiveAddresses.push(result.address);
      }
    });

    if (i + BATCH_SIZE < addresses.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Write results to files
  fs.writeFileSync('active_addresses.json', JSON.stringify(results.activeAddresses, null, 2));

  fs.writeFileSync('inactive_addresses.txt', results.inactiveAddresses.join('\n'));

  console.log('\nResults Summary:');
  console.log(`Found ${results.activeAddresses.length} active addresses (nonce > 0)`);
  console.log(`Found ${results.inactiveAddresses.length} inactive addresses (nonce = 0)`);
  console.log('Results saved to active_addresses.json and inactive_addresses.txt');

  return results;
}

/**
 * Check nonce for a single address using direct JSON-RPC
 */
async function checkNonceWithRPC(address, rpcUrl) {
  const payload = {
    jsonrpc: '2.0',
    method: 'eth_getTransactionCount',
    params: [address, 'latest'],
    id: 1,
  };

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'RPC error');
    }

    // Convert hex nonce to number
    const nonce = parseInt(data.result, 16);
    return { address, nonce };
  } catch (error) {
    return { address, error: error.message };
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Step 1: Fetch addresses from API or use sample data
    const addresses = await fetchAddressesFromAPI();

    if (addresses.length === 0) {
      console.error('No addresses found to check');
      return;
    }

    // Step 2: Check nonces for addresses
    await checkAddressesWithNonce(addresses);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the script
main()
  .then(() => console.log('Script completed successfully'))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
