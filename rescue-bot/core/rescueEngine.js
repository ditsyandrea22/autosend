const { ethers } = require("ethers");
const { sendBundle } = require("../flashbots/bundleSender");
const { RPC_URL, PRIVATE_KEY, TO_ADDRESS } = require("../config/env");

// Create a provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

// Create a wallet from the private key
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

async function runRescue(blockNumber) {
  const balance = await provider.getBalance(wallet.address);

  if (balance === 0n) {
    console.log("Balance is zero, skipping rescue.");
    return;
  }

  const feeData = await provider.getFeeData();

  // We'll use a simple gas strategy: multiply the suggested fees by 6 to be aggressive
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * 6n;
  const maxFeePerGas = feeData.maxFeePerGas * 6n;

  // Estimate gas limit for a simple ETH transfer (21000) but we can also use estimateGas
  const gasLimit = 21000;

  // Calculate the amount to send: balance - (gasLimit * maxFeePerGas)
  const gasCost = gasLimit * maxFeePerGas;
  const amountToSend = balance > gasCost ? balance - gasCost : 0n;

  if (amountToSend === 0n) {
    console.log("Insufficient balance to cover gas, skipping rescue.");
    return;
  }

  const tx = {
    to: TO_ADDRESS,
    value: amountToSend,
    gasLimit: gasLimit,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
    maxFeePerGas: maxFeePerGas,
    nonce: await provider.getTransactionCount(wallet.address, "pending"),
    type: 2, // EIP-1559 transaction
    chainId: 1 // Ethereum Mainnet
  };

  console.log(`Sending rescue transaction: ${ethers.formatEther(amountToSend)} ETH to ${TO_ADDRESS}`);
  await sendBundle(wallet, tx, blockNumber);
}

module.exports = { runRescue };