/**
 * NFT Rescue Strategy
 * Builds NFT rescue transactions
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { getERC721ABI, getERC1155ABI } = require('../config/tokens');
const { getChainConfig } = require('../config/chains');

/**
 * Build ERC721 NFT rescue transaction
 * 
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - Token ID to rescue
 * @param {string} walletAddress - Compromised wallet address
 * @param {string} destination - Destination address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object|null>} Transaction object or null
 */
async function buildNFTRescue(contractAddress, tokenId, walletAddress, destination, provider, nonce) {
  try {
    const chainConfig = getChainConfig('ethereum');
    const gasLimit = chainConfig?.gasLimits?.erc721Transfer || 85000;

    const feeData = await provider.getFeeData();
    let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;

    // Apply gas multiplier (NFT transfers need higher priority)
    const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
    maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
    maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

    // Use safeTransferFrom for NFTs
    const iface = new ethers.utils.Interface(getERC721ABI());
    const data = iface.encodeFunctionData('safeTransferFrom', [walletAddress, destination, tokenId]);

    const transaction = {
      from: walletAddress,
      to: contractAddress,
      data,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      chainId: (await provider.getNetwork()).chainId,
    };

    logger.info(`[NFTRescue] Built ERC721 rescue: Token ${tokenId}`);

    return transaction;

  } catch (error) {
    logger.error('[NFTRescue] Error building NFT rescue:', error);
    return null;
  }
}

/**
 * Build ERC1155 NFT rescue transaction
 * 
 * @param {string} contractAddress - ERC1155 contract address
 * @param {string} tokenId - Token ID
 * @param {BigInt} amount - Amount to rescue
 * @param {string} walletAddress - Wallet address
 * @param {string} destination - Destination address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object|null>} Transaction object
 */
async function buildERC1155Rescue(contractAddress, tokenId, amount, walletAddress, destination, provider, nonce) {
  try {
    const chainConfig = getChainConfig('ethereum');
    const gasLimit = chainConfig?.gasLimits?.erc1155Transfer || 90000;

    const feeData = await provider.getFeeData();
    let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;

    const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
    maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
    maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

    const iface = new ethers.utils.Interface(getERC1155ABI());
    const data = iface.encodeFunctionData('safeTransferFrom', [
      walletAddress,
      destination,
      tokenId,
      amount,
      '0x',
    ]);

    return {
      from: walletAddress,
      to: contractAddress,
      data,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      chainId: (await provider.getNetwork()).chainId,
    };
  } catch (error) {
    logger.error('[NFTRescue] Error building ERC1155 rescue:', error);
    return null;
  }
}

/**
 * Build setApprovalForAll revocation (for NFTs)
 * 
 * @param {string} contractAddress - NFT contract address
 * @param {string} walletAddress - Wallet address
 * @param {string} operator - Operator to revoke
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object>} Transaction object
 */
async function buildApprovalForAllRevoke(contractAddress, walletAddress, operator, provider, nonce) {
  try {
    const gasLimit = 50000;

    const feeData = await provider.getFeeData();
    let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;

    const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
    maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
    maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

    const iface = new ethers.utils.Interface(getERC721ABI());
    const data = iface.encodeFunctionData('setApprovalForAll', [operator, false]);

    return {
      from: walletAddress,
      to: contractAddress,
      data,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      chainId: (await provider.getNetwork()).chainId,
    };
  } catch (error) {
    logger.error('[NFTRescue] Error building approval revoke:', error);
    return null;
  }
}

/**
 * Get NFT ownership info
 * 
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - Token ID
 * @param {ethers.Provider} provider - Ethers provider
 * @returns {Promise<object>} Ownership info
 */
async function getNFTOwnership(contractAddress, tokenId, provider) {
  try {
    const contract = new ethers.Contract(contractAddress, getERC721ABI(), provider);
    const [owner, name, symbol] = await Promise.all([
      contract.ownerOf(tokenId).catch(() => null),
      contract.name().catch(() => 'Unknown'),
      contract.symbol().catch(() => '???'),
    ]);

    return {
      contract: contractAddress,
      tokenId,
      owner,
      name,
      symbol,
      isOwned: !!owner,
    };
  } catch (error) {
    logger.error('[NFTRescue] Error getting NFT ownership:', error);
    return {
      contract: contractAddress,
      tokenId,
      owner: null,
      error: error.message,
    };
  }
}

/**
 * Get all NFTs owned by a wallet
 * 
 * @param {string} contractAddress - NFT contract address
 * @param {string} walletAddress - Wallet address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} maxTokens - Maximum tokens to fetch
 * @returns {Promise<Array>} Array of token IDs
 */
async function getWalletNFTs(contractAddress, walletAddress, provider, maxTokens = 100) {
  const tokens = [];

  try {
    const contract = new ethers.Contract(contractAddress, getERC721ABI(), provider);
    const balance = await contract.balanceOf(walletAddress);

    if (balance.eq(0) || balance.gt(maxTokens)) {
      return tokens;
    }

    for (let i = 0; i < balance.toNumber(); i++) {
      try {
        const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, i);
        tokens.push(tokenId.toString());
      } catch (e) {
        break;
      }
    }
  } catch (error) {
    logger.error('[NFTRescue] Error getting wallet NFTs:', error);
  }

  return tokens;
}

/**
 * Batch build NFT rescue transactions
 * 
 * @param {Array} nfts - Array of NFT objects {contract, tokenId}
 * @param {string} walletAddress - Wallet address
 * @param {string} destination - Destination address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} startNonce - Starting nonce
 * @returns {Promise<Array>} Array of transactions
 */
async function batchBuildNFTRescues(nfts, walletAddress, destination, provider, startNonce) {
  const transactions = [];
  let nonce = startNonce;

  for (const nft of nfts) {
    const tx = await buildNFTRescue(
      nft.contract,
      nft.tokenId,
      walletAddress,
      destination,
      provider,
      nonce
    );

    if (tx) {
      transactions.push(tx);
      nonce++;
    }
  }

  return transactions;
}

module.exports = {
  buildNFTRescue,
  buildERC1155Rescue,
  buildApprovalForAllRevoke,
  getNFTOwnership,
  getWalletNFTs,
  batchBuildNFTRescues,
};
