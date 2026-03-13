/**
 * Nonce Manager
 * Thread-safe nonce management for rescue operations
 * Prevents nonce collisions when multiple rescue attempts happen simultaneously
 */

const { logger } = require("../utils/logger");
const { sleep } = require("../utils/sleep");

class NonceManager {
  /**
   * @param {ethers.Provider} provider - Ethers provider
   * @param {string} walletAddress - Wallet address to manage nonce for
   */
  constructor(provider, walletAddress) {
    this.provider = provider;
    this.walletAddress = walletAddress.toLowerCase();
    this.nonceLock = null; // Promise that resolves when lock is available
    this.nonceCache = null;
    this.lastUpdate = 0;
    this.CACHE_TTL = 5000; // 5 seconds cache TTL
  }

  /**
   * Acquire lock and get next nonce
   * Uses Promise-based locking to prevent race conditions
   * 
   * @returns {Promise<number>}
   */
  async acquireNonce() {
    // Wait for any existing lock by awaiting the promise
    if (this.nonceLock) {
      await this.nonceLock;
    }

    // Create a new promise that will resolve when we're done
    let releaseLock;
    this.nonceLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      // Check if cached nonce is still valid
      const now = Date.now();
      if (this.nonceCache !== null && (now - this.lastUpdate) < this.CACHE_TTL) {
        this.nonceCache++;
        logger.debug(`Using cached nonce: ${this.nonceCache}`);
        return this.nonceCache;
      }

      // Get fresh nonce from pending transactions
      const nonce = await this.provider.getTransactionCount(this.walletAddress, "pending");
      this.nonceCache = nonce;
      this.lastUpdate = now;
      
      logger.debug(`Fresh nonce acquired: ${nonce}`);
      return nonce;
    } finally {
      // Release the lock
      this.nonceLock = null;
      releaseLock();
    }
  }

  /**
   * Get current nonce without incrementing (for viewing)
   * 
   * @returns {Promise<number>}
   */
  async getCurrentNonce() {
    return await this.provider.getTransactionCount(this.walletAddress, "pending");
  }

  /**
   * Reset nonce cache (useful after confirmed transactions)
   */
  resetCache() {
    this.nonceCache = null;
    this.lastUpdate = 0;
    logger.debug("Nonce cache reset");
  }

  /**
   * Force refresh nonce from network
   * 
   * @returns {Promise<number>}
   */
  async forceRefresh() {
    // Wait for any existing lock by awaiting the promise
    if (this.nonceLock) {
      await this.nonceLock;
    }

    // Create a new promise that will resolve when we're done
    let releaseLock;
    this.nonceLock = new Promise((resolve) => {
      releaseLock = resolve;
    });

    try {
      const nonce = await this.provider.getTransactionCount(this.walletAddress, "pending");
      this.nonceCache = nonce;
      this.lastUpdate = Date.now();
      logger.debug(`Nonce force refreshed: ${nonce}`);
      return nonce;
    } finally {
      // Release the lock
      this.nonceLock = null;
      releaseLock();
    }
  }

  /**
   * Check if nonce is currently locked
   * 
   * @returns {boolean}
   */
  isLocked() {
    return this.nonceLock !== null;
  }
}

/**
 * Simple nonce lock helper function
 * For use with external lock objects
 * 
 * @param {Object} lockHolder - Object with locked property
 * @param {Function} fn - Async function to execute
 * @returns {Promise<any>}
 */
async function withNonceLock(lockHolder, fn) {
  while (lockHolder.locked) {
    await sleep(10);
  }
  
  lockHolder.locked = true;
  try {
    return await fn();
  } finally {
    lockHolder.locked = false;
  }
}

/**
 * Create a nonce manager instance
 * 
 * @param {ethers.Provider} provider 
 * @param {string} walletAddress 
 * @returns {NonceManager}
 */
function createNonceManager(provider, walletAddress) {
  return new NonceManager(provider, walletAddress);
}

module.exports = {
  NonceManager,
  withNonceLock,
  createNonceManager,
};
