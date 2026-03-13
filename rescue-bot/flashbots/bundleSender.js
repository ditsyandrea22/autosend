const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const { ethers } = require("ethers");
const { RPC_URL, FLASHBOTS_AUTH_SIGNER } = require("../config/env");

// Create a provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

async function sendBundle(wallet, tx, blockNumber) {
  if (!FLASHBOTS_AUTH_SIGNER) {
    throw new Error("FLASHBOTS_AUTH_SIGNER is required in .env");
  }
  
  // Create auth signer from environment - Flashbots requires authenticated relay
  const authSigner = new ethers.Wallet(FLASHBOTS_AUTH_SIGNER);

  // Create the Flashbots Bundle Provider
  const flashbots = await FlashbotsBundleProvider.create(
    provider,
    authSigner
  );

  // Sign the bundle with the wallet and the transaction
  const signed = await flashbots.signBundle([
    {
      signer: wallet,
      transaction: tx
    }
  ]);

  // Send the bundle to the next 5 blocks (current block +1 to +5)
  for (let i = 1; i <= 5; i++) {
    const targetBlock = blockNumber + i;
    try {
      await flashbots.sendRawBundle(signed, targetBlock);
      console.log(`Bundle sent to block ${targetBlock}`);
    } catch (error) {
      console.error(`Failed to send bundle to block ${targetBlock}:`, error.message);
    }
  }

  console.log("Bundle sending process completed");
}

module.exports = { sendBundle };