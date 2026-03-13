/**
 * Block Engine
 * Monitors block production and handles block-level events
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');
const { sleep } = require('../utils/sleep');

class BlockEngine extends EventEmitter {
  constructor(provider, chainName = 'ethereum') {
    super();
    this.provider = provider;
    this.chainName = chainName;
    this.isRunning = false;
    this.currentBlock = 0;
    this.blockListeners = new Map();
    this.lastBlockTime = 0;
    this.blockTimes = [];
    this.maxBlockTimes = 100;
  }

  /**
   * Start block monitoring
   */
  async start() {
    if (this.isRunning) {
      logger.warn(`[BlockEngine] Already running for ${this.chainName}`);
      return;
    }

    logger.info(`[BlockEngine] Starting for ${this.chainName}`);

    try {
      // Get current block number
      this.currentBlock = await this.provider.getBlockNumber();
      logger.info(`[BlockEngine] Current block: ${this.currentBlock}`);

      // Subscribe to new blocks
      this.provider.on('block', (blockNumber) => this.handleNewBlock(blockNumber));

      this.isRunning = true;
      logger.info(`[BlockEngine] Started successfully for ${this.chainName}`);

    } catch (error) {
      logger.error(`[BlockEngine] Failed to start for ${this.chainName}:`, error);
      throw error;
    }
  }

  /**
   * Stop block monitoring
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info(`[BlockEngine] Stopping for ${this.chainName}`);

    // Remove all listeners
    this.provider.removeAllListeners('block');

    // Clear block listeners
    this.blockListeners.clear();

    this.isRunning = false;
    logger.info(`[BlockEngine] Stopped for ${this.chainName}`);
  }

  /**
   * Handle new block event
   */
  async handleNewBlock(blockNumber) {
    const now = Date.now();
    
    // Calculate block time
    if (this.lastBlockTime > 0) {
      const blockTime = (now - this.lastBlockTime) / 1000;
      this.blockTimes.push(blockTime);
      if (this.blockTimes.length > this.maxBlockTimes) {
        this.blockTimes.shift();
      }
    }
    this.lastBlockTime = now;

    const previousBlock = this.currentBlock;
    this.currentBlock = blockNumber;

    // Check for skipped blocks
    if (blockNumber > previousBlock + 1) {
      logger.warn(`[BlockEngine] Skipped ${blockNumber - previousBlock - 1} blocks`);
    }

    // Emit block event
    this.emit('block', blockNumber);

    // Call registered block listeners
    for (const [id, listener] of this.blockListeners) {
      try {
        await listener(blockNumber);
      } catch (error) {
        logger.error(`[BlockEngine] Block listener ${id} error:`, error);
      }
    }

    // Log block progress
    if (blockNumber % 100 === 0) {
      const avgBlockTime = this.getAverageBlockTime();
      logger.info(`[BlockEngine] Block ${blockNumber} (avg time: ${avgBlockTime.toFixed(2)}s)`);
    }
  }

  /**
   * Register a listener for block events
   */
  onBlock(blockNumber, callback) {
    const listenerId = `block_${blockNumber}_${Date.now()}`;
    this.blockListeners.set(listenerId, async () => {
      if (this.currentBlock >= blockNumber) {
        await callback(this.currentBlock);
        this.blockListeners.delete(listenerId);
      }
    });
    return listenerId;
  }

  /**
   * Wait for specific block
   */
  async waitForBlock(targetBlock, timeout = 300000) {
    if (this.currentBlock >= targetBlock) {
      return targetBlock;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.blockListeners.delete(`wait_${targetBlock}`);
        reject(new Error(`Timeout waiting for block ${targetBlock}`));
      }, timeout);

      const listenerId = `wait_${targetBlock}`;
      this.blockListeners.set(listenerId, async (blockNumber) => {
        if (blockNumber >= targetBlock) {
          clearTimeout(timeoutId);
          this.blockListeners.delete(listenerId);
          resolve(blockNumber);
        }
      });
    });
  }

  /**
   * Get current block number
   */
  getCurrentBlock() {
    return this.currentBlock;
  }

  /**
   * Get average block time
   */
  getAverageBlockTime() {
    if (this.blockTimes.length === 0) {
      return 0;
    }
    return this.blockTimes.reduce((a, b) => a + b, 0) / this.blockTimes.length;
  }

  /**
   * Get block stats
   */
  getStats() {
    return {
      chainName: this.chainName,
      currentBlock: this.currentBlock,
      averageBlockTime: this.getAverageBlockTime(),
      isRunning: this.isRunning,
      listenersCount: this.blockListeners.size,
    };
  }

  /**
   * Get block with transactions
   */
  async getBlockWithTransactions(blockNumber) {
    try {
      return await this.provider.getBlockWithTransactions(blockNumber);
    } catch (error) {
      logger.error(`[BlockEngine] Error fetching block ${blockNumber}:`, error);
      return null;
    }
  }

  /**
   * Get block timestamp
   */
  async getBlockTimestamp(blockNumber) {
    try {
      const block = await this.provider.getBlock(blockNumber);
      return block ? block.timestamp : null;
    } catch (error) {
      logger.error(`[BlockEngine] Error fetching block timestamp:`, error);
      return null;
    }
  }

  /**
   * Estimate time to reach target block
   */
  estimateTimeToBlock(targetBlock) {
    const avgBlockTime = this.getAverageBlockTime();
    const blocksAway = targetBlock - this.currentBlock;
    return Math.ceil(blocksAway * avgBlockTime);
  }
}

module.exports = {
  BlockEngine,
};
