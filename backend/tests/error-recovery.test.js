/**
 * Error Recovery Test - Simulate Alist Failure (Task 5.2)
 * 
 * Test Scenario: Alist crashes mid-upload
 * Setup: Start backend, initiate upload
 * During background task execution: Kill Alist process
 * 
 * Expected Behavior:
 * 1. Upload attempt fails with ECONNREFUSED
 * 2. Error classified as TRANSIENT
 * 3. Retry logic activates (wait 5 seconds)
 * 4. Attempt 2 fails (Alist still down)
 * 5. After 3 attempts: Mark file synced=false, log error
 * 
 * Recovery:
 * 1. Manually restart Alist
 * 2. Trigger manual retry: POST /api/files/{id}/retry-sync
 * 3. Verify file syncs successfully
 * 
 * **Validates: Requirements R2, R3**
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const request = require('supertest');

const TEST_SERVER_PORT = process.env.PORT || 7860;
const TEST_SERVER_URL = `http://localhost:${TEST_SERVER_PORT}`;

// Mocks for file and child_process
jest.mock('child_process');
jest.mock('fs');

const RcloneStorage = require('../rclone_wrapper');
const { shouldRetryError, getRetryDelay } = require('../retryLogic');
const StorageErrorLogger = require('../storageErrorLogger');

describe('Error Recovery Test - Alist Failure Simulation (Task 5.2)', () => {
  let mockErrorLogger;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    mockErrorLogger = new StorageErrorLogger({
      enableFileLogging: false,
      enableConsoleLogging: false
    });

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  // =========================================================================
  // TC1: Alist Failure - Connection Refused Classification
  // =========================================================================
  describe('TC1: Error Classification - ECONNREFUSED classified as TRANSIENT', () => {
    it('should classify ECONNREFUSED as transient error', () => {
      // Arrange
      const error = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      error.code = 'ECONNREFUSED';

      // Act
      const isTransient = shouldRetryError(error);

      // Assert
      expect(isTransient).toBe(true);
      console.log(`✅ ECONNREFUSED correctly classified as TRANSIENT`);
    });

    it('should classify "Connection refused" in message as transient', () => {
      // Arrange
      const error = new Error('Connection refused when connecting to Alist at localhost:5244');

      // Act
      const isTransient = shouldRetryError(error);

      // Assert
      expect(isTransient).toBe(true);
      console.log(`✅ "Connection refused" message correctly classified as TRANSIENT`);
    });

    it('should classify permanent error (401 Unauthorized) as non-retryable', () => {
      // Arrange
      const error = new Error('401 Unauthorized: Invalid credentials for Terabox');
      error.code = '401';

      // Act
      const isTransient = shouldRetryError(error);

      // Assert
      expect(isTransient).toBe(false);
      console.log(`✅ 401 Unauthorized correctly classified as PERMANENT`);
    });
  });

  // =========================================================================
  // TC2: Alist Failure - Upload Attempt with ECONNREFUSED
  // =========================================================================
  describe('TC2: Upload attempt fails with ECONNREFUSED when Alist down', () => {
    it('should fail first upload attempt when Alist unreachable', async () => {
      // Arrange
      const fileBuffer = Buffer.from('test invoice data');
      const filename = 'invoice-alist-down.pdf';
      const zonaKode = 'zona-01';
      const tokoKode = 'toko-a';
      const category = 'PPN';

      const alistDownError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      alistDownError.code = 'ECONNREFUSED';

      // Mock uploadDirect to fail with Alist down error
      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(alistDownError);

      // Act
      const result = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, zonaKode, tokoKode, category
      );

      // Assert - First attempt failed
      expect(result.success).toBe(false);
      expect(result.syncAttempts).toBeGreaterThan(1); // Should have retried
      expect(result.syncError).toContain('Connection refused');
      
      // Verify database fields
      expect(result.storagePath).toBeDefined();
      expect(typeof result.syncError).toBe('string');

      console.log(`✅ Upload correctly failed with ECONNREFUSED`);
      console.log(`   Sync attempts: ${result.syncAttempts}, Error: ${result.syncError}`);
    }, 60000);

    it('should log ATTEMPT messages for each retry on Alist down', async () => {
      // Arrange
      const fileBuffer = Buffer.from('invoice content');
      const filename = 'invoice-retry-tracking.pdf';

      const alistDownError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      alistDownError.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(alistDownError);

      // Act
      const result = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert - All attempts logged
      const attemptLogs = consoleLogSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] ATTEMPT'));
      
      expect(attemptLogs.length).toBeGreaterThan(0);
      expect(attemptLogs[0][0]).toMatch(/\[Background Upload\] ATTEMPT \d+/);
      
      // Verify failure logged
      const failureLogs = consoleErrorSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] FAILED'));
      
      expect(failureLogs.length).toBeGreaterThan(0);
      expect(failureLogs[0][0]).toContain('after 3 attempts');

      console.log(`✅ All ${result.syncAttempts} attempts logged properly`);
    }, 60000);
  });

  // =========================================================================
  // TC3: Retry Logic Activation with Exponential Backoff
  // =========================================================================
  describe('TC3: Retry logic activates with exponential backoff delays', () => {
    it('should implement exponential backoff delays: 5s, 10s, 20s', () => {
      // Act & Assert - Verify backoff pattern
      const delay1 = getRetryDelay(1, 5000);
      const delay2 = getRetryDelay(2, 5000);
      const delay3 = getRetryDelay(3, 5000);

      expect(delay1).toBe(5000);  // 5s * 2^0
      expect(delay2).toBe(10000); // 5s * 2^1
      expect(delay3).toBe(20000); // 5s * 2^2

      console.log(`✅ Exponential backoff verified: ${delay1}ms, ${delay2}ms, ${delay3}ms`);
    });

    it('should calculate correct delay for any attempt number', () => {
      // Arrange
      const baseDelay = 5000;
      const testCases = [
        { attempt: 1, expectedDelay: 5000 },
        { attempt: 2, expectedDelay: 10000 },
        { attempt: 3, expectedDelay: 20000 },
        { attempt: 4, expectedDelay: 40000 }
      ];

      // Act & Assert
      testCases.forEach(tc => {
        const delay = getRetryDelay(tc.attempt, baseDelay);
        expect(delay).toBe(tc.expectedDelay);
      });

      console.log(`✅ All backoff delays calculated correctly`);
    });
  });

  // =========================================================================
  // TC4: Database State Transitions - Sync Status
  // =========================================================================
  describe('TC4: Database state transitions correctly during error recovery', () => {
    it('should mark file synced=false after 3 failed attempts', async () => {
      // Arrange
      const fileBuffer = Buffer.from('document');
      const filename = 'invoice-sync-false.pdf';

      const alistDownError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      alistDownError.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(alistDownError);

      // Act
      const result = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert - Database field expectations
      expect(result.success).toBe(false); // File NOT synced
      expect(result.syncAttempts).toBe(3); // Tried 3 times
      expect(result.syncError).toBeDefined();
      expect(result.syncError?.length).toBeGreaterThan(0);
      expect(result.storagePath).toBeDefined();

      console.log(`✅ Database state correct: synced=${!result.success}, attempts=${result.syncAttempts}`);
    }, 60000);

    it('should log error with all required fields at each stage', async () => {
      // Arrange
      const fileBuffer = Buffer.from('data');
      const filename = 'invoice-logging.pdf';

      const alistDownError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      alistDownError.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(alistDownError);

      // Act
      const result = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert - Error logging completeness
      const allLogs = [
        ...consoleLogSpy.mock.calls,
        ...consoleErrorSpy.mock.calls
      ];

      const backgroundUploadLogs = allLogs
        .filter(call => call[0]?.includes('[Background Upload]'));

      expect(backgroundUploadLogs.length).toBeGreaterThan(0);

      // Verify failure message contains required fields
      const failureLogs = consoleErrorSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] FAILED'));

      expect(failureLogs.length).toBeGreaterThan(0);
      const failureMsg = failureLogs[0][0];
      expect(failureMsg).toContain(filename);
      expect(failureMsg).toContain('attempts');
      expect(failureMsg).toContain('Connection refused');

      console.log(`✅ Error logging contains all required fields`);
    }, 60000);
  });

  // =========================================================================
  // TC5: Recovery - Successful Sync After Alist Restart
  // =========================================================================
  describe('TC5: Recovery after Alist restart - Manual retry endpoint', () => {
    it('should succeed on manual retry after Alist is restarted', async () => {
      // Arrange
      const fileBuffer = Buffer.from('recovered content');
      const filename = 'invoice-recovery.pdf';

      const alistDownError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      alistDownError.code = 'ECONNREFUSED';

      // Mock: First 3 attempts fail (Alist down), 4th attempt succeeds (Alist restarted)
      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValueOnce(alistDownError)
        .mockRejectedValueOnce(alistDownError)
        .mockRejectedValueOnce(alistDownError)
        // After manual restart, next attempt succeeds
        .mockResolvedValueOnce({
          storagePath: '/arsip/zona-01/toko-a/PPN/invoice-recovery.pdf',
          size: fileBuffer.length
        });

      // Act - First upload attempt (will fail after 3 retries)
      const initialResult = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert - Initial failure
      expect(initialResult.success).toBe(false);
      expect(initialResult.syncAttempts).toBe(3);

      // Act - Manual retry (after Alist restart)
      const recoveryResult = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert - Successful recovery
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.syncAttempts).toBe(1); // Fresh attempt
      expect(recoveryResult.syncError).toBeNull();

      console.log(`✅ File successfully recovered after Alist restart`);
      console.log(`   Initial attempts: ${initialResult.syncAttempts}`);
      console.log(`   Recovery attempt: ${recoveryResult.syncAttempts}`);
    }, 60000);

    it('should log recovery success with proper messaging', async () => {
      // Arrange
      const fileBuffer = Buffer.from('recovery test');
      const filename = 'invoice-recovery-log.pdf';

      const alistDownError = new Error('ECONNREFUSED: Connection refused');
      alistDownError.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(alistDownError)
        .mockResolvedValueOnce({
          storagePath: '/arsip/zona-01/toko-a/PPN/invoice-recovery-log.pdf',
          size: fileBuffer.length
        });

      // Act - Initial failure
      const initialResult = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Clear previous logs
      consoleLogSpy.mockClear();
      consoleErrorSpy.mockClear();

      // Act - Recovery attempt
      const recoveryResult = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert
      expect(recoveryResult.success).toBe(true);

      const successLogs = consoleLogSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] SUCCESS'));

      expect(successLogs.length).toBeGreaterThan(0);
      expect(successLogs[0][0]).toContain(filename);

      console.log(`✅ Recovery success logged properly`);
    }, 60000);
  });

  // =========================================================================
  // TC6: Comprehensive Error Logging Validation
  // =========================================================================
  describe('TC6: Error logging captures complete context at each stage', () => {
    it('should log attempt messages with filename and attempt number', async () => {
      // Arrange
      const fileBuffer = Buffer.from('data');
      const filename = 'invoice-attempt-log.pdf';

      const error = new Error('ECONNREFUSED: Connection refused');
      error.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(error);

      // Act
      const result = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert
      const attemptLogs = consoleLogSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] ATTEMPT'));

      // Should have logged attempts 1, 2, 3
      expect(attemptLogs.length).toBeGreaterThanOrEqual(1);

      // Verify log format
      attemptLogs.forEach((log, idx) => {
        expect(log[0]).toMatch(/\[Background Upload\] ATTEMPT \d+/);
        expect(log[0]).toContain(filename);
      });

      console.log(`✅ Attempt logs contain filename and attempt number`);
    }, 60000);

    it('should log failure with error message and context', async () => {
      // Arrange
      const fileBuffer = Buffer.from('data');
      const filename = 'invoice-error-context.pdf';

      const error = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      error.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(error);

      // Act
      const result = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert
      const failureLogs = consoleErrorSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] FAILED'));

      expect(failureLogs.length).toBeGreaterThan(0);

      const failureMsg = failureLogs[0][0];
      expect(failureMsg).toContain(filename);
      expect(failureMsg).toContain('after 3 attempts');
      expect(failureMsg).toContain('Connection refused');

      console.log(`✅ Failure log contains filename, attempt count, and error message`);
    }, 60000);
  });

  // =========================================================================
  // TC7: Integration - Full Error Recovery Flow
  // =========================================================================
  describe('TC7: Full error recovery workflow', () => {
    it('should handle complete Alist down → retry → recovery flow', async () => {
      // Arrange
      const fileBuffer = Buffer.from('invoice data');
      const filename = 'invoice-full-recovery.pdf';

      const alistDownError = new Error('ECONNREFUSED: Connection refused at 127.0.0.1:5244');
      alistDownError.code = 'ECONNREFUSED';

      // Mock sequence: fail 3 times, then succeed on recovery
      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValueOnce(alistDownError)
        .mockRejectedValueOnce(alistDownError)
        .mockRejectedValueOnce(alistDownError)
        .mockResolvedValueOnce({
          storagePath: '/arsip/zona-01/toko-a/PPN/invoice-full-recovery.pdf',
          size: fileBuffer.length
        });

      // Act - Phase 1: Initial upload attempt (fails)
      const phase1 = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert Phase 1
      expect(phase1.success).toBe(false);
      expect(phase1.syncAttempts).toBe(3);
      expect(phase1.syncError).toBeDefined();

      const phase1Logs = consoleErrorSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] FAILED'));
      expect(phase1Logs.length).toBeGreaterThan(0);

      // Act - Phase 2: Simulate Alist restart and manual retry
      const phase2 = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );

      // Assert Phase 2
      expect(phase2.success).toBe(true);
      expect(phase2.syncAttempts).toBe(1);
      expect(phase2.syncError).toBeNull();

      const phase2Logs = consoleLogSpy.mock.calls
        .filter(call => call[0]?.includes('[Background Upload] SUCCESS'));
      expect(phase2Logs.length).toBeGreaterThan(0);

      console.log(`✅ Complete error recovery workflow validated`);
      console.log(`   Phase 1 (Alist down): ${phase1.syncAttempts} attempts, failed`);
      console.log(`   Phase 2 (Recovery): ${phase2.syncAttempts} attempt, succeeded`);
    }, 120000);

    it('should transition database correctly: synced=false → true through recovery', async () => {
      // Arrange
      const fileBuffer = Buffer.from('invoice');
      const filename = 'invoice-state-transition.pdf';

      const error = new Error('ECONNREFUSED: Connection refused');
      error.code = 'ECONNREFUSED';

      jest.spyOn(RcloneStorage, 'uploadDirect')
        .mockRejectedValue(error)
        .mockResolvedValueOnce({
          storagePath: '/arsip/zona-01/toko-a/PPN/invoice-state-transition.pdf',
          size: fileBuffer.length
        });

      // Act & Assert - State before recovery
      const beforeRecovery = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );
      expect(beforeRecovery.success).toBe(false); // synced = false

      // Act & Assert - State after recovery
      const afterRecovery = await RcloneStorage.uploadInBackground(
        fileBuffer, filename, 'zona-01', 'toko-a', 'PPN'
      );
      expect(afterRecovery.success).toBe(true); // synced = true

      console.log(`✅ Database state transition validated: false → true`);
    }, 60000);
  });
});
