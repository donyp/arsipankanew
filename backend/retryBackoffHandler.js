/**
 * Retry Backoff Handler - Exponential Backoff Retry Logic
 * Task 3.1: Implements exponential backoff retry mechanism for transient failures
 * Task 3.2: Integration point for background upload retries
 * Requirements: R3
 */

const {
    retryWithBackoff: coreRetryWithBackoff,
    shouldRetryError: coreShouldRetryError,
    getRetryDelay: coreGetRetryDelay,
    RETRY_CONFIG
} = require('./retryLogic');

// Re-export core functions from retryLogic for direct use
const getRetryDelay = coreGetRetryDelay;
const shouldRetryError = coreShouldRetryError;
const retryWithBackoff = coreRetryWithBackoff;

/**
 * Enhanced retry handler with logging integration
 * Wraps retryWithBackoff with detailed logging for upload operations
 * 
 * @param {Function} uploadFn - Async function that performs the upload
 * @param {Object} options - Configuration options
 * @param {string} options.filename - File being uploaded (for logging)
 * @param {string} options.storagePath - Storage destination path (for logging)
 * @param {number} options.maxAttempts - Max retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 5000ms)
 * @param {Function} options.onAttempt - Callback(attemptNumber, status) for logging
 * @param {Function} options.onSuccess - Callback(attempts, totalDelay) on success
 * @param {Function} options.onFailure - Callback(attempts, totalDelay, error) on failure
 * @returns {Promise<Object>} Result with success, attempts, totalDelay, lastError, result
 */
async function executeWithRetry(uploadFn, options = {}) {
    const {
        filename = 'unknown',
        storagePath = 'unknown',
        maxAttempts = 3,
        baseDelay = 5000,
        onAttempt = null,
        onSuccess = null,
        onFailure = null
    } = options;

    const result = await retryWithBackoff(uploadFn, {
        maxAttempts,
        baseDelay,
        shouldRetry: shouldRetryError,
        onRetry: (attemptNumber, delay, error) => {
            if (onAttempt) {
                onAttempt(attemptNumber, {
                    status: 'retry_pending',
                    filename,
                    storagePath,
                    error: error.message,
                    delayMs: delay,
                    nextRetryIn: `${(delay / 1000).toFixed(1)}s`
                });
            }
        }
    });

    if (result.success && onSuccess) {
        onSuccess(result.attempts, result.totalDelay);
    } else if (!result.success && onFailure) {
        onFailure(result.attempts, result.totalDelay, result.lastError);
    }

    return result;
}

/**
 * Helper to format retry delay for logging
 * @param {number} attemptNumber - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in ms (default 5000)
 * @returns {Object} Formatted delay information
 */
function formatRetryDelay(attemptNumber, baseDelay = 5000) {
    const delayMs = getRetryDelay(attemptNumber, baseDelay);
    return {
        attemptNumber,
        delayMs,
        delaySeconds: (delayMs / 1000).toFixed(1),
        delayFormatted: `${(delayMs / 1000).toFixed(1)}s`
    };
}

/**
 * Get all retry delays for given number of attempts (for pre-planning)
 * @param {number} maxAttempts - Number of attempts to plan for
 * @param {number} baseDelay - Base delay in ms (default 5000)
 * @returns {Array<Object>} Array of attempt info with delays
 */
function getAllRetryDelays(maxAttempts = 3, baseDelay = 5000) {
    const delays = [];
    for (let i = 1; i <= maxAttempts; i++) {
        delays.push(formatRetryDelay(i, baseDelay));
    }
    return delays;
}

module.exports = {
    // Re-exported core functions from retryLogic (Task 3.1 requirements)
    getRetryDelay,
    shouldRetryError,
    retryWithBackoff,
    RETRY_CONFIG,
    
    // Enhanced handlers for upload operations (Task 3.2)
    executeWithRetry,
    formatRetryDelay,
    getAllRetryDelays
};
