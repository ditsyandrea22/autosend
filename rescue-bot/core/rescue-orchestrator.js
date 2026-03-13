const { ethers } = require("ethers");
const { RPC_URL, PRIVATE_KEY, TO_ADDRESS, TOKEN_ADDRESSES, NFT_ADDRESSES } = require("../config/env");

// AI Components
const { DrainerClassifier } = require("../ai/drainer-classifier");
const { TransactionRiskAnalyzer } = require("../ai/tx-risk-analyzer");

// Strategy Components
const { GasPredictor } = require("../strategy/gas-predictor");
const { BundleOptimizer } = require("../strategy/bundle-optimizer");
const { BlockTargeter } = require("../strategy/block-targeter");

// Rescue Components
const { ETHRescue } = require("../rescue/eth-rescue");
const { ERC20Rescue } = require("../rescue/erc20-rescue");
const { NFTRescue } = require("../rescue/nft-rescue");
const { ApprovalRevoke } = require("../rescue/approval-revoke");

// Relay Components
const { FlashbotsRelay } = require("../relay/flashbots-relay");
const { BuilderBroadcast } = require("../relay/builder-broadcast");

// Infrastructure
const { LatencyMonitor } = require("../infra/latency-monitor");
const { MempoolEngine } = require("./mempool-engine");

/**
 * Rescue Orchestrator - Coordinates all rescue operations
 */
class RescueOrchestrator {
  constructor(config = {}) {
    this.config = {
      rpcUrl: config.rpcUrl || RPC_URL,
      privateKey: config.privateKey || PRIVATE_KEY,
      safeAddress: config.safeAddress || TO_ADDRESS,
      tokenAddresses: config.tokenAddresses || TOKEN_ADDRESSES || [],
      nftAddresses: config.nftAddresses || NFT_ADDRESSES || [],
      ...config,
    };

    // Initialize provider and wallet
    this.provider = new ethers.providers.JsonRpcProvider(this.config.rpcUrl);
    this.wallet = new ethers.Wallet(this.config.privateKey, this.provider);

    // Initialize components
    this.initComponents();
    
    // State
    this.isRunning = false;
    this.lastRescueBlock = 0;
    this.rescueAttempts = 0;
  }

  /**
   * Initialize all components
   */
  initComponents() {
    // AI Components
    this.drainerClassifier = new DrainerClassifier(this.provider);
    this.riskAnalyzer = new TransactionRiskAnalyzer(this.provider);

    // Strategy Components
    this.gasPredictor = new GasPredictor(this.provider);
    this.bundleOptimizer = new BundleOptimizer(this.provider);
    this.blockTargeter = new BlockTargeter(this.provider);

    // Rescue Components
    this.ethRescue = new ETHRescue(this.provider, this.wallet);
    this.erc20Rescue = new ERC20Rescue(this.provider, this.wallet);
    this.nftRescue = new NFTRescue(this.provider, this.wallet);
    this.approvalRevoke = new ApprovalRevoke(this.provider, this.wallet);

    // Relay Components
    this.flashbotsRelay = new FlashbotsRelay(this.provider);
    this.builderBroadcast = new BuilderBroadcast(this.provider);

    // Infrastructure
    this.latencyMonitor = new LatencyMonitor();
    this.mempoolEngine = new MempoolEngine(this.provider, this.wallet.address);

    console.log("[Rescue Orchestrator] All components initialized");
  }

  /**
   * Initialize the system
   */
  async initialize() {
    console.log("[Rescue Orchestrator] Initializing...");
    
    // Initialize Flashbots
    await this.flashbotsRelay.initialize();
    
    // Enable builders
    this.builderBroadcast.enableAllBuilders();

    // Setup mempool monitoring
    this.setupMempoolMonitoring();

    console.log("[Rescue Orchestrator] Initialization complete");
  }

  /**
   * Setup mempool monitoring for drainer detection
   */
  setupMempoolMonitoring() {
    this.mempoolEngine.setDrainerCallback(async (drainerTx) => {
      console.log("[Rescue Orchestrator] 🚨 DRAINER DETECTED! Initiating emergency rescue...");
      await this.executeRescue(drainerTx);
    });

    this.mempoolEngine.startMonitoring();
  }

  /**
   * Run rescue on new block
   */
  async run(blockNumber) {
    if (!this.isRunning) return;

    const timing = this.latencyMonitor.measure("block_processing", async () => {
      // Update components with new block
      await this.gasPredictor.updateHistory(blockNumber);
      await this.drainerClassifier.updateGasHistory(blockNumber);
      await this.blockTargeter.updateBlock(blockNumber);

      // Check if we should run rescue
      if (blockNumber > this.lastRescueBlock + 1) {
        await this.executeRescue();
      }
    });

    await timing;
  }

  /**
   * Execute rescue operation
   */
  async executeRescue(triggerTx = null) {
    console.log("\n[Rescue Orchestrator] Starting rescue operation...");
    this.rescueAttempts++;
    this.lastRescueBlock = await this.provider.getBlockNumber();

    try {
      // Get gas configuration
      const gasConfig = await this.gasPredictor.getRescueGas(0, true);

      // Build rescue bundle
      const bundle = await this.buildRescueBundle(gasConfig);

      if (bundle.length === 0) {
        console.log("[Rescue Orchestrator] No assets to rescue");
        return;
      }

      // Optimize bundle
      const optimized = await this.bundleOptimizer.optimizeWithGas(bundle, this.wallet);
      
      console.log(`[Rescue Orchestrator] Bundle contains ${optimized.transactions.length} transactions`);

      // Sign bundle
      const signedTxs = await this.signBundle(optimized.transactions);
      const signedBundle = this.bundleOptimizer.createSignedBundle(signedTxs);

      // Simulate
      const simResult = await this.flashbotsRelay.simulateBundle(
        this.bundleOptimizer.createSignedBundle(signedTxs),
        this.lastRescueBlock + 1
      );

      if (!simResult.success) {
        console.log("[Rescue Orchestrator] ⚠️ Simulation failed:", simResult.error);
        // Continue anyway in emergency
      }

      // Get target blocks
      const targetBlocks = this.blockTargeter.getTargetBlocks(this.lastRescueBlock);
      console.log(`[Rescue Orchestrator] Targeting blocks: ${targetBlocks.join(", ")}`);

      // Send to Flashbots
      const results = await this.flashbotsRelay.sendBundleToMultipleBlocks(
        this.bundleOptimizer.createSignedBundle(signedTxs),
        targetBlocks
      );

      // Also broadcast to other builders
      await this.builderBroadcast.broadcast(
        this.bundleOptimizer.createSignedBundle(signedTxs),
        this.lastRescueBlock + 1
      );

      console.log("[Rescue Orchestrator] ✓ Rescue bundle sent");

    } catch (error) {
      console.error("[Rescue Orchestrator] Rescue error:", error.message);
    }
  }

  /**
   * Build rescue bundle
   */
  async buildRescueBundle(gasConfig) {
    const transactions = [];

    // 1. Check and add approvals to revoke (if any known)
    // This would typically query an approval tracker

    // 2. Add ERC20 rescues
    if (this.config.tokenAddresses.length > 0) {
      const tokensWithBalance = await this.erc20Rescue.getTokensWithBalance(
        this.config.tokenAddresses
      );
      
      for (const token of tokensWithBalance) {
        const tx = await this.erc20Rescue.createRescueTx(
          token.token,
          this.config.safeAddress,
          gasConfig
        );
        if (tx) {
          transactions.push(tx);
        }
      }
    }

    // 3. Add NFT rescues
    // Simplified - would need token ID tracking in production
    if (this.config.nftAddresses.length > 0) {
      const nfts = await this.nftRescue.getOwnedNFTs(this.config.nftAddresses);
      // Would need to track specific token IDs
    }

    // 4. Add ETH rescue (always try)
    const ethTx = await this.ethRescue.createRescueTx(
      this.config.safeAddress,
      gasConfig
    );
    if (ethTx) {
      transactions.push(ethTx);
    }

    return transactions;
  }

  /**
   * Sign bundle transactions
   */
  async signBundle(transactions) {
    const signed = [];
    
    for (const tx of transactions) {
      try {
        const populatedTx = await this.wallet.populateTransaction(tx);
        const signedTx = await this.wallet.signTransaction(populatedTx);
        signed.push(signedTx);
      } catch (error) {
        console.error("[Rescue Orchestrator] Signing error:", error.message);
      }
    }

    return signed;
  }

  /**
   * Start the orchestrator
   */
  async start() {
    await this.initialize();
    this.isRunning = true;

    // Start block monitoring
    this.provider.on("block", async (blockNumber) => {
      await this.run(blockNumber);
    });

    console.log("[Rescue Orchestrator] Started - Monitoring for drainer attacks");
  }

  /**
   * Stop the orchestrator
   */
  stop() {
    this.isRunning = false;
    this.mempoolEngine.stopMonitoring();
    this.provider.removeAllListeners("block");
    console.log("[Rescue Orchestrator] Stopped");
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      wallet: this.wallet.address,
      safeAddress: this.config.safeAddress,
      rescueAttempts: this.rescueAttempts,
      mempoolStats: this.mempoolEngine.getStats(),
      latencyReport: this.latencyMonitor.generateReport(),
    };
  }
}

module.exports = {
  RescueOrchestrator,
};
