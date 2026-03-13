// Load environment variables
require("dotenv").config();

module.exports = {
  // RPC Configuration
  RPC_URL: process.env.RPC_URL || process.env.MAINNET_RPC_URL,
  RPC_URLS: process.env.RPC_URLS ? process.env.RPC_URLS.split(",") : [],
  
  // Wallet Configuration
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  TO_ADDRESS: process.env.TO_ADDRESS,
  
  // Token Addresses (comma-separated)
  TOKEN_ADDRESSES: process.env.TOKEN_ADDRESSES 
    ? process.env.TOKEN_ADDRESSES.split(",").map(t => t.trim())
    : [],
    
  // NFT Contract Addresses (comma-separated)
  NFT_ADDRESSES: process.env.NFT_ADDRESSES 
    ? process.env.NFT_ADDRESSES.split(",").map(n => n.trim())
    : [],
  
  // Flashbots Configuration
  FLASHBOTS_AUTH_SIGNER: process.env.FLASHBOTS_AUTH_SIGNER,
  
  // Builder Configuration
  BUILDERS: process.env.BUILDERS 
    ? process.env.BUILDERS.split(",").map(b => b.trim())
    : ["flashbots", "beaverbuild", "bloxroute", "builder0x69"],
  
  // Strategy Configuration
  BLOCK_TARGET_STRATEGY: process.env.BLOCK_TARGET_STRATEGY || "balanced", // fast, balanced, aggressive
  GAS_MULTIPLIER: parseInt(process.env.GAS_MULTIPLIER) || 6,
  
  // Monitoring Configuration
  LATENCY_TARGET_MS: parseInt(process.env.LATENCY_TARGET_MS) || 50,
  ENABLE_MEMPOOL_MONITORING: process.env.ENABLE_MEMPOOL_MONITORING !== "false",
  
  // Advanced: Custom approval revocations
  APPROVALS_TO_MONITOR: process.env.APPROVALS_TO_MONITOR 
    ? JSON.parse(process.env.APPROVALS_TO_MONITOR)
    : [],
};
