/**
 * Constants
 * Bot configuration constants
 * 
 * Note: These values can be overridden via environment variables:
 * - GAS_BASE_MULTIPLIER: Base gas multiplier (default: 2)
 * - GAS_ATTACK_MULTIPLIER: Attack gas multiplier (default: 6)
 * - GAS_MAX_MULTIPLIER: Maximum gas multiplier (default: 10)
 */

// Helper to parse environment variable as number
const parseEnvNumber = (key, defaultValue) => {
  const value = process.env[key];
  if (value !== undefined) {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
};

// Gas strategy multipliers
const GAS = {
  // Base multiplier for normal conditions (configurable via GAS_BASE_MULTIPLIER)
  BASE_MULTIPLIER: parseEnvNumber("GAS_BASE_MULTIPLIER", 2),
  // Aggressive multiplier when under attack (configurable via GAS_ATTACK_MULTIPLIER)
  ATTACK_MULTIPLIER: parseEnvNumber("GAS_ATTACK_MULTIPLIER", 6),
  // Maximum multiplier cap (configurable via GAS_MAX_MULTIPLIER)
  MAX_MULTIPLIER: parseEnvNumber("GAS_MAX_MULTIPLIER", 10),
  // Gas limit for ETH transfer
  ETH_TRANSFER_GAS: 21000,
  // Gas limit for ERC20 transfer
  ERC20_TRANSFER_GAS: 65000,
  // Gas limit for NFT transfer
  NFT_TRANSFER_GAS: 85000,
};

// Block timing
const BLOCKS = {
  // Target future blocks for bundle inclusion
  TARGET_BLOCKS_AHEAD: 1,
  // Maximum blocks to wait before retry
  MAX_RETRY_BLOCKS: 10,
  // Block time in seconds (average)
  BLOCK_TIME_SECONDS: 12,
};

// Mempool monitoring
const MEMPOOL = {
  // Filter check interval in ms
  CHECK_INTERVAL: 100,
  // Number of blocks to keep in memory for analysis
  BLOCK_HISTORY_SIZE: 100,
  // Maximum pending tx to monitor
  MAX_PENDING_TX: 1000,
};

// Bundle configuration
const BUNDLE = {
  // Bundle timeout in ms
  TIMEOUT: 25000,
  // Retry interval in ms
  RETRY_INTERVAL: 12000,
  // Maximum retry attempts per block
  MAX_RETRIES: 100,
  // Simulation required before send
  REQUIRE_SIMULATION: true,
};

// Flashbots relays
const RELAYS = {
  FLASHBOTS: "https://relay.flashbots.net",
  ULTRASOUND: "https://relay.ultrasound.money",
  BLOXROUTE: "https://rsync.bloxroute.com",
  EDEN: "https://relay.edennetwork.io",
};

// RPC configuration
const RPC = {
  // Request timeout in ms
  TIMEOUT: 30000,
  // Retry attempts
  RETRY_ATTEMPTS: 3,
  // Retry delay in ms
  RETRY_DELAY: 1000,
};

// Logging
const LOG = {
  // Log levels: debug, info, warn, error
  LEVEL: "info",
  // Enable timestamps
  TIMESTAMPS: true,
  // Enable colors (disable for production logs)
  COLORS: true,
};

module.exports = {
  GAS,
  BLOCKS,
  MEMPOOL,
  BUNDLE,
  RELAYS,
  RPC,
  LOG,
};
