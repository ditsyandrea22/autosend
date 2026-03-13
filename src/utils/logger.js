/**
 * Logger Utility
 * Production-grade logging with timestamps and levels
 */

const { LOG } = require("../config/constants");

class Logger {
  constructor(context = "Bot") {
    this.context = context;
    this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
    this.currentLevel = LOG.LEVEL;
  }

  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.currentLevel];
  }

  _formatMessage(level, ...args) {
    const timestamp = LOG.TIMESTAMPS ? new Date().toISOString() : "";
    const levelStr = level.toUpperCase().padEnd(5);
    const contextStr = `[${this.context}]`;
    
    let message = "";
    for (const arg of args) {
      if (typeof arg === "object") {
        message += JSON.stringify(arg, null, 2) + " ";
      } else {
        message += String(arg) + " ";
      }
    }
    
    return `${timestamp} ${levelStr} ${contextStr} ${message}`.trim();
  }

  debug(...args) {
    if (this._shouldLog("debug")) {
      console.debug(this._formatMessage("debug", ...args));
    }
  }

  info(...args) {
    if (this._shouldLog("info")) {
      console.log(this._formatMessage("info", ...args));
    }
  }

  warn(...args) {
    if (this._shouldLog("warn")) {
      console.warn(this._formatMessage("warn", ...args));
    }
  }

  error(...args) {
    if (this._shouldLog("error")) {
      console.error(this._formatMessage("error", ...args));
    }
  }

  // Special methods for rescue operations
  rescueAttempt(txHash, amount) {
    this.info("🚨 RESCUE ATTEMPT:", { txHash, amount });
  }

  bundleSent(blockNumber) {
    this.info("📦 Bundle sent for block:", blockNumber);
  }

  bundleIncluded(blockNumber, txHash) {
    this.info("✅ Bundle included in block:", blockNumber, { txHash });
  }

  attackDetected(address) {
    this.warn("⚠️  ATTACK DETECTED:", address);
  }

  gasUpdate(maxFee, priorityFee) {
    this.debug("⛽ Gas updated:", { maxFee: maxFee.toString(), priorityFee: priorityFee.toString() });
  }
}

/**
 * Create a logger instance
 * @param {string} context - Context/name for the logger
 * @returns {Logger}
 */
function createLogger(context) {
  return new Logger(context);
}

// Default logger
const logger = new Logger("RescueBot");

module.exports = { Logger, createLogger, logger };
