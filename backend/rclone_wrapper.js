// ============================================================
// Rclone Storage Wrapper — Terabox Primary (Direct WebDAV)
// Direct Rclone connection to Terabox (no Alist middleware needed)
// ============================================================
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getSecret } = require('./secretManager');
const { retryWithBackoff, shouldRetryError } = require('./retryLogic');
const StorageErrorLogger = require('./storageErrorLogger');
const LocalStorage = require('./local_storage');

// Configuration for direct Rclone WebDAV connection
let rcloneConfig = {
    teraboxUser: process.env.TERABOX_USER || null,
    teraboxPass: process.env.TERABOX_PASS || null,
    source: 'ENV_VAR'
};

const alistDomain = process.env.ALIST_URL || 'http://127.0.0.1:5244';
const alistCredentials = {
    username: process.env.ALIST_ADMIN_USERNAME || 'admin',
    password: process.env.ALIST_ADMIN_PASSWORD || null,
    source: 'ENV_VAR'
};
let alistTokenCache = { token: null, expiry: 0 };

// Initialize error logger
const errorLogger = new StorageErrorLogger({
    logFilePath: path.join(__dirname, 'storage-errors.log'),
    enableFileLogging: true,
    enableConsoleLogging: true
});

const createdDirsCache = new Set();
const syncQueuePath = process.env.SYNC_QUEUE_PATH || path.resolve(__dirname, '..', 'data', 'storage-sync-queue.json');
const syncStatusPath = process.env.SYNC_STATUS_PATH || path.resolve(__dirname, '..', 'data', 'storage-sync-status.json');
let syncQueueWorkerStarted = false;
let syncQueueWorkerRunning = false;

function readSyncQueue() {
    try {
        if (!fs.existsSync(syncQueuePath)) return [];
        const parsed = JSON.parse(fs.readFileSync(syncQueuePath, 'utf8'));
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('[Sync Queue] Failed to read queue:', err.message);
        return [];
    }
}

function writeSyncQueue(queue) {
    const parent = path.dirname(syncQueuePath);
    fs.mkdirSync(parent, { recursive: true });
    const tempPath = `${syncQueuePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(queue, null, 2));
    fs.renameSync(tempPath, syncQueuePath);
}

function readSyncStatus() {
    try {
        if (!fs.existsSync(syncStatusPath)) return {};
        const parsed = JSON.parse(fs.readFileSync(syncStatusPath, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (err) {
        console.error('[Sync Status] Failed to read status:', err.message);
        return {};
    }
}

function writeSyncStatus(statuses) {
    const parent = path.dirname(syncStatusPath);
    fs.mkdirSync(parent, { recursive: true });
    const tempPath = `${syncStatusPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(statuses, null, 2));
    fs.renameSync(tempPath, syncStatusPath);
}

function updateSyncStatus(storagePath, updates) {
    const statuses = readSyncStatus();
    statuses[storagePath] = {
        ...(statuses[storagePath] || {}),
        ...updates,
        storagePath,
        updatedAt: new Date().toISOString()
    };
    writeSyncStatus(statuses);
    return statuses[storagePath];
}

function getSyncStatuses(storagePaths = null) {
    const statuses = readSyncStatus();
    if (!Array.isArray(storagePaths)) return statuses;
    const allowed = new Set(storagePaths);
    return Object.fromEntries(Object.entries(statuses).filter(([storagePath]) => allowed.has(storagePath)));
}

function queueKey(storagePath) {
    return storagePath;
}

function enqueueSyncJob({ storagePath, originalName, size }) {
    const queue = readSyncQueue();
    const existing = queue.find(job => queueKey(job.storagePath) === queueKey(storagePath));
    if (existing) {
        existing.originalName = originalName;
        existing.size = size;
        existing.primaryStatus = existing.primaryStatus || 'pending';
        existing.backupStatus = existing.backupStatus || 'pending';
        existing.updatedAt = new Date().toISOString();
    } else {
        queue.push({
            storagePath,
            originalName,
            size,
            primaryStatus: 'pending',
            backupStatus: 'pending',
            backupError: null,
            attempts: 0,
            nextAttemptAt: new Date().toISOString(),
            lastError: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    }
    writeSyncQueue(queue);
    updateSyncStatus(storagePath, {
        originalName,
        size,
        primaryStatus: 'pending',
        backupStatus: 'pending',
        lastError: null,
        backupError: null,
        attempts: existing?.attempts || 0,
        nextAttemptAt: existing?.nextAttemptAt || new Date().toISOString()
    });
    return queue;
}

function removeSyncJob(storagePath) {
    const queue = readSyncQueue();
    const nextQueue = queue.filter(job => queueKey(job.storagePath) !== queueKey(storagePath));
    if (nextQueue.length !== queue.length) writeSyncQueue(nextQueue);
}

function isDue(job) {
    return !job.nextAttemptAt || new Date(job.nextAttemptAt).getTime() <= Date.now();
}

function retryDelayForSyncJob(attempts, error) {
    // CAPTCHA/precreate failures are not useful to retry every few seconds.
    // Keep them queued and retry later after the user refreshes the Alist
    // Terabox session. Network failures can retry sooner.
    if (/captcha|verification|precreate|4000023|405/i.test(error?.message || '')) {
        return 30 * 60 * 1000;
    }
    return Math.min(60 * 60 * 1000, Math.max(60 * 1000, 2 ** Math.min(attempts, 6) * 1000));
}

function updateSyncJob(storagePath, updates) {
    const queue = readSyncQueue();
    const job = queue.find(item => queueKey(item.storagePath) === queueKey(storagePath));
    if (!job) return null;
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    writeSyncQueue(queue);
    updateSyncStatus(storagePath, updates);
    return job;
}

async function backupLocalFile(storagePath) {
    if (!LocalStorage.fileExists(storagePath)) {
        throw new Error('Salinan lokal tidak ditemukan untuk backup.');
    }
    await rcloneExec(['copyto', LocalStorage.getPath(storagePath), `${BACKUP_REMOTE}:${storagePath}`]);
    return true;
}

async function remoteFileExists(storagePath) {
    const token = await getAlistToken();
    const response = await fetch(`${alistDomain}/api/fs/get`, {
        method: 'POST',
        headers: {
            'Authorization': token,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: alistPath(storagePath) }),
        signal: AbortSignal.timeout(30 * 1000)
    });
    const data = await response.json();
    return response.ok && data.code === 200 && Boolean(data.data?.raw_url);
}

async function processSyncQueue() {
    if (syncQueueWorkerRunning) return;
    syncQueueWorkerRunning = true;
    try {
        const queue = readSyncQueue();
        const dueJobs = queue.filter(isDue).slice(0, 3);
        for (const job of dueJobs) {
            try {
                if (await remoteFileExists(job.storagePath)) {
                    console.log(`[Sync Queue] Remote file already exists: ${job.storagePath}`);
                    updateSyncJob(job.storagePath, { primaryStatus: 'verified', lastError: null });
                } else if (job.primaryStatus !== 'verified') {
                    const buffer = await LocalStorage.downloadBuffer(job.storagePath);
                    await RcloneStorage.uploadDirect(buffer, job.originalName, job.storagePath);

                    if (!(await remoteFileExists(job.storagePath))) {
                        throw new Error('Upload returned success but remote verification failed');
                    }
                    updateSyncJob(job.storagePath, { primaryStatus: 'verified', lastError: null });
                }

                if (job.backupStatus !== 'verified') {
                    try {
                        await backupLocalFile(job.storagePath);
                        updateSyncJob(job.storagePath, {
                            primaryStatus: 'verified',
                            backupStatus: 'verified',
                            backupError: null,
                            lastError: null
                        });
                    } catch (backupError) {
                        updateSyncJob(job.storagePath, {
                            primaryStatus: 'verified',
                            backupStatus: 'failed',
                            backupError: backupError.message,
                            lastError: backupError.message,
                            attempts: Number(job.attempts || 0) + 1,
                            nextAttemptAt: new Date(Date.now() + retryDelayForSyncJob(job.attempts + 1, backupError)).toISOString()
                        });
                        console.warn(`[Sync Queue] Backup deferred ${job.originalName}: ${backupError.message}`);
                        continue;
                    }
                }

                console.log(`[Sync Queue] ✅ Primary and backup verified: ${job.storagePath}`);
                removeSyncJob(job.storagePath);
            } catch (err) {
                const currentQueue = readSyncQueue();
                const current = currentQueue.find(item => queueKey(item.storagePath) === queueKey(job.storagePath));
                if (!current) continue;
                current.attempts = Number(current.attempts || 0) + 1;
                current.primaryStatus = current.primaryStatus === 'verified' ? 'verified' : 'failed';
                current.lastError = err.message;
                current.nextAttemptAt = new Date(Date.now() + retryDelayForSyncJob(current.attempts, err)).toISOString();
                current.updatedAt = new Date().toISOString();
                writeSyncQueue(currentQueue);
                updateSyncStatus(job.storagePath, current);
                console.warn(`[Sync Queue] Deferred ${job.originalName}: ${err.message}`);
            }
        }
    } finally {
        syncQueueWorkerRunning = false;
    }
}

function startSyncQueueWorker() {
    if (syncQueueWorkerStarted) return;
    syncQueueWorkerStarted = true;
    const timer = setInterval(() => {
        processSyncQueue().catch(err => console.error('[Sync Queue] Worker failed:', err.message));
    }, 5 * 60 * 1000);
    timer.unref();
    processSyncQueue().catch(err => console.error('[Sync Queue] Initial run failed:', err.message));
}

/**
 * Diagnostic logging helper with context information.
 * @param {string} operation - Name of the operation (e.g., 'upload', 'listFiles')
 * @param {object} details - Custom details to include in log
 */
function logOperation(operation, details = {}) {
    const context = {
        operation,
        timestamp: new Date().toISOString(),
        config_source: rcloneConfig.source,
        ...details
    };
    console.log(`[Operation]`, JSON.stringify(context));
}

// Rclone remote names (must match rclone.conf)
const PRIMARY_REMOTE = process.env.RCLONE_PRIMARY_REMOTE || 'terabox';
const BACKUP_REMOTE = process.env.RCLONE_BACKUP_REMOTE || 'storj';
const BASE_PATH = process.env.RCLONE_BASE_PATH || '/arsip';

const isWindows = process.platform === 'win32';
const rclonePath = isWindows
    ? path.resolve(__dirname, '..', 'rclone.exe')
    : (process.env.RCLONE_BIN || path.resolve(__dirname, '..', 'rclone'));
const configPath = process.env.RCLONE_CONFIG || path.resolve(__dirname, '..', 'rclone.conf');

/**
 * Execute an rclone command and return a promise.
 */
function rcloneExec(args) {
    return new Promise((resolve, reject) => {
        const finalArgs = ['--config', configPath, ...args];

        execFile(rclonePath, finalArgs, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error('[Rclone Error]', stderr || error.message);
                return reject(new Error(stderr || error.message));
            }
            resolve(stdout.trim());
        });
    });
}

function rcloneSpawn(args) {
    const finalArgs = ['--config', configPath, ...args];
    const logMsg = `[Rclone Spawn] ${rclonePath} ${finalArgs.join(' ')}\n`;
    const logPath = path.join(__dirname, 'debug_rclone_spawn.log');
    try { fs.appendFileSync(logPath, logMsg); } catch (_) { }
    console.log('[Rclone Spawn]', finalArgs.join(' '));
    return spawn(rclonePath, finalArgs);
}

async function loginToAlist() {
    const response = await fetch(`${alistDomain}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: alistCredentials.username,
            password: alistCredentials.password
        })
    });
    const data = await response.json();
    if (!response.ok || !data.data?.token) {
        throw new Error(`Alist authentication failed: ${data.message || `HTTP ${response.status}`}`);
    }
    alistTokenCache = {
        token: data.data.token,
        expiry: Date.now() + 23 * 60 * 60 * 1000
    };
    return alistTokenCache.token;
}

async function getAlistToken() {
    if (alistTokenCache.token && Date.now() < alistTokenCache.expiry) {
        return alistTokenCache.token;
    }
    return loginToAlist();
}

function alistPath(storagePath) {
    const cleanPath = storagePath.startsWith('/') ? storagePath : `/${storagePath}`;
    return `/terabox${cleanPath}`;
}

async function readAlistResponse(response, operation) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (_) {
        if (/captcha|verification code|verification/i.test(text)) {
            throw new Error(`Alist/Terabox meminta CAPTCHA saat ${operation}; upload remote tidak dapat dilanjutkan.`);
        }
        throw new Error(`Alist mengembalikan respons tidak valid saat ${operation} (HTTP ${response.status}).`);
    }
}

const RcloneStorage = {
    /**
     * Get a file from Terabox via Rclone.
     * Returns stream for use in downloads/previews.
     */
    async getStream(storagePath) {
        logOperation('getStream', { 
            action: 'Getting file stream',
            storagePath: storagePath
        });

        try {
            const token = await getAlistToken();
            const response = await fetch(`${alistDomain}/api/fs/get`, {
                method: 'POST',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: alistPath(storagePath) })
            });
            const data = await response.json();
            if (!response.ok || data.code !== 200 || !data.data?.raw_url) {
                throw new Error(`Alist file lookup failed: ${data.message || `HTTP ${response.status}`}`);
            }

            const fileResponse = await fetch(data.data.raw_url);
            if (!fileResponse.ok || !fileResponse.body) {
                throw new Error(`Alist file stream failed: HTTP ${fileResponse.status}`);
            }
            return require('stream').Readable.fromWeb(fileResponse.body);
        } catch (remoteError) {
            if (LocalStorage.fileExists(storagePath)) {
                console.warn(`[Storage] Terabox preview unavailable; serving local copy for ${storagePath}: ${remoteError.message}`);
                return LocalStorage.createReadStream(storagePath);
            }
            throw remoteError;
        }
    },

    /**
     * Build the storage path synchronously
     */
    buildStoragePath(zonaKode, tokoKode, category, originalName) {
        return `${BASE_PATH}/${zonaKode}/${tokoKode}/${category}/${originalName}`;
    },

    /**
     * Build the full remote path: terabox_direct:/arsip/zona-01/toko-a/PPN/file.pdf
     */
    buildPath(remote, zonaKode, tokoKode, category, fileName) {
        const parts = [remote + ':' + BASE_PATH];
        if (zonaKode) parts.push(zonaKode);
        if (tokoKode) parts.push(tokoKode);
        if (category) parts.push(category);
        if (fileName) parts.push(fileName);
        return parts.join('/');
    },

    /**
     * Upload a file buffer to primary storage (Terabox via direct Rclone) with exponential backoff retry.
     * 
     * Uses retry logic with exponential backoff delays:
     * - Attempt 1: immediate
     * - Attempt 2: 5s delay
     * - Attempt 3: 10s delay
     * - Attempt 4: 20s delay (max for transient errors)
     * 
     * Permanent errors (auth failure) fail immediately with 1 attempt.
     * Transient errors (connection timeout, service unavailable) retry with backoff.
     * 
     * Returns metadata including:
     * - success: boolean indicating if upload succeeded
     * - syncAttempts: number of attempts made
     * - syncError: error message if failed, null if successful
     * - storagePath: path where file is stored
     */
    async uploadInBackground(fileBuffer, originalName, zonaKode, tokoKode, category) {
        const storagePath = this.buildStoragePath(zonaKode, tokoKode, category, originalName);
        
        console.log(`[Background Upload] Starting upload for ${originalName}`);
        enqueueSyncJob({ storagePath, originalName, size: fileBuffer.length });
        
        // Log operation start
        errorLogger.logOperation('background_upload_start', {
            filename: originalName,
            storagePath: storagePath,
            fileSize: fileBuffer.length,
            status: 'QUEUED'
        });
        
        // Use retryWithBackoff to handle transient failures with exponential delays
        const result = await retryWithBackoff(
            () => this.uploadDirect(fileBuffer, originalName, storagePath),
            {
                maxAttempts: 3,
                baseDelay: 5000, // 5 seconds
                shouldRetry: shouldRetryError,
                onRetry: (attemptNumber, delay, error) => {
                    // Log at start of retry attempt (before waiting)
                    const attemptMsg = `[Background Upload] ATTEMPT ${attemptNumber} for ${originalName}`;
                    console.log(attemptMsg);
                    
                    // Classify error for context
                    const errorType = error.code || error.message || 'Unknown';
                    const isTransient = shouldRetryError(error);
                    
                    // Log to error logger for comprehensive tracking
                    errorLogger.logError('background_upload_retry', error, {
                        filename: originalName,
                        storagePath: storagePath,
                        attemptNumber: attemptNumber,
                        maxAttempts: 3,
                        nextRetryDelayMs: delay,
                        nextRetryIn: `${(delay / 1000).toFixed(1)}s`,
                        isTransient: isTransient,
                        context: `Retrying due to ${isTransient ? 'transient' : 'unknown'} error`
                    });
                }
            }
        );
        
        if (result.success) {
            // Success after retry(ies)
            const successMsg = `[Background Upload] SUCCESS for ${originalName} after ${result.attempts} attempts`;
            console.log(successMsg);
            updateSyncJob(storagePath, {
                primaryStatus: 'verified',
                lastError: null,
                nextAttemptAt: new Date().toISOString()
            });
            processSyncQueue().catch(err => console.warn('[Sync Queue] Post-upload backup failed:', err.message));
            
            // Log successful completion
            errorLogger.logOperation('background_upload_success', {
                filename: originalName,
                storagePath: storagePath,
                attempts: result.attempts,
                totalDelayMs: result.totalDelay,
                totalDelay: `${(result.totalDelay / 1000).toFixed(1)}s`,
                status: 'SUCCESS'
            });
            
            return {
                success: true,
                storagePath,
                size: fileBuffer.length,
                syncAttempts: result.attempts,
                syncError: null
            };
        } else {
            // Failure after all retries exhausted
            const failureMsg = `[Background Upload] FAILED for ${originalName} after ${result.attempts} attempts: ${result.lastError?.message || 'Unknown error'}`;
            console.error(failureMsg);
            
            // Log failure with comprehensive error context
            errorLogger.logError('background_upload_failed', result.lastError, {
                filename: originalName,
                storagePath: storagePath,
                attemptsFailed: result.attempts,
                maxAttempts: 3,
                totalDelayMs: result.totalDelay,
                totalDelay: `${(result.totalDelay / 1000).toFixed(1)}s`,
                context: 'All retry attempts exhausted'
            });
            updateSyncStatus(storagePath, {
                primaryStatus: 'failed',
                backupStatus: 'pending',
                attempts: result.attempts,
                lastError: result.lastError?.message || 'Unknown error',
                nextAttemptAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
            });
            
            return {
                success: false,
                storagePath,
                size: fileBuffer.length,
                syncAttempts: result.attempts,
                syncError: result.lastError?.message || 'Unknown error'
            };
        }
    },

    /**
     * The internal upload method using Rclone directly
     */
    async uploadDirect(fileBuffer, originalName, storagePath) {
        try {
            logOperation('uploadDirect', { 
                action: 'Starting upload',
                operation_type: 'upload',
                filename: originalName, 
                storagePath: storagePath 
            });

            // Alist's filesystem API supports writes reliably for this
            // WebDAV-backed Terabox storage; rclone rcat returns HTTP 405.
            const parentFolderPath = storagePath.substring(0, storagePath.lastIndexOf('/'));
            if (!createdDirsCache.has(parentFolderPath)) {
                try {
                    await rcloneExec(['mkdir', `${PRIMARY_REMOTE}:${parentFolderPath}`]);
                    createdDirsCache.add(parentFolderPath);
                } catch (err) {
                    const message = err.message || '';
                    if (/409|conflict|already exists/i.test(message)) {
                        createdDirsCache.add(parentFolderPath);
                    } else {
                        throw err;
                    }
                }
            }
            const token = await getAlistToken();
            const putResponse = await fetch(`${alistDomain}/api/fs/put`, {
                method: 'PUT',
                headers: {
                    'Authorization': token,
                    'File-Path': encodeURIComponent(alistPath(storagePath))
                },
                body: fileBuffer,
                signal: AbortSignal.timeout(10 * 60 * 1000)
            });
            const putData = await readAlistResponse(putResponse, 'mengupload file');
            if (!putResponse.ok || putData.code !== 200) {
                throw new Error(`Alist API upload failed: ${putData.message || `HTTP ${putResponse.status}`}`);
            }

            logOperation('uploadDirect', { 
                status: '✅ Upload successful',
                filename: originalName,
                storagePath: storagePath 
            });

            return { storagePath, size: fileBuffer.length };
        } catch (err) {
            logOperation('uploadDirect', { 
                status: '❌ Upload failed',
                error: err.message,
                storagePath: storagePath 
            });
            console.error(`[Upload Error]`, err);
            throw err;
        }
    },

    /**
     * Upload a media file (Ads) to primary storage.
     */
    async uploadMedia(fileBuffer, originalName, category) {
        const storagePath = `/ads-media/${category}/${originalName}`;

        try {
            logOperation('uploadMedia', { 
                action: 'Starting media upload',
                operation_type: 'upload-media',
                category: category,
                filename: originalName, 
                storagePath: storagePath 
            });

            // Keep directory creation through rclone, but upload the file through
            // Alist's filesystem API because WebDAV rcat is not supported.
            const parentFolderPath = storagePath.substring(0, storagePath.lastIndexOf('/'));

            if (!createdDirsCache.has(parentFolderPath)) {
                logOperation('uploadMedia', { 
                    action: 'Creating directory',
                    path: parentFolderPath 
                });
                try {
                    await rcloneExec(['mkdir', `${PRIMARY_REMOTE}:${parentFolderPath}`]);
                    createdDirsCache.add(parentFolderPath);
                } catch (err) {
                    const errMsg = err.message || '';
                    console.warn(`[Upload Media] rclone mkdir error: ${errMsg}`);
                    if (errMsg.toLowerCase().includes('409') || errMsg.toLowerCase().includes('conflict')) {
                        console.log(`[Upload Media] Detected 409/Conflict for ${parentFolderPath}, continuing...`);
                        createdDirsCache.add(parentFolderPath);
                    } else {
                        throw err;
                    }
                }
            }

            const token = await getAlistToken();
            logOperation('uploadMedia', { 
                action: 'Uploading file',
                filename: originalName,
                category: category
            });
            const putResponse = await fetch(`${alistDomain}/api/fs/put`, {
                method: 'PUT',
                headers: {
                    'Authorization': token,
                    'File-Path': encodeURIComponent(alistPath(storagePath))
                },
                body: fileBuffer,
                signal: AbortSignal.timeout(10 * 60 * 1000)
            });
            const putData = await readAlistResponse(putResponse, 'mengupload media');
            if (!putResponse.ok || putData.code !== 200) {
                throw new Error(`Alist API upload failed: ${putData.message || `HTTP ${putResponse.status}`}`);
            }

            logOperation('uploadMedia', { 
                status: '✅ Media upload successful',
                filename: originalName,
                category: category,
                storagePath: storagePath 
            });

            return { storagePath, size: fileBuffer.length };
        } catch (err) {
            logOperation('uploadMedia', { 
                status: '❌ Media upload failed',
                error: err.message,
                storagePath: storagePath 
            });
            console.error(`[Upload Media Error]`, err);
            throw err;
        }
    },

    /**
     * Create an empty directory for a media category
     */
    async createMediaFolder(category) {
        const primaryDest = `${PRIMARY_REMOTE}:/ads-media/${category}`;
        await rcloneExec(['mkdir', primaryDest]);
        console.log(`[Rclone] Category folder created: ${primaryDest}`);

        // Backup
        const backupDest = `${BACKUP_REMOTE}:/ads-media/${category}`;
        rcloneExec(['mkdir', backupDest]).catch(() => { });
    },

    /**
     * Download a file from storage to temporary location
     * First tries copyto, falls back to cat+pipe if copyto fails with "directory not found"
     */
    async download(storagePath) {
        const tmpDir = path.join(__dirname, 'tmp');
        
        // Ensure tmp directory exists
        if (!fs.existsSync(tmpDir)) {
            try {
                fs.mkdirSync(tmpDir, { recursive: true });
                console.log(`[Download] Created tmp directory: ${tmpDir}`);
            } catch (err) {
                console.error(`[Download] Failed to create tmp directory:`, err);
                throw new Error(`Cannot create tmp directory: ${err.message}`);
            }
        }

        const tempFileName = `download-${Date.now()}-${path.basename(storagePath)}`;
        const tempFilePath = path.join(tmpDir, tempFileName);
        const remotePath = `${PRIMARY_REMOTE}:${storagePath}`;
        
        logOperation('download', { 
            storagePath: storagePath,
            tempPath: tempFilePath,
            tmpDir: tmpDir,
            action: 'Starting download - trying copyto first'
        });

        // Try method 1: copyto
        try {
            const result = await this._downloadViaCopyto(remotePath, tempFilePath, storagePath);
            return result;
        } catch (copytoErr) {
            const errMsg = copytoErr.message || '';
            if (errMsg.includes('directory not found') || errMsg.includes('not found')) {
                console.log('[Download] copyto failed with "not found", trying cat streaming...');
                logOperation('download', { 
                    action: 'copyto failed, falling back to cat streaming',
                    error: errMsg.substring(0, 200),
                    storagePath
                });
                
                // Try method 2: cat with streaming
                try {
                    const result = await this._downloadViaCat(remotePath, tempFilePath, storagePath);
                    return result;
                } catch (catErr) {
                    logOperation('download', { 
                        status: '❌ Download failed (all methods)',
                        copytoError: copytoErr.message.substring(0, 100),
                        catError: catErr.message.substring(0, 100),
                        storagePath
                    });
                    throw new Error(`All download methods failed. copyto: ${copytoErr.message.substring(0, 100)}, cat: ${catErr.message.substring(0, 100)}`);
                }
            } else {
                throw copytoErr;
            }
        }
    },

    /**
     * Download via rclone copyto
     */
    async _downloadViaCopyto(remotePath, tempFilePath, storagePath) {
        return new Promise((resolve, reject) => {
            const args = [
                '--config', configPath,
                '--verbose',
                '--timeout=10m',
                '--retries=3',
                'copyto',
                remotePath,
                tempFilePath
            ];
            
            const child = spawn(rclonePath, args);
            let stderr = '';
            
            const timeout = 600000; // 10 minutes
            let timeoutHandle = setTimeout(() => {
                child.kill('SIGTERM');
                fs.unlink(tempFilePath, () => {});
                reject(new Error('Download copyto timeout after 10 minutes'));
            }, timeout);
            
            child.stderr.on('data', (data) => {
                const msg = data.toString();
                stderr += msg;
            });
            
            child.on('error', (err) => {
                clearTimeout(timeoutHandle);
                fs.unlink(tempFilePath, () => {});
                reject(err);
            });
            
            child.on('close', (code) => {
                clearTimeout(timeoutHandle);
                
                if (code !== 0) {
                    fs.unlink(tempFilePath, () => {});
                    reject(new Error(`Rclone copyto failed: ${stderr}`));
                    return;
                }
                
                // Verify file
                try {
                    if (!fs.existsSync(tempFilePath)) {
                        reject(new Error('Downloaded file does not exist'));
                        return;
                    }
                    
                    const stats = fs.statSync(tempFilePath);
                    if (stats.size === 0) {
                        fs.unlink(tempFilePath, () => {});
                        reject(new Error('Downloaded file is empty'));
                        return;
                    }
                    
                    logOperation('download', { 
                        status: '✅ Download successful (copyto)',
                        storagePath,
                        fileSize: stats.size,
                        tempPath: tempFilePath
                    });
                    resolve(tempFilePath);
                } catch (err) {
                    fs.unlink(tempFilePath, () => {});
                    reject(err);
                }
            });
        });
    },

    /**
     * Download via rclone cat + pipe to file
     * More reliable for streaming from WebDAV
     */
    async _downloadViaCat(remotePath, tempFilePath, storagePath) {
        return new Promise((resolve, reject) => {
            const child = spawn(rclonePath, [
                '--config', configPath,
                '--timeout=10m',
                'cat',
                remotePath
            ]);
            
            const writeStream = fs.createWriteStream(tempFilePath);
            let stderr = '';
            
            const timeout = 600000; // 10 minutes
            let timeoutHandle = setTimeout(() => {
                child.kill('SIGTERM');
                writeStream.destroy();
                fs.unlink(tempFilePath, () => {});
                reject(new Error('Download cat timeout after 10 minutes'));
            }, timeout);
            
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            child.on('error', (err) => {
                clearTimeout(timeoutHandle);
                writeStream.destroy();
                fs.unlink(tempFilePath, () => {});
                reject(err);
            });
            
            writeStream.on('error', (err) => {
                clearTimeout(timeoutHandle);
                child.kill('SIGTERM');
                fs.unlink(tempFilePath, () => {});
                reject(err);
            });
            
            writeStream.on('finish', () => {
                clearTimeout(timeoutHandle);
                try {
                    const stats = fs.statSync(tempFilePath);
                    if (stats.size === 0) {
                        fs.unlink(tempFilePath, () => {});
                        reject(new Error('Downloaded file is empty'));
                        return;
                    }
                    
                    logOperation('download', { 
                        status: '✅ Download successful (cat)',
                        storagePath,
                        fileSize: stats.size,
                        tempPath: tempFilePath
                    });
                    resolve(tempFilePath);
                } catch (err) {
                    fs.unlink(tempFilePath, () => {});
                    reject(err);
                }
            });
            
            child.on('close', (code) => {
                clearTimeout(timeoutHandle);
                if (code !== 0 && !writeStream.destroyed) {
                    writeStream.destroy();
                    fs.unlink(tempFilePath, () => {});
                    reject(new Error(`Rclone cat exited with code ${code}: ${stderr}`));
                }
            });
            
            // Pipe cat output to file
            child.stdout.pipe(writeStream);
        });
    },

    /**
     * Delete a file from storage via Rclone
     */
    async deleteFile(storagePath) {
        let cleanPath = storagePath.startsWith('/') ? storagePath : '/' + storagePath;

        logOperation('deleteFile', { 
            action: 'Starting file deletion',
            operation_type: 'delete',
            storagePath: storagePath 
        });

        const remotePath = `${PRIMARY_REMOTE}:${cleanPath}`;

        try {
            logOperation('deleteFile', { 
                action: 'Deleting file',
                remotePath: remotePath
            });

            await rcloneExec(['delete', remotePath]);
            
            logOperation('deleteFile', { 
                status: '✅ Delete successful',
                storagePath: storagePath 
            });
            return true;
        } catch (err) {
            logOperation('deleteFile', { 
                status: '❌ Delete failed',
                error: err.message,
                storagePath: storagePath 
            });
            console.error(`[RcloneStorage] Delete failed:`, err);
            throw err;
        }
    },

    /**
     * Check if a file exists on primary storage.
     */
    async checkFileExists(storagePath) {
        // A newly uploaded file remains valid locally while Terabox sync is
        // blocked by an upstream CAPTCHA or temporary write failure.
        if (LocalStorage.fileExists(storagePath)) {
            return true;
        }
        try {
            const remotePath = `${PRIMARY_REMOTE}:${storagePath}`;
            await rcloneExec(['ls', remotePath]);
            return true;
        } catch (err) {
            return false;
        }
    },

    /**
     * Return pending automatic uploads without exposing file contents.
     */
    getPendingSyncJobs() {
        return readSyncQueue();
    },

    getSyncQueueSnapshot() {
        const jobs = readSyncQueue();
        return {
            jobs,
            summary: {
                total: jobs.length,
                pending: jobs.filter(job => job.primaryStatus !== 'verified').length,
                primaryVerified: jobs.filter(job => job.primaryStatus === 'verified').length,
                backupPending: jobs.filter(job => job.backupStatus !== 'verified').length,
                backupVerified: jobs.filter(job => job.backupStatus === 'verified').length,
                failed: jobs.filter(job => job.lastError || job.backupStatus === 'failed').length
            }
        };
    },

    getSyncStatuses(storagePaths = null) {
        return getSyncStatuses(storagePaths);
    },

    async verifySyncPaths(storagePaths = []) {
        const result = {};
        for (const storagePath of storagePaths) {
            const stored = getSyncStatuses([storagePath])[storagePath] || {
                storagePath,
                primaryStatus: 'pending',
                backupStatus: 'pending'
            };
            try {
                const primaryExists = await remoteFileExists(storagePath);
                result[storagePath] = {
                    ...stored,
                    primaryStatus: primaryExists ? 'verified' : 'failed',
                    lastError: primaryExists ? null : 'File primary tidak ditemukan di remote.'
                };
                updateSyncStatus(storagePath, result[storagePath]);
            } catch (err) {
                result[storagePath] = { ...stored, primaryStatus: 'failed', lastError: err.message };
                updateSyncStatus(storagePath, result[storagePath]);
            }
        }
        return result;
    },

    retrySyncJobs(storagePaths = []) {
        const requested = new Set(Array.isArray(storagePaths) ? storagePaths : []);
        const queue = readSyncQueue();
        let changed = 0;
        queue.forEach(job => {
            if (requested.size === 0 || requested.has(job.storagePath)) {
                job.nextAttemptAt = new Date().toISOString();
                job.lastError = null;
                if (job.primaryStatus === 'failed') job.primaryStatus = 'pending';
                if (job.backupStatus === 'failed') job.backupStatus = 'pending';
                changed++;
            }
        });
        if (changed) writeSyncQueue(queue);
        return changed;
    },

    backupFile(storagePath) {
        return backupLocalFile(storagePath);
    },

    async backupLocalPath(localPath, remotePath) {
        if (!fs.existsSync(localPath)) {
            throw new Error('Berkas backup lokal tidak ditemukan.');
        }
        await rcloneExec(['copyto', localPath, `${BACKUP_REMOTE}:${remotePath}`]);
        const remoteListing = await rcloneExec(['lsjson', '--files-only', `${BACKUP_REMOTE}:${remotePath}`]);
        let remoteFiles;
        try {
            remoteFiles = JSON.parse(remoteListing || '[]');
        } catch (err) {
            throw new Error(`Upload backup selesai tetapi respons verifikasi storage cadangan tidak valid: ${err.message}`);
        }
        const remoteFile = Array.isArray(remoteFiles)
            ? remoteFiles.find(file => file && file.Name)
            : null;
        const localSize = fs.statSync(localPath).size;
        if (!remoteFile || Number(remoteFile.Size) !== localSize) {
            throw new Error(`Upload backup selesai tetapi verifikasi ukuran gagal (lokal ${localSize} byte, remote ${remoteFile?.Size ?? 'tidak ditemukan'} byte).`);
        }
        return true;
    },

    async verifyBackupStorage() {
        try {
            await rcloneExec(['lsjson', '--max-depth', '1', `${BACKUP_REMOTE}:`]);
            return { healthy: true, detail: `Storage cadangan ${BACKUP_REMOTE} dapat dibaca.` };
        } catch (err) {
            return { healthy: false, detail: `Storage cadangan ${BACKUP_REMOTE} gagal diverifikasi: ${err.message}` };
        }
    },

    /**
     * Trigger a queue pass after the Terabox session is refreshed.
     */
    processPendingSyncJobs() {
        return processSyncQueue();
    },

    /**
     * List all files in a directory via Rclone
     */
    async listFiles(storagePath) {
        let cleanPath = storagePath.startsWith('/') ? storagePath : '/' + storagePath;

        logOperation('listFiles', { 
            action: 'Listing files',
            operation_type: 'list',
            path: storagePath 
        });

        try {
            const remotePath = `${PRIMARY_REMOTE}:${cleanPath}`;
            const output = await rcloneExec(['lsjson', remotePath]);
            
            let files = [];
            try {
                files = JSON.parse(output);
            } catch (e) {
                console.warn('[Rclone] Could not parse JSON output, returning empty list');
                files = [];
            }

            const fileCount = files ? files.length : 0;
            logOperation('listFiles', { 
                status: '✅ List successful',
                path: storagePath,
                file_count: fileCount 
            });

            return files || [];
        } catch (err) {
            logOperation('listFiles', { 
                status: '❌ List failed',
                error: err.message,
                path: storagePath 
            });
            console.error(`[RcloneStorage] List failed:`, err);
            throw err;
        }
    }
};

/**
 * Initialize Rclone credentials at server startup.
 * This function should be called from server.js during initialization.
 * 
 * @returns {Promise<Object>} - Status object: { success, source, message }
 */
async function initializeRcloneCredentials() {
    console.log('🔐 [RcloneStorage] Initializing storage credentials...');

    try {
        const password = await getSecret(
            'arsip-alist-password',
            'ALIST_ADMIN_PASSWORD',
            null
        );
        alistCredentials.password = password;
        alistCredentials.source = 'ENV';
        rcloneConfig.source = 'RCLONE_CONF + ALIST_API';
        
        logOperation('initializeRcloneCredentials', { 
            status: '✅ Alist API and rclone configured',
            config_source: rcloneConfig.source
        });
        console.log('✅ [RcloneStorage] Alist API and rclone configured for Terabox');
        startSyncQueueWorker();

        return {
            success: true,
            source: rcloneConfig.source,
            message: 'Alist API and rclone configured'
        };
    } catch (err) {
        logOperation('initializeRcloneCredentials', { 
            status: '❌ Initialization failed',
            error: err.message
        });
        console.error('❌ [RcloneStorage] Initialization failed:', err.message);

        return {
            success: false,
            source: 'RCLONE_CONF',
            message: `Initialization failed: ${err.message}`
        };
    }
}

module.exports = RcloneStorage;
module.exports.initializeRcloneCredentials = initializeRcloneCredentials;

/**
 * Reset cache for testing purposes
 */
module.exports.__resetCache = function() {
    createdDirsCache.clear();
};
