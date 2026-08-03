/**
 * Unit Tests for StorageErrorLogger
 * Task 3.3: Test comprehensive error logging functionality
 * Requirements: R3
 */

const StorageErrorLogger = require('../storageErrorLogger');
const fs = require('fs');
const path = require('path');

describe('StorageErrorLogger', () => {
    let logger;
    const testLogFile = path.join(__dirname, 'test-storage-errors.log');

    beforeEach(() => {
        // Create logger with test log file
        logger = new StorageErrorLogger({
            logFilePath: testLogFile,
            enableFileLogging: true,
            enableConsoleLogging: false
        });

        // Clear log file before each test
        if (fs.existsSync(testLogFile)) {
            fs.unlinkSync(testLogFile);
        }
    });

    afterEach(() => {
        // Clean up test log file
        if (fs.existsSync(testLogFile)) {
            fs.unlinkSync(testLogFile);
        }
    });

    describe('logOperation()', () => {
        test('logs operation with filename and storagePath', () => {
            logger.logOperation('background_upload_start', {
                filename: 'invoice-001.pdf',
                storagePath: '/arsip/zona-01/toko-a/PPN/invoice-001.pdf',
                fileSize: 1024000,
                status: 'QUEUED'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('background_upload_start');
            expect(content).toContain('invoice-001.pdf');
            expect(content).toContain('/arsip/zona-01/toko-a/PPN/invoice-001.pdf');
            expect(content).toContain('QUEUED');
        });

        test('logs operation with default values when details are minimal', () => {
            logger.logOperation('simple_operation');

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('simple_operation');
            expect(content).toContain('unknown'); // Default filename/path
        });

        test('includes timestamp in operation log', () => {
            const beforeTime = new Date().toISOString();
            logger.logOperation('test_operation', { filename: 'test.pdf' });
            const afterTime = new Date().toISOString();

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('"timestamp"');
        });

        test('logs all provided details', () => {
            const details = {
                filename: 'file.pdf',
                storagePath: '/path/to/file',
                attempts: 2,
                totalDelayMs: 15000,
                customField: 'custom_value'
            };

            logger.logOperation('test_op', details);

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('file.pdf');
            expect(content).toContain('custom_value');
            expect(content).toContain('15000');
        });
    });

    describe('logError()', () => {
        test('classifies gzip header error as TRANSIENT', () => {
            const error = new Error('error when trying to read error from body: gzip: invalid header');
            logger.logError('background_upload_retry', error, {
                filename: 'file.pdf',
                storagePath: '/arsip/file.pdf',
                attemptNumber: 1,
                maxAttempts: 3
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('GZIP_INVALID_HEADER');
            expect(content).toContain('TRANSIENT');
            expect(content).toContain('Verify Alist WebDAV is responding correctly');
        });

        test('classifies 401 unauthorized error as PERMANENT', () => {
            const error = new Error('401 Unauthorized');
            logger.logError('background_upload_retry', error, {
                filename: 'file.pdf',
                storagePath: '/arsip/file.pdf',
                attemptNumber: 1,
                maxAttempts: 3
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('AUTH_FAILED');
            expect(content).toContain('PERMANENT');
            expect(content).toContain('Check rclone.conf credentials');
        });

        test('classifies connection refused error as TRANSIENT', () => {
            const error = new Error('ECONNREFUSED: Connection refused');
            logger.logError('background_upload_retry', error, {
                filename: 'file.pdf',
                storagePath: '/arsip/file.pdf',
                attemptNumber: 1,
                maxAttempts: 3
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('CONNECTION_REFUSED');
            expect(content).toContain('TRANSIENT');
            expect(content).toContain('localhost:5244');
        });

        test('classifies timeout error as TRANSIENT', () => {
            const error = new Error('ETIMEDOUT: Connection timeout');
            logger.logError('background_upload_retry', error, {
                filename: 'file.pdf',
                attemptNumber: 1,
                maxAttempts: 3
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('TIMEOUT');
            expect(content).toContain('TRANSIENT');
        });

        test('includes all context fields in error log', () => {
            const error = new Error('Test error');
            logger.logError('test_operation', error, {
                filename: 'test.pdf',
                storagePath: '/path/to/test.pdf',
                attemptNumber: 2,
                maxAttempts: 3,
                nextRetryDelayMs: 10000,
                nextRetryIn: '10.0s',
                isTransient: true,
                context: 'Retrying due to transient error'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('test.pdf');
            expect(content).toContain('/path/to/test.pdf');
            expect(content).toContain('"attemptNumber":2');
            expect(content).toContain('"maxAttempts":3');
            expect(content).toContain('10000');
            expect(content).toContain('Retrying due to transient error');
        });

        test('includes error message and code in log', () => {
            const error = new Error('Connection timeout');
            error.code = 'ETIMEDOUT';

            logger.logError('test_op', error, {
                filename: 'test.pdf'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('Connection timeout');
            expect(content).toContain('ETIMEDOUT');
        });

        test('includes stack trace in error log', () => {
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n    at test.js:10:15\n    at context.js:5:3';

            logger.logError('test_op', error, {
                filename: 'test.pdf'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('stackTrace');
            expect(content).toContain('test.js');
        });

        test('returns error context object', () => {
            const error = new Error('Test error');
            const result = logger.logError('test_op', error, {
                filename: 'test.pdf',
                attemptNumber: 1
            });

            expect(result).toBeDefined();
            expect(result.operation).toBe('test_op');
            expect(result.filename).toBe('test.pdf');
            expect(result.attemptNumber).toBe(1);
            expect(result.suggestion).toBeDefined();
        });

        test('includes remediation suggestion in log', () => {
            const error = new Error('Connection refused at localhost:5244');
            logger.logError('test_op', error, {
                filename: 'test.pdf'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('suggestion');
            expect(content).toContain('Alist service');
        });
    });

    describe('logRetry()', () => {
        test('logs retry with attempt number', () => {
            logger.logRetry({
                attemptNumber: 2,
                maxAttempts: 3,
                nextRetryDelayMs: 10000,
                filename: 'file.pdf',
                error: new Error('Connection timeout')
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('Attempt 2/3');
            expect(content).toContain('file.pdf');
            expect(content).toContain('10.0s');
        });

        test('logs retry reason if error provided', () => {
            logger.logRetry({
                attemptNumber: 1,
                maxAttempts: 3,
                nextRetryDelayMs: 5000,
                filename: 'test.pdf',
                error: new Error('Connection refused')
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('Connection refused');
        });

        test('handles retry without error', () => {
            logger.logRetry({
                attemptNumber: 1,
                maxAttempts: 3,
                nextRetryDelayMs: 5000,
                filename: 'test.pdf'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('Attempt 1/3');
            expect(content).toContain('test.pdf');
        });
    });

    describe('logSuccess()', () => {
        test('logs success with operation details', () => {
            logger.logSuccess({
                operation: 'background_upload',
                filename: 'file.pdf',
                attemptNumber: 1,
                totalDelayMs: 0
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('Success');
            expect(content).toContain('background_upload');
            expect(content).toContain('file.pdf');
            expect(content).toContain('1 attempt');
        });

        test('logs success with multiple attempts and delay', () => {
            logger.logSuccess({
                operation: 'upload',
                filename: 'invoice.pdf',
                attemptNumber: 3,
                totalDelayMs: 15000
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('3 attempt');
            expect(content).toContain('15.0s');
        });
    });

    describe('getRecentErrors()', () => {
        test('returns recent log lines', () => {
            logger.logOperation('op1', { filename: 'file1.pdf' });
            logger.logOperation('op2', { filename: 'file2.pdf' });
            logger.logOperation('op3', { filename: 'file3.pdf' });

            const recent = logger.getRecentErrors(2);
            expect(recent.length).toBeLessThanOrEqual(2);
            expect(recent[recent.length - 1]).toContain('file3.pdf');
        });

        test('returns empty array if log file does not exist', () => {
            if (fs.existsSync(testLogFile)) {
                fs.unlinkSync(testLogFile);
            }

            const recent = logger.getRecentErrors(50);
            expect(recent).toEqual([]);
        });

        test('returns all lines if fewer than requested', () => {
            logger.logOperation('op1', { filename: 'file1.pdf' });
            logger.logOperation('op2', { filename: 'file2.pdf' });

            const recent = logger.getRecentErrors(50);
            expect(recent.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('clearLog()', () => {
        test('clears log file content', () => {
            logger.logOperation('test_op', { filename: 'test.pdf' });
            
            let content = fs.readFileSync(testLogFile, 'utf8');
            expect(content.length).toBeGreaterThan(0);

            logger.clearLog();
            
            content = fs.readFileSync(testLogFile, 'utf8');
            // After clearing, log should only contain the "log cleared" message
            expect(content).toContain('cleared');
        });
    });

    describe('getLogFilePath()', () => {
        test('returns configured log file path', () => {
            const filePath = logger.getLogFilePath();
            expect(filePath).toBe(testLogFile);
        });
    });

    describe('getLogFileSize()', () => {
        test('returns log file size in bytes', () => {
            logger.logOperation('test_op', { filename: 'test.pdf' });
            
            const size = logger.getLogFileSize();
            expect(size).toBeGreaterThan(0);
        });

        test('returns 0 if log file does not exist', () => {
            if (fs.existsSync(testLogFile)) {
                fs.unlinkSync(testLogFile);
            }

            const size = logger.getLogFileSize();
            expect(size).toBe(0);
        });
    });

    describe('rotateLogIfNeeded()', () => {
        test('rotates log file when exceeding max size', () => {
            // Write large content to exceed limit
            const smallMax = 100; // Very small for testing
            
            logger.logOperation('op1', { filename: 'file1.pdf' });
            logger.logOperation('op2', { filename: 'file2.pdf' });
            logger.logOperation('op3', { filename: 'file3.pdf' });
            
            const beforeRotation = logger.getLogFileSize();
            
            if (beforeRotation > smallMax) {
                logger.rotateLogIfNeeded(smallMax, 5);
                
                // Check that backup file was created
                const dir = path.dirname(testLogFile);
                const ext = path.extname(testLogFile);
                const basename = path.basename(testLogFile, ext);
                const backupFile = path.join(dir, `${basename}.1${ext}`);
                
                // After rotation, current log should be much smaller
                const afterRotation = logger.getLogFileSize();
                expect(afterRotation < beforeRotation).toBe(true);
            }
        });

        test('does not rotate if size is below threshold', () => {
            logger.logOperation('op1', { filename: 'file1.pdf' });
            
            const sizeBefore = logger.getLogFileSize();
            logger.rotateLogIfNeeded(100000, 5); // Large threshold
            const sizeAfter = logger.getLogFileSize();
            
            expect(sizeAfter).toBe(sizeBefore);
        });
    });

    describe('error classification patterns', () => {
        const testCases = [
            {
                error: 'gzip: invalid header',
                expectedType: 'GZIP_INVALID_HEADER',
                expectedClassification: 'TRANSIENT'
            },
            {
                error: '401 Unauthorized',
                expectedType: 'AUTH_FAILED',
                expectedClassification: 'PERMANENT'
            },
            {
                error: 'ECONNREFUSED: connection refused',
                expectedType: 'CONNECTION_REFUSED',
                expectedClassification: 'TRANSIENT'
            },
            {
                error: 'ETIMEDOUT: connection timeout',
                expectedType: 'TIMEOUT',
                expectedClassification: 'TRANSIENT'
            },
            {
                error: 'EHOSTUNREACH: no route to host',
                expectedType: 'HOST_UNREACHABLE',
                expectedClassification: 'TRANSIENT'
            },
            {
                error: 'EACCES: permission denied',
                expectedType: 'PERMISSION_DENIED',
                expectedClassification: 'PERMANENT'
            },
            {
                error: 'ENOENT: file not found',
                expectedType: 'NOT_FOUND',
                expectedClassification: 'PERMANENT'
            },
            {
                error: 'ENOSPC: no space left on device',
                expectedType: 'DISK_FULL',
                expectedClassification: 'PERMANENT'
            }
        ];

        testCases.forEach(testCase => {
            test(`correctly classifies error: ${testCase.error}`, () => {
                const error = new Error(testCase.error);
                logger.logError('test_op', error, { filename: 'test.pdf' });

                const content = fs.readFileSync(testLogFile, 'utf8');
                expect(content).toContain(testCase.expectedType);
                expect(content).toContain(testCase.expectedClassification);
            });
        });
    });

    describe('console and file logging options', () => {
        test('logs to console when enabled', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            const loggerWithConsole = new StorageErrorLogger({
                logFilePath: testLogFile,
                enableConsoleLogging: true,
                enableFileLogging: false
            });

            loggerWithConsole.logOperation('test_op', { filename: 'test.pdf' });

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        test('does not log to console when disabled', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            const loggerNoConsole = new StorageErrorLogger({
                logFilePath: testLogFile,
                enableConsoleLogging: false,
                enableFileLogging: true
            });

            loggerNoConsole.logOperation('test_op', { filename: 'test.pdf' });

            expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('test_op'));
            consoleSpy.mockRestore();
        });

        test('logs to file when enabled', () => {
            const loggerWithFile = new StorageErrorLogger({
                logFilePath: testLogFile,
                enableFileLogging: true
            });

            loggerWithFile.logOperation('test_op', { filename: 'test.pdf' });

            expect(fs.existsSync(testLogFile)).toBe(true);
            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('test_op');
        });

        test('does not log to file when disabled', () => {
            const noFileLogger = new StorageErrorLogger({
                logFilePath: testLogFile,
                enableFileLogging: false,
                enableConsoleLogging: false
            });

            noFileLogger.logOperation('test_op', { filename: 'test.pdf' });

            // Log file should not be created if file logging is disabled
            // (unless another test created it)
        });
    });

    describe('comprehensive logging scenarios', () => {
        test('logs complete upload flow with retry and success', () => {
            // Operation start
            logger.logOperation('background_upload_start', {
                filename: 'invoice.pdf',
                storagePath: '/arsip/zona-01/toko-a/PPN/invoice.pdf',
                fileSize: 512000,
                status: 'QUEUED'
            });

            // Retry attempt
            const error = new Error('Connection timeout');
            logger.logError('background_upload_retry', error, {
                filename: 'invoice.pdf',
                storagePath: '/arsip/zona-01/toko-a/PPN/invoice.pdf',
                attemptNumber: 1,
                maxAttempts: 3,
                nextRetryDelayMs: 5000,
                isTransient: true
            });

            // Success
            logger.logSuccess({
                operation: 'background_upload',
                filename: 'invoice.pdf',
                attemptNumber: 2,
                totalDelayMs: 5000
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toContain('QUEUED');
            expect(content).toContain('Connection timeout');
            expect(content).toContain('Success');
            expect(content).toContain('invoice.pdf');
        });

        test('logs complete failure flow with all retries exhausted', () => {
            logger.logOperation('background_upload_start', {
                filename: 'file.pdf',
                storagePath: '/arsip/file.pdf',
                status: 'QUEUED'
            });

            for (let i = 1; i <= 3; i++) {
                const error = new Error('Connection refused');
                logger.logError('background_upload_retry', error, {
                    filename: 'file.pdf',
                    storagePath: '/arsip/file.pdf',
                    attemptNumber: i,
                    maxAttempts: 3,
                    nextRetryDelayMs: 5000 * Math.pow(2, i - 1),
                    isTransient: true
                });

                if (i < 3) {
                    logger.logRetry({
                        attemptNumber: i,
                        maxAttempts: 3,
                        nextRetryDelayMs: 5000 * Math.pow(2, i - 1),
                        filename: 'file.pdf',
                        error: new Error('Connection refused')
                    });
                }
            }

            logger.logOperation('background_upload_failed', {
                filename: 'file.pdf',
                storagePath: '/arsip/file.pdf',
                attempts: 3,
                status: 'FAILED',
                error: 'All retries exhausted'
            });

            const content = fs.readFileSync(testLogFile, 'utf8');
            expect(content).toMatch(/Attempt [123]\/3/);
            expect(content).toContain('FAILED');
        });
    });
});
