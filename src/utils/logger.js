/**
 * Logger
 * Unified logging utility using pino
 */

const pino = require('pino');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_PRETTY = process.env.LOG_PRETTY === 'true';

// Create logger
const logger = pino({
  level: LOG_LEVEL,
  transport: LOG_PRETTY ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
});

/**
 * Create child logger with context
 */
function child(options) {
  return logger.child(options);
}

/**
 * Log debug message
 */
function debug(message, ...args) {
  logger.debug(message, ...args);
}

/**
 * Log info message
 */
function info(message, ...args) {
  logger.info(message, ...args);
}

/**
 * Log warn message
 */
function warn(message, ...args) {
  logger.warn(message, ...args);
}

/**
 * Log error message
 */
function error(message, ...args) {
  logger.error(message, ...args);
}

/**
 * Log fatal message
 */
function fatal(message, ...args) {
  logger.fatal(message, ...args);
}

/**
 * Log with custom level
 */
function log(level, message, ...args) {
  logger[level](message, ...args);
}

module.exports = {
  logger,
  child,
  debug,
  info,
  warn,
  error,
  fatal,
  log,
};
