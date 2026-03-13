/**
 * Sleep Utility
 * Promise-based delay functions
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for specified seconds
 * @param {number} seconds - Seconds to sleep
 * @returns {Promise<void>}
 */
function sleepSeconds(seconds) {
  return sleep(seconds * 1000);
}

/**
 * Sleep until a specific timestamp
 * @param {number} targetTimestamp - Target Unix timestamp (in ms)
 * @returns {Promise<void>}
 */
async function sleepUntil(targetTimestamp) {
  const now = Date.now();
  const delay = targetTimestamp - now;
  if (delay > 0) {
    await sleep(delay);
  }
}

/**
 * Retry with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @param {Function} shouldRetry - Optional function to determine if retry is needed
 * @returns {Promise<any>}
 */
async function withRetry(
  fn,
  maxRetries = 3,
  initialDelay = 1000,
  maxDelay = 10000,
  shouldRetry = () => true
) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Wait for a condition with timeout
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Timeout in ms
 * @param {number} checkInterval - Check interval in ms
 * @returns {Promise<boolean>}
 */
async function waitFor(condition, timeout = 30000, checkInterval = 100) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(checkInterval);
  }
  
  return false;
}

module.exports = { sleep, sleepSeconds, sleepUntil, withRetry, waitFor };
