/**
 * Shared utility functions
 * Common utilities used across the application
 */

/**
 * Check if running in production mode
 * @returns {boolean} True if NODE_ENV is 'production'
 */
function isProduction() {
  // Check for explicit production flag or NODE_ENV
  const env = process.env.NODE_ENV?.toLowerCase();
  return env === 'production' || process.env.PRODUCTION === 'true' || process.env.PRODUCTION === '1';
}

module.exports = {
  isProduction,
};
