/**
 * ERC20 Detector
 * Detects ERC20 token transfers and approvals
 */

const { ethers } = require('ethers');
const { getERC20ABI } = require('../config/tokens');

// ERC20 function selectors
const ERC20_SELECTORS = {
  TRANSFER: '0xa9059cbb',
  TRANSFER_FROM: '0x23b872dd',
  APPROVE: '0x095ea7b3',
  INCREASE_ALLOWANCE: '0x39509351',
  DECREASE_ALLOWANCE: '0x8c5be1e5',
  PERMIT: '0xd505accf',
};

/**
 * Detect ERC20 transfer from transaction data
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {object|null} Detection result
 */
function detectERC20Transfer(tx) {
  if (!tx || !tx.data || tx.data.length < 10) {
    return null;
  }

  const selector = tx.data.substring(0, 10);

  // Check for transfer or transferFrom
  if (selector === ERC20_SELECTORS.TRANSFER || selector === ERC20_SELECTORS.TRANSFER_FROM) {
    try {
      const iface = new ethers.utils.Interface(getERC20ABI());
      const decoded = iface.parseTransaction({ data: tx.data });
      
      if (decoded.name === 'transfer' || decoded.name === 'transferFrom') {
        return {
          type: 'transfer',
          token: tx.to,
          selector,
          args: decoded.args,
          amount: decoded.args[decoded.name === 'transfer' ? 1 : 2]?.toString(),
          to: decoded.args[decoded.name === 'transfer' ? 0 : 1],
          from: decoded.name === 'transferFrom' ? decoded.args[0] : tx.from,
        };
      }
    } catch (e) {
      // Failed to parse, might not be ERC20
    }
  }

  return null;
}

/**
 * Detect ERC20 approval from transaction data
 * 
 * @param {ethers.Transaction} tx - Transaction object
 * @returns {object|null} Detection result
 */
function detectERC20Approval(tx) {
  if (!tx || !tx.data || tx.data.length < 10) {
    return null;
  }

  const selector = tx.data.substring(0, 10);

  // Check for approval functions
  if (
    selector === ERC20_SELECTORS.APPROVE ||
    selector === ERC20_SELECTORS.INCREASE_ALLOWANCE ||
    selector === ERC20_SELECTORS.DECREASE_ALLOWANCE
  ) {
    try {
      const iface = new ethers.utils.Interface(getERC20ABI());
      const decoded = iface.parseTransaction({ data: tx.data });
      
      return {
        type: 'approval',
        token: tx.to,
        selector,
        args: decoded.args,
        spender: decoded.args[0],
        amount: decoded.args[1]?.toString(),
        isUnlimited: decoded.args[1]?.toString() === ethers.constants.MaxUint256?.toString(),
      };
    } catch (e) {
      // Failed to parse
    }
  }

  return null;
}

/**
 * Get token balance for an address
 * 
 * @param {ethers.Contract} tokenContract - Token contract instance
 * @param {string} address - Wallet address
 * @returns {BigInt} Token balance
 */
async function getTokenBalance(tokenContract, address) {
  try {
    return await tokenContract.balanceOf(address);
  } catch (e) {
    return ethers.constants.Zero;
  }
}

/**
 * Get token allowance
 * 
 * @param {ethers.Contract} tokenContract - Token contract instance
 * @param {string} owner - Owner address
 * @param {string} spender - Spender address
 * @returns {BigInt} Allowance
 */
async function getTokenAllowance(tokenContract, owner, spender) {
  try {
    return await tokenContract.allowance(owner, spender);
  } catch (e) {
    return ethers.constants.Zero;
  }
}

/**
 * Check if approval is unlimited
 * 
 * @param {BigInt} allowance - Allowance amount
 * @returns {boolean}
 */
function isUnlimitedApproval(allowance) {
  const maxUint256 = ethers.constants.MaxUint256;
  return allowance.eq(maxUint256);
}

/**
 * Create ERC20 contract instance
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} tokenAddress - Token contract address
 * @returns {ethers.Contract} Contract instance
 */
function createERC20Contract(provider, tokenAddress) {
  return new ethers.Contract(
    tokenAddress,
    getERC20ABI(),
    provider
  );
}

/**
 * Get token metadata
 * 
 * @param {ethers.Contract} tokenContract - Token contract instance
 * @returns {object} Token metadata
 */
async function getTokenMetadata(tokenContract) {
  try {
    const [name, symbol, decimals] = await Promise.all([
      tokenContract.name(),
      tokenContract.symbol(),
      tokenContract.decimals(),
    ]);

    return {
      name,
      symbol,
      decimals,
    };
  } catch (e) {
    return {
      name: 'Unknown',
      symbol: '???',
      decimals: 18,
    };
  }
}

/**
 * Scan wallet for ERC20 tokens
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} walletAddress - Wallet to scan
 * @param {string[]} tokenAddresses - Token addresses to check
 * @returns {Promise<Array>} List of tokens with balances
 */
async function scanWalletERC20(provider, walletAddress, tokenAddresses) {
  const results = [];

  for (const tokenAddress of tokenAddresses) {
    try {
      const contract = createERC20Contract(provider, tokenAddress);
      const balance = await getTokenBalance(contract, walletAddress);

      if (balance.gt(0)) {
        const metadata = await getTokenMetadata(contract);
        results.push({
          address: tokenAddress,
          ...metadata,
          balance: balance.toString(),
          balanceFormatted: ethers.formatUnits(balance, metadata.decimals),
        });
      }
    } catch (e) {
      // Skip invalid tokens
    }
  }

  return results;
}

/**
 * Get all approvals for a wallet
 * 
 * @param {ethers.Provider} provider - Ethers provider
 * @param {string} walletAddress - Wallet address
 * @param {string[]} tokenAddresses - Token addresses to check
 * @returns {Promise<Array>} List of approvals
 */
async function getWalletApprovals(provider, walletAddress, tokenAddresses) {
  const results = [];

  for (const tokenAddress of tokenAddresses) {
    try {
      const contract = createERC20Contract(provider, tokenAddress);
      const metadata = await getTokenMetadata(contract);
      
      // Get common spender addresses
      const commonSpenders = [
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Router
        '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router
        '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', // SushiSwap Router
      ];

      for (const spender of commonSpenders) {
        const allowance = await getTokenAllowance(contract, walletAddress, spender);
        
        if (allowance.gt(0)) {
          results.push({
            token: tokenAddress,
            tokenSymbol: metadata.symbol,
            spender,
            allowance: allowance.toString(),
            isUnlimited: isUnlimitedApproval(allowance),
          });
        }
      }
    } catch (e) {
      // Skip invalid tokens
    }
  }

  return results;
}

module.exports = {
  ERC20_SELECTORS,
  detectERC20Transfer,
  detectERC20Approval,
  getTokenBalance,
  getTokenAllowance,
  isUnlimitedApproval,
  createERC20Contract,
  getTokenMetadata,
  scanWalletERC20,
  getWalletApprovals,
};
