/**
 * Provider Cluster
 * Manages multiple RPC providers for reliability and load balancing
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');

class ProviderCluster {
  /**
   * @param {string[]} urls - Array of RPC URLs
   * @param {object} options - Configuration options
   */
  constructor(urls, options = {}) {
    this.urls = urls;
    this.providers = [];
    this.healthChecks = new Map();
    this.currentIndex = 0;
    this.options = {
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      healthCheckInterval: options.healthCheckInterval || 30000,
      timeout: options.timeout || 30000,
      ...options,
    };

    // Initialize providers
    this.initializeProviders();
    
    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Initialize providers from URLs
   */
  initializeProviders() {
    this.providers = this.urls.map((url, index) => {
      const provider = new ethers.providers.JsonRpcProvider({
        url,
        timeout: this.options.timeout,
      });
      
      provider.name = `Provider_${index}`;
      provider.url = url;
      provider.isHealthy = true;
      provider.lastCheck = Date.now();
      provider.latency = 0;
      
      return provider;
    });

    logger.info(`[ProviderCluster] Initialized ${this.providers.length} providers`);
  }

  /**
   * Get next healthy provider using round-robin
   */
  get() {
    if (this.providers.length === 0) {
      throw new Error('No providers available');
    }

    // Try providers in round-robin order
    for (let i = 0; i < this.providers.length; i++) {
      const index = (this.currentIndex + i) % this.providers.length;
      const provider = this.providers[index];

      if (provider.isHealthy) {
        this.currentIndex = (index + 1) % this.providers.length;
        return provider;
      }
    }

    // If no healthy provider, return first one anyway
    logger.warn('[ProviderCluster] No healthy providers, returning first available');
    return this.providers[0];
  }

  /**
   * Get provider with lowest latency
   */
  getFastest() {
    const healthyProviders = this.providers.filter(p => p.isHealthy);
    
    if (healthyProviders.length === 0) {
      return this.providers[0];
    }

    return healthyProviders.reduce((fastest, provider) => 
      provider.latency < fastest.latency ? provider : fastest
    );
  }

  /**
   * Execute function with automatic failover
   */
  async execute(func, options = {}) {
    const maxAttempts = options.maxAttempts || this.options.retryAttempts;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const provider = options.useFastest ? this.getFastest() : this.get();

      try {
        const startTime = Date.now();
        const result = await func(provider);
        provider.latency = Date.now() - startTime;
        provider.isHealthy = true;
        return result;
      } catch (error) {
        lastError = error;
        provider.isHealthy = false;
        
        logger.warn(`[ProviderCluster] Provider ${provider.name} failed (attempt ${attempt + 1}):`, error.message);
        
        if (attempt < maxAttempts - 1) {
          await this.sleep(this.options.retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Get block number with failover
   */
  async getBlockNumber() {
    return this.execute(async (provider) => {
      return await provider.getBlockNumber();
    });
  }

  /**
   * Get balance with failover
   */
  async getBalance(address) {
    return this.execute(async (provider) => {
      return await provider.getBalance(address);
    });
  }

  /**
   * Get transaction with failover
   */
  async getTransaction(txHash) {
    return this.execute(async (provider) => {
      return await provider.getTransaction(txHash);
    });
  }

  /**
   * Get fee data with failover
   */
  async getFeeData() {
    return this.execute(async (provider) => {
      return await provider.getFeeData();
    });
  }

  /**
   * Send raw transaction with failover
   */
  async sendRawTransaction(signedTx) {
    return this.execute(async (provider) => {
      return await provider.sendTransaction(signedTx);
    });
  }

  /**
   * Call contract with failover
   */
  async call(transaction) {
    return this.execute(async (provider) => {
      return await provider.call(transaction);
    });
  }

  /**
   * Get network with failover
   */
  async getNetwork() {
    return this.execute(async (provider) => {
      return await provider.getNetwork();
    });
  }

  /**
   * Start health check interval
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.options.healthCheckInterval);
  }

  /**
   * Perform health checks on all providers
   */
  async performHealthChecks() {
    for (const provider of this.providers) {
      const startTime = Date.now();
      
      try {
        await provider.getBlockNumber();
        provider.latency = Date.now() - startTime;
        provider.isHealthy = true;
        provider.lastCheck = Date.now();
      } catch (error) {
        provider.isHealthy = false;
        logger.warn(`[ProviderCluster] Health check failed for ${provider.name}:`, error.message);
      }
    }

    const healthyCount = this.providers.filter(p => p.isHealthy).length;
    logger.debug(`[ProviderCluster] Health check: ${healthyCount}/${this.providers.length} providers healthy`);
  }

  /**
   * Get cluster status
   */
  getStatus() {
    return {
      totalProviders: this.providers.length,
      healthyProviders: this.providers.filter(p => p.isHealthy).length,
      providers: this.providers.map(p => ({
        name: p.name,
        url: p.url,
        isHealthy: p.isHealthy,
        latency: p.latency,
        lastCheck: p.lastCheck,
      })),
    };
  }

  /**
   * Add new provider
   */
  addProvider(url) {
    const provider = new ethers.providers.JsonRpcProvider({
      url,
      timeout: this.options.timeout,
    });
    
    provider.name = `Provider_${this.providers.length}`;
    provider.url = url;
    provider.isHealthy = true;
    provider.lastCheck = Date.now();
    provider.latency = 0;
    
    this.providers.push(provider);
    this.urls.push(url);
    
    logger.info(`[ProviderCluster] Added new provider: ${url}`);
  }

  /**
   * Remove provider
   */
  removeProvider(index) {
    if (index >= 0 && index < this.providers.length) {
      const removed = this.providers.splice(index, 1)[0];
      this.urls.splice(index, 1);
      logger.info(`[ProviderCluster] Removed provider: ${removed.url}`);
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    for (const provider of this.providers) {
      if (provider.removeAllListeners) {
        provider.removeAllListeners();
      }
    }
  }
}

module.exports = {
  ProviderCluster,
};
