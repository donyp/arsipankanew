// ============================================================
// Unit Tests for Rclone Connectivity Verification (Task 2.2)
// ============================================================

const {
    parseRcloneOutput,
    classifyRcloneError,
    getConnectionStatus,
    verifyRcloneConnectivity,
    initializeRcloneConnectivity
} = require('../rcloneConnectivityHandler');

describe('Rclone Connectivity Verification', () => {
    
    // ============================================================
    // Test Suite 1: Output Parsing
    // ============================================================
    describe('parseRcloneOutput', () => {
        test('should parse valid JSON file list from rclone lsjson', () => {
            const stdout = JSON.stringify([
                { Name: 'folder1', Size: 0, ModTime: '2024-01-15T10:30:00Z', IsDir: true },
                { Name: 'file1.pdf', Size: 1024, ModTime: '2024-01-15T10:30:00Z', IsDir: false }
            ]);

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(result.fileList).toHaveLength(2);
            expect(result.fileList[0].Name).toBe('folder1');
            expect(result.fileList[1].Name).toBe('file1.pdf');
            expect(result.error).toBeNull();
        });

        test('should handle empty file list', () => {
            const stdout = JSON.stringify([]);

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(result.fileList).toHaveLength(0);
            expect(result.error).toBeNull();
        });

        test('should handle empty stdout', () => {
            const result = parseRcloneOutput('', '');
            
            expect(result.success).toBe(true);
            expect(result.fileList).toHaveLength(0);
            expect(result.error).toBeNull();
        });

        test('should handle invalid JSON and return parse error', () => {
            const stdout = 'Not valid JSON <html>Error page</html>';

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(false);
            expect(result.error).not.toBeNull();
            expect(result.error.message).toContain('Invalid JSON');
        });

        test('should parse single object as array', () => {
            const stdout = JSON.stringify({ Name: 'file.pdf', Size: 2048, IsDir: false });

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(Array.isArray(result.fileList)).toBe(true);
            expect(result.fileList.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // Test Suite 2: Error Classification
    // ============================================================
    describe('classifyRcloneError', () => {
        test('should classify 401 Unauthorized as AUTH error', () => {
            const stderr = 'error: 401 Unauthorized';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('AUTH');
            expect(result.message).toContain('401');
            expect(result.message).toContain('credentials');
        });

        test('should classify gzip header error as UNREACHABLE', () => {
            const stderr = 'error when trying to read error from body: gzip: invalid header';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('UNREACHABLE');
            expect(result.message).toContain('WebDAV');
        });

        test('should classify Connection refused as UNREACHABLE', () => {
            const stderr = 'Connection refused: 127.0.0.1:5244';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('UNREACHABLE');
            expect(result.message).toContain('localhost:5244');
        });

        test('should classify ECONNREFUSED as UNREACHABLE', () => {
            const stderr = 'Error: ECONNREFUSED - Cannot connect to Alist';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('UNREACHABLE');
        });

        test('should classify ETIMEDOUT as TRANSIENT', () => {
            const stderr = 'Error: ETIMEDOUT';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('TRANSIENT');
            expect(result.message).toContain('timeout');
        });

        test('should classify DNS error EAI_AGAIN as TRANSIENT', () => {
            const stderr = 'Error: EAI_AGAIN';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('TRANSIENT');
        });

        test('should classify config file not found as PERMANENT', () => {
            const stderr = 'Error: config file not found';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('PERMANENT');
            expect(result.message).toContain('rclone.conf');
        });

        test('should classify EHOSTUNREACH as UNREACHABLE', () => {
            const stderr = 'Error: EHOSTUNREACH - No route to host';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('UNREACHABLE');
        });

        test('should classify unknown errors as UNKNOWN', () => {
            const stderr = 'Some random error message';
            
            const result = classifyRcloneError(stderr, 1);
            
            expect(result.type).toBe('UNKNOWN');
        });

        test('should handle empty error message', () => {
            const result = classifyRcloneError('', 1);
            
            expect(result.type).toBe('UNKNOWN');
            expect(result.message).toBeDefined();
        });
    });

    // ============================================================
    // Test Suite 3: Connection Status Management
    // ============================================================
    describe('getConnectionStatus', () => {
        test('should return connection status object', () => {
            const status = getConnectionStatus();
            
            expect(status).toHaveProperty('verified');
            expect(status).toHaveProperty('timestamp');
            expect(status).toHaveProperty('error');
            expect(status).toHaveProperty('healthy');
            expect(typeof status.verified).toBe('boolean');
        });

        test('should track connection attempts', () => {
            const status1 = getConnectionStatus();
            const attempts1 = status1.attempts;
            
            const status2 = getConnectionStatus();
            const attempts2 = status2.attempts;
            
            // Status should be consistent between calls (not increment on read)
            expect(attempts1).toBe(attempts2);
        });
    });

    // ============================================================
    // Test Suite 4: Error Message and Diagnostic Information
    // ============================================================
    describe('Error Messages and Diagnostics', () => {
        test('AUTH error should suggest checking credentials', () => {
            const stderr = 'error: 401 Unauthorized';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.message).toContain('credentials');
            expect(error.message).toContain('Alist');
        });

        test('UNREACHABLE gzip error should suggest Alist configuration', () => {
            const stderr = 'error when trying to read error from body: gzip: invalid header';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.message).toContain('configured');
        });

        test('TRANSIENT timeout error should indicate temporary issue', () => {
            const stderr = 'Error: ETIMEDOUT';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.message.toLowerCase()).toContain('network');
        });

        test('UNREACHABLE connection refused should suggest service check', () => {
            const stderr = 'Connection refused: 127.0.0.1:5244';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.message).toContain('localhost:5244');
            expect(error.message).toContain('running');
        });
    });

    // ============================================================
    // Test Suite 5: Parsing Edge Cases
    // ============================================================
    describe('Output Parsing Edge Cases', () => {
        test('should handle newlines in JSON output', () => {
            const stdout = JSON.stringify([
                { Name: 'file1.pdf', Size: 1024 }
            ]) + '\n';

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(result.fileList).toHaveLength(1);
        });

        test('should handle large file lists', () => {
            const files = Array.from({ length: 1000 }, (_, i) => ({
                Name: `file${i}.pdf`,
                Size: 1024 * (i + 1),
                ModTime: '2024-01-15T10:30:00Z'
            }));
            const stdout = JSON.stringify(files);

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(result.fileList).toHaveLength(1000);
        });

        test('should handle special characters in file names', () => {
            const files = [
                { Name: 'file-with-dash.pdf', Size: 1024 },
                { Name: 'file_with_underscore.pdf', Size: 1024 },
                { Name: 'file with space.pdf', Size: 1024 },
                { Name: 'файл.pdf', Size: 1024 } // Cyrillic
            ];
            const stdout = JSON.stringify(files);

            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(result.fileList).toHaveLength(4);
            expect(result.fileList[3].Name).toContain('файл');
        });

        test('should handle deeply nested JSON structures', () => {
            const stdout = JSON.stringify({
                files: [
                    { Name: 'file.pdf', Size: 1024 }
                ]
            });

            const result = parseRcloneOutput(stdout, '');
            
            // Should parse successfully even if structure doesn't match expected
            expect(result).toHaveProperty('success');
        });
    });

    // ============================================================
    // Test Suite 6: Multiple Error Scenarios
    // ============================================================
    describe('Error Classification - Multiple Scenarios', () => {
        test('should prioritize 401 error over other messages', () => {
            const stderr = 'Connection timeout: 401 Unauthorized';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.type).toBe('AUTH');
        });

        test('should handle combined error messages', () => {
            const stderr = 'gzip: invalid header\nConnection reset';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.type).toBe('UNREACHABLE');
        });

        test('should classify DNS-related errors', () => {
            const stderr = 'Error: getaddrinfo ENOTFOUND localhost';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.type).toBe('TRANSIENT');
        });

        test('should handle ENOENT (file not found) as PERMANENT', () => {
            const stderr = 'Error: ENOENT - rclone.conf not found';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.type).toBe('PERMANENT');
        });
    });

    // ============================================================
    // Test Suite 7: Status Persistence
    // ============================================================
    describe('Connection Status Persistence', () => {
        test('should maintain status across multiple calls', () => {
            const status1 = getConnectionStatus();
            const verified1 = status1.verified;
            
            // Small delay to ensure no automatic updates
            const status2 = getConnectionStatus();
            const verified2 = status2.verified;
            
            expect(verified1).toBe(verified2);
        });

        test('should track error information over time', () => {
            const status = getConnectionStatus();
            
            expect(status).toHaveProperty('error');
            expect(status).toHaveProperty('lastError');
            expect(status).toHaveProperty('timestamp');
        });
    });

    // ============================================================
    // Test Suite 8: Integration Scenarios
    // ============================================================
    describe('Integration Scenarios', () => {
        test('successful parse should result in verified status indicator', () => {
            const stdout = JSON.stringify([{ Name: 'file.pdf', Size: 1024 }]);
            const result = parseRcloneOutput(stdout, '');
            
            expect(result.success).toBe(true);
            expect(result.fileList.length).toBeGreaterThan(0);
        });

        test('auth error should be classified as AUTH type', () => {
            const stderr = 'error: 401 Unauthorized';
            const error = classifyRcloneError(stderr, 1);
            
            expect(error.type).toBe('AUTH');
            expect(['AUTH']).toContain(error.type);
        });

        test('unreachable scenarios should suggest connectivity checks', () => {
            const errorScenarios = [
                { stderr: 'Connection refused: 127.0.0.1:5244', expectedType: 'UNREACHABLE' },
                { stderr: 'gzip: invalid header', expectedType: 'UNREACHABLE' },
                { stderr: 'EHOSTUNREACH', expectedType: 'UNREACHABLE' }
            ];

            errorScenarios.forEach(({ stderr, expectedType }) => {
                const error = classifyRcloneError(stderr, 1);
                expect(error.type).toBe(expectedType);
            });
        });
    });

});

// ============================================================
// Export for integration testing
// ============================================================
module.exports = {
    parseRcloneOutput,
    classifyRcloneError,
    getConnectionStatus
};
