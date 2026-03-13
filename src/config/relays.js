/**
 * Relay Configuration
 * Multi-relay support for MEV bundle broadcasting
 */

const RELAYS = {
  /**
   * Flashbots Relay
   * Primary relay for Ethereum mainnet
   */
  flashbots: {
    name: 'Flashbots',
    enabled: process.env.FLASHBOTS_ENABLED !== 'false',
    endpoint: 'https://relay.flashbots.net',
    authEndpoint: 'https://auth.flashbots.net',
    builderEndpoint: 'https://builder0x69.io',
    supports: ['ethereum', 'base'],
    priority: 1,
    config: {
      signingKey: process.env.FLASHBOTS_SIGNING_KEY || '',
    },
  },

  /**
   * bloXroute Relay
   * High-performance relay with private mempool
   */
  bloxroute: {
    name: 'bloXroute',
    enabled: process.env.BLOXROUTE_ENABLED !== 'false',
    endpoint: process.env.BLOXROUTE_ENDPOINT || 'https://api.bloxroute.com',
    authToken: process.env.BLOXROUTE_AUTH_TOKEN || '',
    supports: ['ethereum', 'base', 'polygon', 'bsc'],
    priority: 2,
    config: {
      channel: process.env.BLOXROUTE_CHANNEL || 'builder',
      header: process.env.BLOXROUTE_HEADER || '',
    },
  },

  /**
   * Eden Network Relay
   * Low-latency relay with priority access
   */
  eden: {
    name: 'Eden Network',
    enabled: process.env.EDEN_ENABLED !== 'false',
    endpoint: 'https://relay.edennetwork.io',
    apiKey: process.env.EDEN_API_KEY || '',
    supports: ['ethereum'],
    priority: 3,
  },

  /**
   * Beaverbuild Relay
   * Alternative builder with competitive fees
   */
  beaverbuild: {
    name: 'Beaverbuild',
    enabled: process.env.BEAVERBUILD_ENABLED !== 'false',
    endpoint: 'https://rpc.beaverbuild.org',
    supports: ['ethereum'],
    priority: 4,
  },

  /**
   * Titan Relay
   * Multi-chain relay support
   */
  titan: {
    name: 'Titan',
    enabled: process.env.TITAN_ENABLED !== 'false',
    endpoint: 'https://rpc.titanbuilder.xyz',
    supports: ['ethereum', 'base', 'polygon'],
    priority: 5,
  },

  /**
   * rsync Relay
   * Fast relay for urgent bundles
   */
  rsync: {
    name: 'rsync',
    enabled: process.env.RSYNC_ENABLED !== 'false',
    endpoint: 'https://rsync.builder.io',
    supports: ['ethereum'],
    priority: 6,
  },
};

/**
 * Get relay config by name
 */
function getRelayConfig(relayName) {
  return RELAYS[relayName.toLowerCase()];
}

/**
 * Get all enabled relays
 */
function getEnabledRelays() {
  return Object.values(RELAYS).filter((relay) => relay.enabled);
}

/**
 * Get relays that support a specific chain
 */
function getRelaysForChain(chainName) {
  return getEnabledRelays()
    .filter((relay) => relay.supports.includes(chainName.toLowerCase()))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get relay by priority for a chain
 */
function getPrimaryRelay(chainName) {
  const relays = getRelaysForChain(chainName);
  return relays.length > 0 ? relays[0] : null;
}

module.exports = {
  RELAYS,
  getRelayConfig,
  getEnabledRelays,
  getRelaysForChain,
  getPrimaryRelay,
};
