// ============================================================
// Rclone Connectivity Verification - Task 2.2
// Verifies Rclone can connect to Alist WebDAV endpoint
// ============================================================

const { execFile } = require('child_process');
const path = require('path');

/**
 * Check if Rclone can successfully connect to Alist WebDAV endpoint
 * Executes: rclone --config rclone.conf lsjson terabox:/
 * 
 * Returns:
 * - On success: { success: true, message: "..." }
 * - On failure: { success: false, error: "...", classification: "AUTH_FAILED|UNREACHABLE|..." }
 */
async function verifyRcloneConnectivity(rcloneConfigPath = null) {
    // Default rclone.conf location
    const configPath = rcloneConfigPath || path.join(__dirname, '..', 'rclone.conf');
    
    console.log('[Rclone] Verifying connectivity to Alist WebDAV endpoint...');
    console.log(`[Rclone] Config: ${configPath}`);

    return new Promise((resolve) => {
        const timeout = 15000; // 15 second timeout
        let timedOut = false;

        // Execute: rclone --config <path> lsjson terabox:/
        const child = execFile('rclone', [
            '--config', configPath,
            'lsjson',
            'terabox:/'
        ], {
            timeout,
            maxBuffer: 1024 * 1024 // 1MB buffer for output
        }, (error, stdout, stderr) => {
            if (timedOut) return; // Already rejected

            // On success: expect valid JSON array
            if (!error) {
                try {
                    const parsed = JSON.parse(stdout);
                    // Should be an array (even if empty)
                    if (Array.isArray(parsed)) {
                        console.log('[Rclone] ✅ WebDAV connection verified');
                        return resolve({
                            success: true,
                            message: 'Rclone successfully connected to Alist WebDAV endpoint',
                            fileCount: parsed.length
                        });
                    } else {
                        throw new Error('Invalid JSON response (not an array)');
                    }
                } catch (parseErr) {
                    return resolve({
                        success: false,
                        error: `Invalid JSON response: ${parseErr.message}`,
                        classification: 'INVALID_RESPONSE',
                        stderr: stderr.substring(0, 200)
                    });
                }
            }

            // On error: classify the error type
            const stderrStr = stderr.toString();
            const errorStr = error.message || '';

            let classification = 'UNKNOWN';
            let diagnostic = '';

            // Auth failure
            if (stderrStr.includes('401') || stderrStr.includes('Unauthorized')) {
                classification = 'AUTH_FAILED';
                diagnostic = 'Check rclone.conf credentials match Alist admin account';
            }
            // Gzip error (Alist responding with wrong protocol)
            else if (stderrStr.includes('gzip: invalid header')) {
                classification = 'ALIST_PROTOCOL_ERROR';
                diagnostic = 'Alist WebDAV endpoint not responding correctly. Verify Alist is running and config.json has correct mount path';
            }
            // Connection refused (Alist not running)
            else if (stderrStr.includes('Connection refused') || stderrStr.includes('ECONNREFUSED')) {
                classification = 'ALIST_UNREACHABLE';
                diagnostic = 'Cannot reach Alist on localhost:5244. Verify Alist service is running';
            }
            // Timeout
            else if (errorStr.includes('ETIMEDOUT') || timedOut) {
                classification = 'TIMEOUT';
                diagnostic = `Rclone connection timeout after ${timeout}ms`;
            }
            // Bad remote name
            else if (stderrStr.includes('didn\'t find remote') || stderrStr.includes('Unknown remote')) {
                classification = 'BAD_REMOTE';
                diagnostic = 'Remote "terabox" not configured in rclone.conf. Check [terabox] section exists';
            }
            // File not found / config error
            else if (stderrStr.includes('not found') || stderrStr.includes('Config')) {
                classification = 'CONFIG_ERROR';
                diagnostic = `Rclone config error: ${stderrStr.substring(0, 100)}`;
            }

            const fullMessage = `[Rclone] ❌ Connection failed (${classification}): ${errorStr}. ${diagnostic}`;
            console.error(fullMessage);

            resolve({
                success: false,
                error: errorStr || stderrStr,
                classification,
                stderr: stderrStr.substring(0, 300),
                message: fullMessage
            });
        });

        // Handle timeout
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            console.error(`[Rclone] Timeout after ${timeout}ms, killing process`);
            resolve({
                success: false,
                error: `Rclone connection timeout after ${timeout}ms`,
                classification: 'TIMEOUT',
                message: '[Rclone] ❌ Connection timeout'
            });
        }, timeout + 1000); // Add 1s buffer for kill to take effect

        // Prevent timer from keeping process alive
        child.on('exit', () => {
            clearTimeout(timer);
        });
    });
}

module.exports = {
    verifyRcloneConnectivity
};
