require('dotenv').config();
const { ethers } = require('ethers');

// Load environment variables
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const TO_ADDRESS = process.env.TO_ADDRESS;
const AMOUNT_IN_ETH = process.env.AMOUNT_IN_ETH;

// Validate environment variables
if (!RPC_URL || !PRIVATE_KEY || !TO_ADDRESS || !AMOUNT_IN_ETH) {
  console.error('Missing required environment variables. Please check your .env file.');
  process.exit(1);
}

// Create a provider
const provider = new ethers.JsonRpcProvider(RPC_URL);

// Create a wallet from the private key
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Main function to send transaction
async function sendTransaction() {
  try {
    // Get the current balance of the sender
    const balance = await provider.getBalance(wallet.address);
    console.log(`Sender address: ${wallet.address}`);
    console.log(`Sender balance: ${ethers.formatEther(balance)} ETH`);

    // Parse the amount to send in wei
    const amountInWei = ethers.parseEther(AMOUNT_IN_ETH);

    // Check if the sender has enough balance
    if (balance < amountInWei) {
      console.error(`Insufficient balance. Need at least ${ethers.formatEther(amountInWei)} ETH, but have ${ethers.formatEther(balance)} ETH.`);
      return;
    }

    // Create a transaction
    const transaction = {
      to: TO_ADDRESS,
      value: amountInWei,
    };

    // Send the transaction
    console.log(`Sending ${AMOUNT_IN_ETH} ETH to ${TO_ADDRESS}...`);
    const tx = await wallet.sendTransaction(transaction);
    console.log(`Transaction sent. Hash: ${tx.hash}`);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log(`Transaction mined in block ${receipt.blockNumber}`);
    console.log(`Transaction status: ${receipt.status ? 'Success' : 'Failed'}`);
  } catch (error) {
    console.error('Error sending transaction:', error);
  }
}

// Execute the function
sendTransaction();