/**
 * Alist Startup Handler Unit Tests - Task 2.1
 * Validates: Requirements R1
 * 
 * Test Coverage:
 * - Successful startup on first attempt
 * - Health check retry logic with exponential backoff
 * - Error handling: EADDRINUSE, EACCES, BINARY_NOT_FOUND
 * - Timeout handling (service not responding after 10 attempts)
 * - Proper process cleanup on failure
 */

const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { getAlistBinaryPath, performHealthCheck, startAlistService, initializeAlist } = require('../alistStartupHandler');

// Mock child_process module
jest.mock('child_process');

// Mock http module for health checks
const http = require('http');
jest.mock('http');

describe('Alist Startup Handler - Task 2.1', () => {
    // Mock console to suppress output during tests
    let originalLog, originalError;

    beforeEach(() => {
        originalLog = console.log;
        originalError = console.error;
        console.log = jest.fn();
        console.error = jest.fn();

        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    afterEach(() => {
        console.log = originalLog;
        console.error = originalError;
    });

    // ================================================================
    // Test 1: Binary Path Resolution
    // ================================================================
    describe('getAlistBinaryPath', () => {
        test('should return a valid path containing "alist"', () => {
            const binaryPath = getAlistBinaryPath();
            expect(binaryPath).toBeTruthy();
            expect(binaryPath.toLowerCase()).toContain('alist');
        });

        test('should end with .exe on Windows or just "alist" on Unix', () => {
            const binaryPath = getAlistBinaryPath();
            expect(binaryPath).toMatch(/alist(\.exe)?$/);
        });

        test('path should be consistent on multiple calls', () => {
            const path1 = getAlistBinaryPath();
            const path2 = getAlistBinaryPath();
            expect(path1).toBe(path2);
        });
    });

    // ================================================================
    // Test 2: Successful Health Check on First Attempt
    // ================================================================
    describe('performHealthCheck - Success on First Attempt', () => {
        test('should succeed when server responds with 200', async () => {
            // Mock http.get to return immediate success
            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation((url, options, callback) => {
                // Simulate immediate successful response
                setImmediate(() => {
                    const mockRes = { statusCode: 200 };
                    callback(mockRes);
                });
                return mockReq;
            });

            const result = await performHealthCheck('http://localhost:5244/', 10, 500);
            expect(result).toBe(true);
            expect(http.get).toHaveBeenCalled();
        });

        test('should succeed with 301 redirect (Alist redirects to /web/)', async () => {
            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation((url, options, callback) => {
                setImmediate(() => {
                    const mockRes = { statusCode: 301 };
                    callback(mockRes);
                });
                return mockReq;
            });

            const result = await performHealthCheck('http://localhost:5244/', 10, 500);
            expect(result).toBe(true);
        });

        test('should accept 3xx status codes (redirects)', async () => {
            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation((url, options, callback) => {
                setImmediate(() => {
                    const mockRes = { statusCode: 307 };
                    callback(mockRes);
                });
                return mockReq;
            });

            const result = await performHealthCheck('http://localhost:5244/', 10, 500);
            expect(result).toBe(true);
        });
    });

    // ================================================================
    // Test 3: Health Check Retry Logic with Exponential Backoff
    // ================================================================
    describe('performHealthCheck - Retry Logic', () => {
        test('should retry after transient failures', async () => {
            let callCount = 0;

            http.get.mockImplementation((url, options, callback) => {
                callCount++;
                const mockReq = new EventEmitter();
                mockReq.abort = jest.fn();

                if (callCount < 3) {
                    // First 2 attempts fail
                    setImmediate(() => {
                        mockReq.emit('error', new Error('ECONNREFUSED'));
                    });
                } else {
                    // 3rd attempt succeeds
                    setImmediate(() => {
                        const mockRes = { statusCode: 200 };
                        callback(mockRes);
                    });
                }
                return mockReq;
            });

            const result = await performHealthCheck('http://localhost:5244/', 5, 10);
            expect(result).toBe(true);
            expect(http.get).toHaveBeenCalledTimes(3); // 2 failures + 1 success
        }, 10000);

        test('should fail after max attempts exceeded', async () => {
            http.get.mockImplementation((url, options, callback) => {
                const mockReq = new EventEmitter();
                mockReq.abort = jest.fn();
                // All attempts fail
                setImmediate(() => {
                    mockReq.emit('error', new Error('Persistent failure'));
                });
                return mockReq;
            });

            await expect(
                performHealthCheck('http://localhost:5244/', 3, 10)
            ).rejects.toThrow(/Alist health check failed after 3 attempts/);

            expect(http.get).toHaveBeenCalledTimes(3); // All 3 attempts made
        }, 10000);
    });

    // ================================================================
    // Test 4: Error Handling - EADDRINUSE (Port already in use)
    // ================================================================
    describe('startAlistService - EADDRINUSE Error', () => {
        test('should handle EADDRINUSE error (port already in use)', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            // Simulate EADDRINUSE error
            setImmediate(() => {
                mockProcess.emit('error', Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' }));
            });

            await expect(
                startAlistService(5000)
            ).rejects.toThrow(/address already in use|EADDRINUSE/i);

            expect(mockProcess.kill).not.toHaveBeenCalled(); // Process was never created
        });
    });

    // ================================================================
    // Test 5: Error Handling - EACCES (Permission Denied)
    // ================================================================
    describe('startAlistService - EACCES Error', () => {
        test('should handle EACCES error (permission denied)', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            setImmediate(() => {
                mockProcess.emit('error', Object.assign(new Error('EACCES'), { code: 'EACCES' }));
            });

            await expect(
                startAlistService(5000)
            ).rejects.toThrow(/Permission denied/);

            expect(mockProcess.kill).not.toHaveBeenCalled();
        });
    });

    // ================================================================
    // Test 6: Error Handling - ENOENT (Binary Not Found)
    // ================================================================
    describe('startAlistService - ENOENT Error', () => {
        test('should handle ENOENT error (binary not found)', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            setImmediate(() => {
                mockProcess.emit('error', Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
            });

            await expect(
                startAlistService(5000)
            ).rejects.toThrow(/binary not found/i);

            expect(mockProcess.kill).not.toHaveBeenCalled();
        });
    });

    // ================================================================
    // Test 7: Timeout Handling
    // ================================================================
    describe('startAlistService - Timeout', () => {
        test('should timeout after specified duration with no response', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            // Never emit exit or respond to health checks
            // Timeout should trigger and kill the process

            const startTime = Date.now();
            await expect(
                startAlistService(500) // 500ms timeout for faster test
            ).rejects.toThrow(/timeout|startup timeout/i);

            const elapsed = Date.now() - startTime;
            // Should timeout around 500ms (with tolerance)
            expect(elapsed).toBeGreaterThanOrEqual(400);
            expect(elapsed).toBeLessThan(1500);

            // Process should be killed on timeout
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        }, 3000);
    });

    // ================================================================
    // Test 8: Health Check Timeout During Startup
    // ================================================================
    describe('startAlistService - Health Check Timeout', () => {
        test('should timeout if health check never responds', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            // Mock http.get to never respond
            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation(() => {
                // Return request but never call callback or emit events
                return mockReq;
            });

            await expect(
                startAlistService(1000)
            ).rejects.toThrow();

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        }, 3000);
    });

    // ================================================================
    // Test 9: Process Cleanup on Failure
    // ================================================================
    describe('startAlistService - Process Cleanup', () => {
        test('should kill process when health check fails', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            // Health check fails after retries
            http.get.mockImplementation((url, options, callback) => {
                const mockReq = new EventEmitter();
                mockReq.abort = jest.fn();
                setImmediate(() => mockReq.emit('error', new Error('Health check failed')));
                return mockReq;
            });

            await expect(
                startAlistService(2000)
            ).rejects.toThrow();

            // Process must be killed on failure
            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        }, 5000);

        test('should kill process on startup timeout', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            await expect(
                startAlistService(500)
            ).rejects.toThrow(/timeout/i);

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        }, 3000);
    });

    // ================================================================
    // Test 10: initializeAlist Success Path
    // ================================================================
    describe('initializeAlist', () => {
        test('should return success object when startup succeeds', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            // Mock successful health check
            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation((url, options, callback) => {
                setImmediate(() => {
                    const mockRes = { statusCode: 200 };
                    callback(mockRes);
                });
                return mockReq;
            });

            const result = await initializeAlist();
            expect(result.success).toBe(true);
            expect(result.message).toContain('started');
        }, 3000);

        test('should classify error types correctly', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            setImmediate(() => {
                mockProcess.emit('error', Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' }));
            });

            const result = await initializeAlist();
            expect(result.success).toBe(false);
            expect(result.classification).toBe('PORT_IN_USE');
            expect(result.error).toContain('EADDRINUSE');
        }, 2000);

        test('should provide diagnostic information in error messages', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            setImmediate(() => {
                mockProcess.emit('error', Object.assign(new Error('Permission denied'), { code: 'EACCES' }));
            });

            const result = await initializeAlist();
            expect(result.success).toBe(false);
            expect(result.classification).toBe('PERMISSION_DENIED');
            expect(result.message).toContain('permission');
        }, 2000);
    });

    // ================================================================
    // Test 11: Alist Output Logging
    // ================================================================
    describe('startAlistService - Output Logging', () => {
        test('should log Alist stdout output', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            // Mock successful health check
            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation((url, options, callback) => {
                setImmediate(() => {
                    const mockRes = { statusCode: 200 };
                    callback(mockRes);
                });
                return mockReq;
            });

            const startPromise = startAlistService(2000);

            // Emit stdout data
            setImmediate(() => {
                mockProcess.stdout.emit('data', Buffer.from('Alist server started\n'));
            });

            await startPromise;

            // Verify stdout was logged
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Alist server started'));
        }, 3000);

        test('should log Alist stderr output', async () => {
            const mockProcess = new EventEmitter();
            mockProcess.kill = jest.fn();
            mockProcess.stdout = new EventEmitter();
            mockProcess.stderr = new EventEmitter();

            spawn.mockReturnValue(mockProcess);

            const mockReq = new EventEmitter();
            mockReq.abort = jest.fn();
            http.get.mockImplementation((url, options, callback) => {
                setImmediate(() => {
                    const mockRes = { statusCode: 200 };
                    callback(mockRes);
                });
                return mockReq;
            });

            const startPromise = startAlistService(2000);

            setImmediate(() => {
                mockProcess.stderr.emit('data', Buffer.from('Warning: config missing\n'));
            });

            await startPromise;

            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('config missing'));
        }, 3000);
    });
});
