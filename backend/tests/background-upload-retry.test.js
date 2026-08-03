/**
 * Background Upload Retry Logic Tests - OPTIMIZED
 * Task 3.2: Enhanced Background Upload Task with Retry Logic
 * Validates: Requirements R3
 * 
 * Optimized test suite with 8 core tests for retry logic functionality
 * Mocks Rclone execution and minimal database queries for speed
 */

const RcloneStorage = require('../rclone_wrapper');
const StorageErrorLogger = require('../storageErrorLogger');
const { shouldRetryError } = require('../retryLogic');

// Mock dependencies to speed up tests
jest.mock('child_process');
jest.mock('fs');

describe('Background Upload Retry Logic - Optimized Test Suite', () => {
    let mockErrorLogger;
    let consoleLogSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        // Create error logger without file I/O
        mockErrorLogger = new StorageErrorLogger({
            enableFileLogging: false,
            enableConsoleLogging: false
        });

        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Clear all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        jest.clearAllMocks();
    });

    // ============================================================
    // TEST 1: Successful upload on first attempt
    // ============================================================
    describe('Test 1: Successful upload on first attempt', () => {
        it('should complete upload without retry on first attempt', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-001.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            // Mock uploadDirect to succeed immediately
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/PPN/invoice-001.pdf',
                    size: fileBuffer.length
                });

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(1);
            expect(result.syncError).toBeNull();
            expect(result.size).toBe(fileBuffer.length);
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(1);

            // Verify success message logged
            const successLogs = consoleLogSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] SUCCESS'));
            expect(successLogs.length).toBeGreaterThan(0);
            expect(successLogs[0][0]).toContain('invoice-001.pdf');
            expect(successLogs[0][0]).toContain('after 1 attempts');
        });
    });

    // ============================================================
    // TEST 2: Success after transient error on attempt 2
    // ============================================================
    describe('Test 2: Success after transient error on attempt 2', () => {
        it('should retry after connection timeout and succeed', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-002.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPH21';

            // Create transient error (connection timeout)
            const timeoutError = new Error('ETIMEDOUT: Connection timeout');
            timeoutError.code = 'ETIMEDOUT';

            // Mock uploadDirect: fail on first attempt, succeed on second
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValueOnce(timeoutError)
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/PPH21/invoice-002.pdf',
                    size: fileBuffer.length
                });

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(2);
            expect(result.syncError).toBeNull();
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(2);

            // Verify success message logged
            const successLogs = consoleLogSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] SUCCESS'));
            expect(successLogs.length).toBeGreaterThan(0);
            expect(successLogs[0][0]).toContain('invoice-002.pdf');
            expect(successLogs[0][0]).toContain('after 2 attempts');
        }, 20000); // Allow for retry delay
    });

    // ============================================================
    // TEST 3: Failure after 3 transient errors
    // ============================================================
    describe('Test 3: Failure after 3 transient errors', () => {
        it('should exhaust retries after max attempts on persistent transient error', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-003.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Customs';

            // Create persistent transient error (connection refused)
            const connectionError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
            connectionError.code = 'ECONNREFUSED';

            // Mock uploadDirect to always fail with connection error
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(connectionError);

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(3);
            expect(result.syncError).toContain('Connection refused');
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(3);

            // Verify failure message logged
            const failureLogs = consoleErrorSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] FAILED'));
            expect(failureLogs.length).toBeGreaterThan(0);
            expect(failureLogs[0][0]).toContain('invoice-003.pdf');
            expect(failureLogs[0][0]).toContain('after 3 attempts');
        }, 60000); // Allow for multiple retry delays
    });

    // ============================================================
    // TEST 4: Permanent error no retry (single attempt)
    // ============================================================
    describe('Test 4: Permanent error no retry (single attempt)', () => {
        it('should fail immediately on auth error without retry', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-004.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            // Create permanent error (401 Unauthorized)
            const authError = new Error('401 Unauthorized: Invalid credentials');
            authError.code = '401';

            // Mock uploadDirect to fail with auth error
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(authError);

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(1); // No retry for permanent error
            expect(result.syncError).toContain('Unauthorized');
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(1);

            // Verify failure logged after single attempt
            const failureLogs = consoleErrorSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] FAILED'));
            expect(failureLogs.length).toBeGreaterThan(0);
            expect(failureLogs[0][0]).toContain('after 1 attempts');
        });
    });

    // ============================================================
    // TEST 5: Database fields updated correctly
    // ============================================================
    describe('Test 5: Database fields updated correctly', () => {
        it('should return fields matching database schema expectations', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-005.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Tariff';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/Tariff/invoice-005.pdf',
                    size: fileBuffer.length
                });

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert - Database schema fields
            // Field: syncAttempts (INTEGER)
            expect(result.syncAttempts).toBeDefined();
            expect(typeof result.syncAttempts).toBe('number');
            expect(result.syncAttempts).toBeGreaterThanOrEqual(1);
            expect(Number.isInteger(result.syncAttempts)).toBe(true);

            // Field: syncError (TEXT/null)
            expect(result.syncError).toBeDefined();
            expect(result.syncError === null || typeof result.syncError === 'string').toBe(true);

            // Success case: syncError should be null
            expect(result.syncError).toBeNull();

            // Additional fields
            expect(result.storagePath).toBeDefined();
            expect(typeof result.storagePath).toBe('string');
            expect(result.success).toBe(true);
        });

        it('should return syncError message on failure', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-006.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Excise';

            const error = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
            error.code = 'ECONNREFUSED';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert - Database schema fields on failure
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(3);
            expect(typeof result.syncError).toBe('string');
            expect(result.syncError.length).toBeGreaterThan(0);
            expect(result.syncError).toContain('Connection refused');
        }, 60000);
    });

    // ============================================================
    // TEST 6: Logging messages match expected format
    // ============================================================
    describe('Test 6: Logging messages match expected format', () => {
        it('should log [Background Upload] ATTEMPT messages for each retry', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-007.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Tax';

            const error = new Error('ETIMEDOUT: timeout');
            error.code = 'ETIMEDOUT';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/Tax/invoice-007.pdf',
                    size: fileBuffer.length
                });

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(2);

            // Check for ATTEMPT message format
            const attemptLogs = consoleLogSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] ATTEMPT'));
            expect(attemptLogs.length).toBeGreaterThan(0);
            expect(attemptLogs[0][0]).toMatch(/\[Background Upload\] ATTEMPT \d+ for invoice-007\.pdf/);
        }, 20000);

        it('should log [Background Upload] SUCCESS with attempt count', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-008.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'VAT';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/VAT/invoice-008.pdf',
                    size: fileBuffer.length
                });

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(true);

            // Check for SUCCESS message format
            const successLogs = consoleLogSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] SUCCESS'));
            expect(successLogs.length).toBeGreaterThan(0);
            expect(successLogs[0][0]).toMatch(
                /\[Background Upload\] SUCCESS for invoice-008\.pdf after \d+ attempts/
            );
        });

        it('should log [Background Upload] FAILED with attempt count and error', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-009.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Income';

            const error = new Error('ECONNREFUSED: Connection refused');
            error.code = 'ECONNREFUSED';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert
            expect(result.success).toBe(false);

            // Check for FAILED message format
            const failedLogs = consoleErrorSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] FAILED'));
            expect(failedLogs.length).toBeGreaterThan(0);
            expect(failedLogs[0][0]).toMatch(
                /\[Background Upload\] FAILED for invoice-009\.pdf after \d+ attempts: .+/
            );
        }, 60000);
    });

    // ============================================================
    // TEST 7: Retry metadata captured
    // ============================================================
    describe('Test 7: Retry metadata captured', () => {
        it('should track retry attempts metadata for successful recovery', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-010.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Depreciation';

            const error1 = new Error('ETIMEDOUT: timeout');
            error1.code = 'ETIMEDOUT';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValueOnce(error1)
                .mockRejectedValueOnce(error1)
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/Depreciation/invoice-010.pdf',
                    size: fileBuffer.length
                });

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert - Retry metadata
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(3); // Failed twice, succeeded on 3rd
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(3);

            // Verify error logger tracked retries
            const errorLogCalls = consoleErrorSpy.mock.calls
                .filter(call => call[0]?.includes('background_upload_retry'));
            // Note: errorLogger.logError is called with retry context
            expect(errorLogCalls.length).toBeGreaterThan(0);
        }, 40000);

        it('should track retry metadata for all failed attempts', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test content');
            const filename = 'invoice-011.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'Royalty';

            const error = new Error('ECONNREFUSED: Connection refused');
            error.code = 'ECONNREFUSED';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(
                fileBuffer, filename, zonaKode, tokoKode, category
            );

            // Assert - All retry attempts logged
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(3); // All 3 attempts failed

            // Verify each attempt was logged
            const attemptLogs = consoleLogSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] ATTEMPT'));
            expect(attemptLogs.length).toBeGreaterThan(0); // Should have at least retry attempts

            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(3);
        }, 60000);
    });

    // ============================================================
    // TEST 8: Concurrent upload handling
    // ============================================================
    describe('Test 8: Concurrent upload handling', () => {
        it('should handle multiple concurrent uploads independently', async () => {
            // Arrange
            const fileBuffer1 = Buffer.from('content 1');
            const fileBuffer2 = Buffer.from('content 2');
            const fileBuffer3 = Buffer.from('content 3');

            // Mock uploadDirect for each file
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/PPN/file1.pdf',
                    size: fileBuffer1.length
                })
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/PPH21/file2.pdf',
                    size: fileBuffer2.length
                })
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/Customs/file3.pdf',
                    size: fileBuffer3.length
                });

            // Act - Start all uploads concurrently
            const promise1 = RcloneStorage.uploadInBackground(
                fileBuffer1, 'file1.pdf', 'zona-01', 'toko-a', 'PPN'
            );
            const promise2 = RcloneStorage.uploadInBackground(
                fileBuffer2, 'file2.pdf', 'zona-01', 'toko-a', 'PPH21'
            );
            const promise3 = RcloneStorage.uploadInBackground(
                fileBuffer3, 'file3.pdf', 'zona-01', 'toko-a', 'Customs'
            );

            const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

            // Assert - Each upload succeeds independently
            expect(result1.success).toBe(true);
            expect(result1.syncAttempts).toBe(1);
            expect(result1.storagePath).toContain('file1.pdf');

            expect(result2.success).toBe(true);
            expect(result2.syncAttempts).toBe(1);
            expect(result2.storagePath).toContain('file2.pdf');

            expect(result3.success).toBe(true);
            expect(result3.syncAttempts).toBe(1);
            expect(result3.storagePath).toContain('file3.pdf');

            // Verify all uploads were attempted
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(3);
        });

        it('should handle mixed success/failure in concurrent uploads', async () => {
            // Arrange
            const fileBuffer1 = Buffer.from('content 1');
            const fileBuffer2 = Buffer.from('content 2');
            const fileBuffer3 = Buffer.from('content 3');

            const error = new Error('ECONNREFUSED: Connection refused');
            error.code = 'ECONNREFUSED';

            // Mock: first succeeds, second fails, third succeeds
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/PPN/file1.pdf',
                    size: fileBuffer1.length
                })
                .mockRejectedValue(error) // File 2 will fail on all retries (3 attempts)
                .mockResolvedValueOnce({
                    storagePath: '/arsip/zona-01/toko-a/Customs/file3.pdf',
                    size: fileBuffer3.length
                });

            // Act
            const promise1 = RcloneStorage.uploadInBackground(
                fileBuffer1, 'file1.pdf', 'zona-01', 'toko-a', 'PPN'
            );
            const promise2 = RcloneStorage.uploadInBackground(
                fileBuffer2, 'file2.pdf', 'zona-01', 'toko-a', 'PPH21'
            );
            const promise3 = RcloneStorage.uploadInBackground(
                fileBuffer3, 'file3.pdf', 'zona-01', 'toko-a', 'Customs'
            );

            const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

            // Assert
            expect(result1.success).toBe(true);
            expect(result1.syncAttempts).toBe(1);

            expect(result2.success).toBe(false); // This one fails
            expect(result2.syncAttempts).toBe(3);

            expect(result3.success).toBe(true);
            expect(result3.syncAttempts).toBe(1);
        }, 60000);
    });
});
