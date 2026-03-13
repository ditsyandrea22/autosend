/**
 * Bundle Builder
 * Builds MEV bundles for Flashbots and other relays
 */

const { ethers } = require('ethers');
const { logger } = require('../utils/logger');

/**
 * Build a rescue bundle
 * 
 * @param {ethers.Wallet} signer - Signer wallet
 * @param {Array} transactions - Array of transaction objects
 * @param {object} gasStrategy - Gas strategy parameters
 * @returns {Array} Bundle ready for relay
 */
function buildBundle(signer, transactions, gasStrategy) {
  const bundle = [];

  for (const tx of transactions) {
    // Ensure transaction has gas params
    const transaction = {
      ...tx,
      maxFeePerGas: tx.maxFeePerGas || gasStrategy.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas || gasStrategy.maxPriorityFeePerGas,
      gasLimit: tx.gasLimit || 21000,
    };

    bundle.push({
      signer,
      transaction,
    });
  }

  return bundle;
}

/**
 * Build Flashbots-compatible bundle
 * 
 * @param {ethers.Wallet} signer - Signer wallet
 * @param {Array} transactions - Array of transaction objects
 * @param {number} targetBlock - Target block number
 * @param {object} gasStrategy - Gas strategy
 * @returns {object} Flashbots bundle
 */
function buildFlashbotsBundle(signer, transactions, targetBlock, gasStrategy) {
  const formattedTransactions = transactions.map((tx) => {
    // Create transaction request
    const txRequest = {
      to: tx.to,
      from: tx.from,
      data: tx.data || '0x',
      value: tx.value || 0,
      gasLimit: tx.gasLimit || 21000,
      maxFeePerGas: tx.maxFeePerGas || gasStrategy.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas || gasStrategy.maxPriorityFeePerGas,
      nonce: tx.nonce,
      chainId: tx.chainId,
    };

    return txRequest;
  });

  return {
    txs: formattedTransactions.map((tx) => 
      signer.signTransaction(tx).then((signedTx) => signedTx)
    ),
    blockNumber: ethers.utils.hexValue(targetBlock),
  };
}

/**
 * Build multi-step bundle with dependencies
 * 
 * @param {Array} steps - Array of {signer, transaction} objects
 * @returns {Array} Ordered bundle
 */
function buildMultiStepBundle(steps) {
  return steps.map((step) => ({
    signer: step.signer,
    transaction: step.transaction,
  }));
}

/**
 * Sign transactions in bundle
 * 
 * @param {Array} bundle - Bundle to sign
 * @returns {Promise<Array>} Signed transactions
 */
async function signBundle(bundle) {
  const signedTxs = [];

  for (const item of bundle) {
    const txRequest = {
      to: item.transaction.to,
      data: item.transaction.data || '0x',
      value: item.transaction.value || 0,
      gasLimit: item.transaction.gasLimit,
      maxFeePerGas: item.transaction.maxFeePerGas,
      maxPriorityFeePerGas: item.transaction.maxPriorityFeePerGas,
      nonce: item.transaction.nonce,
      chainId: item.transaction.chainId,
    };

    const signedTx = await item.signer.signTransaction(txRequest);
    signedTxs.push(signedTx);
  }

  return signedTxs;
}

/**
 * Estimate bundle gas
 * 
 * @param {Array} transactions - Array of transactions
 * @returns {BigInt} Total estimated gas
 */
function estimateBundleGas(transactions) {
  let totalGas = 0n;

  for (const tx of transactions) {
    totalGas += BigInt(tx.gasLimit || 21000);
  }

  return totalGas;
}

/**
 * Optimize bundle for MEV
 * 
 * @param {Array} transactions - Transactions to optimize
 * @param {string} victimTxHash - Victim transaction hash
 * @returns {Array} Optimized bundle
 */
function optimizeBundleForMEV(transactions, victimTxHash) {
  // Place rescue transactions before victim transaction
  // to ensure they run first
  const optimized = transactions.map((tx) => ({
    ...tx,
    // Set gas to match or exceed victim's gas
  }));

  return optimized;
}

/**
 * Create conditional bundle
 * 
 * @param {Array} transactions - Main transactions
 * @param {object} condition - Condition for bundle execution
 * @returns {object} Conditional bundle
 */
function createConditionalBundle(transactions, condition) {
  return {
    transactions,
    condition: condition || {
      blockNumber: '>0',
    },
  };
}

/**
 * Validate bundle
 * 
 * @param {Array} bundle - Bundle to validate
 * @returns {object} Validation result
 */
function validateBundle(bundle) {
  const errors = [];
  const warnings = [];

  // Check for duplicate nonces
  const nonces = new Set();
  for (const item of bundle) {
    const nonce = item.transaction.nonce;
    if (nonces.has(nonce)) {
      errors.push(`Duplicate nonce: ${nonce}`);
    }
    nonces.add(nonce);
  }

  // Check for missing gas params
  for (const item of bundle) {
    if (!item.transaction.maxFeePerGas && !item.transaction.gasPrice) {
      warnings.push(`Missing gas price for tx with nonce ${item.transaction.nonce}`);
    }
    if (!item.transaction.gasLimit) {
      warnings.push(`Missing gas limit for tx with nonce ${item.transaction.nonce}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

module.exports = {
  buildBundle,
  buildFlashbotsBundle,
  buildMultiStepBundle,
  signBundle,
  estimateBundleGas,
  optimizeBundleForMEV,
  createConditionalBundle,
  validateBundle,
};
