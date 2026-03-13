const { ethers } = require("ethers");

/**
 * Gas Predictor - Predicts optimal gas prices for rescue transactions
 * Uses escalator strategy to increase gas prices on failed attempts
 */
class GasPredictor {
  constructor(provider) {
    this.provider = provider;
    this.attemptHistory = new Map();
    this.baseFees = [];
    this.priorityFees = [];
    
    // Escalator multipliers for retry attempts
    this.ESCALATOR_MULTIPLIERS = [2, 3, 5, 8, 13, 21];
    this.MAX_ATTEMPTS = 6;
  }

  /**
   * Update gas history with latest block data
   */
  async updateHistory(blockNumber) {
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (block) {
        if (block.baseFeePerGas) {
          this.baseFees.push(block.baseFeePerGas);
          if (this.baseFees.length > 20) this.baseFees.shift();
        }
        if (block.gasUsed && block.gasUsed > 0) {
          const ratio = block.gasUsed / block.gasLimit;
          this.priorityFees.push(ratio);
          if (this.priorityFees.length > 20) this.priorityFees.shift();
        }
      }
    } catch (error) {
      console.error("Error updating gas history:", error.message);
    }
  }

  /**
   * Predict base fee for next block
   */
  predictNextBaseFee() {
    if (this.baseFees.length === 0) return null;
    
    const lastBaseFee = this.baseFees[this.baseFees.length - 1];
    const avgGrowth = this.calculateAverageGrowth();
    
    // EIP-1559 formula: baseFee increases by up to 12.5% based on gas usage
    const maxIncrease = lastBaseFee * 125n / 1000n;
    const predictedIncrease = avgGrowth > 0.8 ? maxIncrease : lastBaseFee * BigInt(Math.floor(avgGrowth * 125)) / 1000n;
    
    return lastBaseFee + predictedIncrease;
  }

  /**
   * Calculate average gas growth ratio
   */
  calculateAverageGrowth() {
    if (this.priorityFees.length < 2) return 0.5;
    return this.priorityFees.reduce((a, b) => a + b, 0) / this.priorityFees.length;
  }

  /**
   * Get predicted gas fees for a specific attempt
   * @param {number} attempt - Current attempt number (0-indexed)
   * @param {Object} baseFeeData - Optional base fee data
   * @returns {Object} - Predicted maxPriorityFeePerGas and maxFeePerGas
   */
  async predictGas(attempt = 0, baseFeeData = null) {
    const multiplier = this.ESCALATOR_MULTIPLIERS[Math.min(attempt, this.MAX_ATTEMPTS - 1)];
    
    // Get current fee data
    let feeData;
    if (baseFeeData) {
      feeData = baseFeeData;
    } else {
      try {
        feeData = await this.provider.getFeeData();
      } catch (error) {
        // Fallback to default values
        feeData = {
          maxFeePerGas: ethers.parseUnits("50", "gwei"),
          maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
        };
      }
    }

    // Calculate priority fee with escalator
    let maxPriorityFeePerGas;
    if (feeData.maxPriorityFeePerGas) {
      maxPriorityFeePerGas = feeData.maxPriorityFeePerGas * BigInt(multiplier);
    } else {
      maxPriorityFeePerGas = ethers.parseUnits(String(2 * multiplier), "gwei");
    }

    // Calculate max fee based on predicted base fee
    let predictedBaseFee;
    if (this.baseFees.length > 0) {
      predictedBaseFee = this.predictNextBaseFee() || feeData.maxFeePerGas;
    } else {
      predictedBaseFee = feeData.maxFeePerGas || ethers.parseUnits("50", "gwei");
    }

    // Apply escalator multiplier to max fee
    const maxFeePerGas = predictedBaseFee * BigInt(multiplier);

    return {
      maxPriorityFeePerGas,
      maxFeePerGas,
      multiplier,
      attempt,
      predictedBaseFee,
    };
  }

  /**
   * Get gas estimate with competitive pricing
   * @param {number} competitiveness - 1-10 scale (10 being most competitive)
   * @returns {Promise<Object>}
   */
  async getCompetitiveGas(competitiveness = 5) {
    const feeData = await this.provider.getFeeData();
    const multiplier = 1 + (competitiveness / 10) * 4; // 1.5x to 5x

    return {
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * BigInt(Math.ceil(multiplier)),
      maxFeePerGas: feeData.maxFeePerGas * BigInt(Math.ceil(multiplier)),
      basePriorityFee: feeData.maxPriorityFeePerGas,
      baseMaxFee: feeData.maxFeePerGas,
    };
  }

  /**
   * Calculate gas limit with buffer
   * @param {Object} tx - Transaction object
   * @param {number} bufferPercent - Additional buffer percentage
   * @returns {Promise<bigint>}
   */
  async estimateGasWithBuffer(tx, bufferPercent = 20) {
    try {
      const gasEstimate = await this.provider.estimateGas(tx);
      const buffer = gasEstimate * BigInt(100 + bufferPercent) / 100n;
      return buffer;
    } catch (error) {
      // Fallback to standard limits
      if (tx.data && tx.data !== "0x") {
        return 500000n; // Contract interaction
      }
      return 21000n; // Simple transfer
    }
  }

  /**
   * Escalator strategy for gas prices
   * @param {number} attempt - Current attempt number
   * @returns {Object} - Escalator parameters
   */
  getEscalatorStrategy(attempt) {
    const multipliers = {
      0: { multiplier: 2, label: "Attempt 1 - 2x" },
      1: { multiplier: 3, label: "Attempt 2 - 3x" },
      2: { multiplier: 5, label: "Attempt 3 - 5x" },
      3: { multiplier: 8, label: "Attempt 4 - 8x" },
      4: { multiplier: 13, label: "Attempt 5 - 13x" },
      5: { multiplier: 21, label: "Attempt 6 - 21x" },
    };
    
    return multipliers[Math.min(attempt, 5)] || multipliers[5];
  }

  /**
   * Get full gas configuration for rescue transaction
   * @param {number} attempt - Current attempt
   * @param {boolean} urgent - Whether this is an urgent rescue
   * @returns {Promise<Object>}
   */
  async getRescueGas(attempt = 0, urgent = true) {
    const competitiveness = urgent ? 8 : 5;
    const gasPrediction = await this.predictGas(attempt);
    const competitive = await this.getCompetitiveGas(competitiveness);
    
    // Use the higher of the two strategies
    return {
      maxPriorityFeePerGas: gasPrediction.maxPriorityFeePerGas > competitive.maxPriorityFeePerGas
        ? gasPrediction.maxPriorityFeePerGas
        : competitive.maxPriorityFeePerGas,
      maxFeePerGas: gasPrediction.maxFeePerGas > competitive.maxFeePerGas
        ? gasPrediction.maxFeePerGas
        : competitive.maxFeePerGas,
      multiplier: gasPrediction.multiplier,
      attempt,
      strategy: urgent ? "URGENT" : "NORMAL",
    };
  }

  /**
   * Reset attempt history
   */
  reset() {
    this.attemptHistory.clear();
    this.baseFees = [];
    this.priorityFees = [];
  }
}

/**
 * Simple predictGas function as shown in the architecture
 * @param {bigint} baseFee - Base fee from block
 * @param {number} attempt - Current attempt number
 * @returns {bigint}
 */
function predictGas(baseFee, attempt) {
  const multiplier = [2, 3, 5, 8][Math.min(attempt, 3)];
  return baseFee * BigInt(multiplier);
}

module.exports = {
  GasPredictor,
  predictGas,
};
