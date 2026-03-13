/**
 * Mempool Engine
 * Monitors pending transactions for attack detection
 */

const { EventEmitter } = require('events');
const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { sleep } = require('../utils/sleep');
const { detectWalletDrain } = require('../detection/drainDetector');
const { detectERC20Transfer } = require('../detection/erc20Detector');
const { detectNFTTransfer } = require('../detection/nftDetector');
const { metrics } = require('../monitoring/metrics');

// Known drainer function selectors
const DRAINER_SELECTORS = [
  '0x095ea7b3', // approve
  '0xa22cb465', // setApprovalForAll
  '0x23b872dd', // transferFrom
  '0x42842e0e', // safeTransferFrom (with data)
  '0xb88d4fde', // safeTransferFrom (without data)
  '0xf242432a', // safeTransferFrom with tokenId
  '0x2eb2c2d6', // safeTransferFrom variant
  '0x5c60da1b', // initialize (proxy initialization)
  '0x5312ea8e', // init (variant)
];

class MempoolEngine extends EventEmitter {
  constructor(provider, wallet, monitoredWallets = []) {
    super();
    this.provider = provider;
    this.wallet = wallet;
    this.walletAddress = wallet.address.toLowerCase();
    this.monitoredWallets = monitoredWallets.map(w => w.toLowerCase());
    this.isRunning = false;
    this.pendingTxHashes = new Set();
    this.processedHashes = new Set();
    this.checkInterval = parseInt(process.env.MEMPOOL_POLL_INTERVAL) || 1000;
    this.maxPendingAge = parseInt(process.env.MAX_PENDING_AGE) || 300000;
    this.txCache = new Map();
    this.stats = {
      pendingChecked: 0,
      attacksDetected: 0,
      errors: 0,
    };
  }

  /**
   * Start mempool monitoring
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[MempoolEngine] Already running');
      return;
    }

    logger.info('[MempoolEngine] Starting mempool monitoring...');

    try {
      // Subscribe to pending transactions
      this.provider.on('pending', (txHash) => this.handlePendingTransaction(txHash));

      // Start periodic cleanup
      this.cleanupInterval = setInterval(() => this.cleanup(), 60000);

      this.isRunning = true;
      logger.info('[MempoolEngine] Started successfully');

    } catch (error) {
      logger.error('[MempoolEngine] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop mempool monitoring
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('[MempoolEngine] Stopping...');

    // Remove listener
    this.provider.removeAllListeners('pending');

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.isRunning = false;
    logger.info('[MempoolEngine] Stopped');
  }

  /**
   * Handle pending transaction
   */
  async handlePendingTransaction(txHash) {
    // Skip if already processed
    if (this.processedHashes.has(txHash)) {
      return;
    }

    // Add to pending
    this.pendingTxHashes.add(txHash);
    this.stats.pendingChecked++;
    metrics.pendingChecked.inc();

    try {
      // Get transaction details
      const tx = await this.provider.getTransaction(txHash);

      if (!tx) {
        return;
      }

      // Cache the transaction
      this.txCache.set(txHash, {
        tx,
        timestamp: Date.now(),
      });

      // Check if transaction is from monitored wallet
      const fromAddress = tx.from ? tx.from.toLowerCase() : null;
      
      if (!fromAddress) {
        return;
      }

      // Check if transaction is from monitored wallet (victim) or our rescue wallet
      const isMonitored = this.monitoredWallets.includes(fromAddress);
      const isOurWallet = fromAddress === this.walletAddress;

      // Skip if not relevant to our monitoring
      if (!isMonitored && !isOurWallet) {
        return;
      }

      // Check for attack patterns on monitored (victim) wallets
      if (isMonitored) {
        // Check for direct drain (ETH transfer out)
        if (detectWalletDrain(tx, fromAddress)) {
          logger.warn(`[MempoolEngine] Attack detected! From monitored wallet: ${fromAddress}`);
          logger.warn(`[MempoolEngine] Transaction: ${txHash}`);
          this.stats.attacksDetected++;
          
          this.emit('attack', tx);
          this.markAsProcessed(txHash);
          return;
        }

        // Check for ERC20 transfer
        if (detectERC20Transfer(tx)) {
          logger.warn(`[MempoolEngine] ERC20 transfer detected from ${fromAddress}`);
          this.emit('erc20Transfer', tx);
        }

        // Check for NFT transfer
        if (detectNFTTransfer(tx)) {
          logger.warn(`[MempoolEngine] NFT transfer detected from ${fromAddress}`);
          this.emit('nftTransfer', tx);
        }

        // Check for approval changes
        if (this.isApprovalChange(tx)) {
          logger.warn(`[MempoolEngine] Approval change detected from ${fromAddress}`);
          this.emit('approvalChange', tx);
        }
      }

      // Check for drainer selector in any transaction to monitored wallet
      if (this.usesDrainerSelector(tx)) {
        const toAddress = tx.to ? tx.to.toLowerCase() : null;
        
        // If transaction targets a monitored wallet's assets
        if (toAddress && this.monitoredWallets.some(w => this.hasInteraction(tx, w))) {
          logger.warn(`[MempoolEngine] Potential drainer interaction detected`);
          this.emit('suspiciousTx', tx);
        }
      }

      // Mark as processed after some time
      setTimeout(() => {
        this.markAsProcessed(txHash);
      }, this.maxPendingAge);

    } catch (error) {
      logger.error(`[MempoolEngine] Error processing tx ${txHash}:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Check if transaction uses known drainer selector
   */
  usesDrainerSelector(tx) {
    if (!tx.data || tx.data.length < 10) {
      return false;
    }
    
    const selector = tx.data.substring(0, 10);
    return DRAINER_SELECTORS.includes(selector);
  }

  /**
   * Check if transaction involves a specific wallet
   */
  hasInteraction(tx, walletAddress) {
    const from = tx.from ? tx.from.toLowerCase() : null;
    const to = tx.to ? tx.to.toLowerCase() : null;
    const wallet = walletAddress.toLowerCase();
    
    return from === wallet || to === wallet;
  }

  /**
   * Check if transaction is an approval change
   */
  isApprovalChange(tx) {
    if (!tx.data || tx.data.length < 10) {
      return false;
    }
    
    const selector = tx.data.substring(0, 10);
    return ['0x095ea7b3', '0xa22cb465'].includes(selector);
  }

  /**
   * Mark transaction as processed
   */
  markAsProcessed(txHash) {
    this.processedHashes.add(txHash);
    this.pendingTxHashes.delete(txHash);
    this.txCache.delete(txHash);
    
    // Limit processed hash cache
    if (this.processedHashes.size > 10000) {
      const iterator = this.processedHashes.values();
      for (let i = 0; i < 5000; i++) {
        this.processedHashes.delete(iterator.next().value);
      }
    }
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    
    // Clean up old cached transactions
    for (const [hash, data] of this.txCache.entries()) {
      if (now - data.timestamp > this.maxPendingAge) {
        this.txCache.delete(hash);
      }
    }
    
    // Log stats periodically
    logger.debug(`[MempoolEngine] Stats: ${JSON.stringify(this.stats)}`);
  }

  /**
   * Add wallet to monitor
   */
  addWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    if (!this.monitoredWallets.includes(address)) {
      this.monitoredWallets.push(address);
      logger.info(`[MempoolEngine] Added wallet to monitor: ${address}`);
    }
  }

  /**
   * Remove wallet from monitor
   */
  removeWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    const index = this.monitoredWallets.indexOf(address);
    if (index > -1) {
      this.monitoredWallets.splice(index, 1);
      logger.info(`[MempoolEngine] Removed wallet from monitor: ${address}`);
    }
  }

  /**
   * Get monitored wallets
   */
  getMonitoredWallets() {
    return [...this.monitoredWallets];
  }

  /**
   * Get engine stats
   */
  getStats() {
    return {
      ...this.stats,
      pendingCount: this.pendingTxHashes.size,
      processedCount: this.processedHashes.size,
      monitoredWallets: this.monitoredWallets.length,
    };
  }
}

module.exports = {
  MempoolEngine,
  DRAINER_SELECTORS,
};
