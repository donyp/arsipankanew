/**
 * Retry Logic Module
 * Implements exponential backoff retry logic for transient failures
 * 
 * Validates: Requirements R3
 */

/**
 * Configuration for retry behavior
 */
const RETRY_CONFIG = {
    // Base delay in milliseconds (attempt 1)
    BASE_DELAY: 5000,
    
    // Maximum number of attempts for transient errors
    MAX_TRANSIENT_ATTEMPTS: 3,
    
    // Maximum number of attempts for permanent errors (no retry)
    MAX_PERMANENT_ATTEMPTS: 1,
    
    // Error types that should trigger retry
    TRANSIENT_ERRORS: [
        'ETIMEDOUT',
        'ECONNREFUSED',
        'EAI_AGAIN',
        'EHOSTUNREACH',
        'TRANSIENT',
        'UNREACHABLE'
    ],
    
    // Error types that should NOT retry
    PERMANENT_ERRORS: [
        'AUTH',
        'EACCES',
        'ENOENT',
        'PERMANENT',
        'ENOENT'
    ]
};

/**
 * Calculate retry delay using exponential backoff formula
 * 
 * Formula: delay = baseDelay * (2 ^ (attemptNumber - 1))
 * 
 * Examples:
 * - attemptNumber=1 → delay = 5000 * 2^0 = 5000ms (5s)
 * - attemptNumber=2 → delay = 5000 * 2^1 = 10000ms (10s)
 * - attemptNumber=3 → delay = 5000 * 2^2 = 20000ms (20s)
 * - attemptNumber=4 → delay = 5000 * 2^3 = 40000ms (40s)
 * 
 * @param {number} attemptNumber - Current attempt number (1-based)
 * @param {number} baseDelay - Base delay in milliseconds (default: 5000ms)
 * @returns {number} Delay in milliseconds for this attempt
 */
function getRetryDelay(attemptNumber, baseDelay = RETRY_CONFIG.BASE_DELAY) {
    if (attemptNumber < 1) {
        throw new Error('Attempt number must be >= 1');
    }
    
    const exponent = attemptNumber - 1;
    const multiplier = Math.pow(2, exponent);
    const delay = baseDelay * multiplier;
    
    return delay;
}

/**
 * Classify error to determine if it should be retried
 * 
 * Uses error classification from rcloneConnectivityHandler pattern:
 * - TRANSIENT errors (network issues, timeouts) → retry with backoff
 * - PERMANENT errors (auth, config) → fail immediately, no retry
 * 
 * @param {Error|Object} error - Error object or error classification result
 * @returns {boolean} true if error should trigger retry, false if permanent
 */
function shouldRetryError(error) {
    if (!error) {
        return false;
    }
    
    // Handle error classification object from rcloneConnectivityHandler
    if (error.type) {
        // Error object from classifyRcloneError()
        return RETRY_CONFIG.TRANSIENT_ERRORS.includes(error.type);
    }
    
    // Handle native Error objects - check error code/message
    if (error.code) {
        // Check against known transient error codes
        if (RETRY_CONFIG.TRANSIENT_ERRORS.includes(error.code)) {
            return true;
        }
    }
    
    if (error.message) {
        const message = error.message.toLowerCase();
        
        // Check for transient error patterns in message
        if (message.includes('timeout') || message.includes('etimedout')) {
            return true;
        }
        if (message.includes('econnrefused') || message.includes('connection refused')) {
            return true;
        }
        if (message.includes('eai_again')) {
            return true;
        }
        if (message.includes('ehostunreach') || message.includes('host unreachable')) {
            return true;
        }
        if (message.includes('temporary') || message.includes('transient')) {
            return true;
        }
        if (message.includes('unreachable')) {
            return true;
        }
    }
    
    // Default: don't retry unknown errors
    return false;
}

/**
 * Sleep utility - return promise that resolves after delay
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry wrapper with exponential backoff
 * 
 * Executes a function with automatic retry logic:
 * - Retries transient errors with exponential backoff delays
 * - Fails immediately on permanent errors
 * - Returns metadata about retry attempts
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry configuration
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 3)
 * @param {Function} options.shouldRetry - Error classifier function (default: shouldRetryError)
 * @param {number} options.baseDelay - Base delay in ms (default: 5000ms)
 * @param {Function} options.onRetry - Optional callback(attemptNumber, delay, error) on each retry
 * @returns {Promise<{
 *   success: boolean,
 *   attempts: number,
 *   totalDelay: number,
 *   lastError: Error|null,
 *   result: any
 * }>}
 */
async function retryWithBackoff(fn, options = {}) {
    const {
        maxAttempts = RETRY_CONFIG.MAX_TRANSIENT_ATTEMPTS,
        shouldRetry = shouldRetryError,
        baseDelay = RETRY_CONFIG.BASE_DELAY,
        onRetry = null
    } = options;
    
    if (typeof fn !== 'function') {
        throw new Error('First argument must be an async function');
    }
    
    let attempts = 0;
    let totalDelay = 0;
    let lastError = null;
    
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
        attempts = attemptNumber;
        
        try {
            // Execute the function
            const result = await fn();
            
            // Success
            return {
                success: true,
                attempts,
                totalDelay,
                lastError: null,
                result
            };
        } catch (error) {
            lastError = error;
            
            // Check if we should retry this error
            const shouldContinue = shouldRetry(error);
            
            if (!shouldContinue) {
                // Permanent error - don't retry
                return {
                    success: false,
                    attempts,
                    totalDelay,
                    lastError: error,
                    result: null
                };
            }
            
            // Check if we have more attempts left
            if (attemptNumber >= maxAttempts) {
                // Out of retries
                return {
                    success: false,
                    attempts,
                    totalDelay,
                    lastError: error,
                    result: null
                };
            }
            
            // Calculate delay for next attempt
            const delay = getRetryDelay(attemptNumber, baseDelay);
            totalDelay += delay;
            
            // Callback for monitoring/logging
            if (onRetry) {
                try {
                    onRetry(attemptNumber, delay, error);
                } catch (e) {
                    // Ignore callback errors
                    console.error('Error in retryWithBackoff onRetry callback:', e.message);
                }
            }
            
            // Wait before retrying
            await sleep(delay);
        }
    }
    
    // Should not reach here, but just in case
    return {
        success: false,
        attempts,
        totalDelay,
        lastError,
        result: null
    };
}

/**
 * Simple default retry classifier for errors
 * Returns appropriate max attempts based on error type
 * 
 * @param {Error|Object} error - Error to classify
 * @returns {number} Max attempts for this error (1 for permanent, 3 for transient)
 */
function getMaxAttemptsForError(error) {
    return shouldRetryError(error) 
        ? RETRY_CONFIG.MAX_TRANSIENT_ATTEMPTS 
        : RETRY_CONFIG.MAX_PERMANENT_ATTEMPTS;
}

module.exports = {
    // Configuration
    RETRY_CONFIG,
    
    // Core functions
    getRetryDelay,
    shouldRetryError,
    retryWithBackoff,
    getMaxAttemptsForError,
    
    // Utilities
    sleep
};
