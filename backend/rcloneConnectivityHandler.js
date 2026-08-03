// ============================================================
// Rclone Connectivity Verification Handler - Task 2.2
// Verifies Rclone can connect to Alist WebDAV endpoint
// ============================================================

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

// Global connection status (stored in memory for health checks)
let rcloneConnectionStatus = {
    verified: false,
    timestamp: null,
    error: null,
    attempts: 0,
    lastError: null,
    credentialSource: null
};

const isWindows = process.platform === 'win32';
const rclonePath = isWindows
    ? path.resolve(__dirname, '..', 'rclone.exe')
    : (process.env.RCLONE_BIN || path.resolve(__dirname, '..', 'rclone'));
const configPath = process.env.RCLONE_CONFIG || path.resolve(__dirname, '..', 'rclone.conf');

/**
 * Parse Rclone lsjson output
 * Returns: { success: boolean, fileList: Array, error?: Error }
 */
function parseRcloneOutput(stdout, stderr) {
    try {
        // Try to parse stdout as JSON
        if (stdout && stdout.trim()) {
            const parsed = JSON.parse(stdout);
            // Should be an array of files
            if (Array.isArray(parsed)) {
                return {
                    success: true,
                    fileList: parsed,
                    error: null
                };
            }
            // Single object response (sometimes Rclone returns a single object for root listing)
            return {
                success: true,
                fileList: Array.isArray(parsed) ? parsed : [parsed],
                error: null
            };
        }
        return {
            success: true,
            fileList: [],
            error: null
        };
    } catch (err) {
        // JSON parse error - indicates Rclone output is not valid JSON
        // This usually happens when Alist returns HTML error page instead of WebDAV response
        return {
            success: false,
            fileList: [],
            error: new Error(`Invalid JSON from Rclone: ${err.message}`)
        };
    }
}

/**
 * Classify Rclone errors into categories
 * Returns: { type: 'TRANSIENT'|'PERMANENT'|'AUTH'|'UNREACHABLE'|'UNKNOWN', message: string }
 */
function classifyRcloneError(stderr, exitCode) {
    const errorMsg = stderr || '';

    // Auth failures - 401 Unauthorized
    if (errorMsg.includes('401 Unauthorized') || errorMsg.includes('401')) {
        return {
            type: 'AUTH',
            message: '401 Unauthorized - check rclone.conf credentials against Alist admin account'
        };
    }

    // Gzip header errors - indicates Alist WebDAV misconfiguration
    if (errorMsg.includes('gzip: invalid header')) {
        return {
            type: 'UNREACHABLE',
            message: 'Alist WebDAV not responding correctly (gzip error) - verify Alist is properly configured'
        };
    }

    // Connection refused - Alist service not listening
    if (errorMsg.includes('Connection refused') || errorMsg.includes('ECONNREFUSED')) {
        return {
            type: 'UNREACHABLE',
            message: 'Cannot reach Alist on localhost:5244 - verify Alist service is running'
        };
    }

    // Network timeouts
    if (errorMsg.includes('ETIMEDOUT') || errorMsg.includes('timeout')) {
        return {
            type: 'TRANSIENT',
            message: 'Network timeout connecting to Alist - temporary network issue'
        };
    }

    // DNS resolution errors
    if (errorMsg.includes('EAI_AGAIN') || errorMsg.includes('getaddrinfo')) {
        return {
            type: 'TRANSIENT',
            message: 'DNS resolution error - temporary network issue'
        };
    }

    // Host unreachable
    if (errorMsg.includes('EHOSTUNREACH') || errorMsg.includes('No route to host')) {
        return {
            type: 'UNREACHABLE',
            message: 'Host unreachable - network configuration issue'
        };
    }

    // Generic connection errors
    if (errorMsg.includes('error when trying to read error from body')) {
        return {
            type: 'UNREACHABLE',
            message: 'Alist WebDAV endpoint error - verify Alist configuration and port 5244'
        };
    }

    // Config file missing
    if (errorMsg.includes('config file not found') || errorMsg.includes('ENOENT')) {
        return {
            type: 'PERMANENT',
            message: `rclone.conf not found at ${configPath}`
        };
    }

    // Unknown error
    return {
        type: 'UNKNOWN',
        message: `Rclone error: ${errorMsg || 'Unknown error'}`
    };
}

/**
 * Verify Rclone connectivity to Alist WebDAV
 * Executes: rclone --config rclone.conf lsjson terabox:/
 * 
 * Returns: {
 *   verified: boolean,
 *   message: string,
 *   errorType?: 'AUTH' | 'UNREACHABLE' | 'PERMANENT' | 'UNKNOWN',
 *   errorDetails?: string,
 *   suggestion?: string
 * }
 */
async function verifyRcloneConnectivity() {
    console.log('[Rclone] Starting connectivity verification...');
    console.log(`[Rclone] Using rclone binary: ${rclonePath}`);
    console.log(`[Rclone] Using config file: ${configPath}`);

    // Check if rclone config exists
    if (!fs.existsSync(configPath)) {
        const message = `[Rclone] ❌ Configuration file not found at ${configPath}`;
        console.error(message);
        
        rcloneConnectionStatus = {
            verified: false,
            timestamp: new Date(),
            error: 'CONFIG_NOT_FOUND',
            attempts: 1,
            lastError: message,
            credentialSource: null
        };

        return {
            verified: false,
            message,
            errorType: 'PERMANENT',
            errorDetails: `rclone.conf is missing at ${configPath}`,
            suggestion: 'Verify rclone.conf exists in workspace root'
        };
    }

    return new Promise((resolve) => {
        const remoteConfig = 'terabox:/';
        const args = ['--config', configPath, 'lsjson', remoteConfig];

        console.log(`[Rclone] Executing: ${rclonePath} ${args.join(' ')}`);

        const timeout = setTimeout(() => {
            console.error('[Rclone] ❌ Connectivity check timeout (10s)');
            rcloneConnectionStatus = {
                verified: false,
                timestamp: new Date(),
                error: 'TIMEOUT',
                attempts: rcloneConnectionStatus.attempts + 1,
                lastError: 'Rclone command timeout after 10 seconds',
                credentialSource: rcloneConnectionStatus.credentialSource
            };

            resolve({
                verified: false,
                message: '[Rclone] ❌ Connection timeout',
                errorType: 'TRANSIENT',
                errorDetails: 'Rclone command did not complete within 10 seconds',
                suggestion: 'Verify network connectivity to Alist on localhost:5244'
            });
        }, 10000);

        execFile(rclonePath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            clearTimeout(timeout);

            if (error) {
                // Exit code non-zero - Rclone encountered an error
                const classification = classifyRcloneError(stderr || error.message, error.code);
                const message = `[Rclone] ❌ Connection failed (${classification.type})`;
                
                console.error(message);
                console.error(`[Rclone] Error details: ${classification.message}`);
                console.error(`[Rclone] Stderr: ${stderr || error.message}`);

                // Load credentials from rclone.conf for diagnostic logging
                let credentialInfo = '';
                try {
                    const configContent = fs.readFileSync(configPath, 'utf8');
                    // Extract terabox section
                    const teraboxMatch = configContent.match(/\[terabox\]([\s\S]*?)(?=\[|$)/);
                    if (teraboxMatch) {
                        // Extract URL and user (not password for security)
                        const urlMatch = teraboxMatch[0].match(/url\s*=\s*(.+)/);
                        const userMatch = teraboxMatch[0].match(/user\s*=\s*(.+)/);
                        if (urlMatch) credentialInfo += `\n  WebDAV URL: ${urlMatch[1].trim()}`;
                        if (userMatch) credentialInfo += `\n  Username: ${userMatch[1].trim()}`;
                    }
                } catch (e) {
                    credentialInfo = '\n  (Could not read rclone.conf)';
                }

                rcloneConnectionStatus = {
                    verified: false,
                    timestamp: new Date(),
                    error: classification.type,
                    attempts: rcloneConnectionStatus.attempts + 1,
                    lastError: classification.message,
                    credentialSource: credentialInfo
                };

                return resolve({
                    verified: false,
                    message,
                    errorType: classification.type,
                    errorDetails: classification.message + credentialInfo,
                    suggestion: getSuggestionForError(classification.type)
                });
            }

            // Exit code 0 - Rclone succeeded
            const parseResult = parseRcloneOutput(stdout, stderr);

            if (parseResult.success) {
                const message = '[Rclone] ✅ WebDAV connection verified';
                console.log(message);
                console.log(`[Rclone] File list returned: ${parseResult.fileList.length} items`);

                rcloneConnectionStatus = {
                    verified: true,
                    timestamp: new Date(),
                    error: null,
                    attempts: rcloneConnectionStatus.attempts + 1,
                    lastError: null,
                    credentialSource: 'rclone.conf'
                };

                return resolve({
                    verified: true,
                    message,
                    errorType: null,
                    errorDetails: null,
                    suggestion: null
                });
            } else {
                // JSON parse failed
                const message = '[Rclone] ❌ Invalid response from Alist';
                console.error(message);
                console.error(`[Rclone] Parse error: ${parseResult.error.message}`);

                rcloneConnectionStatus = {
                    verified: false,
                    timestamp: new Date(),
                    error: 'INVALID_RESPONSE',
                    attempts: rcloneConnectionStatus.attempts + 1,
                    lastError: parseResult.error.message,
                    credentialSource: null
                };

                return resolve({
                    verified: false,
                    message,
                    errorType: 'UNREACHABLE',
                    errorDetails: `Alist returned invalid JSON: ${parseResult.error.message}. This usually means Alist WebDAV is not properly configured or is returning an error page.`,
                    suggestion: 'Verify Alist service is running and configured correctly on localhost:5244'
                });
            }
        });
    });
}

/**
 * Get appropriate diagnostic suggestion based on error type
 */
function getSuggestionForError(errorType) {
    const suggestions = {
        AUTH: 'Check rclone.conf credentials match Alist admin account credentials',
        UNREACHABLE: 'Verify Alist service is running: check port 5244 is listening',
        PERMANENT: 'Verify rclone.conf file exists and is properly formatted',
        TRANSIENT: 'This is a temporary network issue - the system will retry automatically',
        UNKNOWN: 'Enable debug logging with RCLONE_DEBUG=1 for more information'
    };
    return suggestions[errorType] || suggestions.UNKNOWN;
}

/**
 * Initialize Rclone connectivity verification
 * Called during backend startup sequence (Task 2.3)
 * 
 * Returns: {
 *   success: boolean,
 *   message: string,
 *   details: object
 * }
 */
async function initializeRcloneConnectivity() {
    console.log('[Rclone] Initializing Rclone connectivity check...');

    try {
        const result = await verifyRcloneConnectivity();

        if (result.verified) {
            return {
                success: true,
                message: result.message,
                details: result,
                connectionStatus: rcloneConnectionStatus
            };
        } else {
            const fullMessage = result.message + '\n' + result.errorDetails;
            console.error(fullMessage);
            if (result.suggestion) {
                console.log(`[Rclone] Suggestion: ${result.suggestion}`);
            }

            return {
                success: false,
                message: result.message,
                details: result,
                connectionStatus: rcloneConnectionStatus
            };
        }
    } catch (err) {
        const message = `[Rclone] ❌ Connectivity verification exception: ${err.message}`;
        console.error(message);
        
        rcloneConnectionStatus = {
            verified: false,
            timestamp: new Date(),
            error: 'EXCEPTION',
            attempts: rcloneConnectionStatus.attempts + 1,
            lastError: err.message,
            credentialSource: null
        };

        return {
            success: false,
            message,
            details: {
                verified: false,
                errorType: 'UNKNOWN',
                errorDetails: err.message
            },
            connectionStatus: rcloneConnectionStatus
        };
    }
}

/**
 * Get current connection status (for health checks)
 */
function getConnectionStatus() {
    return {
        ...rcloneConnectionStatus,
        healthy: rcloneConnectionStatus.verified
    };
}

/**
 * Health check endpoint - returns connection status
 */
async function healthCheck() {
    const status = getConnectionStatus();
    
    if (!status.healthy) {
        console.log('[Rclone Health] ⚠️ Not verified - attempting re-verification...');
        const result = await verifyRcloneConnectivity();
        return {
            healthy: result.verified,
            status: result.message,
            lastCheck: new Date()
        };
    }

    return {
        healthy: true,
        status: '[Rclone] ✅ WebDAV connection verified',
        lastCheck: rcloneConnectionStatus.timestamp,
        attempts: rcloneConnectionStatus.attempts
    };
}

module.exports = {
    initializeRcloneConnectivity,
    verifyRcloneConnectivity,
    getConnectionStatus,
    healthCheck,
    parseRcloneOutput,
    classifyRcloneError
};
