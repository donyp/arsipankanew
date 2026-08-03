/**
 * Background Upload Tests - Unit Tests for Upload with Retry Logic
 * Task 3.2: Tests for uploadInBackground() with exponential backoff
 * Task 4.1: Validates background upload and retry logic
 * Validates: Requirements R3
 */

const RcloneStorage = require('../rclone_wrapper');
const StorageErrorLogger = require('../storageErrorLogger');

describe('Background Upload with Retry Logic', () => {
    let mockErrorLogger;

    beforeEach(() => {
        mockErrorLogger = new StorageErrorLogger({
            enableFileLogging: false,
            enableConsoleLogging: false
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful Upload on First Attempt', () => {
        it('should complete upload successfully without retry', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            // Mock uploadDirect to succeed on first attempt
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({ storagePath: '/arsip/zona-01/toko-a/PPN/test-document.pdf', size: 17 });

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(1);
            expect(result.syncError).toBeNull();
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(1);
        });
    });

    describe('Success After Transient Error (Attempt 2)', () => {
        it('should retry after ECONNREFUSED and succeed on attempt 2', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const error1 = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
            error1.code = 'ECONNREFUSED';

            // Mock uploadDirect to fail on first attempt, succeed on second
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValueOnce(error1)
                .mockResolvedValueOnce({ storagePath: '/arsip/zona-01/toko-a/PPN/test-document.pdf', size: 17 });

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(2);
            expect(result.syncError).toBeNull();
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(2);
        }, 20000); // Increase timeout for retry delays
    });

    describe('Failure After 3 Transient Errors', () => {
        it('should fail after max attempts with persistent transient error', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const error = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
            error.code = 'ECONNREFUSED';

            // Mock uploadDirect to always fail with transient error
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(3);
            expect(result.syncError).toContain('Connection refused');
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(3);
        }, 60000); // Increase timeout for multiple retry delays
    });

    describe('Permanent Error No Retry (Single Attempt)', () => {
        it('should fail immediately on 401 Unauthorized without retry', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const error = new Error('401 Unauthorized: Invalid credentials');
            error.code = '401';

            // Mock uploadDirect to fail with permanent error
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(1); // Only 1 attempt for permanent error
            expect(result.syncError).toContain('Unauthorized');
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(1);
        });
    });

    describe('Error Types Classification', () => {
        it('should classify ETIMEDOUT as transient and retry', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const error = new Error('Error: ETIMEDOUT');
            error.code = 'ETIMEDOUT';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValueOnce(error)
                .mockResolvedValueOnce({ storagePath: '/arsip/zona-01/toko-a/PPN/test-document.pdf', size: 17 });

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(true);
            expect(result.syncAttempts).toBe(2);
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(2); // Retry occurred
        }, 15000);

        it('should classify EACCES (permission denied) as permanent and not retry', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const error = new Error('Error: EACCES Permission denied');
            error.code = 'EACCES';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(false);
            expect(result.syncAttempts).toBe(1); // No retry for permission error
            expect(RcloneStorage.uploadDirect).toHaveBeenCalledTimes(1);
        });
    });

    describe('Return Value Structure', () => {
        it('should return required fields on success', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({ storagePath: '/arsip/zona-01/toko-a/PPN/test-document.pdf', size: 17 });

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('storagePath');
            expect(typeof result.storagePath).toBe('string');
            expect(result).toHaveProperty('size');
            expect(typeof result.size).toBe('number');
            expect(result).toHaveProperty('syncAttempts');
            expect(typeof result.syncAttempts).toBe('number');
            expect(result).toHaveProperty('syncError');
            expect(result.syncError).toBeNull();
        });

        it('should return required fields on failure', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const error = new Error('ECONNREFUSED: Connection refused');
            error.code = 'ECONNREFUSED';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result).toHaveProperty('success', false);
            expect(result).toHaveProperty('storagePath');
            expect(typeof result.storagePath).toBe('string');
            expect(result).toHaveProperty('size');
            expect(typeof result.size).toBe('number');
            expect(result).toHaveProperty('syncAttempts');
            expect(typeof result.syncAttempts).toBe('number');
            expect(result).toHaveProperty('syncError');
            expect(typeof result.syncError).toBe('string');
            expect(result.syncError.length).toBeGreaterThan(0);
        }, 60000);
    });

    describe('Storage Path Construction', () => {
        it('should correctly build storage path', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({ storagePath: '/arsip/zona-01/toko-a/PPN/test-document.pdf', size: 17 });

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.storagePath).toBe('/arsip/zona-01/toko-a/PPN/test-document.pdf');
        });
    });

    describe('Logging Output', () => {
        it('should log success message with attempt count', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockResolvedValueOnce({ storagePath: '/arsip/zona-01/toko-a/PPN/test-document.pdf', size: 17 });

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(true);
            // Verify success message was logged
            const successLogCalls = consoleLogSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] SUCCESS'));
            expect(successLogCalls.length).toBeGreaterThan(0);
            expect(successLogCalls[0][0]).toContain(filename);
            expect(successLogCalls[0][0]).toContain('after 1 attempts');
            
            consoleLogSpy.mockRestore();
        });

        it('should log failure message with attempt count', async () => {
            // Arrange
            const fileBuffer = Buffer.from('test file content');
            const filename = 'test-document.pdf';
            const zonaKode = 'zona-01';
            const tokoKode = 'toko-a';
            const category = 'PPN';

            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            const error = new Error('ECONNREFUSED: Connection refused');
            error.code = 'ECONNREFUSED';

            jest.spyOn(RcloneStorage, 'uploadDirect')
                .mockRejectedValue(error);

            // Act
            const result = await RcloneStorage.uploadInBackground(fileBuffer, filename, zonaKode, tokoKode, category);

            // Assert
            expect(result.success).toBe(false);
            // Verify failure message was logged
            const failureLogCalls = consoleErrorSpy.mock.calls
                .filter(call => call[0]?.includes('[Background Upload] FAILED'));
            expect(failureLogCalls.length).toBeGreaterThan(0);
            expect(failureLogCalls[0][0]).toContain(filename);
            expect(failureLogCalls[0][0]).toContain('after 3 attempts');
            
            consoleErrorSpy.mockRestore();
        }, 60000);
    });
});
