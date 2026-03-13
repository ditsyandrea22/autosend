/**
 * Latency Monitor - Tracks and reports system latency metrics
 * Critical for MEV-grade performance (<50ms target)
 */
class LatencyMonitor {
  constructor() {
    this.latencyHistory = [];
    this.operationLatencies = new Map();
    this.maxHistorySize = 1000;
    this.targetLatency = 50; // 50ms target for MEV-grade
  }

  /**
   * Record a latency measurement
   */
  recordLatency(operation, latencyMs) {
    // Store in history
    this.latencyHistory.push({
      operation,
      latency: latencyMs,
      timestamp: Date.now(),
    });

    // Trim history
    if (this.latencyHistory.length > this.maxHistorySize) {
      this.latencyHistory.shift();
    }

    // Track per-operation stats
    if (!this.operationLatencies.has(operation)) {
      this.operationLatencies.set(operation, []);
    }
    const opHistory = this.operationLatencies.get(operation);
    opHistory.push(latencyMs);
    if (opHistory.length > 100) {
      opHistory.shift();
    }
  }

  /**
   * Measure execution time of an async function
   */
  async measure(operation, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const latency = performance.now() - start;
      this.recordLatency(operation, latency);
      return result;
    } catch (error) {
      const latency = performance.now() - start;
      this.recordLatency(operation, latency);
      throw error;
    }
  }

  /**
   * Get average latency for an operation
   */
  getAverageLatency(operation) {
    const history = this.operationLatencies.get(operation);
    if (!history || history.length === 0) return null;
    
    const sum = history.reduce((a, b) => a + b, 0);
    return sum / history.length;
  }

  /**
   * Get p50 latency (median)
   */
  getP50(operation) {
    const history = this.operationLatencies.get(operation);
    if (!history || history.length === 0) return null;
    
    const sorted = [...history].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Get p99 latency
   */
  getP99(operation) {
    const history = this.operationLatencies.get(operation);
    if (!history || history.length === 0) return null;
    
    const sorted = [...history].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[index];
  }

  /**
   * Get latency statistics
   */
  getStats(operation = null) {
    if (operation) {
      return {
        operation,
        average: this.getAverageLatency(operation),
        p50: this.getP50(operation),
        p99: this.getP99(operation),
        count: (this.operationLatencies.get(operation) || []).length,
      };
    }

    // Overall stats
    const stats = {};
    for (const [op, history] of this.operationLatencies.entries()) {
      stats[op] = {
        average: this.getAverageLatency(op),
        p50: this.getP50(op),
        p99: this.getP99(op),
        count: history.length,
      };
    }
    return stats;
  }

  /**
   * Check if latency is within target
   */
  isWithinTarget(operation) {
    const avg = this.getAverageLatency(operation);
    if (avg === null) return true;
    return avg <= this.targetLatency;
  }

  /**
   * Get overall health score (0-100)
   */
  getHealthScore() {
    let totalScore = 0;
    let count = 0;

    for (const [operation, history] of this.operationLatencies.entries()) {
      if (history.length === 0) continue;
      
      const avg = this.getAverageLatency(operation);
      if (avg <= this.targetLatency) {
        totalScore += 100;
      } else if (avg <= this.targetLatency * 2) {
        totalScore += 50;
      } else {
        totalScore += 0;
      }
      count++;
    }

    return count > 0 ? Math.round(totalScore / count) : 100;
  }

  /**
   * Generate latency report
   */
  generateReport() {
    const health = this.getHealthScore();
    const stats = this.getStats();

    return {
      healthScore: health,
      targetLatency: `${this.targetLatency}ms`,
      overallStatus: health >= 80 ? "GOOD" : health >= 50 ? "WARNING" : "CRITICAL",
      operations: stats,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset latency history
   */
  reset() {
    this.latencyHistory = [];
    this.operationLatencies.clear();
  }

  /**
   * Start continuous monitoring
   */
  startContinuousMonitoring(callback, intervalMs = 5000) {
    const interval = setInterval(() => {
      const report = this.generateReport();
      callback(report);
    }, intervalMs);

    return () => clearInterval(interval);
  }
}

/**
 * Create a timed operation wrapper
 */
function withTiming(monitor, operationName) {
  return async (fn) => {
    const start = performance.now();
    try {
      const result = await fn();
      const latency = performance.now() - start;
      monitor.recordLatency(operationName, latency);
      return result;
    } catch (error) {
      const latency = performance.now() - start;
      monitor.recordLatency(operationName, latency);
      throw error;
    }
  };
}

module.exports = {
  LatencyMonitor,
  withTiming,
};
