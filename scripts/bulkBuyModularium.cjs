const { task } = require('hardhat/config');

// --- Configuration ---

// Modularium contract addresses per network
const modulariumAddresses = {
  formatest: '0x83c62Cc36B792eE22ba14e74E07Ab05eC2630d1b', // formatest
  forma: '0x98DF8F54ac374B5F9d814f09978E5287C27e3Ef6', // forma
};

// --- Helper Functions ---

// Check if global fetch is available (Node.js v18+)
if (typeof fetch === 'undefined') {
  console.error('❌ Global fetch API is not available.');
  console.error(
    '   Please run this script using Node.js version 18 or higher.'
  );
  console.error(
    "   Alternatively, install 'node-fetch' (`npm install node-fetch` or `yarn add node-fetch`)"
  );
  console.error("   and uncomment the `require('node-fetch')` line below.");
  // const fetch = require('node-fetch'); // Uncomment this line if using node-fetch
  process.exit(1);
}

/**
 * Fetches active listings for a given Kudzu collection address from the Modularium API.
 * @param {string} kudzuAddress - The address of the Kudzu NFT contract.
 * @param {string} apiEndpoint - The API endpoint URL to use.
 * @returns {Promise<Array>} A promise that resolves to an array of valid listing objects.
 */
const getListed = async (kudzuAddress, apiEndpoint) => {
  const url = `${apiEndpoint}/collection/${kudzuAddress}/listings`;
  console.log(`\n🔍 Fetching listings from: ${url}`);
  try {
    const response = await fetch(url, {
      headers: { Accept: '*/*' },
    });

    if (!response.ok) {
      console.error(
        `🚨 Failed to fetch listings: ${response.status} ${response.statusText}`
      );
      try {
        const errorBody = await response.text();
        console.error(`   Response body: ${errorBody}`);
      } catch (e) {
        console.error('   Could not read error response body.');
      }
      return [];
    }

    const data = await response.json();

    // --- Expected API Data Structure ---
    // We expect 'data' to be an array of objects, where each object looks like:
    // {
    //   "orderId": "72435",
    //   "tokenAddress": "0x18130De989d8883c18e0bdBBD3518b4ec1F28f7E",
    //   "tokenId": "77733383",
    //   "price": 0.245, // Price in ETH (number)
    //   "qty": 2, // Total listed quantity
    //   "filled": 1, // Quantity already filled
    //   "maker": "0x...",
    //   ...
    // }

    // Filter for listings that match our expected structure and have quantity remaining > 0
    const validListings = data.map((listing) => {
      // Map to the structure our script expects internally
      const quantityRemaining = listing.qty - listing.filled;
      return {
        order: { id: listing.orderId }, // Using orderId directly
        price: { current: { amount: listing.price.toString() } }, // Convert price number to string
        quantityRemaining: quantityRemaining.toString(), // Convert remaining qty number to string
        // Note: Ensure orderId is the correct ID format for bulkTakeSellOrders
      };
    });

    if (data.length > 0 && validListings.length === 0) {
      console.warn(
        '⚠️ Fetched listings, but none matched the expected structure or had quantity > 0.'
      );
      console.warn(
        '   Sample of first raw listing data received:',
        JSON.stringify(data[0], null, 2)
      );
    } else if (data.length === 0) {
      console.log('   API returned no listings for this collection.');
    }

    console.log(`✅ Found ${validListings.length} valid & available listings.`);
    return validListings;
  } catch (error) {
    console.error('🚨 Error fetching or processing listings:', error);
    return [];
  }
};

// Helper function to execute or simulate a buy transaction
const executeOrSimulateBuy = async (
  params,
  valueWei,
  description,
  contract,
  signer,
  isSimulate,
  ethers
) => {
  console.log(`\n--- ${description} ---`);
  console.log('   Parameters (params):');
  console.log(`     orderIds: ["${params.orderIds.join('", "')}"]`);
  console.log(`     qty: [${params.qty.join(', ')}]`); // Quantities are BigInts
  console.log(`     recipient: ${params.recipient}`);
  console.log(`   Value (ETH): ${ethers.formatEther(valueWei)}`);
  console.log(`   Value (Wei): ${valueWei.toString()}`);

  if (isSimulate) {
    console.log('\n🧪 Simulating bulkTakeSellOrders call...');
    try {
      await contract.bulkTakeSellOrders.staticCall(params, {
        value: valueWei,
      });
      console.log(
        '✅ Simulation Successful: The transaction would likely succeed.'
      );
      return { success: true, receipt: null };
    } catch (simError) {
      console.error('❌ Simulation Failed:', simError.message);
      // Decode revert reason (reuse logic)
      if (simError.data && simError.data !== '0x') {
        try {
          if (simError.data.startsWith('0x08c379a0')) {
            const reason = ethers.AbiCoder.defaultAbiCoder().decode(
              ['string'],
              '0x' + simError.data.slice(10)
            )[0];
            console.error('   Revert Reason:', reason);
          } else {
            console.error(
              '   Could not decode revert reason (unknown format):',
              simError.data
            );
          }
        } catch (decodeError) {
          console.error(
            '   Error decoding revert reason:',
            decodeError.message
          );
          console.error('   Raw error data:', simError.data);
        }
      } else if (simError.reason) {
        console.error('   Revert Reason:', simError.reason);
      }
      return { success: false, receipt: null, error: simError };
    }
  } else {
    console.log('\n💸 Sending actual transaction...');
    try {
      const tx = await contract.bulkTakeSellOrders(params, {
        value: valueWei,
        // Optional: Add gas limit/price overrides if needed
        // gasLimit: ethers.utils.parseUnits("300000", "wei"),
      });
      console.log(`   Transaction Sent: ${tx.hash}`);
      console.log('   Waiting for transaction confirmation (1 block)...');
      const receipt = await tx.wait(1);
      console.log(
        `   ✅ Transaction Confirmed in block: ${receipt.blockNumber}`
      );
      console.log(`   Gas Used: ${receipt.gasUsed.toString()}`);
      return { success: true, receipt: receipt };
    } catch (error) {
      console.error('❌ Transaction Failed:', error.message);
      // Decode revert reason (reuse logic)
      if (error.data && error.data !== '0x') {
        try {
          if (error.data.startsWith('0x08c379a0')) {
            const reason = ethers.AbiCoder.defaultAbiCoder().decode(
              ['string'],
              '0x' + error.data.slice(10)
            )[0];
            console.error('   Revert Reason:', reason);
          } else {
            console.error(
              '   Could not decode revert reason (unknown format):',
              error.data
            );
          }
        } catch (decodeError) {
          console.error(
            '   Error decoding revert reason:',
            decodeError.message
          );
          console.error('   Raw error data:', error.data);
        }
      } else if (error.reason) {
        console.error('   Revert Reason:', error.reason);
      }
      if (error.transactionHash) {
        console.error('   Transaction Hash:', error.transactionHash);
      }
      return { success: false, receipt: null, error: error };
    }
  }
};

// --- Hardhat Task Definition ---

task(
  'bulkBuyModularium',
  'Buys listings from Modularium and compares gas for single vs bulk'
)
  .addFlag('simulate', 'Run in simulation mode without sending a transaction')
  .setAction(async (taskArgs, hre) => {
    // Use hre.ethers provided by the task context
    const ethers = hre.ethers;

    const [signer] = await ethers.getSigners();
    const network = hre.network.name;
    // Access the flag via taskArgs
    const isSimulate = taskArgs.simulate;

    console.log(`
--- Bulk Buy Modularium Task ---`);
    console.log(`👷 Signer Address: ${signer.address}`);
    console.log(`🌐 Network: ${network}`);
    if (isSimulate) {
      console.log('🟢 SIMULATION MODE ENABLED (No transaction will be sent)');
    }

    // --- Dynamically Set API Endpoint ---
    const { chainId } = await ethers.provider.getNetwork();
    console.log(`🔩 Chain ID: ${chainId}`);
    const modulariumAPI =
      chainId === 984122n // Forma Mainnet Chain ID (as BigInt)
        ? 'https://api.modularium.art'
        : 'https://modularium-api.sketchpad-1.forma.art'; // Default to Testnet/Sketchpad
    console.log(`🔩 Using API Endpoint: ${modulariumAPI}`);

    // --- Address Selection ---
    const modulariumAddress = modulariumAddresses[network];

    // --- Get Deployed Kudzu Address ---
    console.log('\nℹ️ Fetching deployed Kudzu contract address...');
    let Kudzu;
    let kudzuAddress;
    try {
      // Dynamically import utils.js - Make sure utils.js is compatible if needed
      // If utils.js uses hre, it should work fine within a task.
      const { initContracts } = await import('./utils.js');
      const contracts = await initContracts(['Kudzu'], hre); // Pass hre if utils needs it
      Kudzu = contracts.Kudzu;
      if (!Kudzu || !Kudzu.target) {
        throw new Error(
          'initContracts did not return a valid Kudzu contract object with a target address.'
        );
      }
      kudzuAddress = Kudzu.target; // .target is commonly used for the address in Hardhat deploys
      console.log(`   ✅ Kudzu contract address found: ${kudzuAddress}`);
    } catch (error) {
      console.error(
        `🚨 Failed to initialize Kudzu contract from utils.js:`,
        error.message
      );
      console.error(
        "   Ensure './utils.js' exists, exports 'initContracts', handles hre correctly, and deployment data is available."
      );
      process.exitCode = 1;
      return; // Exit the task action on error
    }

    // --- Validate Modularium Configuration ---
    if (!modulariumAddress) {
      console.error(
        `🚨 Modularium address not configured or is placeholder for network: ${network}`
      );
      console.error('   Please update `modulariumAddresses` in the script.');
      if (network === 'hardhat') {
        console.info(
          "   ℹ️ For local 'hardhat' network, deploy ModulariumMock first and update the address."
        );
      }
      process.exitCode = 1;
      return; // Exit the task action on error
    }

    console.log(`🎯 Using Modularium contract: ${modulariumAddress}`);
    console.log(`🪴 Targeting Kudzu collection: ${kudzuAddress}`);

    // --- Fetch Listings ---
    const listings = await getListed(kudzuAddress, modulariumAPI);

    if (listings.length === 0) {
      console.log('\n🤷 No listings found. Exiting.');
      return; // Exit the task action
    }

    // --- Order Selection Logic ---
    // Strategy: Find two different listings to compare single vs bulk buy.
    if (listings.length < 2) {
      console.log(
        '\n🤷 Need at least 2 different listings to compare gas costs. Exiting.'
      );
      return;
    }

    const listingA = listings[0];
    const listingB = listings[1]; // Simplistic: taking the first two. Could add logic for cheapest, etc.

    // --- Prepare Parameters ---
    const orderIdA = listingA.order.id;
    const orderIdB = listingB.order.id;
    const quantityToBuy = 1n; // Buy quantity 1 for each (as BigInt)

    const priceEthA = listingA.price.current.amount;
    const priceWeiA = ethers.parseEther(priceEthA);
    const priceEthB = listingB.price.current.amount;
    const priceWeiB = ethers.parseEther(priceEthB);
    const totalPriceWei = priceWeiA + priceWeiB;

    console.log(`\n🛒 Listings Selected for Comparison:`);
    console.log(
      `   Listing A - Order ID: ${orderIdA}, Price: ${priceEthA} ETH`
    );
    console.log(
      `   Listing B - Order ID: ${orderIdB}, Price: ${priceEthB} ETH`
    );
    console.log(
      `   Total Price for A+B: ${ethers.formatEther(totalPriceWei)} ETH`
    );

    // --- Pre-Transaction Checks ---
    const balance = await ethers.provider.getBalance(signer.address);
    console.log(`
💰 Signer ETH Balance: ${ethers.formatEther(balance)} ETH`);
    // Check if balance is sufficient for the *combined* purchase
    if (balance < totalPriceWei) {
      console.error(
        `🚨 Insufficient balance. Required for A+B: ${ethers.formatEther(totalPriceWei)} ETH, Available: ${ethers.formatEther(balance)} ETH`
      );
      process.exitCode = 1;
      return; // Exit the task action on error
    } else {
      console.log('   ✅ Balance sufficient for combined purchase (A+B).');
    }

    // --- Contract Interaction ---
    console.log('\n⚙️ Preparing transaction...');
    // Get Modularium contract ABI (using the Interface) and instance
    const modulariumAbi = hre.artifacts.readArtifactSync('IModularium').abi;
    const modulariumContract = new ethers.Contract(
      modulariumAddress,
      modulariumAbi,
      signer
    );

    // Parameters for buying 1 of Listing A
    const params1 = {
      orderIds: [orderIdA],
      qty: [quantityToBuy],
      recipient: signer.address,
    };

    // Parameters for buying 1 of Listing A AND 1 of Listing B
    const params2 = {
      orderIds: [orderIdA, orderIdB],
      qty: [quantityToBuy, quantityToBuy],
      recipient: signer.address,
    };

    // --- Execute Transactions or Simulations ---
    let result1 = null;
    let result2 = null;

    // --- Execute/Simulate First Buy (1 item from Listing A) ---
    result1 = await executeOrSimulateBuy(
      params1,
      priceWeiA,
      'BUY 1 (Listing A)',
      modulariumContract,
      signer,
      isSimulate,
      ethers
    );

    // --- Execute/Simulate Second Buy (1 from A, 1 from B) --- ONLY IF FIRST SUCCEEDED
    if (result1 && result1.success) {
      // Important: If actually executing, wait a moment to avoid potential nonce issues or hitting rate limits.
      // Also, the state might have changed slightly (e.g., balance).
      if (!isSimulate) {
        console.log(
          '\n⏱️ Waiting a few seconds before the second transaction...'
        );
        await new Promise((resolve) => setTimeout(resolve, 5000)); // 5-second wait
      }
      result2 = await executeOrSimulateBuy(
        params2,
        totalPriceWei,
        'BUY 2 (Listing A + Listing B)',
        modulariumContract,
        signer,
        isSimulate,
        ethers
      );
    } else {
      console.log(
        '\n⚠️ Skipping second transaction/simulation because the first one failed.'
      );
    }

    // --- Compare Gas Costs (if not simulating and both succeeded) ---
    if (
      !isSimulate &&
      result1 &&
      result1.success &&
      result1.receipt &&
      result2 &&
      result2.success &&
      result2.receipt
    ) {
      const gasUsed1 = result1.receipt.gasUsed;
      const gasUsed2 = result2.receipt.gasUsed;
      const gasDifference = gasUsed2 - gasUsed1;

      console.log('\n⛽ Gas Cost Comparison ⛽');
      console.log(`   Gas Used (Buy 1 Listing): ${gasUsed1.toString()}`);
      console.log(`   Gas Used (Buy 2 Listings): ${gasUsed2.toString()}`);
      console.log(
        `   Marginal Gas Cost (Adding 2nd Listing): ${gasDifference.toString()}`
      );
      console.log(`   Cost per Listing (Buy 1): ${gasUsed1.toString()}`);
      // This difference represents the gas cost *specifically* for handling the second order item within the bulk call
      console.log(
        `   Cost per Listing (Buy 2): ${gasDifference.toString()} (marginal cost for 2nd)`
      );
    } else if (!isSimulate) {
      console.log(
        '\n📊 Gas comparison skipped because one or both transactions failed or were not executed.'
      );
    } else {
      console.log('\n📊 Gas comparison not applicable in simulation mode.');
    }

    // Set exit code if any step failed
    if (
      !result1 ||
      !result1.success ||
      (result1.success && !result2) ||
      (result1.success && result2 && !result2.success)
    ) {
      process.exitCode = 1; // Set exit code to indicate failure
    }
  });
