const { ethers } = require("ethers");

// Known malicious function selectors used by drainers
const DRAINER_SELECTORS = [
  "0x095ea7b3", // approve
  "0xa22cb465", // setApprovalForAll
  "0x23b872dd", // transferFrom
  "0xb88d4fde", // safeTransferFrom (with data)
  "0x42842e0e", // safeTransferFrom (without data)
  "0xf242432a", // safeTransferFrom with tokenId
  "0x2eb2c2d6", // safeTransferFrom
  "0x4e71d92d", // claim
  "0xe5e9b7b8", // mint
  "0x7ff36ab4", // swap exact ETH for tokens
  "0x38ed1739", // swap exact tokens for tokens
  "0x8803dbee", // swap exact tokens for ETH
  "0x18cbafe5", // swap exact ETH for tokens (uniswap)
  "0x04e45aaf", // swapExactETHForTokens
  "0x5c60da1b", // delegateCall
  "0x5c60da1b", // proxy implementation
  "0xd53d7a1c", // execute
  "0x4b1e3e53", // execute (from Safe)
  "0x2f2ff05d", // exec
];

// High-risk contract patterns
const HIGH_RISK_CONTRACTS = [
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // vitalik.eth (just an example)
];

// Gas price threshold multiplier
const GAS_THRESHOLD_MULTIPLIER = 3;

/**
 * AI Drainer Classifier - Scores transactions based on risk factors
 * to detect potential drainer attacks
 */
class DrainerClassifier {
  constructor(provider) {
    this.provider = provider;
    this.gasHistory = [];
    this.contractReputation = new Map();
    this.riskWeights = {
      highGasMultiplier: 2,
      dangerousSelector: 3,
      zeroValue: 1,
      unknownContract: 2,
      newContract: 1,
      multipleApprovals: 2,
    };
  }

  /**
   * Update gas history for baseline calculation
   */
  async updateGasHistory(blockNumber) {
    try {
      const block = await this.provider.getBlock(blockNumber);
      if (block && block.baseFeePerGas) {
        this.gasHistory.push(block.baseFeePerGas);
        // Keep only last 100 blocks
        if (this.gasHistory.length > 100) {
          this.gasHistory.shift();
        }
      }
    } catch (error) {
      console.error("Error updating gas history:", error.message);
    }
  }

  /**
   * Get average gas price from history
   */
  getAverageGas() {
    if (this.gasHistory.length === 0) {
      return 0n;
    }
    const sum = this.gasHistory.reduce((acc, val) => acc + val, 0n);
    return sum / BigInt(this.gasHistory.length);
  }

  /**
   * Check if a function selector is dangerous
   */
  isDangerousSelector(selector) {
    return DRAINER_SELECTORS.includes(selector?.toLowerCase() || "");
  }

  /**
   * Extract function selector from transaction data
   */
  extractSelector(txData) {
    if (!txData || txData.length < 10) return null;
    return txData.slice(0, 10).toLowerCase();
  }

  /**
   * Check if contract is newly deployed (simplified check)
   */
  async isNewContract(address) {
    try {
      const code = await this.provider.getCode(address);
      // If code is empty or very small, it's likely a new contract
      return code === "0x" || code.length < 100;
    } catch {
      return true;
    }
  }

  /**
   * Score a transaction based on risk factors
   * @param {Object} tx - Transaction object
   * @returns {Object} - Risk score and details
   */
  async scoreTransaction(tx) {
    let score = 0;
    const riskFactors = [];

    // Check gas price
    const avgGas = this.getAverageGas();
    if (tx.gasPrice && avgGas > 0n) {
      const gasMultiplier = tx.gasPrice / avgGas;
      if (gasMultiplier > BigInt(GAS_THRESHOLD_MULTIPLIER)) {
        score += this.riskWeights.highGasMultiplier;
        riskFactors.push({
          factor: "high_gas",
          value: gasMultiplier.toString(),
          weight: this.riskWeights.highGasMultiplier,
        });
      }
    }

    // Check for dangerous selectors
    const selector = this.extractSelector(tx.data);
    if (this.isDangerousSelector(selector)) {
      score += this.riskWeights.dangerousSelector;
      riskFactors.push({
        factor: "dangerous_selector",
        value: selector,
        weight: this.riskWeights.dangerousSelector,
      });
    }

    // Check zero value (common in approval attacks)
    if (tx.value === 0n || tx.value === "0" || tx.value === undefined) {
      score += this.riskWeights.zeroValue;
      riskFactors.push({
        factor: "zero_value",
        value: "true",
        weight: this.riskWeights.zeroValue,
      });
    }

    // Check if to address is a contract
    if (tx.to) {
      const isNew = await this.isNewContract(tx.to);
      if (isNew) {
        score += this.riskWeights.newContract;
        riskFactors.push({
          factor: "new_contract",
          value: tx.to,
          weight: this.riskWeights.newContract,
        });
      }
    }

    // Check for multiple dangerous operations in data
    if (tx.data) {
      let dangerCount = 0;
      for (const sel of DRAINER_SELECTORS) {
        if (tx.data.includes(sel.slice(2))) {
          dangerCount++;
        }
      }
      if (dangerCount > 1) {
        score += this.riskWeights.multipleApprovals;
        riskFactors.push({
          factor: "multiple_dangerous_ops",
          value: dangerCount.toString(),
          weight: this.riskWeights.multipleApprovals,
        });
      }
    }

    return {
      score,
      isHighRisk: score >= 5,
      riskFactors,
      selector,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect if a transaction is likely a drainer attack
   * @param {Object} tx - Transaction object
   * @returns {Promise<boolean>}
   */
  async detectDrainer(tx) {
    const analysis = await this.scoreTransaction(tx);
    return analysis.isHighRisk;
  }

  /**
   * Batch score multiple transactions
   * @param {Array} txs - Array of transactions
   * @returns {Promise<Array>} - Array of risk scores
   */
  async scoreTransactions(txs) {
    return Promise.all(txs.map((tx) => this.scoreTransaction(tx)));
  }

  /**
   * Get top risky transactions
   * @param {Array} txs - Array of transactions
   * @param {number} limit - Number of top risky transactions to return
   * @returns {Promise<Array>}
   */
  async getTopRiskyTransactions(txs, limit = 5) {
    const scored = await this.scoreTransactions(txs);
    return scored
      .filter((s) => s.isHighRisk)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

/**
 * Simple detector function for basic heuristic checking
 * @param {Object} tx - Transaction object
 * @returns {boolean}
 */
function detectDrainer(tx) {
  const selector = tx.data?.slice(0, 10)?.toLowerCase();
  return DRAINER_SELECTORS.includes(selector || "");
}

module.exports = {
  DrainerClassifier,
  detectDrainer,
  DRAINER_SELECTORS,
};
