/**
 * Rescue Orchestrator
 * Coordinates rescue operations across multiple strategies
 */

const { logger } = require('../utils/logger');
const { sleep } = require('../utils/sleep');
const { RescuePlanner } = require('../strategies/rescuePlanner');
const { buildBundle } = require('../bundle/bundleBuilder');
const { simulateBundle } = require('../bundle/bundleSimulator');
const { broadcastBundle } = require('../relays/relayManager');
const { retryBundle } = require('../bundle/retryEngine');
const { getGasStrategy } = require('../gas/gasEscalator');
const { metrics } = require('../monitoring/metrics');

class RescueOrchestrator {
  constructor(providers, wallets) {
    this.providers = providers;
    this.wallets = wallets;
    this.planner = new RescuePlanner(providers, wallets);
    this.destination = process.env.RESCUE_DESTINATION;
    this.maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;
    this.retryDelay = parseInt(process.env.RETRY_DELAY) || 5000;
    this.pendingRescues = new Map();
  }

  /**
   * Execute rescue for detected attack transaction
   */
  async executeRescue(attackTx, chainName) {
    const startTime = Date.now();
    const attackHash = attackTx.hash;
    
    logger.info(`[RescueOrchestrator] Executing rescue for attack ${attackHash}`);

    try {
      // Check if rescue already in progress for this wallet
      if (this.pendingRescues.has(attackTx.from.toLowerCase())) {
        logger.warn(`[RescueOrchestrator] Rescue already in progress for ${attackTx.from}`);
        return { success: false, error: 'Rescue already in progress' };
      }

      // Mark rescue in progress
      this.pendingRescues.set(attackTx.from.toLowerCase(), {
        startTime,
        attackHash,
        chainName,
      });

      // Plan rescue strategy
      const rescuePlan = await this.planner.createRescuePlan(attackTx, chainName, this.destination);
      
      if (!rescuePlan || rescuePlan.transactions.length === 0) {
        logger.warn('[RescueOrchestrator] No rescue transactions needed');
        this.pendingRescues.delete(attackTx.from.toLowerCase());
        return { success: true, message: 'No rescue needed' };
      }

      logger.info(`[RescueOrchestrator] Rescue plan created with ${rescuePlan.transactions.length} transactions`);

      // Get current gas strategy
      const gasStrategy = await getGasStrategy(chainName, this.providers[chainName]);

      // Build bundle
      const wallet = this.wallets[chainName];
      const bundle = buildBundle(wallet, rescuePlan.transactions, gasStrategy);

      // Simulate bundle
      logger.info('[RescueOrchestrator] Simulating bundle...');
      const simulation = await simulateBundle(bundle, chainName, this.providers[chainName]);
      
      if (!simulation.success) {
        logger.error(`[RescueOrchestrator] Bundle simulation failed: ${simulation.error}`);
        this.pendingRescues.delete(attackTx.from.toLowerCase());
        return { success: false, error: `Simulation failed: ${simulation.error}` };
      }

      logger.info(`[RescueOrchestrator] Bundle simulation successful, gas used: ${simulation.gasUsed}`);

      // Broadcast to relays
      logger.info('[RescueOrchestrator] Broadcasting bundle to relays...');
      const broadcastResult = await broadcastBundle(bundle, chainName, this.providers[chainName]);

      if (!broadcastResult.success) {
        // Retry with higher gas
        logger.warn('[RescueOrchestrator] Initial broadcast failed, retrying...');
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
          logger.info(`[RescueOrchestrator] Retry attempt ${attempt}/${this.maxRetries}`);
          
          // Increase gas
          const escalatedGas = await getGasStrategy(chainName, this.providers[chainName], true);
          const retryBundle = buildBundle(wallet, rescuePlan.transactions, escalatedGas);
          
          const retryResult = await retryBundle(
            retryBundle, 
            chainName, 
            this.providers[chainName],
            attempt
          );

          if (retryResult.success) {
            logger.info(`[RescueOrchestrator] Retry successful on attempt ${attempt}`);
            this.pendingRescues.delete(attackTx.from.toLowerCase());
            
            const duration = Date.now() - startTime;
            metrics.rescueDuration.observe(duration / 1000);
            
            return {
              success: true,
              hash: retryResult.hash,
              blockNumber: retryResult.blockNumber,
              gasUsed: simulation.gasUsed,
              duration,
            };
          }

          if (attempt < this.maxRetries) {
            await sleep(this.retryDelay * attempt);
          }
        }

        this.pendingRescues.delete(attackTx.from.toLowerCase());
        return { success: false, error: 'All retry attempts failed' };
      }

      // Success
      this.pendingRescues.delete(attackTx.from.toLowerCase());
      
      const duration = Date.now() - startTime;
      metrics.rescueDuration.observe(duration / 1000);
      metrics.bundlesSent.inc();

      logger.info(`[RescueOrchestrator] Rescue completed successfully in ${duration}ms`);

      return {
        success: true,
        hash: broadcastResult.hash,
        blockNumber: broadcastResult.blockNumber,
        gasUsed: simulation.gasUsed,
        duration,
      };

    } catch (error) {
      logger.error('[RescueOrchestrator] Rescue execution error:', error);
      this.pendingRescues.delete(attackTx.from.toLowerCase());
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute emergency rescue for specific wallet
   */
  async executeEmergencyRescue(walletAddress, chainName) {
    logger.info(`[RescueOrchestrator] Executing emergency rescue for ${walletAddress}`);

    try {
      const emergencyPlan = await this.planner.createEmergencyRescuePlan(
        walletAddress,
        chainName,
        this.destination
      );

      if (!emergencyPlan || emergencyPlan.transactions.length === 0) {
        return { success: true, message: 'No assets to rescue' };
      }

      const wallet = this.wallets[chainName];
      const gasStrategy = await getGasStrategy(chainName, this.providers[chainName], true);
      const bundle = buildBundle(wallet, emergencyPlan.transactions, gasStrategy);

      const result = await broadcastBundle(bundle, chainName, this.providers[chainName]);

      return result;

    } catch (error) {
      logger.error('[RescueOrchestrator] Emergency rescue error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get pending rescues status
   */
  getPendingRescues() {
    return Array.from(this.pendingRescues.entries()).map(([wallet, info]) => ({
      wallet,
      ...info,
      duration: Date.now() - info.startTime,
    }));
  }

  /**
   * Cancel pending rescue
   */
  cancelRescue(walletAddress) {
    const key = walletAddress.toLowerCase();
    if (this.pendingRescues.has(key)) {
      this.pendingRescues.delete(key);
      logger.info(`[RescueOrchestrator] Cancelled rescue for ${walletAddress}`);
      return true;
    }
    return false;
  }
}

module.exports = {
  RescueOrchestrator,
};
