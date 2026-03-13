const { ethers } = require("ethers");

/**
 * ERC20 ABI for basic token operations
 */
const ERC20_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function transfer(address,uint256) returns(bool)",
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function approve(address,uint256) returns(bool)",
];

/**
 * ERC20 Rescue - Handles ERC20 token rescue operations
 */
class ERC20Rescue {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.tokenCache = new Map();
  }

  /**
   * Get ERC20 contract instance
   * @param {string} tokenAddress - Token contract address
   */
  getContract(tokenAddress) {
    return new ethers.Contract(tokenAddress, ERC20_ABI, this.wallet);
  }

  /**
   * Get token info (symbol, decimals)
   * @param {string} tokenAddress - Token contract address
   */
  async getTokenInfo(tokenAddress) {
    if (this.tokenCache.has(tokenAddress)) {
      return this.tokenCache.get(tokenAddress);
    }

    try {
      const contract = this.getContract(tokenAddress);
      const [symbol, decimals] = await Promise.all([
        contract.symbol(),
        contract.decimals(),
      ]);

      const info = { symbol, decimals: Number(decimals) };
      this.tokenCache.set(tokenAddress, info);
      return info;
    } catch (error) {
      console.error(`[ERC20 Rescue] Error getting token info for ${tokenAddress}:`, error.message);
      return { symbol: "UNKNOWN", decimals: 18 };
    }
  }

  /**
   * Get token balance
   * @param {string} tokenAddress - Token contract address
   * @param {string} walletAddress - Wallet address to check
   */
  async getBalance(tokenAddress, walletAddress) {
    try {
      const contract = this.getContract(tokenAddress);
      return await contract.balanceOf(walletAddress);
    } catch (error) {
      console.error(`[ERC20 Rescue] Error getting balance:`, error.message);
      return 0n;
    }
  }

  /**
   * Create ERC20 rescue transaction
   * @param {string} tokenAddress - Token contract address
   * @param {string} safeAddress - Target safe address
   * @param {Object} gasConfig - Gas configuration
   * @returns {Promise<Object|null>}
   */
  async createRescueTx(tokenAddress, safeAddress, gasConfig) {
    const balance = await this.getBalance(tokenAddress, this.wallet.address);

    if (balance === 0n) {
      return null;
    }

    const contract = this.getContract(tokenAddress);
    const tokenInfo = await this.getTokenInfo(tokenAddress);

    const tx = await contract.transfer.populateTransaction(safeAddress, balance);

    // Add gas config
    tx.gasLimit = await this.estimateGas(tx);
    tx.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
    tx.maxFeePerGas = gasConfig.maxFeePerGas;
    tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
    tx.type = 2;
    tx.chainId = (await this.provider.getNetwork()).chainId;

    return {
      ...tx,
      tokenInfo,
      amount: balance,
      tokenAddress,
    };
  }

  /**
   * Estimate gas for ERC20 transfer
   */
  async estimateGas(tx) {
    try {
      return await this.provider.estimateGas({
        ...tx,
        from: this.wallet.address,
      });
    } catch {
      return 65000n;
    }
  }

  /**
   * Execute ERC20 rescue for multiple tokens
   * @param {Array} tokens - Array of token addresses
   * @param {string} safeAddress - Target safe address
   * @param {Object} gasConfig - Gas configuration
   * @returns {Promise<Array>}
   */
  async rescueMultiple(tokens, safeAddress, gasConfig) {
    const results = [];

    for (const token of tokens) {
      const result = await this.rescue(token, safeAddress, gasConfig);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Execute ERC20 rescue
   * @param {string} tokenAddress - Token contract address
   * @param {string} safeAddress - Target safe address
   * @param {Object} gasConfig - Gas configuration
   * @returns {Promise<Object|null>}
   */
  async rescue(tokenAddress, safeAddress, gasConfig) {
    const tx = await this.createRescueTx(tokenAddress, safeAddress, gasConfig);

    if (!tx) {
      return null;
    }

    try {
      const populatedTx = await this.wallet.populateTransaction(tx);
      const signedTx = await this.wallet.signTransaction(populatedTx);
      
      const tokenInfo = tx.tokenInfo;
      const formattedAmount = ethers.formatUnits(tx.amount, tokenInfo.decimals);
      
      console.log(`[ERC20 Rescue] Prepared: ${formattedAmount} ${tokenInfo.symbol} to ${safeAddress}`);
      
      return {
        transaction: populatedTx,
        signedTransaction: signedTx,
        amount: tx.amount,
        formattedAmount,
        tokenAddress,
        symbol: tokenInfo.symbol,
        to: safeAddress,
      };
    } catch (error) {
      console.error("[ERC20 Rescue] Error:", error.message);
      return null;
    }
  }

  /**
   * Check which tokens have balance
   * @param {Array} tokens - Array of token addresses
   */
  async getTokensWithBalance(tokens) {
    const results = [];

    for (const token of tokens) {
      const balance = await this.getBalance(token, this.wallet.address);
      if (balance > 0n) {
        const info = await this.getTokenInfo(token);
        results.push({
          token,
          balance,
          formatted: ethers.formatUnits(balance, info.decimals),
          symbol: info.symbol,
        });
      }
    }

    return results;
  }
}

/**
 * Simple rescueERC20 function as shown in architecture
 */
async function rescueERC20(token, wallet, safe) {
  const ERC20_ABI = [
    "function balanceOf(address) view returns(uint256)",
    "function transfer(address,uint256)",
  ];

  const contract = new ethers.Contract(token, ERC20_ABI, wallet);
  const balance = await contract.balanceOf(wallet.address);

  if (balance === 0n) return null;

  return contract.transfer.populateTransaction(safe, balance);
}

module.exports = {
  ERC20Rescue,
  rescueERC20,
  ERC20_ABI,
};
