/**
 * Gas Strategy
 * Dynamic gas pricing for competitive rescue operations
 */

const { BigNumber } = require("ethers");
const { GAS } = require("../config/constants");
const { logger } = require("../utils/logger");

/**
 * Get aggressive gas fees for rescue operations
 * Uses multipliers to outbid attackers
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {boolean} isUnderAttack - Whether an attack is detected
 * @returns {Promise<{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint}>}
 */
async function getGas(provider, isUnderAttack = false) {
  const feeData = await provider.getFeeData();
  
  const multiplier = BigNumber.from(isUnderAttack ? GAS.ATTACK_MULTIPLIER : GAS.BASE_MULTIPLIER);
  
  // Apply multiplier to the suggested fees
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.mul(multiplier);
  const maxFeePerGas = feeData.maxFeePerGas.mul(multiplier);
  
  logger.gasUpdate(maxFeePerGas, maxPriorityFeePerGas);
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

/**
 * Get minimum viable gas for rescue
 * Uses base fees only, no priority
 * 
 * @param {ethers.Provider} provider 
 * @returns {Promise<{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint}>}
 */
async function getMinGas(provider) {
  const feeData = await provider.getFeeData();
  
  // Add small priority for inclusion
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.add(BigNumber.from(1000000000)); // 1 gwei
  const maxFeePerGas = feeData.maxFeePerGas;
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

/**
 * Get maximum gas for aggressive rescue
 * Uses highest possible multiplier
 * 
 * @param {ethers.Provider} provider 
 * @returns {Promise<{maxFeePerGas: bigint, maxPriorityFeePerGas: bigint}>}
 */
async function getMaxGas(provider) {
  const feeData = await provider.getFeeData();
  
  const multiplier = BigNumber.from(GAS.MAX_MULTIPLIER);
  
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.mul(multiplier);
  const maxFeePerGas = feeData.maxFeePerGas.mul(multiplier);
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

/**
 * Calculate gas for different transaction types
 * 
 * @param {string} type - Transaction type: 'eth', 'erc20', 'nft'
 * @returns {number} Gas limit
 */
function getGasLimit(type = "eth") {
  switch (type) {
    case "erc20":
      return GAS.ERC20_TRANSFER_GAS;
    case "nft":
      return GAS.NFT_TRANSFER_GAS;
    case "eth":
    default:
      return GAS.ETH_TRANSFER_GAS;
  }
}

/**
 * Calculate optimal amount to send after gas
 * 
 * @param {bigint} balance - Current balance
 * @param {bigint} maxFeePerGas - Max fee per gas
 * @param {number} gasLimit - Gas limit
 * @returns {bigint} Amount to send
 */
function calculateSendAmount(balance, maxFeePerGas, gasLimit) {
  const gasCost = BigNumber.from(gasLimit).mul(maxFeePerGas);
  return balance.gt(gasCost) ? balance.sub(gasCost) : BigNumber.from(0);
}

module.exports = {
  getGas,
  getMinGas,
  getMaxGas,
  getGasLimit,
  calculateSendAmount,
};
