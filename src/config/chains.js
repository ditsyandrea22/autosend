/**
 * Multi-chain configuration for MEV Rescue Bot
 * Supports Ethereum, Base, Polygon, and BSC
 */

const { ethers } = require('ethers');

/**
 * All supported chains configuration
 */
const CHAINS = {
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: 1,
    chainIdHex: '0x1',
    rpc: process.env.ETH_RPC || '',
    rpcFallback: process.env.ETH_RPC_FALLBACK,
    explorer: 'https://etherscan.io',
    explorerApi: 'https://api.etherscan.io/api',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    gasLimits: {
      ethTransfer: 21000,
      erc20Transfer: 65000,
      erc20Approval: 50000,
      nftTransfer: 85000,
      erc721Transfer: 85000,
      erc1155Transfer: 90000,
      approvalRevoke: 50000,
    },
    blockTimeSeconds: 12,
    supportsEIP1559: true,
  },
  base: {
    name: 'Base',
    chainId: 8453,
    chainIdHex: '0x2105',
    rpc: process.env.BASE_RPC || '',
    rpcFallback: process.env.BASE_RPC_FALLBACK,
    explorer: 'https://basescan.org',
    explorerApi: 'https://api.basescan.org/api',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    gasLimits: {
      ethTransfer: 21000,
      erc20Transfer: 65000,
      erc20Approval: 50000,
      nftTransfer: 85000,
      erc721Transfer: 85000,
      erc1155Transfer: 90000,
      approvalRevoke: 50000,
    },
    blockTimeSeconds: 2,
    supportsEIP1559: true,
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    chainIdHex: '0x89',
    rpc: process.env.POLYGON_RPC || '',
    rpcFallback: process.env.POLYGON_RPC_FALLBACK,
    explorer: 'https://polygonscan.com',
    explorerApi: 'https://api.polygonscan.com/api',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    gasLimits: {
      ethTransfer: 21000,
      erc20Transfer: 65000,
      erc20Approval: 50000,
      nftTransfer: 85000,
      erc721Transfer: 85000,
      erc1155Transfer: 90000,
      approvalRevoke: 50000,
    },
    blockTimeSeconds: 2,
    supportsEIP1559: true,
  },
  bsc: {
    name: 'BNB Smart Chain',
    chainId: 56,
    chainIdHex: '0x38',
    rpc: process.env.BSC_RPC || '',
    rpcFallback: process.env.BSC_RPC_FALLBACK,
    explorer: 'https://bscscan.com',
    explorerApi: 'https://api.bscscan.com/api',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    gasLimits: {
      ethTransfer: 21000,
      erc20Transfer: 70000,
      erc20Approval: 55000,
      nftTransfer: 90000,
      erc721Transfer: 90000,
      erc1155Transfer: 95000,
      approvalRevoke: 55000,
    },
    blockTimeSeconds: 3,
    supportsEIP1559: false,
  },
};

/**
 * Get chain config by name
 */
function getChainConfig(chainName) {
  return CHAINS[chainName.toLowerCase()];
}

/**
 * Get chain config by chain ID
 */
function getChainById(chainId) {
  return Object.values(CHAINS).find((chain) => chain.chainId === chainId);
}

/**
 * Get all enabled chains from environment
 */
function getEnabledChains() {
  const enabledStr = process.env.ENABLED_CHAINS || 'ethereum,base,polygon,bsc';
  const enabledNames = enabledStr.split(',').map((s) => s.trim().toLowerCase());

  return enabledNames
    .map((name) => CHAINS[name])
    .filter((chain) => chain !== undefined);
}

/**
 * Create ethers provider for a chain
 */
function createProvider(chainName) {
  const config = getChainConfig(chainName);
  if (!config || !config.rpc) {
    return null;
  }
  return new ethers.JsonRpcProvider(config.rpc);
}

/**
 * Create fallback provider for a chain
 */
function createFallbackProvider(chainName) {
  const config = getChainConfig(chainName);
  if (!config || !config.rpcFallback) {
    return null;
  }
  return new ethers.JsonRpcProvider(config.rpcFallback);
}

module.exports = {
  CHAINS,
  getChainConfig,
  getChainById,
  getEnabledChains,
  createProvider,
  createFallbackProvider,
};
