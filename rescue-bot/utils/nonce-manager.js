const { ethers } = require("ethers");

/**
 * NonceManager - Thread-safe nonce management for rescue operations
 * Prevents nonce collisions when multiple rescue attempts happen simultaneously
 */
class NonceManager {
  constructor(provider, walletAddress) {
    this.provider = provider;
    this.walletAddress = walletAddress.toLowerCase();
    this.nonceLock = null;
    this.nonceCache = null;
    this.lastUpdate = 0;
    this.CACHE_TTL = 5000; // 5 seconds cache TTL
  }

  /**
   * Acquire lock and get next nonce
   * This ensures only one operation can use a nonce at a time
   */
  async acquireNonce() {
    // Wait for any existing lock
    while (this.nonceLock) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Acquire lock
    this.nonceLock = true;

    try {
      // Check if cached nonce is still valid
      const now = Date.now();
      if (this.nonceCache !== null && (now - this.lastUpdate) < this.CACHE_TTL) {
        this.nonceCache++;
        return this.nonceCache;
      }

      // Get fresh nonce from pending transactions
      const nonce = await this.provider.getTransactionCount(this.walletAddress, "pending");
      this.nonceCache = nonce;
      this.lastUpdate = now;
      
      return nonce;
    } finally {
      this.nonceLock = false;
    }
  }

  /**
   * Get current nonce without incrementing (for viewing)
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
  }

  /**
   * Force refresh nonce from network
   */
  async forceRefresh() {
    while (this.nonceLock) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    this.nonceLock = true;
    try {
      const nonce = await this.provider.getTransactionCount(this.walletAddress, "pending");
      this.nonceCache = nonce;
      this.lastUpdate = Date.now();
      return nonce;
    } finally {
      this.nonceLock = false;
    }
  }

  /**
   * Check if nonce is available
   */
  isLocked() {
    return this.nonceLock !== null;
  }
}

/**
 * Simple nonce lock helper function
 */
async function withNonceLock(lockHolder, fn) {
  while (lockHolder.locked) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  
  lockHolder.locked = true;
  try {
    return await fn();
  } finally {
    lockHolder.locked = false;
  }
}

module.exports = {
  NonceManager,
  withNonceLock,
};
