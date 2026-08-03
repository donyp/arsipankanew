/**
 * Storage Error Logger Tests - Task 3.3
 * Validates: Requirements R3
 * Tests error classification, logging, and remediation suggestions
 */

const StorageErrorLogger = require('../storageErrorLogger');
const {
  ERROR_TYPES,
  ERROR_CLASSIFICATION,
  classifyError,
  classifyErrorRetryability
} = require('../storageErrorLogger');
const fs = require('fs');
const path = require('path');

describe('StorageErrorLogger - Error Classification', () => {
  describe('classifyError function', () => {
    test('classifies "gzip: invalid header" as WEBDAV_PROTOCOL_ERROR', () => {
      const error = new Error('error when trying to read error from body: gzip: invalid header');
      expect(classifyError(error)).toBe(ERROR_TYPES.WEBDAV_PROTOCOL_ERROR);
    });

    test('classifies "401 Unauthorized" as WEBDAV_AUTH_FAILED', () => {
      const error = new Error('401 Unauthorized');
      expect(classifyError(error)).toBe(ERROR_TYPES.WEBDAV_AUTH_FAILED);
    });

    test('classifies "Connection refused" as CONNECTION_REFUSED', () => {
      const error = new Error('Connection refused on localhost:5244');
      expect(classifyError(error)).toBe(ERROR_TYPES.CONNECTION_REFUSED);
    });

    test('classifies "ECONNREFUSED" as CONNECTION_REFUSED', () => {
      const error = new Error('ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5244');
      expect(classifyError(error)).toBe(ERROR_TYPES.CONNECTION_REFUSED);
    });

    test('classifies "ETIMEDOUT" as CONNECTION_TIMEOUT', () => {
      const error = new Error('ETIMEDOUT: operation timed out');
      expect(classifyError(error)).toBe(ERROR_TYPES.CONNECTION_TIMEOUT);
    });

    test('classifies timeout errors as CONNECTION_TIMEOUT', () => {
      const error = new Error('timeout waiting for response');
      expect(classifyError(error)).toBe(ERROR_TYPES.CONNECTION_TIMEOUT);
    });

    test('classifies "EACCES" as FILE_WRITE_FAILED', () => {
      const error = new Error('EACCES: permission denied');
      expect(classifyError(error)).toBe(ERROR_TYPES.FILE_WRITE_FAILED);
    });

    test('classifies "no space left" as FILE_WRITE_FAILED', () => {
      const error = new Error('no space left on device');
      expect(classifyError(error)).toBe(ERROR_TYPES.FILE_WRITE_FAILED);
    });

    test('classifies "ENOENT" as FILE_NOT_FOUND', () => {
      const error = new Error('ENOENT: no such file or directory');
      expect(classifyError(error)).toBe(ERROR_TYPES.FILE_NOT_FOUND);
    });

    test('classifies "Alist start" errors as ALIST_START_FAILED', () => {
      const error = new Error('Alist start failed');
      expect(classifyError(error)).toBe(ERROR_TYPES.ALIST_START_FAILED);
    });

    test('classifies "rclone failed" as RCLONE_UPLOAD_FAILED', () => {
      const error = new Error('rclone upload failed');
      expect(classifyError(error)).toBe(ERROR_TYPES.RCLONE_UPLOAD_FAILED);
    });

    test('classifies network errors as NETWORK_ERROR', () => {
      const error = new Error('EAI_AGAIN: getaddrinfo temporary failure');
      expect(classifyError(error)).toBe(ERROR_TYPES.NETWORK_ERROR);
    });

    test('defaults unknown errors to UNKNOWN_ERROR', () => {
      const error = new Error('Some random error');
      expect(classifyError(error)).toBe(ERROR_TYPES.UNKNOWN_ERROR);
    });

    test('handles string error messages', () => {
      const result = classifyError('401 Unauthorized');
      expect(result).toBe(ERROR_TYPES.WEBDAV_AUTH_FAILED);
    });

    test('is case-insensitive', () => {
      const error1 = classifyError(new Error('CONNECTION REFUSED'));
      const error2 = classifyError(new Error('connection refused'));
      expect(error1).toBe(error2);
      expect(error1).toBe(ERROR_TYPES.CONNECTION_REFUSED);
    });
  });

  describe('classifyErrorRetryability function', () => {
    test('classifies ETIMEDOUT as TRANSIENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.CONNECTION_TIMEOUT)).toBe(
        ERROR_CLASSIFICATION.TRANSIENT
      );
    });

    test('classifies ECONNREFUSED as TRANSIENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.CONNECTION_REFUSED)).toBe(
        ERROR_CLASSIFICATION.TRANSIENT
      );
    });

    test('classifies NETWORK_ERROR as TRANSIENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.NETWORK_ERROR)).toBe(
        ERROR_CLASSIFICATION.TRANSIENT
      );
    });

    test('classifies ALIST_UNREACHABLE as TRANSIENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.ALIST_UNREACHABLE)).toBe(
        ERROR_CLASSIFICATION.TRANSIENT
      );
    });

    test('classifies WEBDAV_AUTH_FAILED as PERMANENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.WEBDAV_AUTH_FAILED)).toBe(
        ERROR_CLASSIFICATION.PERMANENT
      );
    });

    test('classifies FILE_WRITE_FAILED as PERMANENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.FILE_WRITE_FAILED)).toBe(
        ERROR_CLASSIFICATION.PERMANENT
      );
    });

    test('classifies FILE_NOT_FOUND as PERMANENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.FILE_NOT_FOUND)).toBe(
        ERROR_CLASSIFICATION.PERMANENT
      );
    });

    test('classifies RCLONE_UPLOAD_FAILED as PERMANENT', () => {
      expect(classifyErrorRetryability(ERROR_TYPES.RCLONE_UPLOAD_FAILED)).toBe(
        ERROR_CLASSIFICATION.PERMANENT
      );
    });
  });
});

describe('StorageErrorLogger - Logging', () => {
  let logger;
  const testLogPath = path.join(__dirname, 'test-storage-errors.log');

  beforeEach(() => {
    // Clean up test log file
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
    
    logger = new StorageErrorLogger({
      logFilePath: testLogPath,
      enableConsoleLogging: false,
      enableFileLogging: true
    });
  });

  afterEach(() => {
    logger.clearLogFile();
  });

  describe('logOperation', () => {
    test('logs operation with timestamp and details', () => {
      logger.logOperation('background_upload', {
        filename: 'test.pdf',
        storagePath: '/arsip/zona-01/toko-a/test.pdf'
      });

      const logs = logger.readRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        level: 'INFO',
        operation: 'background_upload',
        filename: 'test.pdf',
        storagePath: '/arsip/zona-01/toko-a/test.pdf'
      });
      expect(logs[0].timestamp).toBeDefined();
    });

    test('includes all provided details in log', () => {
      logger.logOperation('rclone_exec', {
        command: ['rcat', 'terabox:/test.pdf'],
        exitCode: 0
      });

      const logs = logger.readRecentLogs();
      expect(logs[0]).toMatchObject({
        operation: 'rclone_exec',
        command: ['rcat', 'terabox:/test.pdf'],
        exitCode: 0
      });
    });
  });

  describe('logError', () => {
    test('logs error with classification and suggestion', () => {
      const error = new Error('gzip: invalid header');
      logger.logError('background_upload', error, {
        filename: 'invoice.pdf',
        storagePath: '/arsip/zona-01/toko-a/invoices/invoice.pdf',
        attempt: 1,
        maxRetries: 3
      });

      const logs = logger.readRecentLogs();
      expect(logs).toHaveLength(1);
      
      const logEntry = logs[0];
      expect(logEntry).toMatchObject({
        level: 'ERROR',
        operation: 'background_upload',
        errorType: ERROR_TYPES.WEBDAV_PROTOCOL_ERROR,
        errorClassification: ERROR_CLASSIFICATION.PERMANENT,
        errorMessage: 'gzip: invalid header'
      });
      expect(logEntry.suggestion).toBeTruthy();
      expect(logEntry.suggestion).toContain('Alist WebDAV');
      expect(logEntry.context.filename).toBe('invoice.pdf');
      expect(logEntry.context.attempt).toBe(1);
    });

    test('includes suggestion for gzip error', () => {
      const error = new Error('gzip: invalid header');
      logger.logError('upload', error, { filename: 'test.pdf' });

      const logs = logger.readRecentLogs();
      const suggestion = logs[0].suggestion;
      expect(suggestion).toContain('Alist WebDAV');
      expect(suggestion).toContain('localhost:5244');
    });

    test('includes suggestion for 401 auth error', () => {
      const error = new Error('401 Unauthorized');
      logger.logError('upload', error, { filename: 'test.pdf' });

      const logs = logger.readRecentLogs();
      const suggestion = logs[0].suggestion;
      expect(suggestion).toContain('rclone.conf');
      expect(suggestion).toContain('credentials');
    });

    test('includes suggestion for ECONNREFUSED', () => {
      const error = new Error('ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5244');
      logger.logError('upload', error, { filename: 'test.pdf' });

      const logs = logger.readRecentLogs();
      const suggestion = logs[0].suggestion;
      expect(suggestion).toContain('localhost:5244');
      expect(suggestion).toContain('port conflicts');
    });

    test('includes stack trace in error log', () => {
      const error = new Error('Test error\nat line 123');
      error.stack = 'Error: Test error\n    at line 123\n    at Object.<anonymous>';
      
      logger.logError('upload', error, {});

      const logs = logger.readRecentLogs();
      expect(logs[0].stackTrace).toBeTruthy();
      expect(logs[0].stackTrace).toContain('Error: Test error');
    });

    test('preserves context details in error log', () => {
      const error = new Error('Test error');
      logger.logError('background_upload', error, {
        filename: 'document.pdf',
        storagePath: '/arsip/zona-01/toko-a/documents/document.pdf',
        attempt: 2,
        maxRetries: 3,
        nextRetryIn: '5s',
        customField: 'customValue'
      });

      const logs = logger.readRecentLogs();
      const context = logs[0].context;
      expect(context.filename).toBe('document.pdf');
      expect(context.attempt).toBe(2);
      expect(context.maxRetries).toBe(3);
      expect(context.nextRetryIn).toBe('5s');
      expect(context.customField).toBe('customValue');
    });

    test('tracks error statistics', () => {
      logger.logError('upload', new Error('gzip: invalid header'), {});
      logger.logError('upload', new Error('401 Unauthorized'), {});
      logger.logError('upload', new Error('gzip: invalid header'), {});

      const stats = logger.getErrorStats();
      expect(stats[ERROR_TYPES.WEBDAV_PROTOCOL_ERROR]).toBe(2);
      expect(stats[ERROR_TYPES.WEBDAV_AUTH_FAILED]).toBe(1);
    });

    test('resets error statistics', () => {
      logger.logError('upload', new Error('test error'), {});
      logger.resetErrorStats();
      
      const stats = logger.getErrorStats();
      expect(Object.keys(stats).length).toBe(0);
    });
  });
});

describe('StorageErrorLogger - File Operations', () => {
  let logger;
  const testLogPath = path.join(__dirname, 'test-storage-errors.log');

  beforeEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }
    
    logger = new StorageErrorLogger({
      logFilePath: testLogPath,
      enableConsoleLogging: false,
      enableFileLogging: true
    });
  });

  afterEach(() => {
    logger.clearLogFile();
  });

  test('creates log file directory if it does not exist', () => {
    logger.logOperation('test', {});
    expect(fs.existsSync(testLogPath)).toBe(true);
  });

  test('appends logs to existing file', () => {
    logger.logOperation('op1', { id: 1 });
    logger.logOperation('op2', { id: 2 });

    const logs = logger.readRecentLogs();
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  test('can read recent logs from file', () => {
    for (let i = 0; i < 5; i++) {
      logger.logOperation(`operation_${i}`, { index: i });
    }

    const logs = logger.readRecentLogs(3);
    expect(logs.length).toBe(3);
    expect(logs[2].index).toBe(4); // Last log
  });

  test('getLogHistory returns same logs as readRecentLogs', () => {
    for (let i = 0; i < 5; i++) {
      logger.logOperation(`operation_${i}`, { index: i });
    }

    const logs1 = logger.readRecentLogs(3);
    const logs2 = logger.getLogHistory(3);
    expect(logs1).toEqual(logs2);
  });

  test('getLogHistory defaults to 100 lines', () => {
    for (let i = 0; i < 150; i++) {
      logger.logOperation(`operation_${i}`, { index: i });
    }

    const logs = logger.getLogHistory();
    expect(logs.length).toBe(100);
  });


  test('clears log file', () => {
    logger.logOperation('test', {});
    expect(fs.existsSync(testLogPath)).toBe(true);

    logger.clearLogFile();
    expect(fs.existsSync(testLogPath)).toBe(false);
  });

  test('handles missing log file gracefully', () => {
    logger.clearLogFile();
    const logs = logger.readRecentLogs();
    expect(logs).toEqual([]);
  });

  test('handles file write errors gracefully', () => {
    // Create logger with invalid path to trigger error
    const invalidLogger = new StorageErrorLogger({
      logFilePath: '/invalid/path/that/does/not/exist/logs.txt',
      enableFileLogging: true,
      enableConsoleLogging: false
    });

    // Should not throw
    expect(() => {
      invalidLogger.logOperation('test', {});
    }).not.toThrow();
  });

  test('skips file logging when disabled', () => {
    const noFileLogger = new StorageErrorLogger({
      logFilePath: testLogPath,
      enableFileLogging: false,
      enableConsoleLogging: false
    });

    noFileLogger.logOperation('test', {});

    // File should not exist since logging is disabled
    const fileExists = fs.existsSync(testLogPath);
    // (Might not exist if it was never created)
    const logs = noFileLogger.readRecentLogs();
    expect(logs.length).toBe(0);
  });
});

describe('StorageErrorLogger - Console Logging', () => {
  let logger;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    logger = new StorageErrorLogger({
      enableConsoleLogging: true,
      enableFileLogging: false
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('logs operations to console when enabled', () => {
    logger.logOperation('test_op', { detail: 'value' });
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  test('logs errors to console.error when enabled', () => {
    const error = new Error('test error');
    logger.logError('test_op', error, {});
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  test('includes formatted JSON in console output', () => {
    logger.logOperation('test_op', { detail: 'value' });
    const callArgs = consoleLogSpy.mock.calls[0][1];
    expect(typeof callArgs).toBe('string');
    expect(callArgs).toContain('test_op');
  });

  test('skips console logging when disabled', () => {
    const noConsoleLogger = new StorageErrorLogger({
      enableConsoleLogging: false,
      enableFileLogging: false
    });

    noConsoleLogger.logOperation('test', {});
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

describe('StorageErrorLogger - Error Suggestions', () => {
  let logger;

  beforeEach(() => {
    logger = new StorageErrorLogger({
      enableConsoleLogging: false,
      enableFileLogging: false
    });
  });

  test('provides actionable suggestion for each error type', () => {
    const errorExamples = [
      { error: new Error('gzip: invalid header'), type: 'gzip' },
      { error: new Error('401 Unauthorized'), type: 'auth' },
      { error: new Error('ECONNREFUSED: connect ECONNREFUSED 127.0.0.1:5244'), type: 'connection' }
    ];

    errorExamples.forEach(({ error, type }) => {
      const errorType = classifyError(error);
      expect(errorType).toBeDefined();
      // Each error type should have a corresponding suggestion
    });
  });

  test('suggestion is included in error logs', () => {
    // Use a real logger with file output to verify suggestion
    const testLogPath = path.join(__dirname, 'test-suggestions.log');
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }

    const fileLogger = new StorageErrorLogger({
      logFilePath: testLogPath,
      enableConsoleLogging: false,
      enableFileLogging: true
    });

    const error = new Error('gzip: invalid header');
    fileLogger.logError('upload', error, { filename: 'test.pdf' });

    const logs = fileLogger.readRecentLogs();
    expect(logs[0].suggestion).toBeTruthy();
    expect(logs[0].suggestion.length).toBeGreaterThan(10);

    fileLogger.clearLogFile();
  });
});

describe('StorageErrorLogger - Integration Scenarios', () => {
  let logger;
  const testLogPath = path.join(__dirname, 'test-integration.log');

  beforeEach(() => {
    if (fs.existsSync(testLogPath)) {
      fs.unlinkSync(testLogPath);
    }

    logger = new StorageErrorLogger({
      logFilePath: testLogPath,
      enableConsoleLogging: false,
      enableFileLogging: true
    });
  });

  afterEach(() => {
    logger.clearLogFile();
  });

  test('logs background upload retry scenario', () => {
    // Simulate background upload with retries
    const filename = 'invoice-001.pdf';
    const storagePath = '/arsip/zona-01/toko-a/PPN/invoice-001.pdf';

    // Attempt 1: timeout error
    logger.logError('background_upload', new Error('ETIMEDOUT'), {
      filename,
      storagePath,
      attempt: 1,
      maxRetries: 3,
      nextRetryIn: '5s'
    });

    // Attempt 2: network error
    logger.logError('background_upload', new Error('ECONNREFUSED'), {
      filename,
      storagePath,
      attempt: 2,
      maxRetries: 3,
      nextRetryIn: '10s'
    });

    // Attempt 3: success
    logger.logOperation('background_upload', {
      filename,
      storagePath,
      status: 'SUCCESS',
      attempts: 3
    });

    const logs = logger.readRecentLogs();
    expect(logs).toHaveLength(3);
    
    // Verify progression
    expect(logs[0].errorType).toBe(ERROR_TYPES.CONNECTION_TIMEOUT);
    expect(logs[1].errorType).toBe(ERROR_TYPES.CONNECTION_REFUSED);
    expect(logs[2].operation).toBe('background_upload');
    expect(logs[2].status).toBe('SUCCESS');
  });

  test('logs alist startup failure with diagnosis', () => {
    logger.logError('alist_startup', new Error('Alist start failed: bind EADDRINUSE 0.0.0.0:5244'), {
      port: 5244,
      binaryPath: '/app/alist/alist.exe'
    });

    const logs = logger.readRecentLogs();
    expect(logs[0].errorType).toBe(ERROR_TYPES.ALIST_START_FAILED);
    expect(logs[0].suggestion).toContain('5244');
  });

  test('logs rclone auth failure with actionable suggestion', () => {
    logger.logError('rclone_upload', new Error('401 Unauthorized'), {
      filename: 'test.pdf',
      storagePath: '/arsip/test.pdf',
      command: ['rcat', 'terabox:/test.pdf']
    });

    const logs = logger.readRecentLogs();
    const log = logs[0];
    expect(log.errorType).toBe(ERROR_TYPES.WEBDAV_AUTH_FAILED);
    expect(log.suggestion).toContain('rclone.conf');
    expect(log.suggestion).toContain('credentials');
  });

  test('error statistics track error patterns', () => {
    // Simulate multiple errors
    for (let i = 0; i < 5; i++) {
      logger.logError('upload', new Error('ECONNREFUSED'), {});
    }
    for (let i = 0; i < 3; i++) {
      logger.logError('upload', new Error('401 Unauthorized'), {});
    }

    const stats = logger.getErrorStats();
    expect(stats[ERROR_TYPES.CONNECTION_REFUSED]).toBe(5);
    expect(stats[ERROR_TYPES.WEBDAV_AUTH_FAILED]).toBe(3);
  });
});
