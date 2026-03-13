const { ethers } = require("ethers");

/**
 * Mempool Engine - Monitors pending transactions for drainer detection
 */
class MempoolEngine {
  constructor(provider, walletAddress) {
    this.provider = provider;
    this.walletAddress = walletAddress.toLowerCase();
    this.pendingTxs = new Map();
    this.detectedDrainers = [];
    this.isMonitoring = false;
    this.onDrainerDetected = null;
  }

  /**
   * Set callback for drainer detection
   */
  setDrainerCallback(callback) {
    this.onDrainerDetected = callback;
  }

  /**
   * Start monitoring mempool
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Filter for pending transactions to our wallet
    this.provider.on("pending", async (txHash) => {
      await this.checkPendingTransaction(txHash);
    });

    console.log("[Mempool Engine] Started monitoring pending transactions");
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    this.isMonitoring = false;
    this.provider.removeAllListeners("pending");
    console.log("[Mempool Engine] Stopped monitoring");
  }

  /**
   * Check pending transaction
   */
  async checkPendingTransaction(txHash) {
    try {
      const tx = await this.provider.getTransaction(txHash);
      
      if (!tx) return;

      // Check if transaction involves our wallet
      if (tx.from?.toLowerCase() !== this.walletAddress) {
        return;
      }

      // Store pending transaction
      this.pendingTxs.set(txHash, {
        ...tx,
        detectedAt: Date.now(),
      });

      // Check for drainer patterns
      const isDrainer = this.detectDrainer(tx);

      if (isDrainer) {
        console.log(`[Mempool Engine] ⚠️ DRAINER DETECTED: ${txHash}`);
        console.log(`[Mempool Engine] To: ${tx.to}`);
        console.log(`[Mempool Engine] Data: ${tx.data?.slice(0, 100)}`);
        
        this.detectedDrainers.push({
          txHash,
          tx,
          detectedAt: Date.now(),
        });

        // Trigger callback
        if (this.onDrainerDetected) {
          this.onDrainerDetected(tx);
        }
      }
    } catch (error) {
      // Ignore errors for pending txs that might be dropped
    }
  }

  /**
   * Basic heuristic detection
   * @param {Object} tx - Transaction object
   * @returns {boolean}
   */
  detectDrainer(tx) {
    const selectors = [
      "0x095ea7b3", // approve
      "0xa22cb465", // setApprovalForAll
    ];

    const selector = tx.data?.slice(0, 10)?.toLowerCase();

    if (selectors.includes(selector)) {
      return true;
    }

    // Additional heuristics
    if (tx.data && tx.data.length > 10) {
      // Check for suspicious data patterns
      if (tx.data.includes("095ea7b3") || tx.data.includes("a22cb465")) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get pending transactions count
   */
  getPendingCount() {
    return this.pendingTxs.size;
  }

  /**
   * Get detected drainers
   */
  getDetectedDrainers() {
    return this.detectedDrainers;
  }

  /**
   * Clear detected drainers
   */
  clearDetectedDrainers() {
    this.detectedDrainers = [];
  }

  /**
   * Check transaction with AI classifier
   */
  async checkWithClassifier(tx, classifier) {
    return await classifier.detectDrainer(tx);
  }

  /**
   * Check transaction with risk analyzer
   */
  async checkWithRiskAnalyzer(tx, riskAnalyzer) {
    return await riskAnalyzer.analyzeRisk(tx);
  }

  /**
   * Get mempool stats
   */
  getStats() {
    return {
      isMonitoring: this.isMonitoring,
      pendingCount: this.pendingTxs.size,
      drainersDetected: this.detectedDrainers.length,
      walletAddress: this.walletAddress,
    };
  }
}

/**
 * Simple mempool filter as shown in architecture
 */
function createMempoolFilter(walletAddress) {
  return {
    from: walletAddress,
  };
}

module.exports = {
  MempoolEngine,
  createMempoolFilter,
};
