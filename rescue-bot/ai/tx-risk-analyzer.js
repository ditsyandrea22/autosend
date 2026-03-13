const { ethers } = require("ethers");

/**
 * Transaction Risk Analyzer
 * Provides detailed risk analysis for transactions including:
 * - Gas analysis
 * - Contract interaction analysis
 * - Historical pattern matching
 * - MEV exposure assessment
 */
class TransactionRiskAnalyzer {
  constructor(provider) {
    this.provider = provider;
    this.txHistory = new Map();
    this.riskThresholds = {
      critical: 8,
      high: 5,
      medium: 3,
      low: 1,
    };
    this.gasAnalysis = {
      normalMultiplier: 1.5,
      suspiciousMultiplier: 3,
      extremeMultiplier: 5,
    };
  }

  /**
   * Analyze comprehensive risk score for a transaction
   * @param {Object} tx - Transaction object
   * @returns {Promise<Object>} - Detailed risk analysis
   */
  async analyzeRisk(tx) {
    const risks = {
      gasRisk: await this.analyzeGasRisk(tx),
      contractRisk: await this.analyzeContractRisk(tx),
      patternRisk: await this.analyzePatternRisk(tx),
      mevRisk: await this.analyzeMEVRisk(tx),
      historicalRisk: await this.analyzeHistoricalRisk(tx),
    };

    const totalScore = Object.values(risks).reduce(
      (sum, r) => sum + r.score,
      0
    );

    return {
      totalScore,
      level: this.getRiskLevel(totalScore),
      risks,
      recommendation: this.getRecommendation(totalScore, risks),
      details: {
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value?.toString(),
        data: tx.data?.slice(0, 100),
        gasPrice: tx.gasPrice?.toString(),
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Analyze gas-related risks
   */
  async analyzeGasRisk(tx) {
    let score = 0;
    const factors = [];

    if (tx.gasPrice) {
      const currentBlock = await this.provider.getBlockNumber();
      try {
        const block = await this.provider.getBlock(currentBlock);
        if (block && block.baseFeePerGas) {
          const ratio = tx.gasPrice / block.baseFeePerGas;

          if (ratio > BigInt(this.gasAnalysis.extremeMultiplier)) {
            score += 3;
            factors.push("Extreme gas price (5x+ base fee)");
          } else if (ratio > BigInt(this.gasAnalysis.suspiciousMultiplier)) {
            score += 2;
            factors.push("Suspicious gas price (3x+ base fee)");
          } else if (ratio > BigInt(this.gasAnalysis.normalMultiplier)) {
            score += 1;
            factors.push("Elevated gas price (1.5x+ base fee)");
          }
        }
      } catch (e) {
        // Fallback analysis
        if (tx.maxPriorityFeePerGas && tx.maxFeePerGas) {
          const ratio = tx.maxPriorityFeePerGas / tx.maxFeePerGas;
        if (Number(tx.maxPriorityFeePerGas) / Number(tx.maxFeePerGas) > 0.8) {
            score += 2;
            factors.push("High tip ratio suggests urgency");
          }
        }
      }
    }

    // Check for missing gas limit
    if (!tx.gasLimit || tx.gasLimit === 0) {
      score += 1;
      factors.push("No explicit gas limit");
    }

    return {
      score,
      level: this.getScoreLevel(score, 3),
      factors,
    };
  }

  /**
   * Analyze contract interaction risks
   */
  async analyzeContractRisk(tx) {
    let score = 0;
    const factors = [];

    if (!tx.to) {
      score += 2;
      factors.push("Contract creation (no target)");
      return { score, level: this.getScoreLevel(score, 3), factors };
    }

    try {
      const code = await this.provider.getCode(tx.to);

      // Check if contract exists
      if (code === "0x") {
        score += 1;
        factors.push("EOA address (not a contract)");
      } else {
        // Analyze contract size/complexity
        const contractSize = (code.length - 2) / 2;

        if (contractSize > 100000) {
          score += 2;
          factors.push("Large contract bytecode");
        }

        // Check for proxy patterns
        if (code.includes("3d3d1d83") || code.includes("5c60da1b")) {
          score += 2;
          factors.push("Proxy contract detected");
        }

        // Check for malicious patterns (simplified)
        const dangerousPatterns = ["selfdestruct", "suicide"];
        for (const pattern of dangerousPatterns) {
          if (code.includes(pattern)) {
            score += 3;
            factors.push(`Dangerous pattern: ${pattern}`);
          }
        }
      }
    } catch (e) {
      score += 1;
      factors.push("Could not analyze contract");
    }

    return {
      score,
      level: this.getScoreLevel(score, 3),
      factors,
    };
  }

  /**
   * Analyze transaction pattern risks
   */
  async analyzePatternRisk(tx) {
    let score = 0;
    const factors = [];
    const data = tx.data || "";

    // Check for approval-related patterns
    if (data.startsWith("0x095ea7b3")) {
      score += 2;
      factors.push("Token approval detected");

      // Check for unlimited approval
      if (
        data.includes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") ||
        data.slice(-64) === "0".repeat(64)
      ) {
        score += 2;
        factors.push("Unlimited approval detected");
      }
    }

    // Check for setApprovalForAll (NFT)
    if (data.startsWith("0xa22cb465")) {
      score += 3;
      factors.push("NFT full approval detected");
    }

    // Check for transfer patterns
    if (data.startsWith("0x23b872dd")) {
      score += 2;
      factors.push("Token transferFrom detected");
    }

    // Check for flash loan patterns
    if (data.startsWith("0x0902f1ac")) {
      score += 2;
      factors.push("Flash loan interaction");
    }

    // Check for execute patterns (often used in drainers)
    if (data.startsWith("0x4b1e3e53") || data.startsWith("0xd53d7a1c")) {
      score += 3;
      factors.push("Multi-call execute pattern");
    }

    // Check for zero value transactions with complex data
    if ((tx.value === 0n || tx.value === "0") && data.length > 10) {
      score += 1;
      factors.push("Zero value with data (potential data exfiltration)");
    }

    // Check for random/malformed data
    if (data.length > 0 && data.length < 10) {
      score += 1;
      factors.push("Incomplete function selector");
    }

    return {
      score,
      level: this.getScoreLevel(score, 3),
      factors,
    };
  }

  /**
   * Analyze MEV-related risks
   */
  async analyzeMEVRisk(tx) {
    let score = 0;
    const factors = [];

    // Check if transaction is a bundle (simulated)
    if (tx.bundleHash) {
      score += 1;
      factors.push("Part of a transaction bundle");
    }

    // Check for front-run vulnerable patterns
    if (tx.data && tx.data.includes("0x7a250d5630b4cf539739df2c5dacb4c659f2488d")) {
      score += 2;
      factors.push("Uniswap interaction (MEV-vulnerable)");
    }

    // Check for sandwich opportunities
    if (tx.value > 0n && tx.data) {
      score += 1;
      factors.push("Value transfer with swap (sandwichable)");
    }

    // High value transactions
    if (tx.value && tx.value > ethers.parseEther("1")) {
      score += 1;
      factors.push("High value transaction");
    }

    return {
      score,
      level: this.getScoreLevel(score, 3),
      factors,
    };
  }

  /**
   * Analyze historical patterns
   */
  async analyzeHistoricalRisk(tx) {
    let score = 0;
    const factors = [];

    // Check transaction count
    if (tx.from) {
      const history = this.txHistory.get(tx.from.toLowerCase()) || {
        count: 0,
        lastTx: 0,
      };

      // First transaction ever - slightly risky
      if (history.count === 0) {
        score += 1;
        factors.push("First transaction from this address");
      }

      // Very frequent transactions
      const timeSinceLastTx = Date.now() - history.lastTx;
      if (timeSinceLastTx < 60000 && history.count > 10) {
        score += 2;
        factors.push("High frequency transactions");
      }

      // Update history
      this.txHistory.set(tx.from.toLowerCase(), {
        count: history.count + 1,
        lastTx: Date.now(),
      });
    }

    return {
      score,
      level: this.getScoreLevel(score, 3),
      factors,
    };
  }

  /**
   * Get risk level from total score
   */
  getRiskLevel(score) {
    if (score >= this.riskThresholds.critical) return "CRITICAL";
    if (score >= this.riskThresholds.high) return "HIGH";
    if (score >= this.riskThresholds.medium) return "MEDIUM";
    return "LOW";
  }

  /**
   * Get individual score level
   */
  getScoreLevel(score, max) {
    const ratio = score / max;
    if (ratio >= 0.8) return "CRITICAL";
    if (ratio >= 0.6) return "HIGH";
    if (ratio >= 0.3) return "MEDIUM";
    return "LOW";
  }

  /**
   * Get recommendation based on risk analysis
   */
  getRecommendation(score, risks) {
    if (score >= 10) {
      return "IMMEDIATE_ACTION: High probability of drainer attack. Execute rescue immediately.";
    }
    if (score >= 7) {
      return "HIGH_ALERT: Significant risk detected. Prepare rescue bundle.";
    }
    if (score >= 4) {
      return "CAUTION: Monitor closely. Consider preemptive rescue.";
    }
    return "NORMAL: Standard transaction. Continue monitoring.";
  }

  /**
   * Quick risk check for mempool monitoring
   * @param {Object} tx - Transaction object
   * @returns {Promise<boolean>}
   */
  async isRisky(tx) {
    const analysis = await this.analyzeRisk(tx);
    return analysis.totalScore >= this.riskThresholds.medium;
  }

  /**
   * Reset transaction history
   */
  resetHistory() {
    this.txHistory.clear();
  }
}

module.exports = {
  TransactionRiskAnalyzer,
};
