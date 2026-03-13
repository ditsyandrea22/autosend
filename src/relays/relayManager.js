/**
 * Relay Manager
 * Manages multiple relay connections and broadcasting
 */

const { logger } = require('../utils/logger');
const { getRelaysForChain } = require('../config/relays');
const { signBundle } = require('../bundle/bundleBuilder');
const { ethers } = require('ethers');

class RelayManager {
  constructor() {
    this.relays = new Map();
    this.stats = {
      totalSent: 0,
      totalSuccess: 0,
      totalFailed: 0,
      byRelay: {},
    };
  }

  /**
   * Initialize relay connections
   */
  async initialize() {
    logger.info('[RelayManager] Initializing relays...');
    
    // Initialize each relay type
    const relayConfigs = getRelaysForChain('ethereum');
    
    for (const config of relayConfigs) {
      try {
        const relay = await this.createRelay(config);
        this.relays.set(config.name, relay);
        logger.info(`[RelayManager] Initialized relay: ${config.name}`);
      } catch (error) {
        logger.error(`[RelayManager] Failed to initialize ${config.name}:`, error);
      }
    }

    logger.info(`[RelayManager] Initialized ${this.relays.size} relays`);
  }

  /**
   * Create relay instance
   */
  async createRelay(config) {
    switch (config.name.toLowerCase()) {
      case 'flashbots':
        return await this.createFlashbotsRelay(config);
      case 'bloxroute':
        return this.createBloxrouteRelay(config);
      case 'eden network':
        return this.createEdenRelay(config);
      case 'beaverbuild':
        return this.createBeaverbuildRelay(config);
      default:
        logger.warn(`[RelayManager] Unknown relay: ${config.name}`);
        return null;
    }
  }

  /**
   * Create Flashbots relay
   */
  async createFlashbotsRelay(config) {
    try {
      const { FlashbotsBundleProvider } = require('@flashbots/ethers-provider-bundle');
      const { ethers } = require('ethers');
      
      // Get provider and wallet from environment or create temp
      const provider = new ethers.JsonRpcProvider(process.env.ETH_RPC);
      const wallet = new ethers.Wallet(process.env.FLASHBOTS_SIGNING_KEY || '', provider);

      const flashbots = await FlashbotsBundleProvider.create(
        provider,
        wallet,
        'mainnet'
      );

      return {
        name: 'Flashbots',
        type: 'flashbots',
        provider: flashbots,
        config,
      };
    } catch (error) {
      logger.error('[RelayManager] Flashbots creation error:', error);
      return null;
    }
  }

  /**
   * Create bloXroute relay
   */
  createBloxrouteRelay(config) {
    return {
      name: 'bloXroute',
      type: 'bloxroute',
      config,
      endpoint: config.endpoint,
    };
  }

  /**
   * Create Eden relay
   */
  createEdenRelay(config) {
    return {
      name: 'Eden Network',
      type: 'eden',
      config,
      endpoint: config.endpoint,
    };
  }

  /**
   * Create Beaverbuild relay
   */
  createBeaverbuildRelay(config) {
    return {
      name: 'Beaverbuild',
      type: 'beaverbuild',
      config,
      endpoint: config.endpoint,
    };
  }

  /**
   * Broadcast bundle to all relays
   */
  async broadcastBundle(bundle, chainName, provider) {
    const results = [];
    const chainRelays = getRelaysForChain(chainName);

    // Sign bundle first
    const signedTxs = await signBundle(bundle);

    for (const relayConfig of chainRelays) {
      const relay = this.relays.get(relayConfig.name);
      if (!relay) continue;

      try {
        const result = await this.sendToRelay(relay, signedTxs, provider);
        results.push({
          relay: relayConfig.name,
          ...result,
        });

        if (result.success) {
          this.stats.totalSuccess++;
          this.stats.byRelay[relayConfig.name] = {
            sent: (this.stats.byRelay[relayConfig.name]?.sent || 0) + 1,
            success: (this.stats.byRelay[relayConfig.name]?.success || 0) + 1,
          };
          return result;
        }
      } catch (error) {
        logger.error(`[RelayManager] Error sending to ${relayConfig.name}:`, error);
        results.push({
          relay: relayConfig.name,
          success: false,
          error: error.message,
        });
      }
    }

    this.stats.totalFailed++;

    return {
      success: false,
      results,
      error: 'All relays failed',
    };
  }

  /**
   * Send to specific relay
   */
  async sendToRelay(relay, signedTxs, provider) {
    switch (relay.type) {
      case 'flashbots':
        return this.sendFlashbots(relay, signedTxs);
      case 'bloxroute':
        return this.sendBloxroute(relay, signedTxs);
      case 'eden':
        return this.sendEden(relay, signedTxs);
      case 'beaverbuild':
        return this.sendBeaverbuild(relay, signedTxs);
      default:
        return { success: false, error: 'Unknown relay type' };
    }
  }

  /**
   * Send to Flashbots
   */
  async sendFlashbots(relay, signedTxs) {
    try {
      const blockNumber = await relay.provider.provider.getBlockNumber();
      const targetBlock = blockNumber + 1;

      const bundleReceipt = await relay.provider.sendBundle(signedTxs, targetBlock);

      if (bundleReceipt.error) {
        return {
          success: false,
          error: bundleReceipt.error.message,
        };
      }

      return {
        success: true,
        hash: bundleReceipt.bundleHash,
        blockNumber: targetBlock,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send to bloXroute
   */
  async sendBloxroute(relay, signedTxs) {
    try {
      const endpoint = process.env.BLOXROUTE_ENDPOINT || 'https://api.bloxroute.com';
      const authToken = process.env.BLOXROUTE_AUTH_TOKEN;
      
      if (!authToken) {
        return { success: false, error: 'Bloxroute auth token not configured' };
      }

      const blockNumber = await relay.provider?.provider?.getBlockNumber() || 
        (await (new ethers.JsonRpcProvider(process.env.ETH_RPC)).getBlockNumber());
      
      const response = await fetch(`${endpoint}/v1/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authToken,
        },
        body: JSON.stringify({
          txs: signedTxs,
          blockNumber: blockNumber + 1,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          hash: result.bundleHash || result.hash,
          blockNumber: blockNumber + 1,
        };
      }

      return { success: false, error: `bloXroute error: ${response.status}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send to Eden
   */
  async sendEden(relay, signedTxs) {
    try {
      const endpoint = process.env.EDEN_ENDPOINT || 'https://api.edennetwork.io/v1/bundle';
      const apiKey = process.env.EDEN_API_KEY;
      
      if (!apiKey) {
        return { success: false, error: 'Eden API key not configured' };
      }

      const blockNumber = await relay.provider?.provider?.getBlockNumber() || 
        (await (new ethers.JsonRpcProvider(process.env.ETH_RPC)).getBlockNumber());

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          txs: signedTxs,
          blockNumber: blockNumber + 1,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          hash: result.bundleHash || result.id,
          blockNumber: blockNumber + 1,
        };
      }

      return { success: false, error: `Eden error: ${response.status}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send to Beaverbuild
   */
  async sendBeaverbuild(relay, signedTxs) {
    try {
      const endpoint = 'https://beaverbuild.org';
      
      const blockNumber = await relay.provider?.provider?.getBlockNumber() || 
        (await (new ethers.JsonRpcProvider(process.env.ETH_RPC)).getBlockNumber());

      const response = await fetch(`${endpoint}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_sendBundle',
          params: [signedTxs, `0x${(blockNumber + 1).toString(16)}`],
          id: 1,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          hash: result.result?.bundleHash || result.result,
          blockNumber: blockNumber + 1,
        };
      }

      return { success: false, error: `Beaverbuild error: ${response.status}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get relay stats
   */
  getStats() {
    return {
      ...this.stats,
      activeRelays: this.relays.size,
    };
  }
}

// Singleton instance
let relayManager = null;

/**
 * Get relay manager instance
 */
function getRelayManager() {
  if (!relayManager) {
    relayManager = new RelayManager();
  }
  return relayManager;
}

/**
 * Broadcast bundle helper
 */
async function broadcastBundle(bundle, chainName, provider) {
  const manager = getRelayManager();
  
  if (manager.relays.size === 0) {
    await manager.initialize();
  }

  return manager.broadcastBundle(bundle, chainName, provider);
}

module.exports = {
  RelayManager,
  getRelayManager,
  broadcastBundle,
};
