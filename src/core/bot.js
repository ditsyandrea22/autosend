/**
 * MEV Rescue Bot - Main Entry Point
 * Initializes and orchestrates all components
 */

require('dotenv').config();

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { getEnabledChains, createProvider } = require('../config/chains');
const { MempoolEngine } = require('./mempoolEngine');
const { BlockEngine } = require('./blockEngine');
const { RescueOrchestrator } = require('./orchestrator');
const { startDashboard } = require('../monitoring/dashboardServer');
const { metrics } = require('../monitoring/metrics');
const { sendAlert } = require('../alerts/telegram');

class RescueBot {
  constructor() {
    this.isRunning = false;
    this.isMonitoring = false;
    this.chains = [];
    this.providers = {};
    this.wallets = {};
    this.mempoolEngines = {};
    this.blockEngines = {};
    this.orchestrator = null;
    this.stats = {
      blocksProcessed: 0,
      pendingChecked: 0,
      attacksDetected: 0,
      rescuesExecuted: 0,
      rescuesSuccess: 0,
      rescuesFailed: 0,
    };
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    logger.info('[RescueBot] Initializing bot...');

    // Get enabled chains
    this.chains = getEnabledChains();
    logger.info(`[RescueBot] Enabled chains: ${this.chains.map(c => c.name).join(', ')}`);

    // Initialize providers for each chain
    for (const chain of this.chains) {
      const provider = createProvider(chain.name);
      if (provider) {
        this.providers[chain.name] = provider;
        logger.info(`[RescueBot] Provider created for ${chain.name}`);
      } else {
        logger.warn(`[RescueBot] No RPC configured for ${chain.name}, skipping`);
      }
    }

    // Create wallet
    const privateKey = process.env.RESCUE_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('RESCUE_PRIVATE_KEY not configured');
    }

    const mainChain = Object.keys(this.providers)[0];
    if (mainChain) {
      this.wallets[mainChain] = new ethers.Wallet(privateKey, this.providers[mainChain]);
      logger.info(`[RescueBot] Wallet initialized: ${this.wallets[mainChain].address}`);
    }

    // Initialize orchestrator
    this.orchestrator = new RescueOrchestrator(this.providers, this.wallets);

    // Get monitored wallets
    const monitoredWallets = process.env.MONITORED_WALLETS || '';
    this.monitoredWallets = monitoredWallets
      .split(',')
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length > 0);

    logger.info(`[RescueBot] Monitoring ${this.monitoredWallets.length} wallets`);

    // Start monitoring dashboard if enabled
    if (process.env.ENABLE_DASHBOARD !== 'false') {
      startDashboard();
    }

    logger.info('[RescueBot] Bot initialized successfully');
  }

  /**
   * Start the bot
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[RescueBot] Bot already running');
      return;
    }

    logger.info('[RescueBot] Starting bot...');
    this.isRunning = true;

    // Start mempool monitoring for each chain
    for (const [chainName, provider] of Object.entries(this.providers)) {
      const wallet = this.wallets[chainName];
      if (!wallet) continue;

      // Create mempool engine
      const mempoolEngine = new MempoolEngine(provider, wallet, this.monitoredWallets);
      mempoolEngine.on('attack', async (tx) => {
        await this.handleAttack(tx, chainName);
      });
      mempoolEngine.on('error', (error) => {
        logger.error(`[RescueBot] Mempool error on ${chainName}:`, error);
      });

      // Start monitoring
      await mempoolEngine.start();
      this.mempoolEngines[chainName] = mempoolEngine;

      // Create block engine for confirmation monitoring
      const blockEngine = new BlockEngine(provider, chainName);
      blockEngine.on('block', (blockNumber) => {
        this.stats.blocksProcessed++;
        metrics.blocksProcessed.inc();
      });
      
      await blockEngine.start();
      this.blockEngines[chainName] = blockEngine;
    }

    this.isMonitoring = true;
    logger.info('[RescueBot] Bot started successfully');

    // Send startup alert
    if (process.env.ALERT_ON_ATTACK === 'true') {
      await sendAlert(`🚀 MEV Rescue Bot started\nMonitoring ${this.monitoredWallets.length} wallets`);
    }
  }

  /**
   * Handle detected attack
   */
  async handleAttack(tx, chainName) {
    logger.warn(`[RescueBot] Attack detected! Tx: ${tx.hash}`);
    this.stats.attacksDetected++;
    metrics.attacksDetected.inc();

    try {
      // Execute rescue
      const result = await this.orchestrator.executeRescue(tx, chainName);

      if (result.success) {
        this.stats.rescuesSuccess++;
        metrics.rescuesSuccess.inc();
        logger.info(`[RescueBot] Rescue successful: ${result.hash}`);

        if (process.env.ALERT_ON_RESCUE_SUCCESS === 'true') {
          await sendAlert(`✅ Rescue Successful!\nTx: ${result.hash}\nValue: ${result.value}`);
        }
      } else {
        this.stats.rescuesFailed++;
        metrics.rescuesFailed.inc();
        logger.error(`[RescueBot] Rescue failed: ${result.error}`);

        if (process.env.ALERT_ON_RESCUE_FAILURE === 'true') {
          await sendAlert(`❌ Rescue Failed\nError: ${result.error}`);
        }
      }

      this.stats.rescuesExecuted++;
    } catch (error) {
      logger.error('[RescueBot] Error handling attack:', error);
      this.stats.rescuesFailed++;
      metrics.rescuesFailed.inc();
    }
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isMonitoring: this.isMonitoring,
      chains: Object.keys(this.providers),
      monitoredWallets: this.monitoredWallets.length,
      stats: this.stats,
      wallet: this.wallets[Object.keys(this.wallets)[0]]?.address || 'Not initialized',
    };
  }

  /**
   * Stop the bot
   */
  async stop() {
    logger.info('[RescueBot] Stopping bot...');
    this.isRunning = false;
    this.isMonitoring = false;

    // Stop all mempool engines
    for (const engine of Object.values(this.mempoolEngines)) {
      await engine.stop();
    }

    // Stop all block engines
    for (const engine of Object.values(this.blockEngines)) {
      await engine.stop();
    }

    logger.info('[RescueBot] Bot stopped');
  }
}

// Main execution
async function main() {
  const bot = new RescueBot();

  try {
    await bot.initialize();
    await bot.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('[RescueBot] Received SIGINT, shutting down...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('[RescueBot] Received SIGTERM, shutting down...');
      await bot.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('[RescueBot] Fatal error:', error);
    process.exit(1);
  }
}

// Export for testing
module.exports = {
  RescueBot,
  main,
};

// Run if called directly
if (require.main === module) {
  main();
}
