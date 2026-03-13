/**
 * Gas Oracle
 * Fetches and manages gas price data
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');

class GasOracle {
  constructor(provider, options = {}) {
    this.provider = provider;
    this.cache = {
      feeData: null,
      timestamp: 0,
    };
    this.options = {
      cacheDuration: options.cacheDuration || 5000,
      ...options,
    };
    this.history = [];
    this.maxHistory = 100;
  }

  /**
   * Get current fee data
   */
  async getFeeData() {
    // Check cache
    if (this.cache.feeData && Date.now() - this.cache.timestamp < this.options.cacheDuration) {
      return this.cache.feeData;
    }

    try {
      const feeData = await this.provider.getFeeData();
      
      // Cache result
      this.cache = {
        feeData,
        timestamp: Date.now(),
      };

      // Add to history
      this.addToHistory(feeData);

      return feeData;
    } catch (error) {
      logger.error('[GasOracle] Error fetching fee data:', error);
      
      // Return cached data if available
      if (this.cache.feeData) {
        return this.cache.feeData;
      }
      
      // Fallback to default
      return {
        gasPrice: ethers.utils.parseUnits('50', 'gwei'),
        maxFeePerGas: ethers.utils.parseUnits('100', 'gwei'),
        maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
      };
    }
  }

  /**
   * Get current gas price
   */
  async getGasPrice() {
    const feeData = await this.getFeeData();
    return feeData.gasPrice || feeData.maxFeePerGas;
  }

  /**
   * Get suggested max fee
   */
  async getMaxFee() {
    const feeData = await this.getFeeData();
    return feeData.maxFeePerGas || feeData.gasPrice;
  }

  /**
   * Get suggested priority fee
   */
  async getPriorityFee() {
    const feeData = await this.getFeeData();
    return feeData.maxPriorityFeePerGas || feeData.gasPrice;
  }

  /**
   * Get gas price with multiplier
   */
  async getMultiplierGasPrice(multiplier = 1) {
    const gasPrice = await this.getGasPrice();
    return gasPrice * BigInt(Math.floor(multiplier * 100)) / BigInt(100);
  }

  /**
   * Get EIP-1559 gas params with multiplier
   */
  async getEIP1559GasParams(multiplier = 1) {
    const feeData = await this.getFeeData();
    
    const maxFeePerGas = (feeData.maxFeePerGas || feeData.gasPrice) 
      * BigInt(Math.floor(multiplier * 100)) / BigInt(100);
    
    const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas || feeData.gasPrice)
      * BigInt(Math.floor(multiplier * 100)) / BigInt(100);

    return {
      maxFeePerGas,
      maxPriorityFeePerGas,
    };
  }

  /**
   * Add fee data to history
   */
  addToHistory(feeData) {
    this.history.push({
      gasPrice: feeData.gasPrice?.toString(),
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      timestamp: Date.now(),
    });

    // Limit history size
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Get average gas price from history
   */
  getAverageGasPrice(blocks = 10) {
    if (this.history.length === 0) {
      return null;
    }

    const recent = this.history.slice(-blocks);
    const sum = recent.reduce((acc, item) => {
      return acc + BigInt(item.gasPrice || 0);
    }, 0n);

    return sum / BigInt(recent.length);
  }

  /**
   * Get gas price trend
   */
  getGasTrend() {
    if (this.history.length < 2) {
      return 'stable';
    }

    const recent = this.history.slice(-5);
    const older = this.history.slice(-10, -5);

    if (recent.length === 0 || older.length === 0) {
      return 'stable';
    }

    const recentAvg = recent.reduce((acc, item) => acc + BigInt(item.gasPrice || 0), 0n) / BigInt(recent.length);
    const olderAvg = older.reduce((acc, item) => acc + BigInt(item.gasPrice || 0), 0n) / BigInt(older.length);

    const ratio = recentAvg * 100n / olderAvg;

    if (ratio > 110n) return 'rising';
    if (ratio < 90n) return 'falling';
    return 'stable';
  }

  /**
   * Get gas estimate for transaction
   */
  async estimateGas(transaction) {
    try {
      return await this.provider.estimateGas(transaction);
    } catch (error) {
      logger.warn('[GasOracle] Gas estimation failed, using default:', error.message);
      return BigInt(21000); // Default ETH transfer
    }
  }

  /**
   * Get oracle stats
   */
  getStats() {
    return {
      cached: this.cache.feeData !== null,
      cacheAge: Date.now() - this.cache.timestamp,
      historyLength: this.history.length,
      gasTrend: this.getGasTrend(),
    };
  }
}

module.exports = {
  GasOracle,
};
