/**
 * Token Configuration
 * ERC20 and NFT token addresses and ABIs
 */

// ERC20 Token ABI (minimal for balance and transfer)
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// ERC721 ABI
const ERC721_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

// ERC1155 ABI
const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
];

/**
 * Common token addresses (mainnet)
 */
const COMMON_TOKENS = {
  // Stablecoins
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  BUSD: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
  
  // Popular tokens
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  MATIC: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608C577feB',
  
  // Popular NFTs
  BAYC: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D',
  CryptoPunks: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB',
  ENS: '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85',
};

/**
 * Token configuration
 */
const TOKENS = {
  ERC20: {
    abi: ERC20_ABI,
    addresses: COMMON_TOKENS,
  },
  ERC721: {
    abi: ERC721_ABI,
    addresses: {
      BAYC: COMMON_TOKENS.BAYC,
      CryptoPunks: COMMON_TOKENS.CryptoPunks,
      ENS: COMMON_TOKENS.ENS,
    },
  },
  ERC1155: {
    abi: ERC1155_ABI,
    addresses: {},
  },
};

/**
 * Get ERC20 ABI
 */
function getERC20ABI() {
  return ERC20_ABI;
}

/**
 * Get ERC721 ABI
 */
function getERC721ABI() {
  return ERC721_ABI;
}

/**
 * Get ERC1155 ABI
 */
function getERC1155ABI() {
  return ERC1155_ABI;
}

/**
 * Get token address by symbol
 */
function getTokenAddress(symbol) {
  return COMMON_TOKENS[symbol.toUpperCase()];
}

/**
 * Check if address is a common token
 */
function isCommonToken(address) {
  const lowerAddress = address.toLowerCase();
  return Object.values(COMMON_TOKENS).some(
    (addr) => addr.toLowerCase() === lowerAddress
  );
}

module.exports = {
  ERC20_ABI,
  ERC721_ABI,
  ERC1155_ABI,
  COMMON_TOKENS,
  TOKENS,
  getERC20ABI,
  getERC721ABI,
  getERC1155ABI,
  getTokenAddress,
  isCommonToken,
};
