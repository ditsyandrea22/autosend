/**
 * Dashboard Server
 * Provides HTTP endpoints for monitoring
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { metricsMiddleware } = require('./metrics');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3001;

// Middleware
app.use(express.json());

/**
 * Start the dashboard server
 */
function startDashboard() {
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Metrics endpoint
  app.get('/metrics', metricsMiddleware);

  // Status endpoint
  app.get('/status', (req, res) => {
    res.json({
      status: 'running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    });
  });

  // Info endpoint
  app.get('/info', (req, res) => {
    res.json({
      name: 'MEV Rescue Bot',
      version: '1.0.0',
      description: 'Multi-chain MEV rescue bot',
      chains: ['ethereum', 'base', 'polygon', 'bsc'],
      relays: ['flashbots', 'bloxroute', 'eden', 'beaverbuild'],
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    logger.error('[Dashboard] Error:', err);
    res.status(500).json({ error: err.message });
  });

  // Start server
  app.listen(PORT, () => {
    logger.info(`[Dashboard] Server started on port ${PORT}`);
  });

  return app;
}

/**
 * Stop the dashboard server
 */
function stopDashboard() {
  if (app.listen) {
    app.close(() => {
      logger.info('[Dashboard] Server stopped');
    });
  }
}

module.exports = {
  startDashboard,
  stopDashboard,
  app,
};
