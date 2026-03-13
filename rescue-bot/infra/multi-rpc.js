const { ethers } = require("ethers");

/**
 * Multi-RPC - Manages multiple RPC endpoints for redundancy and low latency
 */
class MultiRPC {
  constructor(rpcUrls = []) {
    this.providers = rpcUrls.map((url) => new ethers.providers.JsonRpcProvider(url));
    this.activeProviderIndex = 0;
    this.latencies = new Map();
    this.failedProviders = new Set();
    this.lastHealthCheck = 0;
  }

  /**
   * Add RPC endpoint
   */
  addRPC(url) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    this.providers.push(provider);
    console.log(`[Multi-RPC] Added RPC: ${this.maskUrl(url)}`);
  }

  /**
   * Mask URL for logging (hide sensitive data)
   */
  maskUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = "***";
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /**
   * Get best provider based on latency
   */
  async getBestProvider() {
    await this.healthCheck();
    
    // Find provider with lowest latency that's not failed
    let bestIndex = 0;
    let bestLatency = Infinity;

    for (let i = 0; i < this.providers.length; i++) {
      if (this.failedProviders.has(i)) continue;
      
      const latency = this.latencies.get(i) || Infinity;
      if (latency < bestLatency) {
        bestLatency = latency;
        bestIndex = i;
      }
    }

    this.activeProviderIndex = bestIndex;
    return this.providers[bestIndex];
  }

  /**
   * Get current active provider
   */
  getActiveProvider() {
    return this.providers[this.activeProviderIndex];
  }

  /**
   * Measure latency for a provider
   */
  async measureLatency(provider, index) {
    const start = Date.now();
    try {
      await provider.getBlockNumber();
      const latency = Date.now() - start;
      this.latencies.set(index, latency);
      return latency;
    } catch (error) {
      this.latencies.set(index, Infinity);
      this.failedProviders.add(index);
      return Infinity;
    }
  }

  /**
   * Health check all providers
   */
  async healthCheck() {
    const now = Date.now();
    if (now - this.lastHealthCheck < 30000) {
      return; // Only check every 30 seconds
    }

    this.lastHealthCheck = now;
    this.failedProviders.clear();

    console.log("[Multi-RPC] Running health check...");

    const checks = this.providers.map(async (provider, index) => {
      const latency = await this.measureLatency(provider, index);
      const status = latency === Infinity ? "FAILED" : `${latency}ms`;
      console.log(`[Multi-RPC] ${this.maskUrl(provider.connection.url)}: ${status}`);
    });

    await Promise.all(checks);
  }

  /**
   * Execute with fallback
   */
  async executeWithFallback(method, ...args) {
    const errors = [];

    for (let attempt = 0; attempt < this.providers.length; attempt++) {
      const provider = await this.getBestProvider();
      
      try {
        return await provider[method](...args);
      } catch (error) {
        errors.push({ provider: provider.connection.url, error: error.message });
        this.failedProviders.add(this.activeProviderIndex);
      }
    }

    throw new Error(`All providers failed: ${errors.map((e) => e.error).join(", ")}`);
  }

  /**
   * Get block with fallback
   */
  async getBlock(blockNumber) {
    return this.executeWithFallback("getBlock", blockNumber);
  }

  /**
   * Get balance with fallback
   */
  async getBalance(address) {
    return this.executeWithFallback("getBalance", address);
  }

  /**
   * Get transaction with fallback
   */
  async getTransaction(hash) {
    return this.executeWithFallback("getTransaction", hash);
  }

  /**
   * Get transaction count with fallback
   */
  async getTransactionCount(address, blockTag = "latest") {
    return this.executeWithFallback("getTransactionCount", address, blockTag);
  }

  /**
   * Get fee data with fallback
   */
  async getFeeData() {
    return this.executeWithFallback("getFeeData");
  }

  /**
   * Get all provider stats
   */
  getStats() {
    return {
      totalProviders: this.providers.length,
      activeProvider: this.activeProviderIndex,
      latencies: Array.from(this.latencies.entries()).map(([index, latency]) => ({
        index,
        latency: latency === Infinity ? "failed" : `${latency}ms`,
      })),
      failedCount: this.failedProviders.size,
    };
  }

  /**
   * Reset failed providers
   */
  resetFailed() {
    this.failedProviders.clear();
    console.log("[Multi-RPC] Reset failed providers");
  }
}

module.exports = {
  MultiRPC,
};
