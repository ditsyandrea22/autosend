/**
 * Wallet Monitor
 * Monitors multiple wallets for suspicious activity
 */

const { EventEmitter } = require('events');
const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { analyzeTransaction } = require('./drainDetector');
const { detectERC20Transfer, detectERC20Approval } = require('./erc20Detector');
const { detectNFTTransfer, detectNFTApproval } = require('./nftDetector');

class WalletMonitor extends EventEmitter {
  constructor(provider, options = {}) {
    super();
    this.provider = provider;
    this.wallets = new Map();
    this.txHistory = new Map();
    this.options = {
      historyLimit: options.historyLimit || 100,
      alertThreshold: options.alertThreshold || 1,
      checkInterval: options.checkInterval || 5000,
      ...options,
    };
    this.isRunning = false;
    this.stats = {
      totalTransactions: 0,
      alertsTriggered: 0,
    };
  }

  /**
   * Add wallet to monitor
   */
  addWallet(address, label = '') {
    const walletAddress = address.toLowerCase();
    
    if (this.wallets.has(walletAddress)) {
      logger.warn(`[WalletMonitor] Wallet ${walletAddress} already monitored`);
      return false;
    }

    this.wallets.set(walletAddress, {
      address: walletAddress,
      label,
      addedAt: Date.now(),
      lastActivity: null,
      txCount: 0,
      riskScore: 0,
    });

    this.txHistory.set(walletAddress, []);

    logger.info(`[WalletMonitor] Added wallet to monitor: ${walletAddress}${label ? ` (${label})` : ''}`);
    return true;
  }

  /**
   * Remove wallet from monitor
   */
  removeWallet(address) {
    const walletAddress = address.toLowerCase();
    
    if (this.wallets.has(walletAddress)) {
      this.wallets.delete(walletAddress);
      this.txHistory.delete(walletAddress);
      logger.info(`[WalletMonitor] Removed wallet from monitor: ${walletAddress}`);
      return true;
    }

    return false;
  }

  /**
   * Get monitored wallets
   */
  getWallets() {
    return Array.from(this.wallets.values());
  }

  /**
   * Check transaction against monitored wallets
   */
  checkTransaction(tx) {
    if (!tx || !tx.from) {
      return null;
    }

    const fromAddress = tx.from.toLowerCase();
    const walletInfo = this.wallets.get(fromAddress);

    if (!walletInfo) {
      return null;
    }

    // Analyze transaction
    const analysis = analyzeTransaction(tx, fromAddress);
    
    if (analysis.isAttack) {
      this.stats.alertsTriggered++;
      
      const alert = {
        wallet: fromAddress,
        txHash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        analysis,
        timestamp: Date.now(),
      };

      this.emit('attack', alert);
      return alert;
    }

    // Check for other activity
    const erc20Transfer = detectERC20Transfer(tx);
    if (erc20Transfer) {
      const event = {
        type: 'erc20_transfer',
        wallet: fromAddress,
        txHash: tx.hash,
        ...erc20Transfer,
        timestamp: Date.now(),
      };
      
      this.emit('erc20Transfer', event);
      return event;
    }

    const erc20Approval = detectERC20Approval(tx);
    if (erc20Approval) {
      const event = {
        type: 'erc20_approval',
        wallet: fromAddress,
        txHash: tx.hash,
        ...erc20Approval,
        timestamp: Date.now(),
      };
      
      this.emit('erc20Approval', event);
      return event;
    }

    const nftTransfer = detectNFTTransfer(tx);
    if (nftTransfer) {
      const event = {
        type: 'nft_transfer',
        wallet: fromAddress,
        txHash: tx.hash,
        ...nftTransfer,
        timestamp: Date.now(),
      };
      
      this.emit('nftTransfer', event);
      return event;
    }

    const nftApproval = detectNFTApproval(tx);
    if (nftApproval) {
      const event = {
        type: 'nft_approval',
        wallet: fromAddress,
        txHash: tx.hash,
        ...nftApproval,
        timestamp: Date.now(),
      };
      
      this.emit('nftApproval', event);
      return event;
    }

    // Update wallet activity
    this.updateWalletActivity(fromAddress, tx);

    return null;
  }

  /**
   * Update wallet activity
   */
  updateWalletActivity(walletAddress, tx) {
    const wallet = this.wallets.get(walletAddress);
    if (!wallet) return;

    wallet.lastActivity = Date.now();
    wallet.txCount++;

    // Add to history
    const history = this.txHistory.get(walletAddress);
    if (history) {
      history.unshift({
        hash: tx.hash,
        to: tx.to,
        value: tx.value,
        timestamp: Date.now(),
      });

      // Limit history
      if (history.length > this.options.historyLimit) {
        history.pop();
      }
    }

    this.stats.totalTransactions++;
  }

  /**
   * Get wallet transaction history
   */
  getWalletHistory(address, limit = 50) {
    const walletAddress = address.toLowerCase();
    const history = this.txHistory.get(walletAddress);
    
    if (!history) {
      return [];
    }

    return history.slice(0, limit);
  }

  /**
   * Get wallet info
   */
  getWalletInfo(address) {
    return this.wallets.get(address.toLowerCase());
  }

  /**
   * Get all wallet balances
   */
  async getWalletBalances() {
    const balances = [];

    for (const [address, info] of this.wallets) {
      try {
        const balance = await this.provider.getBalance(address);
        balances.push({
          address,
          label: info.label,
          balance: balance.toString(),
          balanceETH: ethers.formatEther(balance),
        });
      } catch (e) {
        logger.error(`[WalletMonitor] Error getting balance for ${address}:`, e);
      }
    }

    return balances;
  }

  /**
   * Get wallet risk score
   */
  calculateRiskScore(walletAddress) {
    const wallet = this.wallets.get(walletAddress.toLowerCase());
    if (!wallet) return 0;

    let score = 0;

    // Based on transaction count
    if (wallet.txCount > 10) score += 20;
    if (wallet.txCount > 50) score += 30;

    // Based on recent activity
    if (wallet.lastActivity) {
      const timeSinceActivity = Date.now() - wallet.lastActivity;
      if (timeSinceActivity < 60000) score += 30; // Activity in last minute
      if (timeSinceActivity < 300000) score += 10; // Activity in last 5 minutes
    }

    return Math.min(score, 100);
  }

  /**
   * Get monitor stats
   */
  getStats() {
    return {
      ...this.stats,
      monitoredWallets: this.wallets.size,
    };
  }

  /**
   * Export wallet data
   */
  exportData() {
    const data = {
      wallets: Array.from(this.wallets.entries()).map(([address, info]) => ({
        address,
        ...info,
      })),
      exportedAt: Date.now(),
    };

    return data;
  }

  /**
   * Import wallet data
   */
  importData(data) {
    if (!data || !data.wallets) {
      return false;
    }

    for (const wallet of data.wallets) {
      this.addWallet(wallet.address, wallet.label);
    }

    return true;
  }

  /**
   * Clear all wallets
   */
  clear() {
    this.wallets.clear();
    this.txHistory.clear();
    logger.info('[WalletMonitor] Cleared all wallets');
  }
}

module.exports = {
  WalletMonitor,
};
