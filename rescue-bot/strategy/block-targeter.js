const { ethers } = require("ethers");

/**
 * Block Targeter - Manages optimal block targeting for bundle submission
 * Uses parallel block targeting strategy as shown in architecture
 */
class BlockTargeter {
  constructor(provider) {
    this.provider = provider;
    this.currentBlock = 0;
    this.targetHistory = [];
    
    // Fibonacci-based block targeting for maximum coverage
    this.BLOCK_TARGETS = [1, 2, 3, 5, 8, 13, 21];
    this.DEFAULT_TARGETS = [1, 2, 3, 5, 8];
  }

  /**
   * Update current block number
   */
  async updateBlock(blockNumber) {
    this.currentBlock = blockNumber;
    return blockNumber;
  }

  /**
   * Get target blocks for bundle submission
   * @param {number} currentBlock - Current block number
   * @param {string} strategy - Strategy type: 'fast', 'balanced', 'aggressive'
   * @returns {Array<number>}
   */
  getTargetBlocks(currentBlock, strategy = "balanced") {
    let targets;

    switch (strategy) {
      case "fast":
        // Target closest blocks only
        targets = [1, 2, 3];
        break;
      case "aggressive":
        // Target many blocks ahead
        targets = [1, 2, 3, 5, 8, 13, 21];
        break;
      case "balanced":
      default:
        targets = this.DEFAULT_TARGETS;
        break;
    }

    const absoluteBlocks = targets.map((offset) => currentBlock + offset);
    
    // Record targeting
    this.targetHistory.push({
      currentBlock,
      targets: absoluteBlocks,
      strategy,
      timestamp: Date.now(),
    });

    return absoluteBlocks;
  }

  /**
   * Calculate optimal submission timing
   * @returns {Object}
   */
  getOptimalTiming() {
    const blockTime = 12; // Ethereum average block time in seconds
    const now = Date.now();
    const msSinceBlock = now % (blockTime * 1000);
    
    return {
      msUntilNextBlock: (blockTime * 1000) - msSinceBlock,
      secondsUntilNextBlock: Math.floor((blockTime * 1000 - msSinceBlock) / 1000),
      optimalSubmitOffset: Math.max(0, 100 - msSinceBlock / 100), // Submit slightly before block
      shouldSubmitNow: msSinceBlock > 8000, // Submit in last 4 seconds of block
    };
  }

  /**
   * Check if we should resubmit to new block
   * @param {number} lastSubmissionBlock - Block we last submitted to
   * @returns {boolean}
   */
  shouldResubmit(lastSubmissionBlock) {
    return this.currentBlock > lastSubmissionBlock;
  }

  /**
   * Get blocks to resubmit based on expiration
   * @param {Array} previousTargets - Previously targeted blocks
   * @returns {Array}
   */
  getBlocksToResubmit(previousTargets) {
    const now = Date.now();
    const expiredBlocks = [];
    
    for (const target of previousTargets) {
      // Check if block has passed
      if (target <= this.currentBlock) {
        expiredBlocks.push(target);
      }
    }
    
    // Get new blocks to target
    const newTargets = this.getTargetBlocks(this.currentBlock);
    return newTargets.filter((t) => !previousTargets.includes(t));
  }

  /**
   * Get priority score for each target block
   * @param {Array} targetBlocks - Array of target block numbers
   * @returns {Array<Object>}
   */
  getBlockPriorities(targetBlocks) {
    const currentBlock = this.currentBlock;
    
    return targetBlocks.map((block) => {
      const distance = block - currentBlock;
      const priorityScore = 100 - distance * 5; // Closer blocks = higher priority
      
      return {
        block,
        distance,
        priorityScore: Math.max(0, priorityScore),
        isNextBlock: distance === 1,
        isExpired: distance <= 0,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }

  /**
   * Adaptive block targeting based on network conditions
   * @param {Object} networkStats - Network statistics
   * @returns {Array<number>}
   */
  getAdaptiveTargets(networkStats = {}) {
    const { avgGasPrice = 0, pendingTxCount = 0, networkCongestion = "normal" } = networkStats;
    let strategy = "balanced";
    
    // Adjust strategy based on network conditions
    if (networkCongestion === "high" || avgGasPrice > 100) {
      strategy = "fast"; // Target closest blocks
    } else if (networkCongestion === "low" && pendingTxCount < 1000) {
      strategy = "aggressive"; // Can target further blocks
    }
    
    return this.getTargetBlocks(this.currentBlock, strategy);
  }

  /**
   * Calculate expected inclusion probability
   * @param {number} targetBlock - Target block number
   * @returns {number}
   */
  getInclusionProbability(targetBlock) {
    const distance = targetBlock - this.currentBlock;
    
    if (distance <= 0) return 0; // Block already passed
    
    // Simplified probability model
    const baseProbability = 0.95; // 95% for block+1
    const decayFactor = 0.85; // 15% decay per block
    
    return baseProbability * Math.pow(decayFactor, distance - 1);
  }

  /**
   * Get all inclusion probabilities for target blocks
   * @param {Array} targetBlocks - Array of target block numbers
   * @returns {Array<Object>}
   */
  getInclusionProbabilities(targetBlocks) {
    return targetBlocks.map((block) => ({
      block,
      probability: this.getInclusionProbability(block),
    }));
  }

  /**
   * Calculate expected time to inclusion
   * @returns {number} - Expected seconds until inclusion
   */
  getExpectedTimeToInclusion() {
    const targets = this.getTargetBlocks(this.currentBlock);
    const probabilities = this.getInclusionProbabilities(targets);
    
    let weightedSum = 0;
    let totalProb = 0;
    
    for (const { block, probability } of probabilities) {
      const distance = block - this.currentBlock;
      weightedSum += distance * 12 * probability; // 12 seconds per block
      totalProb += probability;
    }
    
    return totalProb > 0 ? Math.round(weightedSum / totalProb) : 999;
  }

  /**
   * Get timing recommendations
   * @returns {Object}
   */
  getTimingRecommendations() {
    const timing = this.getOptimalTiming();
    const expectedInclusion = this.getExpectedTimeToInclusion();
    
    return {
      ...timing,
      expectedInclusionSeconds: expectedInclusion,
      recommendation: timing.shouldSubmitNow 
        ? "SUBMIT_NOW" 
        : `WAIT_${timing.secondsUntilNextBlock}s`,
    };
  }

  /**
   * Parallel block targeting as shown in architecture
   * @param {number} blockNumber - Current block number
   * @returns {Array<number>}
   */
  parallelBlockTargeting(blockNumber) {
    // Target multiple blocks simultaneously
    return [1, 2, 3, 5, 8].map((offset) => blockNumber + offset);
  }
}

module.exports = {
  BlockTargeter,
};
