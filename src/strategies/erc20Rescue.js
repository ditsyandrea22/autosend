/**
 * ERC20 Rescue Strategy
 * Builds ERC20 token rescue transactions
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');
const { getERC20ABI } = require('../config/tokens');
const { getChainConfig } = require('../config/chains');

/**
 * Build ERC20 rescue transaction
 * 
 * @param {string} tokenAddress - Token contract address
 * @param {string} walletAddress - Compromised wallet address
 * @param {string} destination - Destination address
 * @param {BigInt} amount - Amount to rescue (if null, will query balance)
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object|null>} Transaction object or null
 */
async function buildERC20Rescue(tokenAddress, walletAddress, destination, amount, provider, nonce) {
  try {
    const contract = new ethers.Contract(tokenAddress, getERC20ABI(), provider);
    
    // Get balance if amount not specified
    if (!amount) {
      amount = await contract.balanceOf(walletAddress);
    }

    if (amount.eq(0)) {
      return null;
    }

    // Get fee data
    const feeData = await provider.getFeeData();
    const chainConfig = getChainConfig('ethereum');
    const gasLimit = chainConfig?.gasLimits?.erc20Transfer || 65000;

    let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;

    // Apply gas multiplier
    const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
    maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
    maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

    // Build transaction data
    const iface = new ethers.utils.Interface(getERC20ABI());
    const data = iface.encodeFunctionData('transfer', [destination, amount]);

    const transaction = {
      from: walletAddress,
      to: tokenAddress,
      data,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      chainId: (await provider.getNetwork()).chainId,
    };

    // Get token symbol for logging
    let symbol = '???';
    try {
      symbol = await contract.symbol();
    } catch (e) {}

    logger.info(`[ERC20Rescue] Built rescue: ${amount} ${symbol} to ${destination}`);

    return transaction;

  } catch (error) {
    logger.error('[ERC20Rescue] Error building ERC20 rescue:', error);
    return null;
  }
}

/**
 * Build ERC20 approval revocation transaction
 * 
 * @param {string} tokenAddress - Token contract address
 * @param {string} walletAddress - Wallet address
 * @param {string} spender - Spender address to revoke
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} nonce - Transaction nonce
 * @returns {Promise<object>} Transaction object
 */
async function buildApprovalRevoke(tokenAddress, walletAddress, spender, provider, nonce) {
  try {
    const chainConfig = getChainConfig('ethereum');
    const gasLimit = chainConfig?.gasLimits?.approvalRevoke || 50000;

    const feeData = await provider.getFeeData();
    let maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice;
    let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || feeData.gasPrice;

    const multiplier = parseFloat(process.env.GAS_MULTIPLIER) || 3;
    maxFeePerGas = maxFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);
    maxPriorityFeePerGas = maxPriorityFeePerGas * BigInt(Math.floor(multiplier * 10)) / BigInt(10);

    // Build approval revocation (set to 0)
    const iface = new ethers.utils.Interface(getERC20ABI());
    const data = iface.encodeFunctionData('approve', [spender, 0]);

    return {
      from: walletAddress,
      to: tokenAddress,
      data,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      nonce,
      chainId: (await provider.getNetwork()).chainId,
    };
  } catch (error) {
    logger.error('[ERC20Rescue] Error building approval revoke:', error);
    return null;
  }
}

/**
 * Get ERC20 token balance
 * 
 * @param {string} tokenAddress - Token contract address
 * @param {string} walletAddress - Wallet address
 * @param {ethers.Provider} provider - Ethers provider
 * @returns {Promise<object>} Token balance info
 */
async function getTokenBalance(tokenAddress, walletAddress, provider) {
  try {
    const contract = new ethers.Contract(tokenAddress, getERC20ABI(), provider);
    const [balance, symbol, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.symbol().catch(() => '???'),
      contract.decimals().catch(() => 18),
    ]);

    return {
      address: tokenAddress,
      balance: balance.toString(),
      balanceFormatted: ethers.formatUnits(balance, decimals),
      symbol,
      decimals,
      canRescue: balance.gt(0),
    };
  } catch (error) {
    logger.error('[ERC20Rescue] Error getting token balance:', error);
    return {
      address: tokenAddress,
      balance: '0',
      balanceFormatted: '0',
      symbol: '???',
      decimals: 18,
      canRescue: false,
      error: error.message,
    };
  }
}

/**
 * Check and revoke unlimited approvals
 * 
 * @param {string} walletAddress - Wallet address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string[]} tokenAddresses - Token addresses to check
 * @returns {Promise<Array>} Transactions to revoke
 */
async function checkUnlimitedApprovals(walletAddress, provider, tokenAddresses) {
  const revocations = [];
  const maxUint256 = ethers.constants.MaxUint256;
  const commonSpenders = [
    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3
    '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // SushiSwap
  ];

  let nonce = await provider.getTransactionCount(walletAddress);

  for (const tokenAddress of tokenAddresses) {
    try {
      const contract = new ethers.Contract(tokenAddress, getERC20ABI(), provider);

      for (const spender of commonSpenders) {
        try {
          const allowance = await contract.allowance(walletAddress, spender);
          
          if (allowance.eq(maxUint256)) {
            const tx = await buildApprovalRevoke(tokenAddress, walletAddress, spender, provider, nonce);
            if (tx) {
              revocations.push(tx);
              nonce++;
              logger.info(`[ERC20Rescue] Will revoke unlimited approval for ${spender}`);
            }
          }
        } catch (e) {
          // Skip failed checks
        }
      }
    } catch (e) {
      // Skip failed tokens
    }
  }

  return revocations;
}

/**
 * Batch build ERC20 rescue transactions
 * 
 * @param {Array} tokenBalances - Array of token balance objects
 * @param {string} walletAddress - Wallet address
 * @param {string} destination - Destination address
 * @param {ethers.Provider} provider - Ethers provider
 * @param {number} startNonce - Starting nonce
 * @returns {Promise<Array>} Array of transaction objects
 */
async function batchBuildERC20Rescues(tokenBalances, walletAddress, destination, provider, startNonce) {
  const transactions = [];
  let nonce = startNonce;

  for (const token of tokenBalances) {
    if (token.canRescue) {
      const tx = await buildERC20Rescue(
        token.address,
        walletAddress,
        destination,
        BigInt(token.balance),
        provider,
        nonce
      );
      
      if (tx) {
        transactions.push(tx);
        nonce++;
      }
    }
  }

  return transactions;
}

module.exports = {
  buildERC20Rescue,
  buildApprovalRevoke,
  getTokenBalance,
  checkUnlimitedApprovals,
  batchBuildERC20Rescues,
};
