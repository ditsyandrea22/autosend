/**
 * NFT Detector
 * Detects NFT transfers and approvals
 */

const { ethers } = require('ethers');
const { getERC721ABI, getERC1155ABI } = require('../config/tokens');

// NFT function selectors
const NFT_SELECTORS = {
  // ERC721
  SAFE_TRANSFER_FROM: '0x42842e0e',
  SAFE_TRANSFER_FROM_DATA: '0xb88d4fde',
  TRANSFER_FROM: '0x23b872dd',
  SET_APPROVAL_FOR_ALL: '0xa22cb465',
  APPROVE: '0x095ea7b3',
  
  // ERC1155
  SAFE_TRANSFER_FROM_1155: '0xf242432a',
  SAFE_BATCH_TRANSFER_FROM: '0x2eb2c2d6',
  SET_APPROVAL_FOR_ALL_1155: '0xa22cb465',
};

/**
 * Detect NFT transfer from transaction data
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {object|null} Detection result
 */
function detectNFTTransfer(tx) {
  if (!tx || !tx.data || tx.data.length < 10) {
    return null;
  }

  const selector = tx.data.substring(0, 10);

  // ERC721 safeTransferFrom
  if (selector === NFT_SELECTORS.SAFE_TRANSFER_FROM || selector === NFT_SELECTORS.SAFE_TRANSFER_FROM_DATA) {
    try {
      const iface = new ethers.utils.Interface(getERC721ABI());
      const decoded = iface.parseTransaction({ data: tx.data });
      
      return {
        type: 'erc721_transfer',
        standard: 'ERC721',
        contract: tx.to,
        selector,
        from: decoded.args[0],
        to: decoded.args[1],
        tokenId: decoded.args[2]?.toString(),
      };
    } catch (e) {
      // Failed to parse
    }
  }

  // ERC721 transferFrom
  if (selector === NFT_SELECTORS.TRANSFER_FROM) {
    try {
      const iface = new ethers.utils.Interface(getERC721ABI());
      const decoded = iface.parseTransaction({ data: tx.data });
      
      return {
        type: 'erc721_transfer',
        standard: 'ERC721',
        contract: tx.to,
        selector,
        from: decoded.args[0],
        to: decoded.args[1],
        tokenId: decoded.args[2]?.toString(),
      };
    } catch (e) {
      // Failed to parse
    }
  }

  // ERC1155 safeTransferFrom
  if (selector === NFT_SELECTORS.SAFE_TRANSFER_FROM_1155) {
    try {
      const iface = new ethers.utils.Interface(getERC1155ABI());
      const decoded = iface.parseTransaction({ data: tx.data });
      
      return {
        type: 'erc1155_transfer',
        standard: 'ERC1155',
        contract: tx.to,
        selector,
        from: decoded.args[0],
        to: decoded.args[1],
        tokenId: decoded.args[2]?.toString(),
        amount: decoded.args[3]?.toString(),
      };
    } catch (e) {
      // Failed to parse
    }
  }

  return null;
}

/**
 * Detect NFT approval (setApprovalForAll)
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {object|null} Detection result
 */
function detectNFTApproval(tx) {
  if (!tx || !tx.data || tx.data.length < 10) {
    return null;
  }

  const selector = tx.data.substring(0, 10);

  // setApprovalForAll for ERC721/ERC1155
  if (selector === NFT_SELECTORS.SET_APPROVAL_FOR_ALL) {
    try {
      const iface = new ethers.utils.Interface(getERC721ABI());
      const decoded = iface.parseTransaction({ data: tx.data });
      
      return {
        type: 'approval_for_all',
        contract: tx.to,
        selector,
        operator: decoded.args[0],
        approved: decoded.args[1],
      };
    } catch (e) {
      // Try ERC1155
      try {
        const iface = new ethers.utils.Interface(getERC1155ABI());
        const decoded = iface.parseTransaction({ data: tx.data });
        
        return {
          type: 'approval_for_all',
          contract: tx.to,
          standard: 'ERC1155',
          selector,
          operator: decoded.args[0],
          approved: decoded.args[1],
        };
      } catch (e2) {
        // Failed to parse
      }
    }
  }

  return null;
}

/**
 * Check if transaction is NFT-related
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {boolean}
 */
function isNFTTransaction(tx) {
  if (!tx || !tx.data || tx.data.length < 10) {
    return false;
  }

  const selector = tx.data.substring(0, 10);
  
  return Object.values(NFT_SELECTORS).includes(selector);
}

/**
 * Create ERC721 contract instance
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} contractAddress - NFT contract address
 * @returns {ethers.Contract} Contract instance
 */
function createERC721Contract(provider, contractAddress) {
  return new ethers.Contract(
    contractAddress,
    getERC721ABI(),
    provider
  );
}

/**
 * Create ERC1155 contract instance
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} contractAddress - NFT contract address
 * @returns {ethers.Contract} Contract instance
 */
function createERC1155Contract(provider, contractAddress) {
  return new ethers.Contract(
    contractAddress,
    getERC1155ABI(),
    provider
  );
}

/**
 * Get NFT owner
 * 
 * @param {ethers.Contract} contract - NFT contract
 * @param {BigInt} tokenId - Token ID
 * @returns {string} Owner address
 */
async function getNFTOwner(contract, tokenId) {
  try {
    return await contract.ownerOf(tokenId);
  } catch (e) {
    return null;
  }
}

/**
 * Get NFT balance for wallet
 * 
 * @param {ethers.Contract} contract - NFT contract
 * @param {string} walletAddress - Wallet address
 * @returns {BigInt} Balance
 */
async function getNFTBalance(contract, walletAddress) {
  try {
    return await contract.balanceOf(walletAddress);
  } catch (e) {
    return ethers.constants.Zero;
  }
}

/**
 * Get all NFTs for a wallet (by index)
 * 
 * @param {ethers.Contract} contract - NFT contract (ERC721)
 * @param {string} walletAddress - Wallet address
 * @param {number} maxTokens - Maximum tokens to fetch
 * @returns {Promise<Array>} List of token IDs
 */
async function getWalletNFTs(contract, walletAddress, maxTokens = 100) {
  const tokens = [];
  
  try {
    const balance = await getNFTBalance(contract, walletAddress);
    const count = balance.lt(maxTokens) ? balance.toNumber() : maxTokens;
    
    for (let i = 0; i < count; i++) {
      try {
        const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
        tokens.push(tokenId.toString());
      } catch (e) {
        break;
      }
    }
  } catch (e) {
    // Contract might not support tokenOfOwnerByIndex
  }

  return tokens;
}

/**
 * Check if wallet has given approval for all
 * 
 * @param {ethers.Contract} contract - NFT contract
 * @param {string} walletAddress - Wallet address
 * @param {string} operator - Operator address
 * @returns {boolean} Approval status
 */
async function hasApprovalForAll(contract, walletAddress, operator) {
  try {
    return await contract.isApprovedForAll(walletAddress, operator);
  } catch (e) {
    return false;
  }
}

/**
 * Get NFT metadata
 * 
 * @param {ethers.Contract} contract - NFT contract
 * @returns {object} NFT metadata
 */
async function getNFTMetadata(contract) {
  try {
    const [name, symbol] = await Promise.all([
      contract.name(),
      contract.symbol(),
    ]);

    return { name, symbol };
  } catch (e) {
    return { name: 'Unknown', symbol: '???' };
  }
}

/**
 * Scan wallet for NFTs
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} walletAddress - Wallet to scan
 * @param {string[]} nftAddresses - NFT contract addresses
 * @returns {Promise<Array>} List of NFTs
 */
async function scanWalletNFTs(provider, walletAddress, nftAddresses) {
  const results = [];

  for (const nftAddress of nftAddresses) {
    try {
      const contract = createERC721Contract(provider, nftAddress);
      const balance = await getNFTBalance(contract, walletAddress);
      
      if (balance.gt(0)) {
        const metadata = await getNFTMetadata(contract);
        const tokens = await getWalletNFTs(contract, walletAddress, balance.toNumber());
        
        results.push({
          address: nftAddress,
          ...metadata,
          standard: 'ERC721',
          balance: balance.toString(),
          tokens,
        });
      }
    } catch (e) {
      // Try ERC1155
      try {
        const contract = createERC1155Contract(provider, nftAddress);
        const metadata = await getNFTMetadata(contract);
        
        // For ERC1155, we'd need to check specific token IDs
        results.push({
          address: nftAddress,
          ...metadata,
          standard: 'ERC1155',
        });
      } catch (e2) {
        // Skip invalid contracts
      }
    }
  }

  return results;
}

module.exports = {
  NFT_SELECTORS,
  detectNFTTransfer,
  detectNFTApproval,
  isNFTTransaction,
  createERC721Contract,
  createERC1155Contract,
  getNFTOwner,
  getNFTBalance,
  getWalletNFTs,
  hasApprovalForAll,
  getNFTMetadata,
  scanWalletNFTs,
};
