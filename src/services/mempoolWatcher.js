/**
 * Mempool Watcher Service
 * Monitors pending transactions for attack detection
 */

const { logger } = require("../utils/logger");
const { sleep } = require("../utils/sleep");

// Known drainer function selectors
const DRAINER_SELECTORS = [
  "0x095ea7b3", // approve
  "0xa22cb465", // setApprovalForAll
  "0x23b872dd", // transferFrom
  "0x42842e0e", // safeTransferFrom (with data)
  "0xb88d4fde", // safeTransferFrom (without data)
  "0xf242432a", // safeTransferFrom with tokenId
];

/**
 * MempoolWatcher - Monitors mempool for attacker transactions
 */
class MempoolWatcher {
  /**
   * @param {ethers.Provider} provider - Ethers provider
   * @param {ethers.Wallet} wallet - Wallet to monitor
   */
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.walletAddress = wallet.address.toLowerCase();
    this.isMonitoring = false;
    this.onAttackDetected = null;
    this.pendingTxs = new Map();
    this.detectedAttacks = [];

    // Memory management constants
    this.CLEANUP_THRESHOLD = 4000; // Trigger cleanup when reaching this size
    this.KEEP_RECENT_COUNT = 2000; // Number of entries to keep when cleaning up
  }

  /**
   * Clean up old entries from pendingTxs to prevent memory leak
   */
  _cleanupPendingTxs() {
    if (this.pendingTxs.size > this.CLEANUP_THRESHOLD) {
      const entries = Array.from(this.pendingTxs.entries());
      // Keep only the most recent entries
      this.pendingTxs = new Map(entries.slice(-this.KEEP_RECENT_COUNT));
      logger.debug(`Cleaned up pendingTxs, new size: ${this.pendingTxs.size}`);
    }
  }

  /**
   * Set callback for attack detection
   * @param {Function} callback - Callback function(tx)
   */
  setAttackCallback(callback) {
    this.onAttackDetected = callback;
  }

  /**
   * Start monitoring mempool for pending transactions
   */
  start() {
    if (this.isMonitoring) {
      logger.warn("Mempool watcher already running");
      return;
    }

    this.isMonitoring = true;
    
    // Listen to pending transactions
    this.provider.on("pending", async (txHash) => {
      await this.checkPendingTransaction(txHash);
    });

    logger.info("Mempool watcher started", { wallet: this.walletAddress });
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isMonitoring = false;
    this.provider.removeAllListeners("pending");
    logger.info("Mempool watcher stopped");
  }

  /**
   * Check a pending transaction
   * @param {string} txHash - Transaction hash
   */
  async checkPendingTransaction(txHash) {
    try {
      // Skip if already checked
      if (this.pendingTxs.has(txHash)) {
        return;
      }

      const tx = await this.provider.getTransaction(txHash);
      
      if (!tx) return;

      // Mark as checked
      this.pendingTxs.set(txHash, true);

      // Trigger periodic cleanup to prevent memory leak
      this._cleanupPendingTxs();

      // Only monitor transactions FROM our wallet (attacker transactions)
      if (tx.from?.toLowerCase() !== this.walletAddress) {
        return;
      }

      logger.info("Outgoing transaction detected", { 
        to: tx.to, 
        value: tx.value?.toString(),
        data: tx.data?.slice(0, 20) 
      });

      // Check if it's an attack
      const isAttack = this.detectAttack(tx);

      if (isAttack) {
        logger.attackDetected(this.walletAddress);
        
        this.detectedAttacks.push({
          txHash,
          tx,
          detectedAt: Date.now(),
        });

        // Trigger callback
        if (this.onAttackDetected) {
          await this.onAttackDetected(tx);
        }
      }
    } catch (error) {
      // Ignore errors for pending txs
      logger.debug("Error checking tx:", error.message);
    }
  }

  /**
   * Detect if transaction is an attack
   * @param {Object} tx - Transaction object
   * @returns {boolean}
   */
  detectAttack(tx) {
    // Check for known drainer selectors
    if (tx.data && tx.data.length > 10) {
      const selector = tx.data.slice(0, 10).toLowerCase();
      
      if (DRAINER_SELECTORS.includes(selector)) {
        return true;
      }

      // Check for multiple approvals in data
      let approvalCount = 0;
      for (const sel of DRAINER_SELECTORS) {
        if (tx.data.toLowerCase().includes(sel.slice(2))) {
          approvalCount++;
        }
      }
      
      if (approvalCount > 1) {
        return true;
      }
    }

    // Check for suspicious patterns:
    // 1. High value transfer to unknown address
    // 2. Contract interaction after zero balance
    
    return false;
  }

  /**
   * Get monitoring stats
   * @returns {Object}
   */
  getStats() {
    return {
      isMonitoring: this.isMonitoring,
      pendingChecked: this.pendingTxs.size,
      attacksDetected: this.detectedAttacks.length,
      wallet: this.walletAddress,
    };
  }

  /**
   * Clear detected attacks
   */
  clearAttacks() {
    this.detectedAttacks = [];
  }
}

/**
 * Create a mempool watcher instance
 * @param {ethers.Provider} provider 
 * @param {ethers.Wallet} wallet 
 * @returns {MempoolWatcher}
 */
function createMempoolWatcher(provider, wallet) {
  return new MempoolWatcher(provider, wallet);
}

module.exports = {
  MempoolWatcher,
  createMempoolWatcher,
  DRAINER_SELECTORS,
};
