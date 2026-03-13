const { ethers } = require("ethers");
const { RPC_URL } = require("../config/env");

// Create a provider
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);

/**
 * Get fee data with a multiplier for aggressive gas pricing
 * @param {number} multiplier - The multiplier to apply to the suggested fees (default: 6)
 * @returns {Promise<{maxPriorityFeePerGas: bigint, maxFeePerGas: bigint}>}
 */
async function getFeeData(multiplier = 6) {
  const feeData = await provider.getFeeData();
  
  // Apply multiplier to the suggested fees
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * BigInt(multiplier);
  const maxFeePerGas = feeData.maxFeePerGas * BigInt(multiplier);
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

module.exports = { getFeeData };