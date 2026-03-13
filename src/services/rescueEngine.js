/**
 * Rescue Engine Service
 * Core rescue logic - builds and executes rescue transactions
 */

const { ethers, BigNumber } = require("ethers");
const { BLOCKS, BUNDLE } = require("../config/constants");
const { logger } = require("../utils/logger");
const { sleep } = require("../utils/sleep");
const { getGas, getGasLimit, calculateSendAmount } = require("../strategies/gasStrategy");
const { NonceManager } = require("../strategies/nonceManager");
const { createFlashbotsService } = require("./flashbots");

/**
 * RescueEngine - Main rescue execution engine
 */
class RescueEngine {
  /**
   * @param {Object} config - Configuration
   */
  constructor(config) {
    this.provider = config.provider;
    this.wallet = config.wallet;
    this.rescueAddress = config.rescueAddress;
    this.isUnderAttack = config.isUnderAttack || false;
    
    // Initialize components
    this.nonceManager = new NonceManager(this.provider, this.wallet.address);
    this.flashbotsService = createFlashbotsService(this.provider, this.wallet, {
      authSigner: config.authSigner,
      relays: config.relays,
    });
    
    this.isRunning = false;
    this.lastRescueBlock = 0;
  }

  /**
   * Set attack mode
   * @param {boolean} isUnderAttack 
   */
  setAttackMode(isUnderAttack) {
    this.isUnderAttack = isUnderAttack;
    logger.info("Attack mode:", isUnderAttack);
  }

  /**
   * Execute rescue operation
   * @param {Object} attackTx - The attacking transaction (optional)
   */
  async rescue(attackTx = null) {
    logger.info("Starting rescue operation");

    try {
      // Get current balance
      const balance = await this.provider.getBalance(this.wallet.address);
      
      if (balance.eq(BigNumber.from(0))) {
        logger.info("Balance is zero, nothing to rescue");
        return null;
      }

      // Get gas with appropriate multiplier
      const gas = await getGas(this.provider, this.isUnderAttack);
      const gasLimit = getGasLimit("eth");

      // Calculate amount to send
      const amountToSend = calculateSendAmount(balance, gas.maxFeePerGas, gasLimit);

      if (amountToSend.eq(BigNumber.from(0))) {
        logger.warn("Insufficient balance to cover gas");
        return null;
      }

      // Get nonce
      const nonce = await this.nonceManager.acquireNonce();

      // Build transaction
      const tx = {
        to: this.rescueAddress,
        value: amountToSend,
        gasLimit: gasLimit,
        maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
        maxFeePerGas: gas.maxFeePerGas,
        nonce: nonce,
        type: 2, // EIP-1559
        chainId: (await this.provider.getNetwork()).chainId,
      };

      logger.rescueAttempt("building", ethers.formatEther(amountToSend) + " ETH");

      // Get current block
      const currentBlock = await this.provider.getBlockNumber();
      const targetBlock = currentBlock + BLOCKS.TARGET_BLOCKS_AHEAD;

      // Send bundle
      await this.flashbotsService.sendBundleWithRetry(
        tx,
        targetBlock,
        BUNDLE.MAX_RETRIES
      );

      // Reset nonce cache after successful send
      this.nonceManager.resetCache();
      
      return tx;
    } catch (error) {
      logger.error("Rescue failed:", error.message);
      throw error;
    }
  }

  /**
   * Execute rescue with ERC20 support
   * @param {string} tokenAddress - ERC20 token address
   * @param {boolean} revokeApproval - Whether to revoke approval
   */
  async rescueERC20(tokenAddress, revokeApproval = true) {
    logger.info("Starting ERC20 rescue", { tokenAddress, revokeApproval });

    const token = new ethers.Contract(
      tokenAddress,
      [
        "function transfer(address to, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)",
        "function approve(address spender, uint256 amount) returns (bool)",
        "function allowance(address owner, address spender) view returns (uint256)",
      ],
      this.wallet
    );

    const balance = await token.balanceOf(this.wallet.address);
    
    if (balance.eq(BigNumber.from(0))) {
      logger.info("Token balance is zero");
      return null;
    }

    // Get gas
    const gas = await getGas(this.provider, this.isUnderAttack);
    const gasLimit = getGasLimit("erc20");

    // Get nonce
    let nonce = await this.nonceManager.acquireNonce();

    // If revokeApproval is requested, first revoke all approvals
    if (revokeApproval) {
      try {
        // Get current nonce to check for pending txs
        const currentNonce = await this.provider.getTransactionCount(this.wallet.address, "pending");
        nonce = currentNonce;
        
        // Find and revoke all approvals
        await this._revokeTokenApprovals(token, tokenAddress, gas, nonce);
        nonce++;
      } catch (error) {
        logger.warn("Failed to revoke approvals:", error.message);
        // Continue with rescue even if revocation fails
      }
    }

    // Build transfer transaction
    const tx = {
      to: tokenAddress,
      data: token.interface.encodeFunctionData("transfer", [this.rescueAddress, balance]),
      gasLimit: gasLimit,
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
      maxFeePerGas: gas.maxFeePerGas,
      nonce: nonce,
      type: 2,
      chainId: (await this.provider.getNetwork()).chainId,
    };

    logger.rescueAttempt("ERC20", ethers.formatEther(balance));

    // Send bundle
    const currentBlock = await this.provider.getBlockNumber();
    await this.flashbotsService.sendBundleWithRetry(tx, currentBlock + 1);

    this.nonceManager.resetCache();
    return tx;
  }

  /**
   * Revoke all token approvals to prevent further transfers
   * @param {Object} token - Token contract
   * @param {string} tokenAddress - Token address
   * @param {Object} gas - Gas settings
   * @param {number} startNonce - Starting nonce
   */
  async _revokeTokenApprovals(token, tokenAddress, gas, startNonce) {
    // Common drainer addresses to check for approvals
    const KNOWN_DRAINERS = [
      "0x0000000000000000000000000000000000000000", // Clear approvals
    ];

    // We'll try to revoke approval to zero address (common pattern)
    // First, let's get the gas limit for approval revocation
    const gasLimit = getGasLimit("erc20");

    // Build approval revocation transaction (set to zero)
    const revokeTx = {
      to: tokenAddress,
      data: token.interface.encodeFunctionData("approve", [this.rescueAddress, 0]),
      gasLimit: gasLimit,
      maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
      maxFeePerGas: gas.maxFeePerGas,
      nonce: startNonce,
      type: 2,
      chainId: (await this.provider.getNetwork()).chainId,
    };

    logger.info("Sending approval revocation tx");
    
    try {
      const currentBlock = await this.provider.getBlockNumber();
      await this.flashbotsService.sendBundleWithRetry(revokeTx, currentBlock + 1);
      logger.info("Approval revocation sent");
    } catch (error) {
      logger.warn("Approval revocation failed:", error.message);
    }
  }

  /**
   * Start continuous rescue monitoring
   */
  async startContinuous() {
    this.isRunning = true;
    logger.info("Starting continuous rescue mode");

    while (this.isRunning) {
      try {
        await this.rescue();
      } catch (error) {
        logger.error("Continuous rescue error:", error.message);
      }

      // Wait before next attempt
      await sleep(BLOCKS.BLOCK_TIME_SECONDS * 1000);
    }
  }

  /**
   * Stop rescue engine
   */
  stop() {
    this.isRunning = false;
    logger.info("Rescue engine stopped");
  }
}

/**
 * Create rescue engine instance
 * @param {Object} config 
 * @returns {RescueEngine}
 */
function createRescueEngine(config) {
  return new RescueEngine(config);
}

module.exports = {
  RescueEngine,
  createRescueEngine,
};
