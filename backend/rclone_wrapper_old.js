// ============================================================
// Rclone Storage Wrapper — Terabox Primary (Direct), Storj Backup
// Direct Rclone WebDAV connection to Terabox (no Alist middleware)
// ============================================================
const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getSecret } = require('./secretManager');

// Credential storage (loaded at startup via initializeRcloneCredentials)
let rcloneConfig = {
    teraboxUser: process.env.TERABOX_USER || 'terabox_user',
    teraboxPass: process.env.TERABOX_PASS || 'terabox_pass',
    source: 'ENV_VAR_OR_HARDCODED'
};

const createdDirsCache = new Set();

/**
 * Diagnostic logging helper with context information.
 * Logs operation type, timestamp, and custom details.
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
const rclonePath = isWindows ? path.resolve(__dirname, '..', 'rclone.exe') : 'rclone';
const configPath = process.env.RCLONE_CONFIG || path.resolve(__dirname, '..', 'rclone.conf');

/**
 * Login to Alist with automatic retry logic and exponential backoff.
 * @param {string} domain - Alist domain (e.g. 'http://127.0.0.1:5244')
 * @param {object} credentials - Object with username and password
 * @param {number} attempt - Current attempt number (default 1)
 * @returns {Promise<string>} - Alist token on success
 * @throws {Error} - After max retries exhausted
 */
async function loginToAlist(domain, credentials, attempt = 1) {
    const maxRetries = 2;
    const timeoutMs = 30000;
    
    try {
        logOperation('loginToAlist', { 
            action: 'Login attempt',
            attempt: attempt,
            max_attempts: maxRetries,
            endpoint: domain,
            username: credentials.username 
        });
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        
        const response = await fetch(`${domain}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: credentials.username,
                password: credentials.password
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeout);
        const data = await response.json();
        
        if (!response.ok || !data.data?.token) {
            throw new Error(`Login failed: ${data.message || 'No token returned'} (HTTP ${response.status})`);
        }
        
        logOperation('loginToAlist', { 
            status: '✅ Alist authenticated',
            attempt: attempt,
            endpoint: domain 
        });
        console.log(`✅ Alist authenticated on attempt ${attempt}`);
        return data.data.token;
        
    } catch (err) {
        const isRetryable = err.name === 'AbortError' || 
                           (err.message?.includes('401')) ||
                           (err.message?.includes('timeout'));
        
        if (isRetryable && attempt < maxRetries) {
            const delayMs = 1000 * attempt;
            logOperation('loginToAlist', { 
                status: '⚠️ Login attempt failed (retryable)',
                attempt: attempt,
                max_attempts: maxRetries,
                error: err.message,
                retry_delay_ms: delayMs,
                endpoint: domain
            });
            console.warn(`⚠️ Alist login attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
            await new Promise(r => setTimeout(r, delayMs));
            return loginToAlist(domain, credentials, attempt + 1);
        }
        
        logOperation('loginToAlist', { 
            status: '❌ Alist login failed',
            attempts: attempt,
            error: err.message,
            domain: domain,
            username: credentials.username,
            credentials_source: alistCredentials.source,
            endpoint: domain
        });
        console.error(`❌ Alist login failed after ${attempt} attempts:`, {
            domain,
            username: credentials.username,
            error: err.message,
            credentials_source: alistCredentials.source
        });
        
        throw new Error(`Alist authentication failed: ${err.message}`);
    }
}

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

const RcloneStorage = {
    async getRawUrl(storagePath) {
        let cleanPath = storagePath.startsWith('/') ? storagePath : '/' + storagePath;
        if (cleanPath.startsWith('/ads-media/')) {
            const parts = cleanPath.substring(1).split('/');
            if (parts.length >= 3) {
                cleanPath = '/' + parts.join('/');
            }
        }

        const alistPath = '/terabox' + cleanPath;
        const alistDomain = 'http://127.0.0.1:5244';

        let token = alistTokenCache.token;
        if (!token || Date.now() > alistTokenCache.expiry) {
            logOperation('getRawUrl', { action: 'Need new token (cache expired)', path: alistPath });
            token = await loginToAlist(alistDomain, alistCredentials);
            alistTokenCache = { token, expiry: Date.now() + 24 * 60 * 60 * 1000 };
        } else {
            logOperation('getRawUrl', { action: 'Checking cache: token valid', path: alistPath });
        }

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000); // Increased to 30s
        const fsGetResponse = await fetch(`${alistDomain}/api/fs/get`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path: encodeURI(alistPath) }),
            signal: ctrl.signal
        });
        clearTimeout(t);
        const fsGetData = await fsGetResponse.json();

        // If encodeURI fails, try raw path (Alist handles it sometimes)
        if (fsGetData.code !== 200 || !fsGetData.data) {
            const fallbackRes = await fetch(`${alistDomain}/api/fs/get`, {
                method: 'POST',
                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: alistPath })
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackData.code !== 200 || !fallbackData.data) {
                throw new Error(`Alist Web API failed: ${fallbackData.message || fsGetData.message}`);
            }
            logOperation('getRawUrl', { status: '✅ Got raw URL from Alist', path: alistPath });
            return fallbackData.data.raw_url;
        }

        logOperation('getRawUrl', { status: '✅ Got raw URL from Alist', path: alistPath });
        return fsGetData.data.raw_url;
    },

    /**
     * Get a readable stream for a file from Alist Raw URL.
     * Uses global fetch (Node 18+) for more direct proxying.
     */
    async getStream(storagePath) {
        const rawUrl = await this.getRawUrl(storagePath);
        console.log(`[Stream] Proxying raw URL: ${rawUrl.substring(0, 100)}...`);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // Increased to 30s (headers only)

        const response = await fetch(rawUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) {
            throw new Error(`Failed to fetch raw URL: ${response.status} ${response.statusText}`);
        }

        // Node 18+ fetch returns a Web Stream (ReadableStream). 
        // We convert to Node stream for express compatibility.
        const { Readable } = require('stream');
        if (response.body.getReader) {
            return Readable.fromWeb(response.body);
        }
        return response.body;
    },

    /**
     * Legacy rclone stream (for ZIP logic compatibility if needed)
     */
    async stream(storagePath) {
        const rawUrl = await this.getRawUrl(storagePath);
        return rcloneSpawn(['cat', '--http-no-head', rawUrl]);
    },


    /**
     * Build the full remote path: terabox:/arsip/zona-01/toko-a/PPN/file.pdf
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
     * Build the standard storage path synchronously
     */
    buildStoragePath(zonaKode, tokoKode, category, originalName) {
        return `${BASE_PATH}/${zonaKode}/${tokoKode}/${category}/${originalName}`;
    },

    /**
     * Upload a file buffer to primary storage (Terabox) and optional backup (Storj) in the background.
     * Keeps retrying infinitely if Terabox drops connection (TLS timeout).
     */
    async uploadInBackground(fileBuffer, originalName, zonaKode, tokoKode, category) {
        const storagePath = this.buildStoragePath(zonaKode, tokoKode, category, originalName);

        for (let masterAttempt = 1; masterAttempt <= 100; masterAttempt++) {
            try {
                console.log(`[Background Upload] Attempt ${masterAttempt} for ${originalName}...`);
                await this.uploadDirect(fileBuffer, originalName, storagePath);
                console.log(`[Background Upload] SUCCESS for ${originalName} after ${masterAttempt} attempts`);
                return { storagePath, size: fileBuffer.length };
            } catch (e) {
                console.warn(`[Background Upload] Failed attempt ${masterAttempt} for ${originalName}:`, e.message);
                // Wait 15 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 15000));
            }
        }
        console.error(`[Background Upload] GAVE UP on ${originalName} after 100 attempts!`);
    },

    /**
     * The internal upload method
     */
    async uploadDirect(fileBuffer, originalName, storagePath) {
        try {
            logOperation('uploadDirect', { 
                action: 'Starting upload',
                operation_type: 'upload',
                filename: originalName, 
                storagePath: storagePath 
            });

            const alistDomain = 'http://127.0.0.1:5244';

            // 1. Get Token (with caching)
            let token = alistTokenCache.token;
            if (!token || Date.now() > alistTokenCache.expiry) {
                logOperation('uploadDirect', { action: 'Logging in - token expired or missing', storagePath });
                token = await loginToAlist(alistDomain, alistCredentials);
                alistTokenCache = { token, expiry: Date.now() + 24 * 60 * 60 * 1000 };
            }

            // 1.5 Create Parent Directory using robust rclone mkdir
            const parentFolderPath = storagePath.substring(0, storagePath.lastIndexOf('/'));

            if (!createdDirsCache.has(parentFolderPath)) {
                logOperation('uploadDirect', { 
                    action: 'Creating directory',
                    path: parentFolderPath 
                });
                try {
                    await rcloneExec(['mkdir', `${PRIMARY_REMOTE}:${parentFolderPath}`]);

                    // Recursive Alist Refresh (Optimized: Parallel Segment Refresh)
                    const segments = parentFolderPath.split('/').filter(Boolean);
                    let currentSyncPathArr = [];
                    const refreshPromises = [];

                    for (const segment of segments) {
                        currentSyncPathArr.push(segment);
                        const currentSyncPath = '/' + currentSyncPathArr.join('/');
                        if (currentSyncPath === BASE_PATH) continue;

                        refreshPromises.push(
                            fetch(`${alistDomain}/api/fs/list`, {
                                method: 'POST',
                                headers: { 'Authorization': token, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ path: '/terabox' + currentSyncPath, refresh: true, page: 1, per_page: 1 })
                            }).then(r => r.json()).catch(e => console.warn(`[Sync] Refresh failed for ${currentSyncPath}:`, e.message))
                        );
                    }
                    await Promise.all(refreshPromises);

                    createdDirsCache.add(parentFolderPath);
                } catch (err) {
                    const errMsg = err.message || '';
                    console.warn(`[Upload] rclone mkdir returned an error: ${errMsg}`);
                    if (errMsg.toLowerCase().includes('409') || errMsg.toLowerCase().includes('conflict')) {
                        console.log(`[Upload] Detected 409/Conflict for ${parentFolderPath}, treating as existing directory.`);
                        createdDirsCache.add(parentFolderPath);
                    } else {
                        throw err;
                    }
                }
            }

            // 2. Put File directly via Alist API with Retry Mechanism
            let putResponse, putData;
            let success = false;
            let retries = 3;
            let attempt = 0;

            while (attempt < retries && !success) {
                attempt++;
                try {
                    logOperation('uploadDirect', { 
                        action: 'Uploading file',
                        filename: originalName,
                        attempt: attempt,
                        max_attempts: retries
                    });
                    
                    const c = new AbortController();
                    const tt = setTimeout(() => c.abort(), 600000); // 10 minutes
                    putResponse = await fetch(`${alistDomain}/api/fs/put`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': token,
                            'File-Path': encodeURIComponent('/terabox' + storagePath)
                        },
                        body: fileBuffer,
                        signal: c.signal
                    });
                    clearTimeout(tt);

                    putData = await putResponse.json();
                    if (putData.code === 200) {
                        success = true;
                    } else {
                        throw new Error(putData.message);
                    }
                } catch (err) {
                    console.warn(`[Upload] Attempt ${attempt} failed for ${originalName}: ${err.message}`);
                    if (attempt >= retries) {
                        throw new Error(`Alist API upload failed after 3 attempts: ${err.message}`);
                    }
                    // Wait 2 seconds before retrying
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            logOperation('uploadDirect', { 
                status: '✅ Upload successful',
                filename: originalName,
                attempts: attempt,
                storagePath: storagePath 
            });

            // Backup to Storj (fire and forget via rcat)
            const backupDest = `${BACKUP_REMOTE}:${storagePath}`;
            const backupPromise = new Promise((resolve, reject) => {
                const child = spawn(rclonePath, ['--config', configPath, 'rcat', backupDest]);
                child.on('close', (code) => code === 0 ? resolve() : reject(new Error('Backup rcat failed')));
                child.on('error', reject);
                child.stdin.write(fileBuffer);
                child.stdin.end();
            });
            backupPromise
                .then(() => console.log(`[Rclone] Backup to storj complete.`))
                .catch(err => console.warn(`[Rclone] Backup failed (non-critical):`, err.message));

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

            const alistDomain = 'http://127.0.0.1:5244';

            // 1. Get Token (with caching)
            let token = alistTokenCache.token;
            if (!token || Date.now() > alistTokenCache.expiry) {
                logOperation('uploadMedia', { action: 'Logging in - token expired or missing', storagePath });
                token = await loginToAlist(alistDomain, alistCredentials);
                alistTokenCache = { token, expiry: Date.now() + 24 * 60 * 60 * 1000 };
            }

            // 1.5 Create Parent Directory using robust rclone mkdir
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

            // 2. Put File directly with 10 minute timeout
            logOperation('uploadMedia', { 
                action: 'Uploading file',
                filename: originalName,
                category: category
            });

            const c = new AbortController();
            const tt = setTimeout(() => c.abort(), 600000); // 10 minutes
            const putResponse = await fetch(`${alistDomain}/api/fs/put`, {
                method: 'PUT',
                headers: {
                    'Authorization': token,
                    'File-Path': encodeURIComponent('/terabox' + storagePath)
                },
                body: fileBuffer,
                signal: c.signal
            });
            clearTimeout(tt);
            const putData = await putResponse.json();
            if (putData.code !== 200) throw new Error('Alist API upload failed: ' + putData.message);

            logOperation('uploadMedia', { 
                status: '✅ Media upload successful',
                filename: originalName,
                category: category,
                storagePath: storagePath 
            });

            // Backup (fire and forget via rcat)
            const backupDest = `${BACKUP_REMOTE}:${storagePath}`;
            const backupPromise = new Promise((resolve, reject) => {
                const child = spawn(rclonePath, ['--config', configPath, 'rcat', backupDest]);
                child.on('close', (code) => code === 0 ? resolve() : reject(new Error('Backup rcat failed')));
                child.on('error', reject);
                child.stdin.write(fileBuffer);
                child.stdin.end();
            });
            backupPromise.catch(err => console.warn(`[Rclone] Media backup failed:`, err.message));

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

    async download(storagePath) {
        const tmpDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const tempFilePath = path.join(tmpDir, `download-${Date.now()}-${path.basename(storagePath)}`);
        const rawUrl = await this.getRawUrl(storagePath);
        await rcloneExec(['copyurl', rawUrl, tempFilePath]);
        return tempFilePath;
    },

    /**
     * Delete a file from storage via Alist API (/api/fs/remove).
     * @param {string} storagePath - e.g. "arsip/zona-01/toko-a/PPN/file.pdf"
     */
    async deleteFile(storagePath) {
        let cleanPath = storagePath.startsWith('/') ? storagePath : '/' + storagePath;
        const alistPath = '/terabox' + cleanPath;
        const alistDomain = 'http://127.0.0.1:5244';

        logOperation('deleteFile', { 
            action: 'Starting file deletion',
            operation_type: 'delete',
            storagePath: storagePath 
        });

        // Get or refresh Alist token
        let token = alistTokenCache.token;
        if (!token || Date.now() > alistTokenCache.expiry) {
            token = await loginToAlist(alistDomain, alistCredentials);
            alistTokenCache = { token, expiry: Date.now() + 24 * 60 * 60 * 1000 };
        }

        // Extract the directory and filename from the path
        const dir = path.posix.dirname(alistPath);
        const fileName = path.posix.basename(alistPath);

        logOperation('deleteFile', { 
            action: 'Deleting file',
            filename: fileName,
            directory: dir
        });

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 30000);
        const deleteResponse = await fetch(`${alistDomain}/api/fs/remove`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                dir: dir,
                names: [fileName]
            }),
            signal: ctrl.signal
        });
        clearTimeout(t);

        const deleteData = await deleteResponse.json();
        if (deleteData.code !== 200) {
            logOperation('deleteFile', { 
                status: '❌ Delete failed',
                error: deleteData.message,
                storagePath: storagePath 
            });
            console.error(`[RcloneStorage] Alist delete failed:`, deleteData);
            throw new Error(`Alist delete failed: ${deleteData.message || 'Unknown error'}`);
        }

        logOperation('deleteFile', { 
            status: '✅ Delete successful',
            storagePath: storagePath 
        });
        return true;
    },

    /**
     * Check if a file exists on primary storage.
     */
    async checkFileExists(storagePath) {
        try {
            await this.getRawUrl(storagePath);
            return true;
        } catch (err) {
            return false;
        }
    },

    /**
     * List all files in a directory via Alist API.
     */
    async listFiles(storagePath) {
        let cleanPath = storagePath.startsWith('/') ? storagePath : '/' + storagePath;
        const alistPath = '/terabox' + cleanPath;
        const alistDomain = 'http://127.0.0.1:5244';

        logOperation('listFiles', { 
            action: 'Listing files',
            operation_type: 'list',
            path: storagePath 
        });

        let token = alistTokenCache.token;
        if (!token || Date.now() > alistTokenCache.expiry) {
            token = await loginToAlist(alistDomain, alistCredentials);
            alistTokenCache = { token, expiry: Date.now() + 24 * 60 * 60 * 1000 };
        }

        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 60000); // Increased to 60s for large directories
        const listResponse = await fetch(`${alistDomain}/api/fs/list`, {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: alistPath, page: 1, per_page: 3000 }),
            signal: ctrl.signal
        });
        clearTimeout(t);

        const listData = await listResponse.json();
        if (listData.code !== 200) {
            logOperation('listFiles', { 
                status: '❌ List failed',
                error: listData.message,
                path: storagePath 
            });
            throw new Error(`Alist list failed: ${listData.message}`);
        }

        const fileCount = listData.data.content ? listData.data.content.length : 0;
        logOperation('listFiles', { 
            status: '✅ List successful',
            path: storagePath,
            file_count: fileCount 
        });

        return listData.data.content || [];
    }
};

/**
 * Initialize Rclone credentials from Secret Manager at server startup.
 * This function should be called from server.js during initialization.
 * 
 * @returns {Promise<Object>} - Status object: { success, source, message }
 */
async function initializeRcloneCredentials() {
    console.log('🔐 [RcloneStorage] Initializing storage credentials...');

    try {
        // Try to fetch from Secret Manager (Cloud Run environment)
        const password = await getSecret(
            'arsip-alist-password',
            'ALIST_ADMIN_PASSWORD',
            'AdminArsip2026!'  // Fallback for local dev
        );

        alistCredentials.password = password;

        // Determine which source the secret came from
        if (process.env.GCP_PROJECT_ID) {
            alistCredentials.source = 'SECRET_MANAGER';
            logOperation('initializeRcloneCredentials', { 
                status: '✅ Credentials loaded from SECRET_MANAGER',
                credentials_source: 'SECRET_MANAGER'
            });
            console.log('✅ [RcloneStorage] Storage credentials loaded from SECRET_MANAGER');
        } else if (process.env.ALIST_ADMIN_PASSWORD) {
            alistCredentials.source = 'ENV';
            logOperation('initializeRcloneCredentials', { 
                status: '✅ Credentials loaded from ENV',
                credentials_source: 'ENV'
            });
            console.log('✅ [RcloneStorage] Storage credentials loaded from ENV');
        } else {
            alistCredentials.source = 'FALLBACK';
            logOperation('initializeRcloneCredentials', { 
                status: '✅ Credentials loaded from FALLBACK (local development)',
                credentials_source: 'FALLBACK'
            });
            console.log('✅ [RcloneStorage] Storage credentials loaded from FALLBACK (local development)');
        }

        return {
            success: true,
            source: alistCredentials.source,
            message: `Credentials loaded from ${alistCredentials.source}`
        };
    } catch (err) {
        logOperation('initializeRcloneCredentials', { 
            status: '⚠️ Failed to initialize credentials',
            error: err.message
        });
        console.warn('⚠️ [RcloneStorage] Failed to initialize credentials:', err.message);
        console.log('ℹ️ [RcloneStorage] Using default fallback credentials for local development');

        // Use hardcoded fallback
        alistCredentials.password = 'AdminArsip2026!';
        alistCredentials.source = 'FALLBACK_ERROR';

        return {
            success: false,
            source: 'FALLBACK_ERROR',
            message: `Credential initialization failed: ${err.message}`
        };
    }
}

module.exports = RcloneStorage;
module.exports.initializeRcloneCredentials = initializeRcloneCredentials;
module.exports.loginToAlist = loginToAlist;

/**
 * Reset token cache for testing purposes
 */
module.exports.__resetCache = function() {
    alistTokenCache = { token: null, expiry: 0 };
};
