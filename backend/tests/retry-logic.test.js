/**
 * Unit Tests for Retry Logic Module
 * Tests exponential backoff, error classification, and retry wrapper
 */

const {
    RETRY_CONFIG,
    getRetryDelay,
    shouldRetryError,
    retryWithBackoff,
    getMaxAttemptsForError,
    sleep
} = require('../retryLogic');

describe('Retry Logic Module', () => {
    
    // ==================== getRetryDelay Tests ====================
    
    describe('getRetryDelay()', () => {
        it('should calculate exponential backoff delays correctly', () => {
            expect(getRetryDelay(1)).toBe(5000);      // 5s
            expect(getRetryDelay(2)).toBe(10000);     // 10s
            expect(getRetryDelay(3)).toBe(20000);     // 20s
            expect(getRetryDelay(4)).toBe(40000);     // 40s
        });
        
        it('should respect custom baseDelay parameter', () => {
            const customBase = 1000;
            expect(getRetryDelay(1, customBase)).toBe(1000);
            expect(getRetryDelay(2, customBase)).toBe(2000);
            expect(getRetryDelay(3, customBase)).toBe(4000);
        });
        
        it('should throw error for invalid attempt numbers', () => {
            expect(() => getRetryDelay(0)).toThrow('Attempt number must be >= 1');
            expect(() => getRetryDelay(-1)).toThrow('Attempt number must be >= 1');
        });
        
        it('should follow formula: baseDelay * 2^(n-1)', () => {
            const baseDelay = 5000;
            for (let n = 1; n <= 5; n++) {
                const expected = baseDelay * Math.pow(2, n - 1);
                expect(getRetryDelay(n, baseDelay)).toBe(expected);
            }
        });
    });
    
    // ==================== shouldRetryError Tests ====================
    
    describe('shouldRetryError()', () => {
        it('should identify transient errors as retryable', () => {
            // Error objects with type property (from classifyRcloneError)
            expect(shouldRetryError({ type: 'TRANSIENT' })).toBe(true);
            expect(shouldRetryError({ type: 'UNREACHABLE' })).toBe(true);
        });
        
        it('should identify permanent errors as non-retryable', () => {
            expect(shouldRetryError({ type: 'AUTH' })).toBe(false);
            expect(shouldRetryError({ type: 'PERMANENT' })).toBe(false);
        });
        
        it('should handle native Error objects with code property', () => {
            expect(shouldRetryError({ code: 'ETIMEDOUT' })).toBe(true);
            expect(shouldRetryError({ code: 'ECONNREFUSED' })).toBe(true);
            expect(shouldRetryError({ code: 'EAI_AGAIN' })).toBe(true);
            expect(shouldRetryError({ code: 'EHOSTUNREACH' })).toBe(true);
        });
        
        it('should detect transient error patterns in message', () => {
            expect(shouldRetryError({ message: 'Connection timeout' })).toBe(true);
            expect(shouldRetryError({ message: 'ETIMEDOUT' })).toBe(true);
            expect(shouldRetryError({ message: 'ECONNREFUSED' })).toBe(true);
            expect(shouldRetryError({ message: 'Temporary network error' })).toBe(true);
            expect(shouldRetryError({ message: 'This is transient' })).toBe(true);
            expect(shouldRetryError({ message: 'Host unreachable' })).toBe(true);
        });
        
        it('should return false for null/undefined errors', () => {
            expect(shouldRetryError(null)).toBe(false);
            expect(shouldRetryError(undefined)).toBe(false);
        });
        
        it('should return false for unknown error types', () => {
            expect(shouldRetryError({ type: 'UNKNOWN' })).toBe(false);
            expect(shouldRetryError({ message: 'Some random error' })).toBe(false);
        });
    });
    
    // ==================== retryWithBackoff Tests ====================
    
    describe('retryWithBackoff()', () => {
        it('should succeed on first attempt', async () => {
            const mockFn = jest.fn().mockResolvedValue('success');
            
            const result = await retryWithBackoff(mockFn);
            
            expect(result.success).toBe(true);
            expect(result.attempts).toBe(1);
            expect(result.totalDelay).toBe(0);
            expect(result.lastError).toBeNull();
            expect(result.result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(1);
        });
        
        it('should retry on transient error and succeed on second attempt', async () => {
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce({ type: 'TRANSIENT', message: 'Network timeout' })
                .mockResolvedValueOnce('success');
            
            const result = await retryWithBackoff(mockFn, { baseDelay: 10 });
            
            expect(result.success).toBe(true);
            expect(result.attempts).toBe(2);
            expect(result.totalDelay).toBe(10); // Delay between attempts
            expect(result.lastError).toBeNull();
            expect(result.result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(2);
        });
        
        it('should fail immediately on permanent error (no retry)', async () => {
            const authError = { type: 'AUTH', message: '401 Unauthorized' };
            const mockFn = jest.fn().mockRejectedValue(authError);
            
            const result = await retryWithBackoff(mockFn);
            
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1);
            expect(result.totalDelay).toBe(0);
            expect(result.lastError).toEqual(authError);
            expect(result.result).toBeNull();
            expect(mockFn).toHaveBeenCalledTimes(1); // Called once, no retry
        });
        
        it('should fail after max retries on transient errors', async () => {
            const transientError = { type: 'TRANSIENT', message: 'Network timeout' };
            const mockFn = jest.fn().mockRejectedValue(transientError);
            
            const result = await retryWithBackoff(mockFn, { maxAttempts: 3, baseDelay: 10 });
            
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(3);
            expect(result.totalDelay).toBe(30); // 10ms + 20ms (two waits)
            expect(result.lastError).toEqual(transientError);
            expect(result.result).toBeNull();
            expect(mockFn).toHaveBeenCalledTimes(3);
        });
        
        it('should calculate correct total delay with exponential backoff', async () => {
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce({ type: 'TRANSIENT' })
                .mockRejectedValueOnce({ type: 'TRANSIENT' })
                .mockResolvedValueOnce('success');
            
            const result = await retryWithBackoff(mockFn, { maxAttempts: 3, baseDelay: 100 });
            
            expect(result.success).toBe(true);
            expect(result.attempts).toBe(3);
            // Delays: 100ms (after attempt 1) + 200ms (after attempt 2) = 300ms total
            expect(result.totalDelay).toBe(300);
        });
        
        it('should call onRetry callback on each retry', async () => {
            const onRetry = jest.fn();
            const transientError = { type: 'TRANSIENT' };
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(transientError)
                .mockResolvedValueOnce('success');
            
            const result = await retryWithBackoff(mockFn, { 
                maxAttempts: 2, 
                baseDelay: 50,
                onRetry 
            });
            
            expect(result.success).toBe(true);
            expect(onRetry).toHaveBeenCalledTimes(1);
            expect(onRetry).toHaveBeenCalledWith(1, 50, transientError);
        });
        
        it('should throw error if fn is not a function', async () => {
            await expect(retryWithBackoff('not a function')).rejects.toThrow(
                'First argument must be an async function'
            );
        });
        
        it('should handle custom maxAttempts setting', async () => {
            const mockFn = jest.fn().mockRejectedValue({ type: 'TRANSIENT' });
            
            const result = await retryWithBackoff(mockFn, { maxAttempts: 5, baseDelay: 1 });
            
            expect(result.attempts).toBe(5);
            expect(mockFn).toHaveBeenCalledTimes(5);
        });
        
        it('should handle custom shouldRetry classifier', async () => {
            const customShouldRetry = jest.fn().mockReturnValue(false);
            const mockFn = jest.fn().mockRejectedValue(new Error('Some error'));
            
            const result = await retryWithBackoff(mockFn, { 
                maxAttempts: 3,
                shouldRetry: customShouldRetry
            });
            
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1); // No retry due to custom classifier
            expect(customShouldRetry).toHaveBeenCalled();
        });
        
        it('should handle onRetry callback errors gracefully', async () => {
            const onRetryWithError = jest.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce({ type: 'TRANSIENT' })
                .mockResolvedValueOnce('success');
            
            // Should not throw, callback error should be caught
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const result = await retryWithBackoff(mockFn, { 
                baseDelay: 10,
                onRetry: onRetryWithError 
            });
            
            expect(result.success).toBe(true);
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
    
    // ==================== getMaxAttemptsForError Tests ====================
    
    describe('getMaxAttemptsForError()', () => {
        it('should return 3 attempts for transient errors', () => {
            expect(getMaxAttemptsForError({ type: 'TRANSIENT' })).toBe(3);
            expect(getMaxAttemptsForError({ type: 'UNREACHABLE' })).toBe(3);
            expect(getMaxAttemptsForError({ code: 'ETIMEDOUT' })).toBe(3);
        });
        
        it('should return 1 attempt for permanent errors', () => {
            expect(getMaxAttemptsForError({ type: 'AUTH' })).toBe(1);
            expect(getMaxAttemptsForError({ type: 'PERMANENT' })).toBe(1);
            expect(getMaxAttemptsForError({ message: 'Unknown error' })).toBe(1);
        });
    });
    
    // ==================== Integration Tests ====================
    
    describe('Retry Logic Integration', () => {
        it('should handle realistic Rclone-style error (gzip)', async () => {
            const rcloneError = { 
                type: 'UNREACHABLE',
                message: 'error when trying to read error from body: gzip: invalid header'
            };
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce(rcloneError)
                .mockRejectedValueOnce(rcloneError)
                .mockResolvedValueOnce({ files: [] });
            
            const result = await retryWithBackoff(mockFn, { 
                maxAttempts: 3,
                baseDelay: 5
            });
            
            expect(result.success).toBe(true);
            expect(result.attempts).toBe(3);
            expect(mockFn).toHaveBeenCalledTimes(3);
        });
        
        it('should handle realistic auth error (no retry)', async () => {
            const authError = {
                type: 'AUTH',
                message: '401 Unauthorized - check rclone.conf credentials'
            };
            const mockFn = jest.fn().mockRejectedValue(authError);
            
            const result = await retryWithBackoff(mockFn, { maxAttempts: 3 });
            
            expect(result.success).toBe(false);
            expect(result.attempts).toBe(1);
            expect(mockFn).toHaveBeenCalledTimes(1);
        });
        
        it('should support monitoring retry progression', async () => {
            const retryLog = [];
            const onRetry = (attempt, delay, error) => {
                retryLog.push({ attempt, delay, errorType: error?.type });
            };
            
            const mockFn = jest
                .fn()
                .mockRejectedValueOnce({ type: 'TRANSIENT' })
                .mockRejectedValueOnce({ type: 'TRANSIENT' })
                .mockResolvedValueOnce('success');
            
            const result = await retryWithBackoff(mockFn, {
                maxAttempts: 3,
                baseDelay: 100,
                onRetry
            });
            
            expect(result.success).toBe(true);
            expect(retryLog).toHaveLength(2);
            expect(retryLog[0].attempt).toBe(1);
            expect(retryLog[0].delay).toBe(100);
            expect(retryLog[1].attempt).toBe(2);
            expect(retryLog[1].delay).toBe(200);
        });
    });
    
    // ==================== RETRY_CONFIG Tests ====================
    
    describe('RETRY_CONFIG', () => {
        it('should have correct configuration values', () => {
            expect(RETRY_CONFIG.BASE_DELAY).toBe(5000);
            expect(RETRY_CONFIG.MAX_TRANSIENT_ATTEMPTS).toBe(3);
            expect(RETRY_CONFIG.MAX_PERMANENT_ATTEMPTS).toBe(1);
        });
        
        it('should include all expected transient error types', () => {
            const transientTypes = ['ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EHOSTUNREACH', 'TRANSIENT', 'UNREACHABLE'];
            transientTypes.forEach(type => {
                expect(RETRY_CONFIG.TRANSIENT_ERRORS).toContain(type);
            });
        });
        
        it('should include all expected permanent error types', () => {
            const permanentTypes = ['AUTH', 'EACCES', 'ENOENT', 'PERMANENT'];
            permanentTypes.forEach(type => {
                expect(RETRY_CONFIG.PERMANENT_ERRORS).toContain(type);
            });
        });
    });
});
