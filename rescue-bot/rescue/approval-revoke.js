const { ethers } = require("ethers");

/**
 * Approval ABI for revoke operations
 */
const APPROVAL_ABI = [
  "function approve(address,uint256) returns(bool)",
  "function increaseAllowance(address,uint256) returns(bool)",
  "function decreaseAllowance(address,uint256) returns(bool)",
];

/**
 * ApprovalRevoke - Handles approval revocation for token contracts
 * Critical for preventing drainer attacks
 */
class ApprovalRevoke {
  constructor(provider, wallet) {
    this.provider = provider;
    this.wallet = wallet;
    this.revokedApprovals = new Set();
  }

  /**
   * Get contract instance
   */
  getContract(tokenAddress) {
    return new ethers.Contract(tokenAddress, APPROVAL_ABI, this.wallet);
  }

  /**
   * Create revoke approval transaction (set allowance to 0)
   * @param {string} tokenAddress - Token contract address
   * @param {string} spender - Address to revoke approval from
   * @param {Object} gasConfig - Gas configuration
   */
  async createRevokeTx(tokenAddress, spender, gasConfig) {
    const contract = this.getContract(tokenAddress);

    try {
      const tx = await contract.approve.populateTransaction(spender, 0);
      
      tx.gasLimit = await this.estimateGas(tx);
      tx.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
      tx.maxFeePerGas = gasConfig.maxFeePerGas;
      tx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
      tx.type = 2;
      tx.chainId = (await this.provider.getNetwork()).chainId;

      return {
        ...tx,
        tokenAddress,
        spender,
        action: "REVOKE",
      };
    } catch (error) {
      console.error(`[Approval Revoke] Error creating revoke tx for ${tokenAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Estimate gas for approval
   */
  async estimateGas(tx) {
    try {
      return await this.provider.estimateGas({
        ...tx,
        from: this.wallet.address,
      });
    } catch {
      return 50000n;
    }
  }

  /**
   * Revoke single approval
   */
  async revoke(tokenAddress, spender, gasConfig) {
    const key = `${tokenAddress}-${spender}`.toLowerCase();
    
    if (this.revokedApprovals.has(key)) {
      console.log(`[Approval Revoke] Already revoked ${tokenAddress} for ${spender}`);
      return null;
    }

    const tx = await this.createRevokeTx(tokenAddress, spender, gasConfig);

    if (!tx) {
      return null;
    }

    try {
      const populatedTx = await this.wallet.populateTransaction(tx);
      const signedTx = await this.wallet.signTransaction(populatedTx);
      
      console.log(`[Approval Revoke] Prepared: Revoke ${tokenAddress} for ${spender}`);
      
      this.revokedApprovals.add(key);
      
      return {
        transaction: populatedTx,
        signedTransaction: signedTx,
        tokenAddress,
        spender,
        action: "REVOKE",
      };
    } catch (error) {
      console.error("[Approval Revoke] Error:", error.message);
      return null;
    }
  }

  /**
   * Revoke multiple approvals
   * @param {Array} approvals - Array of {token, spender} objects
   */
  async revokeMultiple(approvals, gasConfig) {
    const results = [];

    for (const { token, spender } of approvals) {
      const result = await this.revoke(token, spender, gasConfig);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Revoke all common token approvals
   * @param {Array} tokens - Array of token addresses
   * @param {Object} gasConfig - Gas configuration
   */
  async revokeAllCommon(tokens, gasConfig) {
    // Common spender addresses to revoke
    const commonSpenders = [
      "0x0000000000000000000000000000000000000000", // Zero address (null)
      // Add more common spender addresses as needed
    ];

    const results = [];

    for (const token of tokens) {
      for (const spender of commonSpenders) {
        const result = await this.revoke(token, spender, gasConfig);
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Create unlimited approval downgrade (set to 0, then small amount)
   */
  async downgradeApproval(tokenAddress, spender, gasConfig, newAllowance = 1n) {
    const results = [];

    // First revoke
    const revokeResult = await this.revoke(tokenAddress, spender, gasConfig);
    if (revokeResult) {
      results.push(revokeResult);
    }

    // Then set new limited approval
    const contract = this.getContract(tokenAddress);
    try {
      const approveTx = await contract.approve.populateTransaction(spender, newAllowance);
      
      approveTx.gasLimit = await this.estimateGas(approveTx);
      approveTx.maxPriorityFeePerGas = gasConfig.maxPriorityFeePerGas;
      approveTx.maxFeePerGas = gasConfig.maxFeePerGas;
      approveTx.nonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
      approveTx.type = 2;
      approveTx.chainId = (await this.provider.getNetwork()).chainId;

      const populatedTx = await this.wallet.populateTransaction(approveTx);
      const signedTx = await this.wallet.signTransaction(populatedTx);

      results.push({
        transaction: populatedTx,
        signedTransaction: signedTx,
        tokenAddress,
        spender,
        action: "DOWNGRADE",
        newAllowance: newAllowance.toString(),
      });
    } catch (error) {
      console.error("[Approval Revoke] Downgrade error:", error.message);
    }

    return results;
  }

  /**
   * Reset approval tracking
   */
  reset() {
    this.revokedApprovals.clear();
  }
}

/**
 * Simple revoke function as shown in architecture
 */
async function revokeApproval(token, spender, wallet) {
  const APPROVAL_ABI = [
    "function approve(address,uint256) returns(bool)",
  ];

  const contract = new ethers.Contract(token, APPROVAL_ABI, wallet);
  
  // Set approval to 0 to revoke
  return contract.approve.populateTransaction(spender, 0);
}

module.exports = {
  ApprovalRevoke,
  revokeApproval,
  APPROVAL_ABI,
};
