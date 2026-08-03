/**
 * Storage Error Logger - Comprehensive Error Logging and Diagnostics
 * Task 3.3: Implement error logging with context, classification, and remediation hints
 * Requirements: R3
 */

const fs = require('fs');
const path = require('path');

/**
 * Error classification patterns for identifying error types
 * Used to provide targeted remediation suggestions
 */
const ERROR_PATTERNS = {
    GZIP_HEADER_ERROR: {
        patterns: ['gzip: invalid header', 'gzip:', 'invalid header'],
        type: 'GZIP_INVALID_HEADER',
        classification: 'TRANSIENT',
        suggestion: 'Verify Alist WebDAV is responding correctly, check Alist health endpoint and configuration'
    },
    UNAUTHORIZED: {
        patterns: ['401 unauthorized', '401', 'unauthorized', 'auth', 'invalid credentials'],
        type: 'AUTH_FAILED',
        classification: 'PERMANENT',
        suggestion: 'Check rclone.conf credentials match Alist admin account. Verify Terabox account credentials in Alist config'
    },
    CONNECTION_REFUSED: {
        patterns: ['econnrefused', 'connection refused', 'connect econnrefused'],
        type: 'CONNECTION_REFUSED',
        classification: 'TRANSIENT',
        suggestion: 'Verify Alist service is running on localhost:5244, check port conflicts with: lsof -i :5244'
    },
    TIMEOUT: {
        patterns: ['etimedout', 'timeout', 'timed out', 'timeout error'],
        type: 'TIMEOUT',
        classification: 'TRANSIENT',
        suggestion: 'Network or service timeout detected. Check Alist service status and network connectivity'
    },
    HOST_UNREACHABLE: {
        patterns: ['ehostunreach', 'host unreachable', 'no route to host'],
        type: 'HOST_UNREACHABLE',
        classification: 'TRANSIENT',
        suggestion: 'Network connectivity issue. Verify Alist service is reachable on localhost:5244'
    },
    PERMISSION_DENIED: {
        patterns: ['eacces', 'permission denied', 'access denied', 'not permitted'],
        type: 'PERMISSION_DENIED',
        classification: 'PERMANENT',
        suggestion: 'File or directory permission issue. Check rclone.conf file permissions (chmod 600) and directory access'
    },
    NOT_FOUND: {
        patterns: ['enoent', 'not found', '404', 'no such file', 'directory not found'],
        type: 'NOT_FOUND',
        classification: 'PERMANENT',
        suggestion: 'File or path not found. Verify storage path is correct and directory exists'
    },
    NETWORK_ERROR: {
        patterns: ['eai_again', 'network error', 'network unreachable', 'dns'],
        type: 'NETWORK_ERROR',
        classification: 'TRANSIENT',
        suggestion: 'DNS or network issue detected. Verify network connectivity and DNS resolution'
    },
    DISK_FULL: {
        patterns: ['enospc', 'disk full', 'no space left'],
        type: 'DISK_FULL',
        classification: 'PERMANENT',
        suggestion: 'Storage disk is full. Check available disk space and clean up if necessary'
    },
    TERABOX_ERROR: {
        patterns: ['terabox', 'terabox quota', 'terabox limit', 'quota exceeded'],
        type: 'TERABOX_QUOTA',
        classification: 'PERMANENT',
        suggestion: 'Terabox account issue: quota exceeded or account suspended. Check Terabox account status'
    }
};

class StorageErrorLogger {
    /**
     * Initialize the error logger
     * @param {Object} options - Configuration options
     * @param {string} options.logFilePath - Path to log file (optional)
     * @param {boolean} options.enableFileLogging - Enable file logging (default: true)
     * @param {boolean} options.enableConsoleLogging - Enable console logging (default: true)
     */
    constructor(options = {}) {
        this.logFilePath = options.logFilePath || path.join(__dirname, 'storage-errors.log');
        this.enableFileLogging = options.enableFileLogging !== false;
        this.enableConsoleLogging = options.enableConsoleLogging !== false;
        
        // Initialize log file if file logging enabled
        if (this.enableFileLogging) {
            try {
                const logDir = path.dirname(this.logFilePath);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
            } catch (err) {
                console.error('[StorageErrorLogger] Failed to initialize log file:', err.message);
            }
        }
    }

    /**
     * Write message to log (file and/or console)
     * @private
     * @param {string} message - Message to log
     * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG)
     */
    _write(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}`;

        // Console logging
        if (this.enableConsoleLogging) {
            if (level === 'ERROR') {
                console.error(logEntry);
            } else if (level === 'WARN') {
                console.warn(logEntry);
            } else {
                console.log(logEntry);
            }
        }

        // File logging
        if (this.enableFileLogging) {
            try {
                fs.appendFileSync(this.logFilePath, logEntry + '\n');
            } catch (err) {
                console.error('[StorageErrorLogger] Failed to write to log file:', err.message);
            }
        }
    }

    /**
     * Classify error type based on error message/code
     * @private
     * @param {Error|string} error - Error object or error message
     * @returns {Object} Classification result: {type, classification, suggestion}
     */
    _classifyError(error) {
        const errorMsg = (error?.message || String(error) || '').toLowerCase();
        const errorCode = error?.code || '';
        const combinedText = `${errorMsg} ${errorCode}`.toLowerCase();

        // Check each error pattern
        for (const [key, pattern] of Object.entries(ERROR_PATTERNS)) {
            for (const patternStr of pattern.patterns) {
                if (combinedText.includes(patternStr.toLowerCase())) {
                    return {
                        type: pattern.type,
                        classification: pattern.classification,
                        suggestion: pattern.suggestion
                    };
                }
            }
        }

        // Default classification for unknown errors
        return {
            type: 'UNKNOWN_ERROR',
            classification: 'UNKNOWN',
            suggestion: 'Review error details and logs for more information'
        };
    }

    /**
     * Log an operation with context
     * Provides diagnostic information about an operation (start, progress, end)
     * 
     * @param {string} operation - Operation name (e.g., 'background_upload_start')
     * @param {Object} details - Operation details to log
     * @param {string} details.filename - Filename being operated on
     * @param {string} details.storagePath - Storage destination path
     * @param {string} [details.status] - Operation status (QUEUED, IN_PROGRESS, SUCCESS, FAILED)
     * @param {number} [details.fileSize] - File size in bytes
     * @param {number} [details.attempts] - Number of attempts made
     * @param {number} [details.totalDelayMs] - Total delay in milliseconds
     * 
     * Example:
     * logger.logOperation('background_upload_start', {
     *   filename: 'invoice-001.pdf',
     *   storagePath: '/arsip/zona-01/toko-a/PPN/invoice-001.pdf',
     *   fileSize: 1024000,
     *   status: 'QUEUED'
     * });
     */
    logOperation(operation, details = {}) {
        const logContext = {
            timestamp: new Date().toISOString(),
            operation: operation,
            filename: details.filename || 'unknown',
            storagePath: details.storagePath || 'unknown',
            status: details.status || 'IN_PROGRESS',
            ...details
        };

        const message = `[Operation] ${JSON.stringify(logContext)}`;
        this._write(message, 'INFO');
    }

    /**
     * Log an error with comprehensive context and remediation suggestion
     * Provides detailed error information for troubleshooting
     * 
     * @param {string} operation - Operation name where error occurred (e.g., 'background_upload_retry')
     * @param {Error|string} error - Error object or message
     * @param {Object} context - Additional context
     * @param {string} context.filename - File being operated on
     * @param {string} context.storagePath - Storage path
     * @param {number} [context.attemptNumber] - Current attempt number
     * @param {number} [context.maxAttempts] - Maximum retry attempts
     * @param {number} [context.nextRetryDelayMs] - Delay until next retry
     * @param {boolean} [context.isTransient] - Whether error is transient
     * @param {string} [context.context] - Additional context message
     * 
     * Example:
     * logger.logError('background_upload_retry', error, {
     *   filename: 'invoice-001.pdf',
     *   storagePath: '/arsip/zona-01/toko-a/PPN/invoice-001.pdf',
     *   attemptNumber: 1,
     *   maxAttempts: 3,
     *   nextRetryDelayMs: 5000,
     *   isTransient: true,
     *   context: 'Retrying due to transient error'
     * });
     */
    logError(operation, error, context = {}) {
        // Classify the error
        const classification = this._classifyError(error);

        // Build comprehensive error context
        const errorContext = {
            timestamp: new Date().toISOString(),
            operation: operation,
            errorType: classification.type,
            errorClassification: classification.classification,
            errorMessage: error?.message || String(error),
            errorCode: error?.code || 'N/A',
            stackTrace: error?.stack ? error.stack.split('\n').slice(0, 5) : [],
            
            // Context information
            filename: context.filename || 'unknown',
            storagePath: context.storagePath || 'unknown',
            attemptNumber: context.attemptNumber || 1,
            maxAttempts: context.maxAttempts || 1,
            nextRetryDelayMs: context.nextRetryDelayMs || 0,
            nextRetryIn: context.nextRetryIn || 'N/A',
            isTransient: context.isTransient ?? false,
            contextMessage: context.context || '',
            
            // Remediation suggestion
            suggestion: classification.suggestion,
            remediationSteps: this._getRemediationSteps(classification.type)
        };

        const message = `[Error] ${JSON.stringify(errorContext)}`;
        this._write(message, classification.classification === 'PERMANENT' ? 'ERROR' : 'WARN');

        // Also output formatted suggestion for quick debugging
        if (context.attemptNumber === 1 || context.attemptNumber === undefined) {
            // Log suggestion on first attempt or standalone error
            this._write(
                `[Suggestion] ${classification.suggestion}`,
                'WARN'
            );
        }

        return errorContext;
    }

    /**
     * Get remediation steps for error type
     * @private
     * @param {string} errorType - Error type from classification
     * @returns {Array<string>} Steps to remediate the error
     */
    _getRemediationSteps(errorType) {
        const remediationMap = {
            'GZIP_INVALID_HEADER': [
                'Check Alist health endpoint: curl http://localhost:5244/',
                'Review Alist configuration: cat alist/data/config.json',
                'Verify WebDAV is enabled in Alist settings',
                'Check Alist logs: tail -50 alist/data/log/log.log',
                'Restart Alist service if configuration looks correct'
            ],
            'AUTH_FAILED': [
                'Verify rclone.conf credentials: cat rclone.conf',
                'Compare rclone.conf user/pass with Alist admin account',
                'Check Terabox account status in Alist',
                'Verify Alist admin password in Secret Manager',
                'Test Rclone manually: rclone --config rclone.conf lsjson terabox:/'
            ],
            'CONNECTION_REFUSED': [
                'Check Alist is running: ps aux | grep alist',
                'Verify port 5244 is listening: lsof -i :5244',
                'Check for port conflicts: netstat -tuln | grep 5244',
                'Verify Alist startup logs for errors',
                'Restart Alist service: kill previous process and restart'
            ],
            'TIMEOUT': [
                'Check network connectivity to Alist service',
                'Verify Alist is responding: curl -m 5 http://localhost:5244/',
                'Check system load and resource availability',
                'Review Alist logs for slow operations',
                'Increase timeout if network is slow'
            ],
            'HOST_UNREACHABLE': [
                'Verify Alist service is running on localhost:5244',
                'Check network connectivity: ping localhost',
                'Verify localhost resolution: cat /etc/hosts',
                'Check firewall rules for port 5244',
                'Review system network configuration'
            ],
            'PERMISSION_DENIED': [
                'Fix rclone.conf permissions: chmod 600 rclone.conf',
                'Verify user has access to rclone.conf directory',
                'Check Terabox account permissions in Alist',
                'Verify directory permissions on storage path',
                'Review file ownership'
            ],
            'NOT_FOUND': [
                'Verify storage path exists',
                'Check directory structure: rclone lsjson terabox:/arsip/',
                'Ensure parent directories are created before upload',
                'Verify path is correct and matches configuration',
                'Check for typos in path'
            ],
            'NETWORK_ERROR': [
                'Check network connectivity: ping 8.8.8.8',
                'Verify DNS resolution: nslookup localhost',
                'Check network interface status',
                'Review system network logs',
                'Test connectivity to Terabox servers'
            ],
            'DISK_FULL': [
                'Check available disk space: df -h',
                'Identify large files: du -sh * | sort -rh',
                'Clear temporary files: rm -rf /tmp/*',
                'Increase disk space if necessary',
                'Archive or delete old logs'
            ],
            'TERABOX_QUOTA': [
                'Check Terabox account quota in web UI',
                'Delete old files to free up space',
                'Upgrade Terabox account for more storage',
                'Check account subscription status',
                'Contact Terabox support if quota issue persists'
            ],
            'UNKNOWN_ERROR': [
                'Review full error message and stack trace in logs',
                'Check operation-specific documentation',
                'Enable verbose logging: --verbose flag',
                'Test operation manually with same parameters',
                'Contact support with error details and logs'
            ]
        };

        return remediationMap[errorType] || remediationMap['UNKNOWN_ERROR'];
    }

    /**
     * Log retry attempt information
     * @param {Object} retryInfo - Retry information
     * @param {number} retryInfo.attemptNumber - Current attempt number
     * @param {number} retryInfo.maxAttempts - Maximum attempts
     * @param {number} retryInfo.nextRetryDelayMs - Delay to next retry
     * @param {string} retryInfo.filename - File being retried
     * @param {Error} retryInfo.error - Error that triggered retry
     */
    logRetry(retryInfo) {
        const {
            attemptNumber = 1,
            maxAttempts = 3,
            nextRetryDelayMs = 5000,
            filename = 'unknown',
            error = null
        } = retryInfo;

        const message = `[Retry] Attempt ${attemptNumber}/${maxAttempts} for ${filename} - next retry in ${(nextRetryDelayMs / 1000).toFixed(1)}s`;
        this._write(message, 'WARN');

        if (error) {
            this._write(`[Retry Reason] ${error.message}`, 'INFO');
        }
    }

    /**
     * Log successful operation
     * @param {Object} successInfo - Success information
     * @param {string} successInfo.operation - Operation name
     * @param {string} successInfo.filename - File operated on
     * @param {number} [successInfo.attemptNumber] - Number of attempts
     * @param {number} [successInfo.totalDelayMs] - Total delay accumulated
     */
    logSuccess(successInfo) {
        const {
            operation = 'unknown',
            filename = 'unknown',
            attemptNumber = 1,
            totalDelayMs = 0
        } = successInfo;

        const message = `[Success] ${operation} completed for ${filename} after ${attemptNumber} attempt(s)${
            totalDelayMs > 0 ? ` (${(totalDelayMs / 1000).toFixed(1)}s total delay)` : ''
        }`;
        this._write(message, 'INFO');
    }

    /**
     * Get recent errors from log file
     * @param {number} lines - Number of recent lines to retrieve (default: 50)
     * @returns {Array<string>} Recent log lines
     */
    getRecentErrors(lines = 50) {
        try {
            if (!fs.existsSync(this.logFilePath)) {
                return [];
            }

            const content = fs.readFileSync(this.logFilePath, 'utf8');
            const allLines = content.split('\n').filter(line => line.trim());
            
            // Return last N lines
            return allLines.slice(Math.max(0, allLines.length - lines));
        } catch (err) {
            console.error('[StorageErrorLogger] Error reading log file:', err.message);
            return [];
        }
    }

    /**
     * Clear error log file
     * Useful for testing or manual cleanup
     */
    clearLog() {
        try {
            if (fs.existsSync(this.logFilePath)) {
                fs.writeFileSync(this.logFilePath, '');
                this._write('[Log] Error log cleared', 'INFO');
            }
        } catch (err) {
            console.error('[StorageErrorLogger] Error clearing log file:', err.message);
        }
    }

    /**
     * Get log file path
     * @returns {string} Path to log file
     */
    getLogFilePath() {
        return this.logFilePath;
    }

    /**
     * Get log file size in bytes
     * @returns {number} Log file size, or 0 if file doesn't exist
     */
    getLogFileSize() {
        try {
            if (!fs.existsSync(this.logFilePath)) {
                return 0;
            }
            const stats = fs.statSync(this.logFilePath);
            return stats.size;
        } catch (err) {
            console.error('[StorageErrorLogger] Error getting log file size:', err.message);
            return 0;
        }
    }

    /**
     * Rotate log file if it exceeds max size
     * Renames current log to log.1, log.1 to log.2, etc.
     * @param {number} maxSizeBytes - Maximum size before rotation (default: 10MB)
     * @param {number} maxBackups - Maximum number of backup files (default: 5)
     */
    rotateLogIfNeeded(maxSizeBytes = 10 * 1024 * 1024, maxBackups = 5) {
        try {
            const size = this.getLogFileSize();
            
            if (size > maxSizeBytes) {
                const dir = path.dirname(this.logFilePath);
                const ext = path.extname(this.logFilePath);
                const basename = path.basename(this.logFilePath, ext);

                // Rotate existing backups
                for (let i = maxBackups - 1; i >= 1; i--) {
                    const oldFile = path.join(dir, `${basename}.${i}${ext}`);
                    const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);
                    if (fs.existsSync(oldFile)) {
                        fs.renameSync(oldFile, newFile);
                    }
                }

                // Rename current log to .1
                const backupFile = path.join(dir, `${basename}.1${ext}`);
                fs.renameSync(this.logFilePath, backupFile);

                this._write('[Log] Log file rotated due to size', 'INFO');
            }
        } catch (err) {
            console.error('[StorageErrorLogger] Error rotating log file:', err.message);
        }
    }
}

module.exports = StorageErrorLogger;
