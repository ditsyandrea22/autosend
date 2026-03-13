/**
 * ETH Rescue Strategy
 * Builds ETH rescue transactions
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { getChainConfig } = require('../config/chains');

/**
 * Build ETH rescue transaction
 * Sends remaining ETH balance to destination, leaving enough for gas
 * 
 * @param {string} walletAddress - Compromised wallet address
 * @param {string} destination - Destination address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object|null>} Transaction object or null
 */
async function buildEthRescue(walletAddress, destination, provider, nonce) {
  try {
    // Get wallet balance
    const balance = await provider.getBalance(walletAddress);
    
    if (balance.eq(0)) {
      logger.debug(`[EthRescue] No ETH balance to rescue for ${walletAddress}`);
      return null;
    }

    // Get fee data
    const feeData = await provider.getFeeData();
    
    // Get gas limit
    const chainConfig = getChainConfig('ethereum'); // Could be passed as parameter
    const gasLimit = chainConfig?.gasLimits?.ethTransfer || 21000;

    // Calculate max fee
    let maxFeePerGas;
    let maxPriorityFeePerGas;

    if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
      // EIP-1559
      maxFeePerGas = feeData.maxFeePerGas;
      maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    } else {
      // Legacy
      maxFeePerGas = feeData.gasPrice;
      maxPriorityFeePerGas = feeData.gasPrice;
    }

    // Apply gas multiplier
    const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
    maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
    maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

    // Calculate max gas cost
    const maxGasCost = maxFeePerGas * BigInt(gasLimit);

    // Calculate value to rescue (balance - gas cost)
    let value = balance - maxGasCost;
    
    // Ensure we leave at least some ETH
    const minReserve = ethers.parseEther('0.001');
    if (value.lt(minReserve)) {
      value = balance - (maxFeePerGas * BigInt(21000));
    }

    // Make sure value is positive
    if (value.lte(0)) {
      logger.warn(`[EthRescue] Insufficient balance for rescue: ${balance} wei`);
      return null;
    }

    const transaction = {
      from: walletAddress,
      to: destination,
      value,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      chainId: (await provider.getNetwork()).chainId,
    };

    logger.info(`[EthRescue] Built ETH rescue: ${ethers.formatEther(value)} ETH`);
    
    return transaction;

  } catch (error) {
    logger.error('[EthRescue] Error building ETH rescue:', error);
    return null;
  }
}

/**
 * Build ETH rescue transaction with specific amount
 * 
 * @param {string} walletAddress - Wallet address
 * @param {string} destination - Destination address
 * @param {BigInt} amount - Amount to rescue
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object>} Transaction object
 */
async function buildEthRescueAmount(walletAddress, destination, amount, provider, nonce) {
  const feeData = await provider.getFeeData();
  const gasLimit = 21000;
  
  let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;

  // Apply multiplier
  const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
  maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
  maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

  return {
    from: walletAddress,
    to: destination,
    value: amount,
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    nonce,
    chainId: (await provider.getNetwork()).chainId,
  };
}

/**
 * Calculate ETH rescue capacity
 * 
 * @param {BigInt} balance - Current ETH balance
 * @param {BigInt} gasPrice - Current gas price
 * @param {number} gasLimit - Gas limit
 * @returns {BigInt} Maximum rescueable amount
 */
function calculateRescueCapacity(balance, gasPrice, gasLimit = 21000) {
  const gasCost = gasPrice * BigInt(gasLimit);
  const rescueAmount = balance - gasCost;
  return rescueAmount.gt(0) ? rescueAmount : 0n;
}

/**
 * Check if wallet has rescueable ETH
 * 
 * @param {string} walletAddress - Wallet address
 * @param {ethers.Provider} provider - Ethers provider
 * @returns {Promise<object>} Balance info
 */
async function checkRescueableEth(walletAddress, provider) {
  const balance = await provider.getBalance(walletAddress);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || feeData.maxFeePerGas;
  const gasLimit = 21000;

  const capacity = calculateRescueCapacity(balance, gasPrice, gasLimit);

  return {
    balance: balance.toString(),
    balanceFormatted: ethers.formatEther(balance),
    rescueCapacity: capacity.toString(),
    rescueCapacityFormatted: ethers.formatEther(capacity),
    canRescue: capacity.gt(0),
  };
}

module.exports = {
  buildEthRescue,
  buildEthRescueAmount,
  calculateRescueCapacity,
  checkRescueableEth,
};
