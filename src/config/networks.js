/**
 * Network Configuration
 * Supported networks for rescue operations
 */

const NETWORKS = {
  // Ethereum Mainnet
  1: {
    name: "Ethereum Mainnet",
    chainId: 1,
    flashbotsRelays: [
      "https://relay.flashbots.net",
      "https://relay.ultrasound.money",
      "https://rsync.bloxroute.com",
    ],
    defaultRpc: null, // User must provide
  },
  // Base
  8453: {
    name: "Base",
    chainId: 8453,
    flashbotsRelays: ["https://relay.flashbots.net"],
    defaultRpc: null,
  },
  // Arbitrum
  42161: {
    name: "Arbitrum One",
    chainId: 42161,
    flashbotsRelays: ["https://relay.flashbots.net"],
    defaultRpc: null,
  },
  // Optimism
  10: {
    name: "Optimism",
    chainId: 10,
    flashbotsRelays: ["https://relay.flashbots.net"],
    defaultRpc: null,
  },
  // BSC
  56: {
    name: "BNB Smart Chain",
    chainId: 56,
    flashbotsRelays: [], // No Flashbots on BSC
    defaultRpc: null,
  },
  // Polygon
  137: {
    name: "Polygon",
    chainId: 137,
    flashbotsRelays: [],
    defaultRpc: null,
  },
};

module.exports = { NETWORKS };
