const { ethers } = require("ethers");
const { NonceManager } = require("../utils/nonce-manager");

/**
 * ETH Rescue - Handles ETH transfer rescue operations
 */
class ETHRescue {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.nonceManager = new NonceManager(provider, wallet.address);
  }

  /**
   * Create ETH rescue transaction
   * @param {string} safeAddress - Target safe address
   * @param {Object} gasConfig - Gas configuration
   * @returns {Promise<Object>}
   */
  async createRescueTx(safeAddress, gasConfig) {
    const balance = await this.provider.getBalance(this.wallet.address);

    if (balance === 0n) {
      return null;
    }

    // Estimate gas for transfer
    const gasLimit = await this.estimateGas(safeAddress);

    // Calculate gas cost
    const gasCost = gasLimit * gasConfig.maxFeePerGas;

    // Calculate amount to send (balance - gas cost)
    const amountToSend = balance > gasCost ? balance - gasCost : 0n;

    if (amountToSend === 0n) {
      console.log("Insufficient balance to cover gas");
      return null;
    }

    const tx = {
      to: safeAddress,
      value: amountToSend,
      gasLimit,
      maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
      maxFeePerGas: gasConfig.maxFeePerGas,
      nonce: await this.getNonce(),
      type: 2, // EIP-1559
      chainId: (await this.provider.getNetwork()).chainId,
    };

    return tx;
  }

  /**
   * Estimate gas for ETH transfer
   */
  async estimateGas(to) {
    try {
      return await this.provider.estimateGas({
        from: this.wallet.address,
        to,
        value: 1n,
      });
    } catch {
      return 21000n;
    }
  }

  /**
   * Get next nonce with lock to prevent collisions
   */
  async getNonce() {
    return await this.nonceManager.acquireNonce();
  }

  /**
   * Reset nonce cache after confirmed transaction
   */
  resetNonceCache() {
    this.nonceManager.resetCache();
  }

  /**
   * Execute ETH rescue
   * @param {string} safeAddress - Target safe address
   * @param {Object} gasConfig - Gas configuration
   * @returns {Promise<Object|null>}
   */
  async rescue(safeAddress, gasConfig) {
    const tx = await this.createRescueTx(safeAddress, gasConfig);

    if (!tx) {
      return null;
    }

    try {
      const populatedTx = await this.wallet.populateTransaction(tx);
      const signedTx = await this.wallet.signTransaction(populatedTx);
      
      console.log(`[ETH Rescue] Prepared: ${ethers.formatEther(tx.value)} ETH to ${safeAddress}`);
      
      return {
        transaction: populatedTx,
        signedTransaction: signedTx,
        amount: tx.value,
        to: safeAddress,
      };
    } catch (error) {
      console.error("[ETH Rescue] Error:", error.message);
      return null;
    }
  }

  /**
   * Check if ETH rescue is needed
   * @param {bigint} minBalance - Minimum balance threshold
   */
  async shouldRescue(minBalance = 0n) {
    const balance = await this.provider.getBalance(this.wallet.address);
    return balance > minBalance;
  }

  /**
   * Get current ETH balance
   */
  async getBalance() {
    return await this.provider.getBalance(this.wallet.address);
  }
}

/**
 * Simple ETH transfer function
 */
async function rescueETH(wallet, safeAddress, amount, gasConfig) {
  const provider = wallet.provider;
  const balance = await provider.getBalance(wallet.address);

  if (balance < amount) {
    throw new Error("Insufficient balance");
  }

  const tx = {
    to: safeAddress,
    value: amount,
    gasLimit: 21000,
    maxPriorityFeePerGas: gasConfig.maxPriorityFeePerGas,
    maxFeePerGas: gasConfig.maxFeePerGas,
    nonce: await provider.getTransactionCount(wallet.address, "pending"),
    type: 2,
    chainId: (await provider.getNetwork()).chainId,
  };

  return wallet.signTransaction(tx);
}

module.exports = {
  ETHRescue,
  rescueETH,
};
