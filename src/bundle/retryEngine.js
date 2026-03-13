/**
 * Retry Engine
 * Manages bundle retries with exponential backoff
 */

const { logger } = require('../utils/logger');
const { sleep } = require('../utils/sleep');
const { broadcastBundle } = require('../relays/relayManager');
const { getGasStrategy } = require('../gas/gasEscalator');

class RetryEngine {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 5000,
      maxDelay: options.maxDelay || 60000,
      exponentialBase: options.exponentialBase || 2,
      ...options,
    };
    this.pendingRetries = new Map();
  }

  /**
   * Retry a bundle with escalation
   */
  async retryBundle(bundle, chainName, provider, attempt = 1) {
    const bundleHash = this.hashBundle(bundle);
    
    logger.info(`[RetryEngine] Retry attempt ${attempt} for bundle ${bundleHash.substring(0, 8)}...`);

    try {
      // Broadcast bundle
      const result = await broadcastBundle(bundle, chainName, provider);

      if (result.success) {
        logger.info(`[RetryEngine] Bundle succeeded on attempt ${attempt}`);
        return {
          success: true,
          hash: result.hash,
          blockNumber: result.blockNumber,
          attempt,
        };
      }

      // Check if we should retry
      if (attempt >= this.options.maxRetries) {
        logger.error(`[RetryEngine] Max retries (${this.options.maxRetries}) reached`);
        return {
          success: false,
          error: result.error || 'Max retries reached',
          attempts: attempt,
        };
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        this.options.baseDelay * Math.pow(this.options.exponentialBase, attempt - 1),
        this.options.maxDelay
      );

      logger.info(`[RetryEngine] Waiting ${delay}ms before retry...`);
      await sleep(delay);

      // Get escalated gas strategy
      const gasStrategy = await getGasStrategy(chainName, provider, true);
      
      // Rebuild bundle with new gas
      const escalatedBundle = this.escalateBundle(bundle, gasStrategy);

      // Retry
      return this.retryBundle(escalatedBundle, chainName, provider, attempt + 1);

    } catch (error) {
      logger.error('[RetryEngine] Retry error:', error);

      if (attempt >= this.options.maxRetries) {
        return {
          success: false,
          error: error.message,
          attempts: attempt,
        };
      }

      const delay = this.options.baseDelay * Math.pow(this.options.exponentialBase, attempt - 1);
      await sleep(delay);

      return this.retryBundle(bundle, chainName, provider, attempt + 1);
    }
  }

  /**
   * Start automatic retry on block events
   */
  startAutoRetry(bundle, chainName, provider, onRetry) {
    const bundleHash = this.hashBundle(bundle);
    
    const retryInfo = {
      bundle,
      chainName,
      provider,
      attempt: 0,
      startTime: Date.now(),
      onRetry,
      cancelled: false,
    };

    this.pendingRetries.set(bundleHash, retryInfo);

    // Listen to block events
    provider.on('block', async (blockNumber) => {
      if (retryInfo.cancelled) {
        return;
      }

      retryInfo.attempt++;

      if (retryInfo.attempt > this.options.maxRetries) {
        this.cancelRetry(bundleHash);
        return;
      }

      // Broadcast bundle
      const result = await broadcastBundle(bundle, chainName, provider);

      if (result.success) {
        this.cancelRetry(bundleHash);
        if (onRetry) {
          onRetry(result);
        }
      }
    });

    return bundleHash;
  }

  /**
   * Cancel pending retry
   */
  cancelRetry(bundleHash) {
    const info = this.pendingRetries.get(bundleHash);
    if (info) {
      info.cancelled = true;
      this.pendingRetries.delete(bundleHash);
      logger.info(`[RetryEngine] Cancelled retry for bundle ${bundleHash.substring(0, 8)}`);
    }
  }

  /**
   * Escalate bundle gas
   */
  escalateBundle(bundle, gasStrategy) {
    return bundle.map((item) => ({
      ...item,
      transaction: {
        ...item.transaction,
        maxFeePerGas: gasStrategy.maxFeePerGas,
        maxPriorityFeePerGas: gasStrategy.maxPriorityFeePerGas,
      },
    }));
  }

  /**
   * Hash bundle for identification
   */
  hashBundle(bundle) {
    const data = JSON.stringify(bundle.map((item) => ({
      to: item.transaction.to,
      nonce: item.transaction.nonce,
      data: item.transaction.data,
    })));
    
    // Simple hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get pending retries
   */
  getPendingRetries() {
    return Array.from(this.pendingRetries.entries()).map(([hash, info]) => ({
      hash,
      attempt: info.attempt,
      startTime: info.startTime,
      duration: Date.now() - info.startTime,
    }));
  }

  /**
   * Cancel all retries
   */
  cancelAll() {
    for (const hash of this.pendingRetries.keys()) {
      this.cancelRetry(hash);
    }
    logger.info('[RetryEngine] All retries cancelled');
  }
}

/**
 * Quick retry helper
 */
async function retryBundle(bundle, chainName, provider, maxRetries = 3) {
  const engine = new RetryEngine({ maxRetries });
  return engine.retryBundle(bundle, chainName, provider, 1);
}

module.exports = {
  RetryEngine,
  retryBundle,
};
