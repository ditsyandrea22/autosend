/**
 * Gas Strategy
 * Dynamic gas pricing for competitive rescue operations
 */

const { BigNumber, ethers } = require("ethers");
const { GAS } = require("../config/constants");
const { logger } = require("../utils/logger");

// Constants for gas calculations
const GWEI_BN = BigNumber.from(1e9); // 1 gwei in wei

// Default gas caps (in gwei) - suitable for mainnet during normal conditions
// During extreme congestion, set GAS_DISABLE_CAPS=true but expect higher costs
// For rescue operations, ensure caps are high enough to outbid attackers
const DEFAULT_MAX_FEE_CAP = 5; // 5 gwei - sufficient for most rescue scenarios during high congestion
const DEFAULT_MAX_PRIORITY_CAP = 1; // 1 gwei - competitive priority fee

/**
 * Safely parse integer from environment variable with fallback
 * @param {string|undefined} value - Environment variable value
 * @param {number} defaultVal - Default value if parsing fails
 * @returns {number} Parsed value or default
 */
function parseGasEnv(value, defaultVal) {
  if (!value) return defaultVal;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Apply fallback for null/undefined fee data
 * @param {BigNumber|undefined|null} value - Fee value
 * @param {BigNumber} fallback - Fallback value (configurable via GAS_MIN_FEE_GWEI env, default: 5 gwei)
 * @returns {BigNumber}
 */
function getFeeWithFallback(value, fallback) {
  // Allow configurable minimum via environment variable
  const minFeeGwei = parseGasEnv(process.env.GAS_MIN_FEE_GWEI, 5);
  const defaultFallback = GWEI_BN.mul(minFeeGwei);
  return value && !value.isZero() ? value : (fallback || defaultFallback);
}

/**
 * Get aggressive gas fees for rescue operations
 * Uses multipliers to outbid attackers
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {boolean} isUnderAttack - Whether an attack is detected
 * @returns {Promise<{maxFeePerGas: BigNumber, maxPriorityFeePerGas: BigNumber}>}
 */
async function getGas(provider, isUnderAttack = false) {
  const feeData = await provider.getFeeData();
  
  // Apply fallback for null fee data (can happen with some RPCs)
  const basePriorityFeePerGas = getFeeWithFallback(feeData.maxPriorityFeePerGas);
  const baseMaxFeePerGas = getFeeWithFallback(feeData.maxFeePerGas);
  
  const multiplier = BigNumber.from(isUnderAttack ? GAS.ATTACK_MULTIPLIER : GAS.BASE_MULTIPLIER);
  
  // Apply multiplier to the suggested fees
  let maxPriorityFeePerGas = basePriorityFeePerGas.mul(multiplier);
  let maxFeePerGas = baseMaxFeePerGas.mul(multiplier);
  
  // Gas fee caps to prevent excessive costs during volatile periods
  // Defaults: 2000 gwei maxFee, 300 gwei priority - set env vars to override
  // Set GAS_DISABLE_CAPS=true to disable caps entirely for critical rescue ops
  const disableCaps = process.env.GAS_DISABLE_CAPS === 'true';
  const maxFeeCap = BigNumber.from(parseGasEnv(process.env.GAS_MAX_FEE_CAP, DEFAULT_MAX_FEE_CAP)).mul(GWEI_BN);
  const maxPriorityCap = BigNumber.from(parseGasEnv(process.env.GAS_MAX_PRIORITY_CAP, DEFAULT_MAX_PRIORITY_CAP)).mul(GWEI_BN);
  
  if (!disableCaps) {
    if (maxFeePerGas.gt(maxFeeCap)) {
      logger.warn(`Gas fee capped at ${parseGasEnv(process.env.GAS_MAX_FEE_CAP, DEFAULT_MAX_FEE_CAP)} gwei (was ${maxFeePerGas.div(GWEI_BN).toString()} gwei). Set GAS_DISABLE_CAPS=true to disable caps for critical rescue.`);
      maxFeePerGas = maxFeeCap;
    }
    if (maxPriorityFeePerGas.gt(maxPriorityCap)) {
      logger.warn(`Priority fee capped at ${parseGasEnv(process.env.GAS_MAX_PRIORITY_CAP, DEFAULT_MAX_PRIORITY_CAP)} gwei (was ${maxPriorityFeePerGas.div(GWEI_BN).toString()} gwei). Set GAS_DISABLE_CAPS=true to disable caps for critical rescue.`);
      maxPriorityFeePerGas = maxPriorityCap;
    }
  }
  
  logger.gasUpdate(maxFeePerGas, maxPriorityFeePerGas);
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

/**
 * Get minimum viable gas for rescue
 * Uses base fees only, no priority
 * 
 * @param {ethers.Provider} provider 
 * @returns {Promise<{maxFeePerGas: BigNumber, maxPriorityFeePerGas: BigNumber}>}
 */
async function getMinGas(provider) {
  const feeData = await provider.getFeeData();
  
  // Apply fallback for null fee data
  const basePriorityFeePerGas = getFeeWithFallback(feeData.maxPriorityFeePerGas);
  const baseMaxFeePerGas = getFeeWithFallback(feeData.maxFeePerGas);
  
  // Add small priority for inclusion (1 gwei)
  const maxPriorityFeePerGas = basePriorityFeePerGas.add(GWEI_BN);
  const maxFeePerGas = baseMaxFeePerGas;
  
  return { maxPriorityFeePerGas, maxFeePerGas };
}

/**
 * Get maximum gas for aggressive rescue
 * Uses highest possible multiplier
 * 
 * @param {ethers.Provider} provider 
 * @returns {Promise<{maxFeePerGas: BigNumber, maxPriorityFeePerGas: BigNumber}>}
 */
async function getMaxGas(provider) {
  const feeData = await provider.getFeeData();
  
  // Apply fallback for null fee data
  const basePriorityFeePerGas = getFeeWithFallback(feeData.maxPriorityFeePerGas);
  const baseMaxFeePerGas = getFeeWithFallback(feeData.maxFeePerGas);
  
  const multiplier = BigNumber.from(GAS.MAX_MULTIPLIER);
  
  let maxPriorityFeePerGas = basePriorityFeePerGas.mul(multiplier);
  let maxFeePerGas = baseMaxFeePerGas.mul(multiplier);
  
  // Apply same fee caps as getGas() for consistency
  const disableCaps = process.env.GAS_DISABLE_CAPS === 'true';
  const maxFeeCap = BigNumber.from(parseGasEnv(process.env.GAS_MAX_FEE_CAP, DEFAULT_MAX_FEE_CAP)).mul(GWEI_BN);
  const maxPriorityCap = BigNumber.from(parseGasEnv(process.env.GAS_MAX_PRIORITY_CAP, DEFAULT_MAX_PRIORITY_CAP)).mul(GWEI_BN);
  
  if (!disableCaps) {
    if (maxFeePerGas.gt(maxFeeCap)) {
      logger.warn(`getMaxGas: Fee capped at ${parseGasEnv(process.env.GAS_MAX_FEE_CAP, DEFAULT_MAX_FEE_CAP)} gwei (was ${maxFeePerGas.div(GWEI_BN).toString()} gwei). Set GAS_DISABLE_CAPS=true to disable.`);
      maxFeePerGas = maxFeeCap;
    }
    if (maxPriorityFeePerGas.gt(maxPriorityCap)) {
      logger.warn(`getMaxGas: Priority fee capped at ${parseGasEnv(process.env.GAS_MAX_PRIORITY_CAP, DEFAULT_MAX_PRIORITY_CAP)} gwei (was ${maxPriorityFeePerGas.div(GWEI_BN).toString()} gwei). Set GAS_DISABLE_CAPS=true to disable.`);
      maxPriorityFeePerGas = maxPriorityCap;
    }
  }
  
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
 * @param {BigNumber} balance - Current balance
 * @param {BigNumber} maxFeePerGas - Max fee per gas
 * @param {number} gasLimit - Gas limit
 * @returns {BigNumber} Amount to send
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
