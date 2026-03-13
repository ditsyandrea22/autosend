/**
 * Gas Escalator
 * Manages gas price escalation for failed/pending transactions
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { sleep } = require('../utils/sleep');

class GasEscalator {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.options = {
      escalationFactor: options.escalationFactor || 1.5,
      maxEscalations: options.maxEscalations || 5,
      baseDelay: options.baseDelay || 30000,
      maxGasMultiplier: options.maxGasMultiplier || 10,
      ...options,
    };
    this.escalations = new Map();
  }

  /**
   * Get current gas strategy
   */
  async getGasStrategy(chainName, provider, escalate = false) {
    try {
      const feeData = await provider.getFeeData();
      
      let maxFeePerGas;
      let maxPriorityFeePerGas;

      // Get base gas values
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // EIP-1559
        maxFeePerGas = feeData.maxFeePerGas;
        maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      } else {
        // Legacy
        maxFeePerGas = feeData.gasPrice;
        maxPriorityFeePerGas = feeData.gasPrice;
      }

      // Apply multiplier
      let multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
      
      if (escalate) {
        multiplier = Math.min(multiplier * this.options.escalationFactor, this.options.maxGasMultiplier);
      }

      maxFeePerGas = this.multiplyGas(maxFeePerGas, multiplier);
      maxPriorityFeePerGas = this.multiplyGas(maxPriorityFeePerGas, multiplier);

      return {
        maxFeePerGas,
        maxPriorityFeePerGas,
        multiplier,
      };
    } catch (error) {
      logger.error('[GasEscalator] Error getting gas strategy:', error);
      
      // Return safe defaults
      return {
        maxFeePerGas: ethers.utils.parseUnits('200', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseGas('5', 'gwei'),
        multiplier: 3,
      };
    }
  }

  /**
   * Multiply gas value by factor
   */
  multiplyGas(gasValue, multiplier) {
    return gasValue * BigInt(Math.floor(multiplier * 100)) / BigInt(100);
  }

  /**
   * Execute transaction with gas escalation
   */
  async executeWithEscalation(signer, transaction, onEscalation) {
    const txHash = transaction.hash || 'pending';
    let attempt = 0;
    let currentTransaction = transaction;

    this.escalations.set(txHash, {
      startTime: Date.now(),
      attempts: 0,
    });

    while (attempt < this.options.maxEscalations) {
      try {
        // Send transaction
        const response = await signer.sendTransaction(currentTransaction);
        
        logger.info(`[GasEscalator] Transaction sent: ${response.hash}, attempt ${attempt + 1}`);
        
        // Wait for confirmation
        const receipt = await response.wait(1);
        
        if (receipt.status === 1) {
          logger.info(`[GasEscalator] Transaction confirmed: ${response.hash}`);
          this.escalations.delete(txHash);
          return { success: true, hash: response.hash, receipt };
        } else {
          logger.warn(`[GasEscalator] Transaction failed: ${response.hash}`);
        }
      } catch (error) {
        logger.warn(`[GasEscalator] Transaction error: ${error.message}`);
        
        // Check if it's a nonce issue
        if (error.message.includes('nonce')) {
          this.escalations.delete(txHash);
          return { success: false, error: 'Nonce error', retry: false };
        }
      }

      // Escalate gas for next attempt
      attempt++;
      
      if (attempt < this.options.maxEscalations) {
        const escalationInfo = this.escalations.get(txHash);
        if (escalationInfo) {
          escalationInfo.attempts = attempt;
        }

        // Calculate new gas
        const gasStrategy = await this.getGasStrategy(null, this.provider, true);
        
        // Update transaction gas
        currentTransaction = {
          ...currentTransaction,
          maxFeePerGas: gasStrategy.maxFeePerGas,
          maxPriorityFeePerGas: gasStrategy.maxPriorityFeePerGas,
        };

        logger.info(`[GasEscalator] Escalating gas, attempt ${attempt + 1}, multiplier: ${gasStrategy.multiplier}`);

        // Call escalation callback
        if (onEscalation) {
          await onEscalation(attempt, gasStrategy);
        }

        // Wait before retry
        await sleep(this.options.baseDelay * attempt);
      }
    }

    this.escalations.delete(txHash);
    return { success: false, error: 'Max escalations reached', retry: true };
  }

  /**
   * Get pending escalations
   */
  getPendingEscalations() {
    return Array.from(this.escalations.entries()).map(([hash, info]) => ({
      hash,
      ...info,
      duration: Date.now() - info.startTime,
    }));
  }

  /**
   * Cancel escalation
   */
  cancelEscalation(txHash) {
    return this.escalations.delete(txHash);
  }

  /**
   * Calculate optimal gas for quick inclusion
   */
  async getPriorityGas() {
    const feeData = await this.provider.getFeeData();
    
    // Use higher priority fee for faster inclusion
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;
    maxPriorityFeePerGas = this.multiplyGas(maxPriorityFeePerGas, 2);

    return {
      maxPriorityFeePerGas,
      maxFeePerGas: feeData.maxFeePerGas || feeData.gasPrice,
    };
  }

  /**
   * Estimate total gas cost
   */
  estimateTotalGasCost(gasLimit, gasPrice) {
    return gasLimit * gasPrice;
  }
}

/**
 * Get global gas strategy
 */
async function getGasStrategy(chainName, provider, escalate = false) {
  const escalator = new GasEscalator(provider);
  return escalator.getGasStrategy(chainName, provider, escalate);
}

/**
 * Quick priority gas
 */
async function getPriorityGas(provider) {
  const escalator = new GasEscalator(provider);
  return escalator.getPriorityGas();
}

module.exports = {
  GasEscalator,
  getGasStrategy,
  getPriorityGas,
};
