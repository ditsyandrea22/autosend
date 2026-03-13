/**
 * Prometheus Metrics
 * Provides metrics for Prometheus monitoring
 */

const promClient = require('prom-client');

// Create registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const blocksProcessed = new promClient.Counter({
  name: 'rescue_bot_blocks_processed_total',
  help: 'Total number of blocks processed',
  registers: [register],
});

const attacksDetected = new promClient.Counter({
  name: 'rescue_bot_attacks_detected_total',
  help: 'Total number of attacks detected',
  registers: [register],
});

const rescuesSuccess = new promClient.Counter({
  name: 'rescue_bot_rescues_success_total',
  help: 'Total number of successful rescues',
  registers: [register],
});

const rescuesFailed = new promClient.Counter({
  name: 'rescue_bot_rescues_failed_total',
  help: 'Total number of failed rescues',
  registers: [register],
});

const bundlesSent = new promClient.Counter({
  name: 'rescue_bot_bundles_sent_total',
  help: 'Total number of bundles sent',
  registers: [register],
});

const pendingChecked = new promClient.Counter({
  name: 'rescue_bot_pending_checked_total',
  help: 'Total number of pending transactions checked',
  registers: [register],
});

const rescueDuration = new promClient.Histogram({
  name: 'rescue_bot_rescue_duration_seconds',
  help: 'Duration of rescue operations in seconds',
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

const gasUsed = new promClient.Counter({
  name: 'rescue_bot_gas_used_total',
  help: 'Total gas used for rescues',
  registers: [register],
});

const mempoolSize = new promClient.Gauge({
  name: 'rescue_bot_mempool_size',
  help: 'Current mempool size',
  registers: [register],
});

const walletCount = new promClient.Gauge({
  name: 'rescue_bot_monitored_wallets',
  help: 'Number of monitored wallets',
  registers: [register],
});

const relayLatency = new promClient.Histogram({
  name: 'rescue_bot_relay_latency_seconds',
  help: 'Relay broadcast latency in seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  labels: ['relay'],
  registers: [register],
});

/**
 * Get all metrics
 */
function getMetrics() {
  return register.metrics();
}

/**
 * Get metrics as string
 */
function getMetricsString() {
  return register.metrics();
}

/**
 * Get metrics for specific metric name
 */
function getMetric(metricName) {
  return register.getSingleMetric(metricName);
}

/**
 * Reset all metrics
 */
function resetMetrics() {
  register.clear();
  promClient.collectDefaultMetrics({ register });
}

/**
 * Express middleware for metrics endpoint
 */
function metricsMiddleware(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}

module.exports = {
  register,
  blocksProcessed,
  attacksDetected,
  rescuesSuccess,
  rescuesFailed,
  bundlesSent,
  pendingChecked,
  rescueDuration,
  gasUsed,
  mempoolSize,
  walletCount,
  relayLatency,
  getMetrics,
  getMetricsString,
  getMetric,
  resetMetrics,
  metricsMiddleware,
};
