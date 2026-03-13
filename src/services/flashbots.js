/**
 * Flashbots Service
 * Handles private bundle sending via Flashbots and other relays
 */

const { FlashbotsBundleProvider } = require("@flashbots/ethers-provider-bundle");
const { ethers } = require("ethers");
const { RELAYS, BLOCKS, BUNDLE } = require("../config/constants");
const { logger } = require("../utils/logger");
const { sleep, withRetry } = require("../utils/sleep");
const { isProduction } = require("../utils/shared");

/**
 * FlashbotsService - Manages bundle sending to Flashbots relays
 */
class FlashbotsService {
  /**
   * @param {ethers.Provider} provider - Ethers provider
   * @param {ethers.Wallet} wallet - Wallet for signing
   * @param {Object} options - Configuration options
   */
  constructor(provider, wallet, options = {}) {
    this.provider = provider;
    this.wallet = wallet;
    this.authSigner = options.authSigner || null;
    this.relays = options.relays || [RELAYS.FLASHBOTS];
    this.currentRelayIndex = 0;
    this.flashbotsProvider = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Flashbots provider with retry on multiple relays
   */
  async initialize() {
    if (this.isInitialized) return;

    if (!this.authSigner) {
      // Require auth signer for production, but allow wallet fallback for development
      if (isProduction()) {
        throw new Error("FLASHBOTS_AUTH_SIGNER is required for production use. Get one at: https://docs.flashbots.net/flashbots-protect/quick-start");
      }
      logger.warn("FLASHBOTS_AUTH_SIGNER not provided - using wallet as authSigner. NOT FOR PRODUCTION USE!");
      this.authSigner = this.wallet;
    }

    // Try each relay until one succeeds
    let lastError = null;
    for (let i = 0; i < this.relays.length; i++) {
      const relayIndex = (this.currentRelayIndex + i) % this.relays.length;
      const relay = this.relays[relayIndex];
      
      try {
        logger.info(`Attempting to initialize Flashbots with relay: ${relay}`);
        this.flashbotsProvider = await FlashbotsBundleProvider.create(
          this.provider,
          this.authSigner,
          relay
        );
        this.currentRelayIndex = relayIndex;
        this.isInitialized = true;
        logger.info(`Flashbots provider initialized with relay: ${relay}`);
        return;
      } catch (error) {
        logger.warn(`Failed to initialize with relay ${relay}:`, error.message);
        lastError = error;
      }
    }

    // All relays failed
    throw new Error(`Failed to initialize Flashbots with any relay. Last error: ${lastError?.message}`);
  }

  /**
   * Switch to next available relay
   */
  async _switchToNextRelay() {
    this.isInitialized = false;
    this.currentRelayIndex = (this.currentRelayIndex + 1) % this.relays.length;
    try {
      await this.initialize();
    } catch (error) {
      logger.error("Failed to switch relay:", error.message);
      throw error;
    }
  }

  /**
   * Send a bundle
   * @param {Object} tx - Transaction object
   * @param {number} targetBlock - Target block number
   * @returns {Promise<Object>} Bundle response
   */
  async sendBundle(tx, targetBlock) {
    await this.initialize();

    const bundle = [
      {
        signer: this.wallet,
        transaction: tx,
      },
    ];

    logger.bundleSent(targetBlock);

    // Sign the bundle
    const signedBundle = await this.flashbotsProvider.signBundle(bundle);

    // Send the bundle
    const response = await this.flashbotsProvider.sendRawBundle(
      signedBundle,
      targetBlock
    );

    // Wait for response
    const waitResponse = await Promise.race([
      response.wait(),
      sleep(BUNDLE.TIMEOUT).then(() => ({ error: "timeout" })),
    ]);

    if (waitResponse.error) {
      logger.warn("Bundle response:", waitResponse.error);
    } else {
      logger.bundleIncluded(targetBlock, waitResponse.bundleHash);
    }

    return response;
  }

  /**
   * Send bundle with retry
   * @param {Object} tx - Transaction
   * @param {number} startBlock - Starting block
   * @param {number} maxRetries - Max retries
   */
  async sendBundleWithRetry(tx, startBlock, maxRetries = BUNDLE.MAX_RETRIES) {
    let currentBlock = startBlock;
    
    for (let i = 0; i < maxRetries; i++) {
      // Get fresh block number to avoid targeting past blocks
      try {
        currentBlock = await this.provider.getBlockNumber();
      } catch (error) {
        logger.warn("Failed to get block number, using cached:", error.message);
        currentBlock++;
      }
      
      const targetBlock = currentBlock + 1;
      
      try {
        const response = await this.sendBundle(tx, targetBlock);
        
        // Check if included
        const result = await response.wait();
        
        if (result && result.bundleHash) {
          logger.info("Bundle included!", { block: targetBlock, hash: result.bundleHash });
          return result;
        }
        
        // Bundle was sent but not included - this is expected behavior
        logger.debug(`Bundle not included in block ${targetBlock}, will retry`);
      } catch (error) {
        // Check if this is a relay error that might benefit from switching relays
        const errorMsg = error.message?.toLowerCase() || "";
        const isRelayError = errorMsg.includes("relay") || 
                             errorMsg.includes("connection") || 
                             errorMsg.includes("timeout");
        
        if (isRelayError && this.relays.length > 1) {
          logger.warn(`Relay error, attempting to switch relay:`, error.message);
          try {
            await this._switchToNextRelay();
            continue; // Retry with new relay
          } catch (switchError) {
            logger.error("Failed to switch relay:", switchError.message);
          }
        }
        
        logger.debug(`Retry ${i + 1}/${maxRetries}:`, error.message);
      }

      // Wait for next block
      await sleep(BLOCKS.BLOCK_TIME_SECONDS * 1000);
    }

    logger.error("Bundle failed after all retries");
    throw new Error("Bundle failed after max retries");
  }

  /**
   * Simulate a bundle
   * @param {Object} tx - Transaction to simulate
   * @param {number} blockNumber - Block number to simulate at
   */
  async simulate(tx, blockNumber) {
    await this.initialize();

    const bundle = [
      {
        signer: this.wallet,
        transaction: tx,
      },
    ];

    const signedBundle = await this.flashbotsProvider.signBundle(bundle);
    
    logger.info("Simulating bundle at block", blockNumber);
    
    const simulation = await this.flashbotsProvider.simulate(
      signedBundle,
      blockNumber,
      blockNumber
    );

    // Get simulation results
    const simulationResult = await simulation.simulate();
    
    return simulationResult;
  }

  /**
   * Get current block number
   * @returns {Promise<number>}
   */
  async getBlockNumber() {
    return await this.provider.getBlockNumber();
  }
}

/**
 * Create Flashbots service instance
 * @param {ethers.Provider} provider 
 * @param {ethers.Wallet} wallet 
 * @param {Object} options 
 * @returns {FlashbotsService}
 */
function createFlashbotsService(provider, wallet, options) {
  return new FlashbotsService(provider, wallet, options);
}

/**
 * Simple bundle send function (legacy compatibility)
 * @param {ethers.Wallet} wallet 
 * @param {Object} tx 
 * @param {number} blockNumber 
 */
async function sendBundle(wallet, tx, blockNumber) {
  const service = new FlashbotsService(wallet.provider, wallet);
  return await service.sendBundle(tx, blockNumber);
}

module.exports = {
  FlashbotsService,
  createFlashbotsService,
  sendBundle,
};
