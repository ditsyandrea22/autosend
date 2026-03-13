/**
 * Production Rescue Bot
 * Main Entry Point
 * 
 * Monitors mempool for attacker transactions and executes
 * rescue operations via Flashbots private bundles
 */

require("dotenv").config();
const { ethers, providers } = require("ethers");
const { logger } = require("./utils/logger");
const { createMempoolWatcher } = require("./services/mempoolWatcher");
const { createRescueEngine } = require("./services/rescueEngine");
const { RELAYS } = require("./config/constants");
const { isProduction } = require("./utils/shared");

// Configuration from environment
const CONFIG = {
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  rescueAddress: process.env.RESCUE_ADDRESS,
  flashbotsAuthSigner: process.env.FLASHBOTS_AUTH_SIGNER,
  chainId: parseInt(process.env.CHAIN_ID || "1"),
  relays: [
    process.env.FLASHBOTS_RELAY || RELAYS.FLASHBOTS,
    process.env.ULTRASOUND_RELAY || RELAYS.ULTRASOUND,
  ].filter(Boolean),
};

/**
 * Validate configuration
 */
function validateConfig() {
  const errors = [];
  
  if (!CONFIG.rpcUrl) {
    errors.push("RPC_URL is required");
  }
  if (!CONFIG.privateKey) {
    errors.push("PRIVATE_KEY is required");
  }
  if (!CONFIG.rescueAddress) {
    errors.push("RESCUE_ADDRESS is required");
  } else if (!ethers.utils.isAddress(CONFIG.rescueAddress)) {
    errors.push("RESCUE_ADDRESS must be a valid Ethereum address");
  }
  // Only require flashbotsAuthSigner in production - allow wallet fallback in development
  if (!CONFIG.flashbotsAuthSigner && isProduction()) {
    errors.push("FLASHBOTS_AUTH_SIGNER is required for production use (get one at https://docs.flashbots.net/flashbots-protect/quick-start)");
  }
  
  if (errors.length > 0) {
    logger.error("Configuration errors:", errors);
    return false;
  }
  
  return true;
}

/**
 * Main rescue bot
 */
class RescueBot {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.mempoolWatcher = null;
    this.rescueEngine = null;
    this.isRunning = false;
    this.attackModeTimeout = null; // Track attack mode timeout for cleanup
  }

  /**
   * Initialize the bot
   */
  async initialize() {
    // Create provider
    this.provider = new providers.JsonRpcProvider(CONFIG.rpcUrl);
    
    // Verify chain ID
    const network = await this.provider.getNetwork();
    if (network.chainId.toString() !== String(CONFIG.chainId)) {
      logger.warn(`Chain ID mismatch. Expected: ${CONFIG.chainId}, Got: ${network.chainId}`);
    }

    // Create wallet
    this.wallet = new ethers.Wallet(CONFIG.privateKey, this.provider);
    
    logger.info("Rescue bot initialized", {
      wallet: this.wallet.address,
      chainId: CONFIG.chainId,
      rescueAddress: CONFIG.rescueAddress,
    });

    // Create mempool watcher
    this.mempoolWatcher = createMempoolWatcher(this.provider, this.wallet);
    
    // Create rescue engine
    this.rescueEngine = createRescueEngine({
      provider: this.provider,
      wallet: this.wallet,
      rescueAddress: CONFIG.rescueAddress,
      authSigner: CONFIG.flashbotsAuthSigner ? new ethers.Wallet(CONFIG.flashbotsAuthSigner) : null,
      relays: CONFIG.relays,
    });

    // Set up attack callback
    this.mempoolWatcher.setAttackCallback(async (attackTx) => {
      await this.handleAttack(attackTx);
    });
  }

  /**
   * Handle detected attack
   * @param {Object} attackTx - The attack transaction
   */
  async handleAttack(attackTx) {
    logger.attackDetected(attackTx.from);
    
    // Set attack mode for aggressive gas
    this.rescueEngine.setAttackMode(true);
    
    // Execute rescue
    try {
      await this.rescueEngine.rescue(attackTx);
    } catch (error) {
      logger.error("Rescue failed:", error.message);
      // Don't re-throw - allow bot to continue monitoring
    }
    
    // Reset attack mode after a delay to allow for multiple rescue attempts
    // Clear any existing timeout to prevent memory leaks or conflicting resets
    const rawTimeout = process.env.ATTACK_MODE_TIMEOUT_MS || '300000';
    let attackModeTimeoutMs = parseInt(rawTimeout, 10);
    if (isNaN(attackModeTimeoutMs) || attackModeTimeoutMs <= 0) {
      logger.warn(`Invalid ATTACK_MODE_TIMEOUT_MS value: "${rawTimeout}", using default 300000ms`);
      attackModeTimeoutMs = 300000;
    }
    if (this.attackModeTimeout) {
      clearTimeout(this.attackModeTimeout);
    }
    this.attackModeTimeout = setTimeout(() => {
      // Add null check for safety - rescueEngine could be null if stopped
      if (this.rescueEngine) {
        this.rescueEngine.setAttackMode(false);
      }
      this.attackModeTimeout = null;
    }, attackModeTimeoutMs); // Reset attack mode after delay to allow for multiple rescue attempts
  }

  /**
   * Start the bot
   */
  async start() {
    if (this.isRunning) {
      logger.warn("Bot already running");
      return;
    }

    await this.initialize();
    
    // Start mempool monitoring
    this.mempoolWatcher.start();
    
    this.isRunning = true;
    
    logger.info(`
╔══════════════════════════════════════════════════════════════╗
║         🚀 PRODUCTION RESCUE BOT v1.0.0                    ║
║                                                              ║
║  Features:                                                  ║
║  • Mempool monitoring for attack detection                 ║
║  • Flashbots private bundles                                ║
║  • Aggressive gas strategy (6x multiplier)                 ║
║  • Multi-relay support                                      ║
║  • Automatic retry on failure                                ║
╚══════════════════════════════════════════════════════════════╝
    `);

    // Periodic status logging
    setInterval(() => {
      const stats = this.mempoolWatcher.getStats();
      logger.info("Status:", stats);
    }, 60000);
  }

  /**
   * Stop the bot
   */
  stop() {
    this.isRunning = false;
    // Clear any pending attack mode timeout to prevent callbacks on dead objects
    if (this.attackModeTimeout) {
      clearTimeout(this.attackModeTimeout);
      this.attackModeTimeout = null;
    }
    if (this.mempoolWatcher) {
      this.mempoolWatcher.stop();
    }
    if (this.rescueEngine) {
      this.rescueEngine.stop();
    }
    logger.info("Bot stopped");
  }

  /**
   * Get bot status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      wallet: this.wallet?.address,
      rescueAddress: CONFIG.rescueAddress,
      mempoolStats: this.mempoolWatcher?.getStats() || {},
    };
  }
}

/**
 * Start the bot
 */
async function start() {
  if (!validateConfig()) {
    process.exit(1);
  }

  const bot = new RescueBot();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    logger.info("Shutting down...");
    bot.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    logger.info("Shutting down...");
    bot.stop();
    process.exit(0);
  });

  try {
    await bot.start();
  } catch (error) {
    logger.error("Failed to start bot:", error.message);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { RescueBot, start };

// Run if executed directly
if (require.main === module) {
  start();
}
