/**
 * Sleep utility
 * Promise-based sleep function
 */

/**
 * Sleep for specified milliseconds
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep for specified seconds
 * 
 * @param {number} seconds - Seconds to sleep
 * @returns {Promise<void>}
 */
function sleepSeconds(seconds) {
  return sleep(seconds * 1000);
}

/**
 * Sleep with jitter
 * 
 * @param {number} ms - Base milliseconds
 * @param {number} jitterFactor - Jitter factor (0-1)
 * @returns {Promise<void>}
 */
function sleepWithJitter(ms, jitterFactor = 0.1) {
  const jitter = ms * jitterFactor * Math.random();
  return sleep(ms + jitter);
}

/**
 * Sleep until specific timestamp
 * 
 * @param {number} targetTimestamp - Target timestamp
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
 * Sleep until next block
 * 
 * @param {number} avgBlockTime - Average block time in seconds
 * @returns {Promise<void>}
 */
async function sleepUntilNextBlock(avgBlockTime = 12) {
  await sleepSeconds(avgBlockTime);
}

/**
 * Retry with exponential backoff
 * 
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retries
 * @param {number} baseDelay - Base delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000, maxDelay = 30000) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(
          baseDelay * Math.pow(2, attempt),
          maxDelay
        );
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

module.exports = {
  sleep,
  sleepSeconds,
  sleepWithJitter,
  sleepUntil,
  sleepUntilNextBlock,
  retryWithBackoff,
};
