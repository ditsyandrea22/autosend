const { ethers } = require("ethers");

/**
 * Bundle Optimizer - Optimizes rescue bundles for maximum success
 * Orders transactions strategically to maximize rescue effectiveness
 */
class BundleOptimizer {
  constructor(provider) {
    this.provider = provider;
    this.gasEstimates = new Map();
  }

  /**
   * Transaction types for ordering
   */
  TRANSACTION_TYPES = {
    APPROVAL_REVOKE: 0,
    ERC20_TRANSFER: 1,
    NFT_TRANSFER: 2,
    ETH_TRANSFER: 3,
  };

  /**
   * Optimal bundle ordering
   * Approval revoke must come first to prevent drainer from using approvals
   * Asset transfers come second
   * ETH transfer comes last
   */
  OPTIMAL_ORDER = [
    this.TRANSACTION_TYPES.APPROVAL_REVOKE,
    this.TRANSACTION_TYPES.ERC20_TRANSFER,
    this.TRANSACTION_TYPES.NFT_TRANSFER,
    this.TRANSACTION_TYPES.ETH_TRANSFER,
  ];

  /**
   * Optimize bundle by ordering transactions optimally
   * @param {Array} transactions - Array of unsigned transactions
   * @returns {Array} - Optimized transactions
   */
  optimizeBundle(transactions) {
    const typed = transactions.map((tx, index) => ({
      ...tx,
      originalIndex: index,
      type: this.categorizeTransaction(tx),
    }));

    // Sort by optimal order
    typed.sort((a, b) => {
      const orderA = this.OPTIMAL_ORDER.indexOf(a.type);
      const orderB = this.OPTIMAL_ORDER.indexOf(b.type);
      return orderA - orderB;
    });

    return typed;
  }

  /**
   * Categorize transaction type
   */
  categorizeTransaction(tx) {
    const data = tx.data?.toLowerCase() || "";

    // Approval revoke (setting to address(0) or zero amount)
    if (data.startsWith("0x095ea7b3")) {
      const amount = data.slice(-64);
      if (amount === "0".repeat(64) || amount.slice(-40) === "0".repeat(40)) {
        return this.TRANSACTION_TYPES.APPROVAL_REVOKE;
      }
    }

    // NFT transfers
    if (
      data.startsWith("0xb88d4fde") || // safeTransferFrom with data
      data.startsWith("0x42842e0e") || // safeTransferFrom without data
      data.startsWith("0xf242432a") || // safeTransferFrom
      data.startsWith("0x2eb2c2d6")
    ) {
      return this.TRANSACTION_TYPES.NFT_TRANSFER;
    }

    // ERC20 transfers
    if (
      data.startsWith("0xa9059cbb") || // transfer
      data.startsWith("0x23b872dd") // transferFrom
    ) {
      return this.TRANSACTION_TYPES.ERC20_TRANSFER;
    }

    // ETH transfer (no data or empty data)
    if (!data || data === "0x") {
      return this.TRANSACTION_TYPES.ETH_TRANSFER;
    }

    // Default - treat as ERC20
    return this.TRANSACTION_TYPES.ERC20_TRANSFER;
  }

  /**
   * Estimate gas for each transaction in bundle
   * @param {Array} transactions - Array of transactions
   * @param {Object} wallet - Signer wallet
   * @returns {Promise<Array>}
   */
  async estimateBundleGas(transactions, wallet) {
    const results = [];

    for (const tx of transactions) {
      try {
        const gasEstimate = await this.provider.estimateGas({
          ...tx,
          from: wallet.address,
        });
        results.push({ tx, gasEstimate, success: true });
        this.gasEstimates.set(tx.hash || Math.random().toString(), gasEstimate);
      } catch (error) {
        // Use fallback estimates based on transaction type
        const fallback = this.getFallbackGas(tx);
        results.push({ tx, gasEstimate: fallback, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get fallback gas estimate based on transaction type
   */
  getFallbackGas(tx) {
    const type = this.categorizeTransaction(tx);
    const fallbacks = {
      [this.TRANSACTION_TYPES.APPROVAL_REVOKE]: 50000n,
      [this.TRANSACTION_TYPES.ERC20_TRANSFER]: 65000n,
      [this.TRANSACTION_TYPES.NFT_TRANSFER]: 85000n,
      [this.TRANSACTION_TYPES.ETH_TRANSFER]: 21000n,
    };
    return fallbacks[type] || 50000n;
  }

  /**
   * Calculate total gas for bundle
   * @param {Array} gasEstimates - Array of gas estimates
   * @returns {bigint}
   */
  calculateTotalGas(gasEstimates) {
    return gasEstimates.reduce((total, { gasEstimate }) => total + gasEstimate, 0n);
  }

  /**
   * Optimize bundle with gas calculations
   * @param {Array} transactions - Array of transactions
   * @param {Object} wallet - Signer wallet
   * @returns {Promise<Object>}
   */
  async optimizeWithGas(transactions, wallet) {
    // Optimize order
    const optimized = this.optimizeBundle(transactions);

    // Estimate gas
    const gasEstimates = await this.estimateBundleGas(optimized, wallet);

    // Calculate totals
    const totalGas = this.calculateTotalGas(gasEstimates);

    return {
      transactions: optimized,
      gasEstimates,
      totalGas,
      order: this.getOrderSummary(optimized),
    };
  }

  /**
   * Get order summary for logging
   */
  getOrderSummary(transactions) {
    return transactions.map((tx, i) => ({
      order: i + 1,
      type: Object.keys(this.TRANSACTION_TYPES).find(
        (key) => this.TRANSACTION_TYPES[key] === tx.type
      ),
      to: tx.to,
      value: tx.value?.toString(),
    }));
  }

  /**
   * Add buffer to gas estimates
   * @param {bigint} totalGas - Total gas estimate
   * @param {number} bufferPercent - Buffer percentage
   * @returns {bigint}
   */
  addGasBuffer(totalGas, bufferPercent = 20) {
    return totalGas * BigInt(100 + bufferPercent) / 100n;
  }

  /**
   * Split large bundle into smaller bundles if needed
   * @param {Array} transactions - Array of transactions
   * @param {bigint} maxGasPerBundle - Maximum gas per bundle
   * @returns {Array} - Array of bundle arrays
   */
  splitBundle(transactions, maxGasPerBundle = 3000000n) {
    const bundles = [];
    let currentBundle = [];
    let currentGas = 0n;

    for (const tx of transactions) {
      const txGas = this.getFallbackGas(tx);
      if (currentGas + txGas > maxGasPerBundle && currentBundle.length > 0) {
        bundles.push(currentBundle);
        currentBundle = [];
        currentGas = 0n;
      }
      currentBundle.push(tx);
      currentGas += txGas;
    }

    if (currentBundle.length > 0) {
      bundles.push(currentBundle);
    }

    return bundles;
  }

  /**
   * Create signed bundle for Flashbots
   * @param {Array} signedTransactions - Array of signed transactions
   * @returns {Array}
   */
  createSignedBundle(signedTransactions) {
    return signedTransactions.map((signedTx) => ({
      signedTransaction: signedTx,
    }));
  }
}

/**
 * Example bundle creation as shown in architecture
 */
function createExampleBundle(revokeTx, erc20TransferTx, nftTransferTx, ethTransferTx) {
  return [
    revokeTx,
    erc20TransferTx,
    nftTransferTx,
    ethTransferTx,
  ];
}

module.exports = {
  BundleOptimizer,
  createExampleBundle,
};
