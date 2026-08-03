// ============================================================
// Alist Startup Handler - Task 2.1
// Spawns and monitors Alist service during container initialization
// ============================================================

const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

// Platform-specific Alist binary path
const getAlistBinaryPath = () => {
    const isWindows = os.platform() === 'win32';
    const binaryName = isWindows ? 'alist.exe' : 'alist';
    return path.join(__dirname, '..', 'alist', binaryName);
};

// Platform-specific spawn arguments
const getAlistSpawnArgs = () => {
    const dataPath = process.env.ALIST_DATA_PATH || path.join(__dirname, '..', 'data', 'alist');
    return ['server', '--data', dataPath];
};

/**
 * Perform HTTP health check on Alist service
 * Retry with exponential backoff up to maxAttempts times
 */
async function performHealthCheck(url, maxAttempts = 10, initialDelayMs = 500) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const req = http.get(url, { timeout: 5000 }, (res) => {
                    // Accept any 2xx status or 3xx redirects (Alist redirects to /web/)
                    if (res.statusCode >= 200 && res.statusCode < 400) {
                        resolve(true);
                    } else {
                        reject(new Error(`Unexpected status code: ${res.statusCode}`));
                    }
                });

                req.on('timeout', () => {
                    req.abort();
                    reject(new Error('Health check timeout'));
                });

                req.on('error', reject);
            });
        } catch (err) {
            lastError = err;
            if (attempt < maxAttempts) {
                const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
                console.log(`[Alist] Health check attempt ${attempt} failed: ${err.message}, retrying in ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
    }

    throw new Error(`Alist health check failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Start Alist service and wait for it to be ready
 * Returns once Alist is responding to HTTP requests
 */
async function startAlistService(timeoutMs = 10000) {
    const binaryPath = getAlistBinaryPath();
    const spawnArgs = getAlistSpawnArgs();
    const healthCheckUrl = 'http://localhost:5244/';

    console.log(`[Alist] Starting service from: ${binaryPath}`);
    console.log(`[Alist] Arguments: ${spawnArgs.join(' ')}`);

    return new Promise((resolve, reject) => {
        let alistProcess;
        let timeoutHandle;
        let healthCheckStarted = false;

        try {
            // Spawn Alist process
            alistProcess = spawn(binaryPath, spawnArgs, {
                stdio: ['ignore', 'pipe', 'pipe'], // stdin: ignore, stdout/stderr: pipe to parent
                detached: false,
                cwd: path.join(__dirname, '..', 'alist')
            });

            // Set timeout for entire startup process
            timeoutHandle = setTimeout(() => {
                if (alistProcess) {
                    alistProcess.kill('SIGTERM');
                }
                reject(new Error(`Alist startup timeout after ${timeoutMs}ms`));
            }, timeoutMs);

            // Handle process errors (e.g., file not found, permission denied)
            alistProcess.on('error', (err) => {
                clearTimeout(timeoutHandle);
                if (err.code === 'ENOENT') {
                    reject(new Error(`Alist binary not found at ${binaryPath}`));
                } else if (err.code === 'EACCES') {
                    reject(new Error(`Permission denied executing Alist binary at ${binaryPath}`));
                } else {
                    reject(new Error(`Failed to spawn Alist process: ${err.message}`));
                }
            });

            // Handle process exit (unexpected)
            alistProcess.on('exit', (code, signal) => {
                clearTimeout(timeoutHandle);
                if (!healthCheckStarted) {
                    reject(new Error(`Alist process exited with code ${code} (signal: ${signal})`));
                }
            });

            // Log Alist stdout (debugging information)
            alistProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                lines.forEach(line => {
                    console.log(`[Alist stdout] ${line}`);
                });
            });

            // Log Alist stderr (errors and warnings)
            alistProcess.stderr.on('data', (data) => {
                const lines = data.toString().split('\n').filter(l => l.trim());
                lines.forEach(line => {
                    console.log(`[Alist stderr] ${line}`);
                });
            });

            // Start health checking after a brief delay to let Alist initialize
            setTimeout(() => {
                healthCheckStarted = true;
                performHealthCheck(healthCheckUrl, 10, 500)
                    .then(() => {
                        clearTimeout(timeoutHandle);
                        console.log(`[Alist] ✅ Service initialized on ${healthCheckUrl}`);
                        resolve({ success: true, process: alistProcess, url: healthCheckUrl });
                    })
                    .catch((err) => {
                        clearTimeout(timeoutHandle);
                        if (alistProcess) {
                            alistProcess.kill('SIGTERM');
                        }
                        reject(err);
                    });
            }, 500); // Give Alist 500ms to start binding to port

        } catch (err) {
            clearTimeout(timeoutHandle);
            reject(new Error(`Alist startup exception: ${err.message}`));
        }
    });
}

/**
 * Initialize Alist service
 * Called during backend startup sequence (Task 2.3)
 * 
 * Error handling:
 * - Port already in use (EADDRINUSE): Log error and exit
 * - Permission denied (EACCES): Log error and exit
 * - Config error: Log error and exit
 * - Health check timeout: Log error and exit
 */
async function initializeAlist() {
    console.log('[Alist] Initializing Alist service...');

    try {
        const result = await startAlistService(10000); // 10 second timeout
        return {
            success: true,
            message: 'Alist service started and health check passed',
            process: result.process,
            url: result.url
        };
    } catch (err) {
        const errorMessage = err.message;

        // Classify error and provide diagnostic information
        let classification = 'UNKNOWN';
        let diagnostic = '';

        if (errorMessage.includes('EADDRINUSE')) {
            classification = 'PORT_IN_USE';
            diagnostic = 'Port 5244 is already in use. Check for conflicting services.';
        } else if (errorMessage.includes('EACCES') || errorMessage.includes('Permission denied')) {
            classification = 'PERMISSION_DENIED';
            diagnostic = 'Permission denied executing Alist binary. Check file permissions.';
        } else if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
            classification = 'BINARY_NOT_FOUND';
            diagnostic = `Alist binary not found at ${getAlistBinaryPath()}`;
        } else if (errorMessage.includes('timeout') || errorMessage.includes('Health check')) {
            classification = 'HEALTH_CHECK_FAILED';
            diagnostic = 'Alist failed to respond to health checks on port 5244.';
        }

        const fullMessage = `[Alist] ❌ Startup failed (${classification}): ${errorMessage}. ${diagnostic}`;
        console.error(fullMessage);

        return {
            success: false,
            error: errorMessage,
            classification,
            message: fullMessage
        };
    }
}

module.exports = {
    initializeAlist,
    startAlistService,
    performHealthCheck,
    getAlistBinaryPath
};
