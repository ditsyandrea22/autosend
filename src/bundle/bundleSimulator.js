/**
 * Bundle Simulator
 * Simulates bundles before submission
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');

/**
 * Simulate a rescue bundle
 * 
 * @param {Array} bundle - Bundle to simulate
 * @param {string} chainName - Chain name
 * @param {ethers.Provider} provider - Provider
 * @returns {Promise<object>} Simulation result
 */
async function simulateBundle(bundle, chainName, provider) {
  try {
    const results = [];
    let totalGasUsed = 0n;
    let allSuccessful = true;

    for (const item of bundle) {
      try {
        // Estimate gas
        const gasEstimate = await provider.estimateGas(item.transaction);
        
        // Try to simulate by calling
        // Note: Flashbots simulation works differently
        results.push({
          nonce: item.transaction.nonce,
          success: true,
          gasUsed: gasEstimate,
        });
        
        totalGasUsed += gasEstimate;
      } catch (error) {
        allSuccessful = false;
        results.push({
          nonce: item.transaction.nonce,
          success: false,
          error: error.message,
        });
        
        logger.warn(`[BundleSimulator] Simulation failed for nonce ${item.transaction.nonce}:`, error.message);
      }
    }

    return {
      success: allSuccessful,
      results,
      gasUsed: totalGasUsed.toString(),
      chainName,
      simulatedAt: Date.now(),
    };

  } catch (error) {
    logger.error('[BundleSimulator] Simulation error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Simulate bundle with Flashbots
 * 
 * @param {FlashbotsBundleProvider} flashbotsProvider - Flashbots provider
 * @param {Array} signedTxs - Signed transactions
 * @param {number} targetBlock - Target block number
 * @returns {Promise<object>} Flashbots simulation result
 */
async function simulateWithFlashbots(flashbotsProvider, signedTxs, targetBlock) {
  try {
    const simulation = await flashbotsProvider.simulate(
      signedTxs,
      targetBlock,
      targetBlock
    );

    if (simulation.firstRevert) {
      return {
        success: false,
        error: `Reverted at: ${simulation.firstRevert}`,
        gasUsed: simulation.gasUsed,
      };
    }

    return {
      success: true,
      gasUsed: simulation.gasUsed,
      stateDiff: simulation.stateDiff,
      logs: simulation.logs,
    };

  } catch (error) {
    logger.error('[BundleSimulator] Flashbots simulation error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Estimate bundle cost
 * 
 * @param {Array} bundle - Bundle to estimate
 * @param {BigInt} gasPrice - Current gas price
 * @returns {BigInt} Total estimated cost
 */
function estimateBundleCost(bundle, gasPrice) {
  let totalGas = 0n;

  for (const item of bundle) {
    totalGas += BigInt(item.transaction.gasLimit || 21000);
  }

  return totalGas * gasPrice;
}

/**
 * Check if bundle is profitable
 * 
 * @param {object} simulation - Simulation result
 * @param {BigInt} bundleCost - Bundle execution cost
 * @param {BigInt} rescueValue - Value being rescued
 * @returns {boolean} Is profitable
 */
function isBundleProfitable(simulation, bundleCost, rescueValue) {
  if (!simulation.success) {
    return false;
  }

  const gasUsed = BigInt(simulation.gasUsed || 0);
  const actualCost = gasUsed * (simulation.effectiveGasPrice || 0n);

  return rescueValue > actualCost;
}

/**
 * Validate simulation result
 * 
 * @param {object} simulation - Simulation result
 * @returns {boolean} Is valid
 */
function validateSimulation(simulation) {
  if (!simulation) {
    return false;
  }

  if (simulation.error) {
    return false;
  }

  return simulation.success || false;
}

module.exports = {
  simulateBundle,
  simulateWithFlashbots,
  estimateBundleCost,
  isBundleProfitable,
  validateSimulation,
};
