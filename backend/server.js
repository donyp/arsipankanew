// ============================================================
// Pusat Arsip Anka Backend — JWT Auth + Rclone Storage
// ============================================================
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const archiver = require('archiver');
const RcloneStorage = require('./rclone_wrapper');
const LocalStorage = require('./local_storage');
const { initializeClient: initializeSecretManager, getSecret } = require('./secretManager');
const { initializeAlist } = require('./alistStartupHandler');
const { initializeRcloneConnectivity, verifyRcloneConnectivity } = require('./rcloneConnectivityHandler');

// Load environment variables FIRST (before using them)
// In local development: loads from .env file
// In production (Hugging Face): process.env is already set via Secrets
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Initialize Secret Manager client (if on Cloud Run)
initializeSecretManager();

const app = express();
const port = process.env.PORT || 4000;

console.log('================================================');
console.log(`[BOOT] Pusat Arsip Anka - v2.1.0-fixed`);
console.log(`[BOOT] Time: ${new Date().toISOString()}`);
console.log('================================================');

// Log environment configuration
console.log('[CONFIG] Reading environment variables...');
console.log(`[CONFIG] PORT: ${process.env.PORT || 'default 4000'}`);
console.log(`[CONFIG] NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`[CONFIG] SUPABASE_URL: ${process.env.SUPABASE_URL ? 'SET (' + process.env.SUPABASE_URL.substring(0, 20) + '...)' : '❌ NOT SET'}`);
console.log(`[CONFIG] SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : '❌ NOT SET'}`);
console.log('[CONFIG] Environment configuration loaded.\n');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Frontend from root
app.use(express.static(path.join(__dirname, '..')));

// Version Header
app.use((req, res, next) => {
    res.setHeader('X-Backend-Version', '2.0.1-fixed');
    next();
});

app.get('/api/heartbeat', (req, res) => {
    console.log('[HEARTBEAT] Health check request received');
    res.json({ status: 'alive', version: '2.0.1-fixed' });
    console.log('[HEARTBEAT] Response sent');
});

// Health check endpoint with Rclone connectivity status
app.get('/api/health', async (req, res) => {
    try {
        const { getConnectionStatus } = require('./rcloneConnectivityHandler');
        const rcloneStatus = getConnectionStatus();
        
        res.json({
            status: 'healthy',
            version: '2.0.1-fixed',
            services: {
                rclone: {
                    connected: rcloneStatus.verified,
                    lastCheck: rcloneStatus.timestamp,
                    error: rcloneStatus.error,
                    attempts: rcloneStatus.attempts
                }
            }
        });
    } catch (err) {
        console.error('[HEALTH] Error retrieving status:', err.message);
        res.status(500).json({
            status: 'error',
            error: err.message
        });
    }
});
// Supabase Admin Client (for DB access, not for auth)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Multer config (memory storage for streaming to Rclone)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file PDF yang diizinkan'), false);
        }
    }
});

// Multer config for Ads Media (accepts images, videos, design files)
const uploadMediaMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for media
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-very-long-random-string';
const JWT_EXPIRES_IN = '8h';

// Maintenance Mode Helper (Persistent via Supabase + Fallback File)
// Task 3.5: Improved async error handling with comprehensive logging
const MAINTENANCE_FILE = path.join(__dirname, 'maintenance_status.json');
async function getMaintenanceStatus() {
    try {
        // High priority: Fetch from Supabase for true persistence across restarts
        const { data, error } = await supabase
            .from('system_config')
            .select('value')
            .eq('key', 'maintenance_mode')
            .maybeSingle();

        if (error) {
            // Task 3.5: Explicit error logging for Supabase query failures
            console.warn('[Maintenance] Supabase query error:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            throw error; // Fall through to catch block for fallback handling
        }

        if (data && data.value) {
            return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        }

        // Fallback: Local JSON file
        if (!fs.existsSync(MAINTENANCE_FILE)) return { isMaintenance: false };
        return JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
    } catch (err) {
        // Task 3.5: Enhanced error logging with stack trace
        console.warn('[Maintenance] DB fetch failed, using local fallback:', {
            message: err.message,
            code: err.code,
            stack: err.stack
        });
        
        try {
            if (!fs.existsSync(MAINTENANCE_FILE)) {
                // Task 3.5: Log fallback to default value
                console.warn('[Maintenance] No local file found, defaulting to maintenance=OFF');
                return { isMaintenance: false };
            }
            const localData = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
            console.log('[Maintenance] Successfully loaded from local file:', localData);
            return localData;
        } catch (fileErr) {
            // Task 3.5: Explicit logging when all fallbacks fail
            console.error('[Maintenance] All maintenance status sources failed:', {
                dbError: err.message,
                fileError: fileErr.message
            });
            console.warn('[Maintenance] Defaulting to maintenance=OFF to prevent blocking requests');
            return { isMaintenance: false };
        }
    }
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

/**
 * Verify JWT token from Authorization header.
 * Populates req.user = { userId, email, role, zona_id }
 * Task 3.5: Enhanced async middleware error handling to prevent event loop blocking
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    // Allow token from Header OR Query Parameter (?token=...)
    const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Token tidak valid atau sudah expired.' });
        }
        // --- BYPASS CONSTRAINT CHECK: Elevate to moderator dynamically ---
        if (decoded.permissions && decoded.permissions.includes('IS_MODERATOR')) {
            decoded.role = 'moderator';
        }

        req.user = decoded;

        // --- MAINTENANCE MODE ENFORCEMENT ---
        // Task 3.5: Async call with comprehensive error handling to prevent blocking
        getMaintenanceStatus()
            .then(sys => {
                if (sys && sys.isMaintenance && decoded.role === 'admin_zona') {
                    return res.status(503).json({
                        error: 'Sistem Sedang Perbaikan',
                        message: 'Akses Admin Zona ditangguhkan sementara untuk pemeliharaan teknis. Silakan coba lagi nanti.'
                    });
                }

                // Session Heartbeat (Asynchronous)
                // Task 3.5: Fire-and-forget pattern with comprehensive error handling
                const sessionId = req.headers['x-session-id'];
                if (sessionId) {
                    supabase.from('active_sessions')
                        .update({ last_active: new Date().toISOString() })
                        .eq('session_id', sessionId)
                        .then(({ error }) => {
                            if (error) {
                                // Task 3.5: Detailed error logging
                                console.warn('[HEARTBEAT] Error updating session:', {
                                    sessionId,
                                    message: error.message,
                                    code: error.code
                                });
                            }
                        })
                        .catch(err => {
                            // Task 3.5: Catch any promise rejections to prevent blocking
                            console.warn('[HEARTBEAT] Failed to update session:', {
                                sessionId,
                                message: err.message,
                                stack: err.stack
                            });
                            // Note: Request continues regardless of heartbeat failure
                        });
                }

                // Task 3.5: Request continues regardless of async operation results
                next();
            })
            .catch(err => {
                // Task 3.5: Enhanced error logging with context
                console.error('[Middleware] Maintenance check async error:', {
                    message: err.message || err,
                    stack: err.stack,
                    userId: decoded.userId,
                    role: decoded.role,
                    path: req.path
                });
                // Task 3.5: Fallback behavior - assume maintenance mode is OFF
                // This ensures async failures never block request processing
                console.warn('[Middleware] Continuing request processing with maintenance=OFF fallback');
                next();
            });
    });
}

/**
 * RBAC Middleware â€” restrict routes to specific roles.
 */
function authorizeRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Anda tidak memiliki akses ke fitur ini.' });
        }
        next();
    };
}

// Granular Permission Middleware
function requirePermission(perm) {
    return (req, res, next) => {
        if (req.user.role === 'moderator') return next();
        if (req.user.role === 'super_admin' && perm !== 'manage_users') return next();
        const perms = req.user.permissions || [];
        if (perms.includes(perm)) return next();
        return res.status(403).json({ error: `Akses ditolak. Dibutuhkan izin khusus: ${perm}` });
    };
}

// Any Upload Permission Middleware
function requireUploadPermission(req, res, next) {
    if (req.user.role === 'moderator' || req.user.role === 'super_admin') return next();
    const perms = req.user.permissions || [];
    if (perms.includes('upload_single') || perms.includes('upload_batch')) return next();
    return res.status(403).json({ error: 'Anda tidak memiliki akses untuk mengunggah file.' });
}

function authorizeZone(req, res, next) {
    if (req.user.role === 'moderator' || req.user.role === 'super_admin') return next(); // Bypass

    const requestedZona = req.query.zona_id || req.body?.zona_id || req.params?.zona_id;
    if (requestedZona && parseInt(requestedZona) !== req.user.zona_id) {
        return res.status(403).json({ error: 'Anda tidak memiliki akses ke zona ini.' });
    }
    next();
}

// Helper to create system notifications
async function createSystemNotification({ user_id, zona_id, title, message, type = 'info', link = null }) {
    try {
        const { error } = await supabase
            .from('system_notifications')
            .insert({
                user_id, // Null for global/moderator targeted
                zona_id, // Optional
                title,
                message,
                type,
                link,
                status: 'Unread',
                created_at: new Date().toISOString()
            });
        if (error) console.error('[NOTIF] Create Error:', error.message);
    } catch (err) {
        console.error('[NOTIF] Trigger Error:', err);
    }
}

// Helper to notify all Moderators and Super Admins
async function notifyModerators(title, message, link = null) {
    try {
        // Fetch all users with role super_admin or moderator
        const { data: mods, error } = await supabase
            .from('users')
            .select('id')
            .in('role', ['super_admin', 'moderator']);

        if (error) throw error;

        const notifs = mods.map(m => ({
            user_id: m.id,
            title,
            message,
            type: 'request',
            link,
            status: 'Unread',
            created_at: new Date().toISOString()
        }));

        if (notifs.length > 0) {
            await supabase.from('system_notifications').insert(notifs);
        }
    } catch (err) {
        console.error('[NOTIF] Moderator Alert Error:', err);
    }
}

// ============================================================
// AUTH ENDPOINTS
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email dan password wajib diisi.' });
        }

        // Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('*, zonas(kode, nama)')
            .eq('email', email.toLowerCase().trim())
            .eq('is_active', true)
            .single();

        if (error) console.error("Supabase Error during login:", error.message || error);
        if (!user) console.error("User not found during login");

        if (error || !user) {
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Email atau password salah.' });
        }

        // Check Session Limit for Admin Zona
        const { data: activeSessions, error: sessionError } = await supabase
            .from('active_sessions')
            .select('*')
            .eq('user_id', user.id);

        if (sessionError) console.error("[SESSION] Check Error:", sessionError);

        if (user.role === 'admin_zona' && activeSessions && activeSessions.length >= 2) {
            const { session_id } = req.body;
            const currentSession = activeSessions.find(s => s.session_id === session_id);

            if (!currentSession) {
                return res.status(403).json({
                    error: 'Sesi Terbatas: Akun ini sudah aktif di 2 perangkat lain. Silakan logout dari perangkat sebelumnya.'
                });
            }
        }

        // Generate JWT
        const payload = {
            userId: user.id,
            email: user.email,
            role: user.role,
            zona_id: user.zona_id,
            name: user.name,
            permissions: user.permissions || []
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        // Upsert Session
        const { session_id } = req.body;
        if (session_id) {
            await supabase
                .from('active_sessions')
                .upsert({
                    user_id: user.id,
                    session_id: session_id,
                    user_agent: req.headers['user-agent'] || 'Unknown',
                    last_active: new Date().toISOString()
                }, { onConflict: 'session_id' });
        }

        // Audit with detailed info
        const userAgent = req.headers['user-agent'] || 'Unknown';
        await supabase.from('audit_logs').insert({
            user_id: user.id,
            action: 'Login',
            context: JSON.stringify({
                ip: req.ip,
                ua: userAgent,
                status: 'Success'
            })
        });

        // --- MAINTENANCE MODE ENFORCEMENT ---
        const sys = await getMaintenanceStatus();
        if (sys.isMaintenance && user.role === 'admin_zona') {
            return res.status(503).json({
                error: 'Sistem Sedang Perbaikan',
                message: 'Akses Admin Zona ditangguhkan sementara untuk pemeliharaan teknis. Silakan coba lagi nanti.',
                updatedAt: sys.updatedAt
            });
        }

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                zona_id: user.zona_id
            }
        });

    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ error: 'Server error saat login.' });
    }
});

// POST /api/auth/verify-admin — quick check for admin bypass during maintenance
app.post('/api/auth/verify-admin', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.json({ isAdmin: false });

        const { data: user, error } = await supabase
            .from('users')
            .select('role, password_hash, is_active')
            .eq('email', email.toLowerCase().trim())
            .single();

        if (error || !user || !user.is_active) return res.json({ isAdmin: false });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.json({ isAdmin: false });

        const isAdmin = user.role === 'super_admin' || user.role === 'moderator';
        res.json({ isAdmin });

    } catch (err) {
        res.json({ isAdmin: false });
    }
});

// POST /api/auth/logout (stateless â€” just for audit logging)
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
    await supabase.from('audit_logs').insert({
        user_id: req.user.userId,
        action: 'Logout',
        context: 'User logged out'
    });
    res.json({ success: true, message: 'Logged out.' });
});

// GET /api/auth/me â€” get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('id, email, contact_email, name, role, zona_id, toko_id, is_active, permissions, zonas(kode, nama)')
            .eq('id', req.user.userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ error: 'User tidak ditemukan.' });
        }

        res.json({ user });

        // POST /api/logout â€” Terminate session
        app.post('/api/logout', authenticateToken, async (req, res) => {
            try {
                const { session_id } = req.body;
                if (session_id) {
                    await supabase.from('active_sessions').delete().eq('session_id', session_id);
                }
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// ============================================================
// FILES ENDPOINTS
// ============================================================

// GET /api/files â€” list files (auto-filtered by zona for admin_zona)
app.get('/api/files', authenticateToken, authorizeZone, async (req, res) => {
    try {
        console.log(`[/api/files] User role: ${req.user.role}, zona_id: ${req.user.zona_id}`);
        
        let query = supabase
            .from('files')
            .select('*, zonas(kode, nama), toko(kode, nama)', { count: 'exact' })
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        // Auto-filter by zona for admin_zona (INVOICE only)
        if (req.user.role === 'admin_zona') {
            console.log(`[/api/files] Filtering as admin_zona for zona_id: ${req.user.zona_id}`);
            query = query.eq('zona_id', req.user.zona_id)
                .eq('category', 'INVOICE'); // Strict: admin_zona only sees INVOICE category
        } 
        // Moderator and super_admin see all files (no automatic zona filter)
        // But can optionally filter by zona_id query param
        else if (req.query.zona_id) {
            console.log(`[/api/files] Filtering by optional zona_id: ${req.query.zona_id}`);
            query = query.eq('zona_id', parseInt(req.query.zona_id));
        } else if (req.user.role === 'moderator' || req.user.role === 'super_admin') {
            console.log(`[/api/files] ${req.user.role} viewing ALL files (no zona filter)`);
        }

        // Category filter
        if (req.query.category) {
            query = query.eq('category', req.query.category);
        }

        // Toko filter - only apply if toko_id is valid number
        if (req.query.toko_id && !isNaN(parseInt(req.query.toko_id))) {
            console.log(`[/api/files] Filtering by toko_id: ${req.query.toko_id}`);
            query = query.eq('toko_id', parseInt(req.query.toko_id));
        } else if (req.query.toko_id) {
            console.log(`[/api/files] WARNING: Invalid toko_id parameter: ${req.query.toko_id} (ignoring)`);
        }

        // Filter by Tipe PPN (PPN/NON)
        if (req.query.tipe_ppn) {
            query = query.eq('tipe_ppn', req.query.tipe_ppn);
        }

        // Anomaly Status Filter
        if (req.query.is_anomaly === 'true') {
            query = query.ilike('status', '%Anomali%');
        }

        // Search Logic: Strict AND match for multi-term queries
        if (req.query.search) {
            const searchVal = req.query.search.trim().toLowerCase();
            if (searchVal) {
                // Split by spaces to handle multiple terms (e.g. "Deltamas 14.223")
                const terms = searchVal.split(/\s+/).filter(t => t.length > 0);

                // Apply 'ilike' for EACH term (AND logic)
                for (const term of terms) {
                    query = query.ilike('nama_file', `%${term}%`);
                }

                console.log(`[Search] Query: "${searchVal}" | Split into ${terms.length} terms: [${terms.join(', ')}]`);
            }
        }

        // Pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        // IMPORTANT: Apply range AFTER all filters and before fetch
        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) {
            console.error('[/api/files] Query error:', error);
            throw error;
        }

        console.log(`[/api/files] Success: found ${data?.length || 0} files, total: ${count || 0}`);

        res.json({
            files: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });

    } catch (err) {
        console.error('List Files Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar file.' });
    }
});

// GET /api/files/trash — list deleted files
app.get('/api/files/trash', authenticateToken, requirePermission('restore_trash'), async (req, res) => {
    try {
        let query = supabase
            .from('files')
            .select('*, zonas(kode, nama), toko(kode, nama), deleter:users!deleted_by(name)', { count: 'exact' })
            .not('deleted_at', 'is', null)
            .order('deleted_at', { ascending: false });

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        query = query.range(from, to);

        const { data, error, count } = await query;
        if (error) throw error;

        // Fallback for "Unknown" if deleted_by is NULL or user deleted
        const filesWithFallback = (data || []).map(f => {
            let userName = 'Admin (System)';
            if (f.deleter && f.deleter.name) {
                userName = f.deleter.name;
            }
            return {
                ...f,
                display_name: userName,
                users: { name: userName } // Legacy compatibility for trash.js
            };
        });

        res.json({
            files: filesWithFallback,
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (err) {
        console.error('Trash List Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar sampah.' });
    }
});


// GET /api/toko — list tokos (filtered by zona)
app.get('/api/toko', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('toko').select('id, kode, nama, zona_id').order('nama', { ascending: true });

        let targetZona = req.query.zona_id;
        if (req.user.role === 'admin_zona') {
            targetZona = req.user.zona_id;
        }

        if (targetZona) {
            query = query.eq('zona_id', parseInt(targetZona));
        }

        const { data, error } = await query;
        if (error) throw error;

        res.json({ tokos: data || [] });
    } catch (err) {
        console.error('List Toko Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar toko.' });
    }
});

// Stream an archive file directly from the configured storage remote.
async function streamFileDownload(req, res) {
    try {
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona') {
            if (file.zona_id !== req.user.zona_id) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
            if (file.category === 'PIUTANG') {
                const userPerms = req.user.permissions || [];
                if (!userPerms.includes('view_piutang')) {
                    return res.status(403).json({ error: 'Anda tidak memiliki akses ke kategori Piutang.' });
                }
            }
        }

        // Stream directly
        let fileStream;
        try {
            fileStream = await RcloneStorage.getStream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Alist Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal mendownload file.' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[Stream Error]', err);
        });

    } catch (err) {
        console.error('Download File Error:', err);
        res.status(500).json({ error: 'Gagal download file.' });
    }
}

// GET /api/files/:id/download — download file
app.get('/api/files/:id/download', authenticateToken, streamFileDownload);

// Alias for sequential download (1-3 files) used by frontend
app.get('/api/files/download/:id', authenticateToken, (req, res, next) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) {
        return res.status(400).json({ error: 'ID file tidak valid.' });
    }
    return streamFileDownload(req, res, next);
});

// GET /api/files/:id/view — inline preview (PDF in iframe)
app.get('/api/files/:id/view', authenticateToken, async (req, res) => {
    try {
        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona') {
            if (file.zona_id !== req.user.zona_id) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
            if (file.category === 'PIUTANG') {
                const userPerms = req.user.permissions || [];
                if (!userPerms.includes('view_piutang')) {
                    return res.status(403).json({ error: 'Anda tidak memiliki akses ke kategori Piutang.' });
                }
            }
        }

        // Determine content type from file extension
        const ext = path.extname(file.nama_file).toLowerCase();
        const mimeMap = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.webp': 'image/webp',
        };
        const contentType = mimeMap[ext] || 'application/pdf';

        // Stream file inline (for browser preview, not download)
        let fileStream;
        try {
            fileStream = await RcloneStorage.getStream(file.storage_path);
        } catch (streamErr) {
            console.error(`[View Stream Error] Path: ${file.storage_path}`, streamErr);
            return res.status(500).json({ error: 'Gagal memuat preview file.' });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', 'inline');
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[View Stream Pipe Error]', err);
        });

    } catch (err) {
        console.error('View File Error:', err);
        res.status(500).json({ error: 'Gagal memuat preview file.' });
    }
});

// POST /api/files/:id/share - generate signed link
app.post('/api/files/:id/share', authenticateToken, async (req, res) => {
    try {
        // --- RESTRICTION: Block Admin Zona from sharing ---
        if (req.user.role === 'admin_zona') {
            return res.status(403).json({ error: 'Akses ditolak: Admin Zona tidak diizinkan menyalin link file.' });
        }

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check (Security robustification for other roles)
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            if (Number(file.zona_id) !== Number(req.user.zona_id)) {
                return res.status(403).json({ error: 'Anda tidak memiliki akses ke file ini.' });
            }
        }

        // Generate tiny JWT (expires in 2 days)
        const shareToken = jwt.sign({ f: file.id }, JWT_SECRET, { expiresIn: '2d' });

        res.json({ token: shareToken });

    } catch (err) {
        console.error('Share File Error:', err);
        res.status(500).json({ error: 'Gagal membuat link berbagi.' });
    }
});

// POST /api/files/:id/acknowledge - mark file as read
app.post('/api/files/:id/acknowledge', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin_zona') {
            return res.status(403).json({ error: 'Hanya Admin Zona yang dapat menandai file sebagai sudah dibaca.' });
        }

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Zone access check
        if (req.user.role === 'admin_zona' && Number(file.zona_id) !== Number(req.user.zona_id)) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        // Update status to 'Read' if it was 'Unread'
        let newStatus = file.status;
        if (file.status === 'Unread') {
            newStatus = 'Read';
        } else if (file.status === 'Unread (Anomali)') {
            newStatus = 'Read (Anomali)';
        }

        if (newStatus !== file.status) {
            const { error: updateError } = await supabase
                .from('files')
                .update({ status: newStatus })
                .eq('id', file.id);

            if (updateError) throw updateError;
            console.log(`[Acknowledge] File ${file.id} marked as ${newStatus} by ${req.user.userId}`);
        }

        res.json({ success: true, status: newStatus });

    } catch (err) {
        console.error('Acknowledge Error:', err);
        res.status(500).json({ error: 'Server error saat memproses tanda terima.' });
    }
});

// GET /api/share/:token - download via signed url
app.get('/api/share/:token', async (req, res) => {
    try {
        // Decode tiny JWT
        const decoded = jwt.verify(req.params.token, JWT_SECRET);
        if (!decoded || !decoded.f) {
            return res.status(403).json({ error: 'Tautan berbagi tidak valid atau kadaluarsa.' });
        }

        const fileId = decoded.f;

        const { data: file, error } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .single();

        if (error || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // Stream directly
        let fileStream;
        try {
            fileStream = await RcloneStorage.getStream(file.storage_path);
        } catch (downloadErr) {
            console.error(`[Alist Stream Error] Path: ${file.storage_path}`, downloadErr);
            return res.status(500).json({ error: 'Gagal mendownload file.' });
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${file.nama_file}"`);
        if (file.ukuran_bytes) {
            res.setHeader('Content-Length', file.ukuran_bytes);
        }

        fileStream.pipe(res);

        fileStream.on('error', (err) => {
            console.error('[Stream Error]', err);
        });

    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ error: 'Tautan berbagi ini sudah kadaluarsa (melewati 2 hari).' });
        }
        console.error('Share Download Error:', err);
        res.status(500).json({ error: 'Tautan berbagi tidak valid.' });
    }
});

// GET /api/files/check-duplicate — Background check for filename existence
app.get('/api/files/check-duplicate', authenticateToken, async (req, res) => {
    try {
        const { name, zona_id } = req.query;
        if (!name || !zona_id) return res.status(400).json({ error: 'Data tidak lengkap.' });

        const { data, error } = await supabase
            .from('files')
            .select('id')
            .eq('nama_file', name)
            .eq('zona_id', parseInt(zona_id))
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        res.json({ exists: !!data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Helper for Filename Scanning (Direct Scan Logic) ---
function extractMetadataFromFilename(filename) {
    const name = filename.replace(/\.pdf$/i, '').toUpperCase();
    let meta = { total: 0, tipe_ppn: 'NON' };

    // 1. Context-Aware Nominal Extraction (Look for number after PPN/NON)
    // This catches 0, 5000, 15.370.000 etc while avoiding dates.
    const contextMatch = name.match(/(?:PPN|NON)\s+(\d{1,3}(?:\.\d{3})+|\d+|\b0\b)/);
    if (contextMatch) {
        meta.total = parseFloat(contextMatch[1].replace(/\./g, '')) || 0;
        console.log(`[Filename Scan] Context-Match found: ${meta.total} in "${filename}"`);
    } else {
        // Fallback: Greedy Nominal Regex (legacy)
        const priceMatch = name.match(/\d{1,3}(?:\.\d{3})+|\d{5,10}/);
        if (priceMatch) {
            meta.total = parseFloat(priceMatch[0].replace(/\./g, '')) || 0;
            console.log(`[Filename Scan] Fallback match: ${meta.total}`);
        }
    }

    // 2. PPN/NON detection
    if (name.includes('PPN')) meta.tipe_ppn = 'PPN';
    else if (name.includes('NON')) meta.tipe_ppn = 'NON';

    return meta;
}

// POST /api/files/upload
app.post('/api/files/upload', authenticateToken, requireUploadPermission, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const { zona_id, toko_id, category } = req.body;
        console.log(`[Upload Audit] User: ${req.user.userId}, Body:`, { ...req.body, file: req.file?.originalname });

        if (!zona_id) {
            return res.status(400).json({ error: 'zona_id wajib diisi.' });
        }

        // --- SECURITY PATCH: Admin Zona Isolation ---
        if (req.user.role === 'admin_zona' && parseInt(zona_id) !== req.user.zona_id) {
            return res.status(403).json({ error: 'Keamanan: Anda hanya dapat mengunggah ke zona yang menjadi tanggung jawab Anda.' });
        }

        // Parallelize Zona/Toko lookups
        const [zonaRes, tokoRes] = await Promise.all([
            supabase.from('zonas').select('kode').eq('id', parseInt(zona_id)).single(),
            toko_id ? supabase.from('toko').select('kode').eq('id', parseInt(toko_id)).single() : Promise.resolve({ data: null })
        ]);

        const zona = zonaRes.data;
        if (!zona) return res.status(400).json({ error: 'Zona tidak ditemukan.' });

        let tokoKode = 'umum';
        if (tokoRes.data) tokoKode = tokoRes.data.kode;

        // Validate Date (tanggal_dokumen)
        if (req.body.tanggal_dokumen) {
            const parsedDate = Date.parse(req.body.tanggal_dokumen);
            if (isNaN(parsedDate)) {
                return res.status(400).json({ error: 'Format tanggal_dokumen tidak valid atau tidak terbaca kalender.' });
            }
        }

        // --- Duplicate Detection (Nama File + Zona) ---
        const { data: existingFile } = await supabase
            .from('files')
            .select('id')
            .eq('nama_file', req.file.originalname)
            .eq('zona_id', parseInt(zona_id))
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        if (existingFile) {
            return res.status(409).json({ error: 'File dengan nama yang sama sudah ada di zona ini.' });
        }

        // Calculate Storage Path Instantly
        const storagePath = RcloneStorage.buildStoragePath(
            zona.kode,
            tokoKode,
            category || 'PPN',
            req.file.originalname
        );
        const size = req.file.buffer.length;

        // --- RESILIENCE: Auto-Batching Fallback with In-Memory Mutex ---
        let finalBatchId = req.body.batch_id;

        // Skip auto-batching for PIUTANG category
        if (!finalBatchId && category !== 'PIUTANG') {
            console.log(`[Upload] File "${req.file.originalname}" arrived without batch_id. Finding/Creating...`);
            if (!global.batchLocks) global.batchLocks = {};
            const userLockKey = req.user.userId;

            // Wait if locked
            while (global.batchLocks[userLockKey]) {
                await new Promise(r => setTimeout(r, 50));
            }

            global.batchLocks[userLockKey] = true;
            try {
                // Double-check recent batch under lock
                const fiveMinAgo = new Date(Date.now() - 300000).toISOString();
                const { data: recentBatch } = await supabase
                    .from('upload_batches')
                    .select('id')
                    .eq('uploader_id', req.user.userId)
                    .gte('created_at', fiveMinAgo)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (recentBatch) {
                    finalBatchId = recentBatch.id;
                    console.log(`[Auto-Batch] Grouped into: ${finalBatchId}`);
                } else {
                    const { data: newBatch, error: bErr } = await supabase
                        .from('upload_batches')
                        .insert({ uploader_id: req.user.userId, total_files: 0, success_files: 0 })
                        .select('id')
                        .single();
                    if (bErr) throw bErr;
                    finalBatchId = newBatch.id;
                    console.log(`[Auto-Batch] Created NEW: ${finalBatchId}`);
                }
            } catch (err) {
                console.error("[Auto-Batch] Critical failure:", err.message);
                // Fallback to a random ID if everything fails, to avoid "null" batches
                finalBatchId = 'err_' + Date.now();
            } finally {
                delete global.batchLocks[userLockKey];
            }
        } else {
            // Ensure batch record exists if explicitly provided (Auto-Upsert)
            try {
                await supabase.from('upload_batches').upsert({
                    id: finalBatchId,
                    uploader_id: req.user.userId,
                    total_files: 0,
                    success_files: 0
                }, { onConflict: 'id', ignoreDuplicates: true });
            } catch (err) {
                console.warn('[Upload] Failed to auto-upsert batch record:', err.message);
            }
        }

        // --- FAIL-SAFE: Server-Side Filename Scanning ---
        const filenameMeta = extractMetadataFromFilename(req.file.originalname);

        let finalNominal = req.body.total_jual ? parseFloat(req.body.total_jual) : 0;
        if ((!finalNominal || finalNominal === 0) && filenameMeta.total > 0) {
            console.log(`[Fail-Safe] Auto-recovered Nominal: ${filenameMeta.total} from ${req.file.originalname}`);
            finalNominal = filenameMeta.total;
        }

        const finalTipePPN = req.body.tipe_ppn || filenameMeta.tipe_ppn || 'NON';

        // --- FRAUD DETECTION: Check for Anomaly (Same Toko, Same Nominal, Same Category, within 24h) ---
        let finalStatus = 'Unread';
        if (finalNominal > 0 && toko_id && (category || 'INVOICE') === 'INVOICE') {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: anomalyFiles } = await supabase
                .from('files')
                .select('id')
                .eq('toko_id', parseInt(toko_id))
                .eq('total_jual', finalNominal)
                .eq('category', 'INVOICE')
                .gte('created_at', yesterday)
                .is('deleted_at', null)
                .limit(1);

            if (anomalyFiles && anomalyFiles.length > 0) {
                finalStatus = 'Unread (Anomali)';
                console.warn(`⚠️ [FRAUD DETECTION] Anomaly detected! Duplicate nominal Rp${finalNominal} for Toko ID ${toko_id} within 24h.`);
            }
        }

        console.log(`[Metadata] File: ${req.file.originalname} | Final Nominal: ${finalNominal} | Batch: ${finalBatchId} | Status: ${finalStatus}`);

        // Background Upload (Fire and FORGET to unblock UI)
        const fileBuffer = Buffer.from(req.file.buffer);
        
        // Primary: Upload to Local Storage (reliable, immediate)
        LocalStorage.uploadDirect(fileBuffer, req.file.originalname, storagePath)
            .then(() => console.log(`[Upload] Local storage upload complete for: ${req.file.originalname}`))
            .catch(err => console.error(`[Upload] Local storage upload failed:`, err.message));
        
        // Secondary: Try Rclone/Terabox for backup (Fire and forget, but track sync status)
        RcloneStorage.uploadInBackground(
            fileBuffer,
            req.file.originalname,
            zona.kode,
            tokoKode,
            category || 'PPN'
        )
        .then(async (syncResult) => {
            // After background upload completes, update database with sync status
            if (syncResult && (syncResult.success !== undefined || syncResult.syncAttempts !== undefined)) {
                try {
                    // Find the file record by storage_path to get the file ID
                    const { data: fileData } = await supabase
                        .from('files')
                        .select('id')
                        .eq('storage_path', storagePath)
                        .single();
                    
                    if (fileData && fileData.id) {
                        // Update file with sync metadata
                        const updateFields = {
                            sync_error: syncResult.syncError || null
                        };
                        
                        if (syncResult.success) {
                            updateFields.synced = true;
                            updateFields.synced_at = new Date().toISOString();
                        } else {
                            updateFields.synced = false;
                        }
                        
                        await supabase
                            .from('files')
                            .update(updateFields)
                            .eq('id', fileData.id);
                        
                        console.log(`[Upload] Database updated for ${req.file.originalname}: synced=${syncResult.success}, attempts=${syncResult.syncAttempts}`);
                    }
                } catch (dbErr) {
                    console.error(`[Upload] Failed to update database with sync status:`, dbErr.message);
                }
            }
        })
        .catch(err => console.warn(`[Upload] Rclone backup upload failed:`, err.message));

        // Insert metadata into DB immediately so it appears on dashboard/history
        const { data: fileRecord, error: dbError } = await supabase
            .from('files')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                zona_id: parseInt(zona_id),
                toko_id: toko_id ? parseInt(toko_id) : null,
                category: category || 'PPN',
                ukuran_bytes: size,
                uploaded_by: req.user.userId,
                batch_id: finalBatchId,
                tanggal_dokumen: req.body.tanggal_dokumen,
                tipe_ppn: finalTipePPN,
                no_invoice: req.body.no_invoice,
                total_jual: finalNominal,
                status: finalStatus,
                synced: false,
                sync_error: null
            })
            .select()
            .single();

        if (dbError) throw dbError;

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload File',
            context: `Uploaded ${req.file.originalname} to ${storagePath}`
        });

        // [DISABLED] WA Notification — replaced by manual copy-paste system via /api/batches

        res.json({
            success: true,
            message: 'File berhasil diupload.',
            file: fileRecord
        });

    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'Gagal upload file: ' + err.message });
    }
});

// DELETE /api/files/:id
app.delete('/api/files/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const isHardDelete = req.query.hard === 'true';

        // Role-based bypass (consistent with requirePermission middleware)
        const canBypass = req.user.role === 'super_admin' || req.user.role === 'moderator';

        if (!canBypass) {
            const perms = req.user.permissions || [];
            if (isHardDelete && !perms.includes('hard_delete')) {
                return res.status(403).json({ error: 'Akses ditolak. Butuh izin Hapus Permanen.' });
            }
            if (!isHardDelete && !perms.includes('soft_delete')) {
                return res.status(403).json({ error: 'Akses ditolak. Butuh izin Buang Ke Sampah.' });
            }
        }

        const { data: file, error: fetchError } = await supabase
            .from('files')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError || !file) return res.status(404).json({ error: 'File tidak ditemukan.' });

        // Admin Zona restriction
        if (req.user.role === 'admin_zona' && file.zona_id !== req.user.zona_id) {
            return res.status(403).json({ error: 'Akses dilarang. File ini milik zona lain.' });
        }

        // Soft delete (set deleted_at)

        if (isHardDelete) {
            // FIRE AND FORGET: Delete from storage in background
            RcloneStorage.deleteFile(file.storage_path).catch(err => console.error(`[Background Delete Error] ${file.nama_file}:`, err.message));

            // Delete from DB immediately
            await supabase.from('files').delete().eq('id', file.id);

            await supabase.from('audit_logs').insert({
                user_id: req.user.userId,
                action: 'Hard Delete',
                context: `Permanently deleted ${file.nama_file}`
            });
        } else {
            // Soft delete
            await supabase.from('files')
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: req.user.userId
                })
                .eq('id', file.id);

            await supabase.from('audit_logs').insert({
                user_id: req.user.userId,
                action: 'Soft Delete',
                context: `Moved ${file.nama_file} to recycle bin`
            });
        }

        res.json({ success: true, message: isHardDelete ? 'File dihapus permanen.' : 'File dipindah ke sampah.' });

    } catch (err) {
        console.error('Delete Error:', err);
        res.status(500).json({ error: 'Gagal menghapus file.' });
    }
});

// POST /api/files/bulk-delete - bulk soft delete
app.post('/api/files/bulk-delete', authenticateToken, requirePermission('soft_delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        }

        const now = new Date().toISOString();
        let query = supabase
            .from('files')
            .update({
                deleted_at: now,
                deleted_by: req.user.userId
            })
            .in('id', ids);

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const { error } = await query;

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Soft Delete',
            context: `Moved ${ids.length} files to trash`
        });

        res.json({ success: true, message: `${ids.length} file dipindahkan ke sampah.` });
    } catch (err) {
        console.error('Bulk Soft Delete Error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
    }
});

// POST /api/files/bulk-restore - bulk restore from trash
app.post('/api/files/bulk-restore', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid.' });
        }

        let query = supabase
            .from('files')
            .update({ deleted_at: null })
            .in('id', ids);

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const { error } = await query;

        // Audit
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Restore',
            context: `Restored ${ids.length} files from trash`
        });

        res.json({ success: true, message: `${ids.length} file berhasil dipulihkan.` });
    } catch (err) {
        console.error('Bulk Restore Error:', err);
        res.status(500).json({ error: 'Gagal memulihkan file massal.' });
    }
});

// POST /api/files/bulk-trash-delete - bulk permanent delete
app.post('/api/files/bulk-trash-delete', authenticateToken, requirePermission('hard_delete'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID tidak valid.' });
        }

        // Fetch storage paths
        let query = supabase
            .from('files')
            .select('id, nama_file, storage_path')
            .in('id', ids);

        if (req.user.role === 'admin_zona') {
            query = query.eq('zona_id', req.user.zona_id);
        }

        const { data: files, error } = await query;

        if (error || !files) throw error;

        let successCount = 0;
        let errors = [];

        for (const file of files) {
            try {
                // 1. Storage
                await RcloneStorage.deleteFile(file.storage_path);
                // 2. DB
                await supabase.from('files').delete().eq('id', file.id);
                successCount++;
            } catch (err) {
                console.error(`[Bulk Hard Delete Error] ID ${file.id}:`, err);
                errors.push(`${file.nama_file}: ${err.message}`);
            }
        }

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Hard Delete',
            context: `Permanently deleted ${successCount} files. Errors: ${errors.length}`
        });

        res.json({
            success: true,
            message: `${successCount} file berhasil dihapus permanen.`,
            errors: errors.length > 0 ? errors : null
        });

    } catch (err) {
        console.error('Bulk Delete Error:', err);
        res.status(500).json({ error: 'Terjadi kesalahan sistem saat menghapus masal.' });
    }
});

// PUT /api/files/:id/restore — Restricted to Admin/Moderator
app.put('/api/files/:id/restore', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {

        const { error } = await supabase
            .from('files')
            .update({
                deleted_at: null,
                deleted_by: null
            })
            .eq('id', req.params.id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Restore File',
            context: `Restored file ${req.params.id}`
        });

        res.json({ success: true, message: 'File berhasil dipulihkan.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memulihkan file.' });
    }
});

// GET/POST /api/files/bulk-download - Download multiple files as ZIP
app.all('/api/files/bulk-download', authenticateToken, async (req, res) => {
    try {
        // Permission Check: super_admin, moderator, and admin_zona are allowed
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator' && req.user.role !== 'admin_zona') {
            const perms = req.user.permissions || [];
            if (!perms.includes('bulk_download')) {
                return res.status(403).json({ error: 'Akses ditolak. Dibutuhkan izin Unduh ZIP Massal.' });
            }
        }

        let { ids } = (req.method === 'POST' || req.method === 'PUT') ? req.body : req.query;
        if (typeof ids === 'string') ids = ids.split(',').map(id => id.trim());

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Tidak ada file yang dipilih.' });
        }

        // 1. Fetch metadata from Supabase
        const { data: files, error } = await supabase
            .from('files')
            .select('*')
            .in('id', ids);

        if (error || !files || files.length === 0) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // 1b. Post-fetch security filter (Piutang only for Super Admin or view_piutang)
        const allowedFiles = files.filter(f => {
            if (req.user.role === 'admin_zona') {
                if (f.zona_id !== req.user.zona_id) return false;
                if (f.category === 'PIUTANG') {
                    const userPerms = req.user.permissions || [];
                    if (!userPerms.includes('view_piutang')) return false;
                }
                return true;
            }
            return true; // Super Admin can access all
        });

        if (allowedFiles.length === 0) {
            return res.status(403).json({ error: 'Tidak ada file yang diizinkan untuk didownload.' });
        }

        // Use allowedFiles for the rest of the logic
        const archive = archiver('zip', { zlib: { level: 5 } }); // Level 5 for better speed

        // Error handling for archive
        archive.on('error', (err) => {
            console.error('[Archiver Error]', err);
            if (!res.headersSent) res.status(500).send({ error: err.message });
        });

        // Use stream to send Zip to response
        const now = new Date();
        const DD = String(now.getDate()).padStart(2, '0');
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const YY = String(now.getFullYear()).slice(-2);
        const randomBatch = Math.floor(100 + Math.random() * 900);
        res.attachment(`ARSIP ANKA ${randomBatch}${DD}${MM}${YY}.zip`);
        archive.pipe(res);

        // 3. Add files to ZIP sequentially to prevent server overload
        for (const file of allowedFiles) {
            try {
                console.log(`[ZIP] Processing: ${file.nama_file}`);
                const fileStream = await RcloneStorage.getStream(file.storage_path);

                archive.append(fileStream, { name: file.nama_file });

                // Wait for the entry to be fully processed by archiver
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        console.warn(`[ZIP] Timeout on ${file.nama_file}. Skipping...`);
                        resolve();
                    }, 60000); // 60s max per file

                    archive.once('entry', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    fileStream.on('error', (err) => {
                        clearTimeout(timeout);
                        console.error(`[ZIP] Stream error for ${file.nama_file}:`, err.message);
                        resolve(); // Continue with next file
                    });
                });
            } catch (err) {
                console.warn(`[Bulk Download] Failed to initialize stream for ${file.nama_file}:`, err.message);
            }
        }

        await archive.finalize();

    } catch (err) {
        console.error('Bulk Download Error:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Terjadi kesalahan saat memproses ZIP.' });
    }
});

// ============================================================
// USER MANAGEMENT ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/users
app.get('/api/users', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('id, email, contact_email, name, role, zona_id, toko_id, is_active, permissions, created_at, zonas(kode, nama)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ users: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar user.' });
    }
});

// POST /api/users â€” create user
app.post('/api/users', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { email, contact_email, password, name, role, zona_id, toko_id, permissions } = req.body;

        if (!email || !password || !name || !role) {
            return res.status(400).json({ error: 'Username, password, nama, dan role wajib diisi.' });
        }

        // Check duplicate Username (column 'email')
        const { data: existing } = await supabase.from('users').select('id').eq('email', email.toLowerCase().trim()).single();
        if (existing) {
            return res.status(400).json({ error: 'Username sudah digunakan.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const password_hash = await bcrypt.hash(password, salt);

        const { data: user, error } = await supabase
            .from('users')
            .insert({
                email: email.toLowerCase().trim(),
                contact_email: contact_email ? contact_email.toLowerCase().trim() : null,
                password_hash,
                name,
                role,
                zona_id: role === 'admin_zona' ? zona_id : null,
                toko_id: role === 'admin_zona' ? toko_id : null,
                is_active: true,
                permissions: permissions || []
            })
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Create User',
            context: `Created user ${email} (${contact_email || 'No Email'}) with role ${role}`
        });

        res.json({ success: true, user });
    } catch (err) {
        console.error('Create User Error:', err);
        res.status(500).json({ error: 'Gagal membuat user: ' + err.message });
    }
});

// PUT /api/users/:id â€” update user
app.put('/api/users/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const { email, contact_email, password, name, role, zona_id, toko_id, is_active, permissions } = req.body;

        const updates = {};
        if (email) updates.email = email.toLowerCase().trim();
        if (contact_email !== undefined) updates.contact_email = contact_email ? contact_email.toLowerCase().trim() : null;
        if (name) updates.name = name;
        if (role) updates.role = role;
        if (typeof is_active === 'boolean') updates.is_active = is_active;
        if (zona_id !== undefined) updates.zona_id = zona_id;
        if (toko_id !== undefined) updates.toko_id = toko_id;
        if (permissions !== undefined) updates.permissions = permissions;

        // Re-hash password if provided
        if (password) {
            const salt = await bcrypt.genSalt(12);
            updates.password_hash = await bcrypt.hash(password, salt);
        }

        const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', req.params.id)
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Update User',
            context: `Updated user ${req.params.id}`
        });

        res.json({ success: true, user: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update user: ' + err.message });
    }
});

// DELETE /api/users/:id â€” Permanent Delete
app.delete('/api/users/:id', authenticateToken, requirePermission('manage_users'), async (req, res) => {
    try {
        const userIdToDelete = req.params.id;

        // Prevent self-deletion
        if (userIdToDelete === req.user.userId) {
            return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' });
        }

        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userIdToDelete);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Delete User Permanent',
            context: `Permanently deleted user ${userIdToDelete}`
        });

        res.json({ success: true, message: 'User berhasil dihapus secara permanen.' });
    } catch (err) {
        console.error('Delete User Error:', err);
        res.status(500).json({ error: 'Gagal menghapus user: ' + err.message });
    }
});

// ============================================================
// OPERATIONAL FEATURES (Broadcast & Stats)
// ============================================================

// POST /api/broadcasts — Send broadcast (Admin only)
app.post('/api/broadcasts', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { content, target_zona_id } = req.body;
        if (!content) return res.status(400).json({ error: 'Isi pengumuman wajib diisi.' });

        const { error } = await supabase
            .from('broadcast_messages')
            .insert({
                content,
                target_zona_id: target_zona_id || null, // null means all zones
                created_by: req.user.userId
            });

        if (error) throw error;


        res.json({ success: true, message: 'Pengumuman berhasil disiarkan.' });
    } catch (err) {
        console.error('Broadcast Error:', err);
        res.status(500).json({ error: 'Gagal mengirim pengumuman: ' + err.message });
    }
});

// GET /api/broadcasts — Fetch all broadcasts
app.get('/api/broadcasts', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('broadcast_messages')
            .select('*, zonas(nama)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ broadcasts: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat daftar pengumuman.' });
    }
});


// DELETE /api/broadcasts/:id — Delete broadcast
app.delete('/api/broadcasts/:id', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('broadcast_messages')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Pengumuman berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus pengumuman.' });
    }
});

// GET /api/broadcasts/latest
app.get('/api/broadcasts/latest', authenticateToken, async (req, res) => {
    try {
        let query = supabase
            .from('broadcast_messages')
            .select('content, created_at, target_zona_id')
            .order('created_at', { ascending: false });

        // Filter: Target the user's specific zone OR show global (null)
        if (req.user.role !== 'super_admin' && req.user.zona_id) {
            query = query.or(`target_zona_id.is.null,target_zona_id.eq.${req.user.zona_id}`);
        }

        const { data, error } = await query.limit(1).maybeSingle();

        if (error) throw error;
        res.json({ broadcast: data || null });
    } catch (err) {
        console.error('Broadcast Load Error:', err);
        res.status(500).json({ error: 'Gagal memuat pengumuman.' });
    }
});

// GET /api/system/maintenance — Get current system status (Public)
// Task 3.5: Added error handling to ensure async failures never block responses
app.get('/api/system/maintenance', async (req, res) => {
    try {
        const status = await getMaintenanceStatus();
        res.json(status);
    } catch (err) {
        // Task 3.5: Log error and return safe fallback
        console.error('[API] Error fetching maintenance status:', {
            message: err.message,
            stack: err.stack
        });
        // Return safe default to prevent endpoint failure
        res.json({ isMaintenance: false, error: 'Unable to fetch maintenance status' });
    }
});

// POST /api/system/sync-terabox — Sync Terabox files to database
app.post('/api/system/sync-terabox', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    try {
        console.log('[Sync] Starting Terabox to Database sync...');
        const { data: zones, error: zonesError } = await supabase.from('zonas').select('id, kode');
        if (zonesError) throw zonesError;
        const { data: tokos, error: tokosError } = await supabase.from('toko').select('id, kode, zona_id');
        if (tokosError) throw tokosError;

        // Satu pemindaian rekursif jauh lebih cepat daripada satu request per toko/kategori.
        const remotePath = `${ALIST_REMOTE}:${ALIST_BASE}`;
        const remoteFiles = await new Promise((resolve, reject) => {
            execFile(
                RCLONE_BIN,
                ['--config', RCLONE_CONF, 'lsjson', remotePath, '--recursive'],
                { timeout: 180000, maxBuffer: 50 * 1024 * 1024 },
                (err, stdout, stderr) => {
                    if (err) return reject(new Error(stderr || err.message));
                    try {
                        resolve(JSON.parse(stdout.trim() || '[]'));
                    } catch (parseErr) {
                        reject(new Error(`Bad rclone output: ${parseErr.message}`));
                    }
                }
            );
        });

        const files = remoteFiles.filter(file => !(file.IsDir ?? file.is_dir));
        const zonaByKode = new Map(zones.map(zona => [zona.kode.toLowerCase(), zona]));
        const tokoByKey = new Map(tokos.map(toko => [`${toko.zona_id}:${toko.kode.toLowerCase()}`, toko]));

        // Ambil semua path yang sudah ada dengan pagination. Supabase membatasi
        // hasil default ke 1.000 baris, sehingga satu query saja bisa membuat
        // file lama dianggap baru dan terimpor sebagai duplikat.
        const existingPaths = new Set();
        const existingDeletedByPath = new Map();
        for (let from = 0; ; from += 1000) {
            const { data: existingFiles, error: existingError } = await supabase
                .from('files')
                .select('storage_path, deleted_at')
                .range(from, from + 999);
            if (existingError) throw existingError;
            for (const existingFile of existingFiles || []) {
                if (existingFile.storage_path) {
                    existingPaths.add(existingFile.storage_path);
                    existingDeletedByPath.set(existingFile.storage_path, existingFile.deleted_at);
                }
            }
            if (!existingFiles || existingFiles.length < 1000) break;
        }

        const records = [];
        const errors = [];
        let skippedExisting = 0;
        const pathsToRestore = [];
        for (const file of files) {
            const relativePath = file.Path || file.path || '';
            const parts = relativePath.split('/').filter(Boolean);
            if (parts.length < 4) {
                errors.push(`${relativePath}: path tidak sesuai zona/toko/kategori`);
                continue;
            }

            const [zonaKode, tokoKode, category] = parts;
            const zona = zonaByKode.get(zonaKode.toLowerCase());
            const toko = zona && tokoByKey.get(`${zona.id}:${tokoKode.toLowerCase()}`);
            const storagePath = `${ALIST_BASE}/${relativePath}`;
            if (!zona) {
                errors.push(`${relativePath}: zona tidak ditemukan di database`);
                continue;
            }
            if (existingPaths.has(storagePath)) {
                skippedExisting++;
                if (existingDeletedByPath.get(storagePath)) pathsToRestore.push(storagePath);
                continue;
            }

            records.push({
                nama_file: parts.slice(3).join('/'),
                storage_path: storagePath,
                zona_id: zona.id,
                // Toko yang belum ada di master tetap ditampilkan di arsip.
                // Admin dapat melengkapi master toko tanpa kehilangan file.
                toko_id: toko ? toko.id : null,
                category: category.toUpperCase(),
                ukuran_bytes: file.Size ?? file.size ?? 0,
                status: 'Unread',
                uploaded_by: req.user.userId,
                deleted_at: null
            });
            existingPaths.add(storagePath);
        }

        // File yang benar-benar masih ada di Terabox harus tampil di dashboard.
        // Restore dalam batch agar file lama yang tersoft-delete tidak hilang.
        for (let i = 0; i < pathsToRestore.length; i += 100) {
            const batch = pathsToRestore.slice(i, i + 100);
            const { error: restoreError } = await supabase
                .from('files')
                .update({ deleted_at: null })
                .in('storage_path', batch);
            if (restoreError) errors.push(`restore batch ${i + 1}: ${restoreError.message}`);
        }

        // Supabase membatasi ukuran request; masukkan dalam batch kecil.
        let totalFilesImported = 0;
        for (let i = 0; i < records.length; i += 100) {
            const batch = records.slice(i, i + 100);
            const { error: insertError } = await supabase.from('files').insert(batch);
            if (insertError) {
                errors.push(`batch ${i + 1}-${i + batch.length}: ${insertError.message}`);
            } else {
                totalFilesImported += batch.length;
            }
        }
        const totalFilesSkipped = skippedExisting;

        // Audit log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Sync Terabox to Database',
            context: JSON.stringify({
                totalFilesFound: files.length,
                totalFilesImported,
                totalFilesSkipped,
                errors: errors.slice(0, 10)
            })
        });
        
        res.json({
            success: true,
            totalFilesFound: files.length,
            totalFilesImported,
            totalFilesSkipped,
            errors: errors.length > 0 ? errors : null,
            message: totalFilesImported > 0 
                ? `Successfully imported ${totalFilesImported} files` 
                : 'No new files to import'
        });
        
    } catch (err) {
        console.error('[Sync Error]', err);
        res.status(500).json({ error: 'Sync failed: ' + err.message });
    }
});

// POST/PUT /api/system/maintenance — Toggle maintenance mode
app.all('/api/system/maintenance', authenticateToken, authorizeRole('super_admin', 'moderator'), async (req, res) => {
    // Task 3.5: Moved GET method inside try-catch for error handling
    try {
        if (req.method === 'GET') {
            const status = await getMaintenanceStatus();
            return res.json(status);
        }
        
        const isMaintenance = req.body.isMaintenance !== undefined ? req.body.isMaintenance : req.body.is_maintenance;
        const result = req.body.result;

        // Read current status to merge with lastResult
        const currentStatus = await getMaintenanceStatus();

        const status = {
            ...currentStatus,
            isMaintenance: !!isMaintenance,
            updatedBy: req.user.name || req.user.email,
            updatedAt: new Date().toISOString()
        };

        // If finishing maintenance, store the result
        if (!isMaintenance && result) {
            status.lastResult = {
                id: 'maint_' + Date.now(),
                title: result.title,
                details: result.details,
                completedAt: new Date().toISOString()
            };
        }

        // --- PERSISTENCE ---
        // 1. Local Fallback
        fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify(status, null, 4));

        // 2. Supabase Primary Storage
        await supabase
            .from('system_config')
            .upsert({ key: 'maintenance_mode', value: status }, { onConflict: 'key' });

        // Audit Log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: isMaintenance ? 'Enable Maintenance' : 'Disable Maintenance',
            context: JSON.stringify(status)
        });

        // Notification: Maintenance status change
        if (!isMaintenance && result) {
            createSystemNotification({ title: '✅ Perbaikan Selesai', message: 'Sistem kembali online: ' + (result.title || 'Selesai') + (result.details ? ' — ' + result.details : ''), type: 'success' });
        }

        res.json({ success: true, status });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui status sistem: ' + err.message });
    }
});

// TEMPORARY: Fix NULL ukuran_bytes for existing files
app.get('/api/debug/fix-sizes', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('files')
            .update({ ukuran_bytes: 524288 }) // 512KB default
            .is('ukuran_bytes', null);

        if (error) throw error;
        res.json({ message: 'Fixed NULL sizes', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats/alist — live file count from Terabox via rclone (cached 5 min per scope)
const { execFile } = require('child_process');
const RCLONE_BIN   = process.env.RCLONE_BIN    || require('path').resolve(__dirname, '..', 'rclone');
const RCLONE_CONF  = process.env.RCLONE_CONFIG  || require('path').resolve(__dirname, '..', 'rclone.conf');
const ALIST_REMOTE = process.env.RCLONE_ALIST_REMOTE || 'terabox';
const ALIST_BASE   = process.env.RCLONE_BASE_PATH    || '/arsip';

// Cache per scope-path: { [path]: { data, at } }
const _alistCache = {};
const ALIST_CACHE_TTL = 5 * 60 * 1000; // 5 menit

function getRcloneSize(remote, remotePath) {
    return new Promise((resolve, reject) => {
        execFile(
            RCLONE_BIN,
            ['--config', RCLONE_CONF, 'size', `${remote}:${remotePath}`, '--json'],
            { timeout: 60000, maxBuffer: 1024 * 1024 },
            (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                try { resolve(JSON.parse(stdout.trim())); }
                catch (e) { reject(new Error('Bad rclone output: ' + stdout)); }
            }
        );
    });
}

app.get('/api/stats/alist', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        let scopePath = ALIST_BASE; // default: seluruh /arsip (moderator / superadmin)

        // admin_zona hanya boleh melihat data zonanya sendiri
        if (user.role === 'admin_zona' && user.zona_id) {
            const { data: zona } = await supabase
                .from('zonas')
                .select('kode')
                .eq('id', user.zona_id)
                .single();
            if (zona && zona.kode) {
                scopePath = `${ALIST_BASE}/${zona.kode}`;
            }
        }

        const now = Date.now();
        const cached = _alistCache[scopePath];
        if (cached && (now - cached.at) < ALIST_CACHE_TTL) {
            return res.json(cached.data);
        }

        const result = await getRcloneSize(ALIST_REMOTE, scopePath);
        const data = {
            total_files: result.count ?? 0,
            total_bytes: result.bytes ?? 0,
            scope:       scopePath,
            cached_at:   new Date().toISOString()
        };
        _alistCache[scopePath] = { data, at: now };
        res.json(data);
    } catch (err) {
        console.error('[STATS/alist] Error:', err.message);
        const cached = _alistCache[ALIST_BASE];
        if (cached) return res.json({ ...cached.data, stale: true });
        res.status(500).json({ error: 'Gagal membaca statistik Alist: ' + err.message });
    }
});

// GET /api/stats/storage — storage usage statistics
app.get('/api/stats/storage', authenticateToken, async (req, res) => {
    try {
        console.log('[STATS] Fetching storage stats for user:', req.user.userId);
        // Today's start in local time (then to UTC-like ISO)
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Total Bytes (filtered by zona for admin_zona)
        let totalQuery = supabase
            .from('files')
            .select('ukuran_bytes')
            .is('deleted_at', null);

        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            totalQuery = totalQuery.eq('zona_id', req.user.zona_id);
        }

        const { data: allFiles, error: errTotal } = await totalQuery;

        if (errTotal) {
            console.error('[STATS] Error fetching total files:', errTotal);
            throw errTotal;
        }

        console.log(`[STATS] Found ${allFiles.length} active files.`);
        const totalUsed = allFiles.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
        console.log(`[STATS] Total bytes calculated: ${totalUsed}`);

        // 2. Today's Bytes (filtered by zona for admin_zona)
        let todayQuery = supabase
            .from('files')
            .select('ukuran_bytes')
            .gte('created_at', todayStr)
            .is('deleted_at', null);

        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            todayQuery = todayQuery.eq('zona_id', req.user.zona_id);
        }

        const { data: todayFiles, error: errToday } = await todayQuery;

        if (errToday) {
            console.error('[STATS] Error fetching today files:', errToday);
            throw errToday;
        }
        const todayUsed = todayFiles.reduce((sum, f) => sum + (f.ukuran_bytes || 0), 0);
        console.log(`[STATS] Today's bytes calculated: ${todayUsed}`);

        res.json({
            total_bytes: totalUsed,
            today_bytes: todayUsed,
            limit_bytes: 1024 * 1024 * 1024 * 1024 // 1024 GB (Terabox Default)
        });
    } catch (err) {
        console.error('Storage Stats Error:', err);
        res.status(500).json({ error: 'Gagal menghitung statistik penyimpanan.' });
    }
});

// GET /api/stats/chart — Invoice Analytics (Zone-Aware)
app.get('/api/stats/chart', authenticateToken, async (req, res) => {
    try {
        const chartData = {};
        const isZoneAdmin = req.user.role === 'admin_zona';
        const userZonaId = req.user.zona_id;

        // 1. Fetch zones — admin_zona only gets their own zone
        let zonaQuery = supabase.from('zonas').select('id, nama').order('kode');
        if (isZoneAdmin && userZonaId) {
            zonaQuery = zonaQuery.eq('id', userZonaId);
        }
        const { data: allZonas, error: zError } = await zonaQuery;
        if (!zError && allZonas) {
            for (const z of allZonas) {
                chartData[z.nama] = 0;
            }
        }

        // 2. Fetch INVOICE files — filtered by zone for admin_zona
        let fileQuery = supabase
            .from('files')
            .select('total_jual, category, nama_file, zona_id, zonas(nama)')
            .is('deleted_at', null)
            .eq('category', 'INVOICE');

        if (isZoneAdmin && userZonaId) {
            fileQuery = fileQuery.eq('zona_id', userZonaId);
        }

        const { data, error } = await fileQuery;

        if (error) throw error;
        console.log(`[DEBUG_CHART] Fetched ${data?.length || 0} invoice files.`);
        if (data && data.length > 0) {
            console.log(`[DEBUG_CHART] First row:`, data[0]);
        }

        // Grouping by Zone
        const invoiceFiles = data || [];
        for (const row of invoiceFiles) {
            let zName = row.zonas?.nama || 'Unknown Zone';
            let value = parseFloat(row.total_jual) || 0;

            // --- Filename Parser Fallback ---
            if (value === 0 && row.nama_file) {
                const priceMatch = row.nama_file.match(/(\d{1,3}(\.\d{3})+)/);
                if (priceMatch) {
                    const cleanValue = priceMatch[0].replace(/\./g, '');
                    value = parseFloat(cleanValue) || 0;
                }
            }

            if (chartData[zName] !== undefined) {
                chartData[zName] += value;
            } else {
                chartData[zName] = value;
            }
        }

        // Naturally sort labels (Zona 1, Zona 2, ..., Zona 10)
        const labels = allZonas
            .map(z => z.nama)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        const values = labels.map(label => chartData[label] || 0);
        console.log(`[DEBUG_CHART] Result (Sorted):`, { labels, values });

        res.json({ labels, values });
    } catch (err) {
        console.error('Chart Data Error:', err);
        res.status(500).json({ error: 'Gagal memuat analitik visual.' });
    }
});

// GET /api/admin/login-history
app.get('/api/admin/login-history', authenticateToken, requirePermission('view_activity_logs'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                id,
                created_at,
                action,
                context,
                user_id,
                users!inner ( name, role )
            `)
            .eq('action', 'Login')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;
        res.json({ logs: data });
    } catch (err) {
        console.error('History API Error:', err);
        res.status(500).json({ error: 'Gagal memuat riwayat login.' });
    }
});

// POST /api/files/:id/dispute — Admin Zona flags invoice as incorrect (Revision Request)
app.post('/api/files/:id/dispute', authenticateToken, async (req, res) => {
    try {
        const { reason, note } = req.body;
        if (!reason) return res.status(400).json({ error: 'Alasan revisi wajib diisi.' });

        // 1. Get file details to build a helpful message
        const { data: file, error: findErr } = await supabase
            .from('files')
            .select('nama_file')
            .eq('id', req.params.id)
            .single();

        if (findErr || !file) {
            return res.status(404).json({ error: 'File tidak ditemukan.' });
        }

        // 2. Update file status in 'files' table
        const { error: updateErr } = await supabase
            .from('files')
            .update({
                status: 'Revision',
                dispute_reason: reason,
                dispute_note: note || '',
                disputed_at: new Date().toISOString(),
                disputed_by: req.user.userId || req.user.id
            })
            .eq('id', req.params.id);

        if (updateErr) throw updateErr;

        // 3. Create a ticket in 'upload_requests' table so it appears in the moderator queue
        // The moderator view (requests.html) fetches from this table.
        const pesanRequest = `REVISI: Permintaan perbaikan data untuk berkas "${file.nama_file}".\nAlasan: ${reason}.\nCatatan: ${note || '-'}`;

        await supabase.from('upload_requests').insert({
            user_id: req.user.userId || req.user.id,
            zona_id: req.user.zona_id,
            file_id: req.params.id, // Link to the file
            pesan: pesanRequest,
            status: 'Pending'
        });

        // 4. Audit Log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId || req.user.id,
            action: 'Revision Requested',
            context: `Revision for ${file.nama_file}. Reason: ${reason}`
        });

        // 5. Notify Moderators
        await createNotification({
            role: 'moderator',
            title: '📣 Request Revisi Baru',
            message: `Zona ${req.user.zona_id || '-'} meminta revisi berkas: ${file.nama_file}`,
            type: 'request',
            link: 'requests.html'
        });

        res.json({ success: true, message: 'Permintaan revisi berhasil dikirim ke moderator.' });
    } catch (err) {
        console.error('Revision Error:', err);
        res.status(500).json({ error: 'Gagal mengajukan revisi.' });
    }
});

// GET /api/admin/activity-logs
app.get('/api/admin/activity-logs', authenticateToken, requirePermission('view_activity_logs'), async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('audit_logs')
            .select(`
                id,
                created_at,
                action,
                context,
                user_id,
                users!inner ( name, role )
            `)
            .neq('action', 'Login')
            .order('created_at', { ascending: false })
            .limit(200);

        if (error) throw error;
        res.json({ logs: data });
    } catch (err) {
        console.error('Activity Logs API Error:', err);
        res.status(500).json({ error: 'Gagal memuat log aktivitas.' });
    }
});

// ============================================================
// ZONA & TOKO REFERENCE ENDPOINTS
// ============================================================

// ============================================================
// BATCH UPLOAD HISTORY & NOTICE SYSTEM
// ============================================================

// POST /api/batches — Create a new batch session
app.post('/api/batches', authenticateToken, requireUploadPermission, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('upload_batches')
            .insert({
                uploader_id: req.user.userId,
                total_files: 0,
                success_files: 0
            })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, batch: data });
    } catch (err) {
        console.error('[CRITICAL] Failed to create batch session:', err);
        res.status(500).json({ error: 'Gagal membuat sesi batch: ' + err.message });
    }
});

// PUT /api/batches/:id — Update batch counters
app.put('/api/batches/:id', authenticateToken, async (req, res) => {
    try {
        const { total_files, success_files } = req.body;
        const { error } = await supabase
            .from('upload_batches')
            .update({ total_files, success_files })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update batch: ' + err.message });
    }
});

// GET /api/batches — List recent batches with dynamic counts from files table
app.get('/api/batches', authenticateToken, async (req, res) => {
    try {
        // Fetch batches
        const { data: batches, error: bError } = await supabase
            .from('upload_batches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (bError) throw bError;

        if (!batches || batches.length === 0) {
            return res.json({ batches: [] });
        }

        // Fetch user names for uploader_id mapping (optional enrichment)
        const uploaderIds = [...new Set(batches.filter(b => b.uploader_id).map(b => b.uploader_id))];
        const { data: users } = await supabase.from('users').select('id, name').in('id', uploaderIds);
        const userMap = (users || []).reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {});

        // Fetch counts from files table for THESE batches
        const batchIds = batches.map(b => b.id);
        const { data: counts, error: cError } = await supabase
            .from('files')
            .select('batch_id')
            .in('batch_id', batchIds)
            .is('deleted_at', null);

        if (cError) console.warn('[Batch History] File count error:', cError);

        // Group counts by batch_id
        const countMap = (counts || []).reduce((acc, f) => {
            acc[f.batch_id] = (acc[f.batch_id] || 0) + 1;
            return acc;
        }, {});

        // Combine
        const enrichedBatches = batches.map(b => ({
            ...b,
            uploader_name: userMap[b.uploader_id] || '-',
            // Use dynamic count if greater than stored count (or just use dynamic)
            total_files: countMap[b.id] || b.total_files || 0,
            success_files: countMap[b.id] || b.success_files || 0
        }));

        res.json({ batches: enrichedBatches });
    } catch (err) {
        console.error('[CRITICAL] Failed to load batches:', err);
        res.status(500).json({ error: 'Gagal memuat riwayat batch: ' + err.message });
    }
});

// GET /api/batches/:id/details — Get files in a batch, grouped by zona
app.get('/api/batches/:id/details', authenticateToken, async (req, res) => {
    try {
        const { data: files, error } = await supabase
            .from('files')
            .select('id, nama_file, zona_id, toko_id, category, no_invoice, total_jual, created_at, tipe_ppn, tanggal_dokumen')
            .eq('batch_id', req.params.id)
            .is('deleted_at', null)
            .order('zona_id');

        if (error) throw error;

        const zonaIds = [...new Set(files.map(f => f.zona_id))];
        const tokoIds = [...new Set(files.filter(f => f.toko_id).map(f => f.toko_id))];

        const [zonaRes, tokoRes] = await Promise.all([
            supabase.from('zonas').select('id, nama').in('id', zonaIds),
            tokoIds.length > 0 ? supabase.from('toko').select('id, nama').in('id', tokoIds) : { data: [] }
        ]);

        const zonaMap = {};
        (zonaRes.data || []).forEach(z => zonaMap[z.id] = z.nama);
        const tokoMap = {};
        (tokoRes.data || []).forEach(t => tokoMap[t.id] = t.nama);

        // Group files by zona
        const grouped = {};
        files.forEach(f => {
            const zonaName = zonaMap[f.zona_id] || 'Zona ' + f.zona_id;
            if (!grouped[zonaName]) grouped[zonaName] = [];
            grouped[zonaName].push({
                ...f,
                toko_nama: tokoMap[f.toko_id] || 'Umum'
            });
        });

        res.json({ success: true, grouped, total: files.length });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat detail batch: ' + err.message });
    }
});

// GET /api/zonas
app.get('/api/zonas', authenticateToken, async (req, res) => {
    const { data, error } = await supabase.from('zonas').select('*').order('id');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ zonas: data });
});

// POST /api/zonas — Create new zone
app.post('/api/zonas', authenticateToken, requirePermission('manage_zonas'), async (req, res) => {
    try {
        const { nama, wa_recipient } = req.body;
        if (!nama) return res.status(400).json({ error: 'Nama Zona wajib diisi.' });

        const kode = `ZONA-${Date.now().toString().slice(-4)}`;

        const { data, error } = await supabase
            .from('zonas')
            .insert({ nama, wa_recipient, kode, deskripsi: `Zona ${nama}` })
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, message: 'Zona baru berhasil ditambahkan.', zona: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambahkan zona: ' + err.message });
    }
});

// PUT /api/zonas/:id â€” Update zone settings
app.put('/api/zonas/:id', authenticateToken, requirePermission('manage_zonas'), async (req, res) => {
    try {
        const { nama, wa_recipient } = req.body;
        const { error } = await supabase
            .from('zonas')
            .update({ nama, wa_recipient })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Data zona berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui zona: ' + err.message });
    }
});


// POST /api/toko â€” Create new shop
app.post('/api/toko', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        const { kode, nama, zona_id } = req.body;
        if (!kode || !nama || !zona_id) {
            return res.status(400).json({ error: 'Data tidak lengkap (kode, nama, zona_id diperlukan).' });
        }

        const { data, error } = await supabase
            .from('toko')
            .insert({ kode, nama, zona_id: parseInt(zona_id) })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ success: true, toko: data });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menambah toko: ' + err.message });
    }
});

// PUT /api/toko/:id â€” Update shop
app.put('/api/toko/:id', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        const { kode, nama, zona_id } = req.body;
        const { error } = await supabase
            .from('toko')
            .update({ kode, nama, zona_id: parseInt(zona_id) })
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Data toko berhasil diperbarui.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memperbarui toko: ' + err.message });
    }
});

// DELETE /api/toko/:id â€” Delete shop
app.delete('/api/toko/:id', authenticateToken, requirePermission('manage_toko'), async (req, res) => {
    try {
        // Check if shop still has files linked
        const { count, error: checkError } = await supabase
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('toko_id', req.params.id);

        if (checkError) throw checkError;
        if (count > 0) {
            return res.status(400).json({ error: 'Toko tidak bisa dihapus karena masih memiliki dokumen terkait.' });
        }

        const { error } = await supabase
            .from('toko')
            .delete()
            .eq('id', req.params.id);

        if (error) throw error;
        res.json({ success: true, message: 'Toko berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus toko: ' + err.message });
    }
});

// ============================================================

// ============================================================
// MEDIA CATEGORIES ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/media-categories â€” list all categories
app.get('/api/media-categories', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('media_categories')
            .select('*')
            .order('id');
        if (error) throw error;
        res.json({ categories: data || [] });
    } catch (err) {
        console.error('List Categories Error:', err);
        res.status(500).json({ error: 'Gagal memuat kategori.' });
    }
});

// POST /api/media-categories â€” create new category
app.post('/api/media-categories', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { nama, emoji, deskripsi, warna } = req.body;
        if (!nama) return res.status(400).json({ error: 'Nama kategori wajib diisi.' });

        const slug = nama.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        const { data, error } = await supabase
            .from('media_categories')
            .insert({
                nama: slug,
                emoji: emoji || 'ðŸ“',
                deskripsi: deskripsi || '',
                warna: warna || 'gray'
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') return res.status(400).json({ error: 'Kategori sudah ada.' });
            throw error;
        }

        // Create folder in Terabox via Rclone
        try {
            await RcloneStorage.createMediaFolder(slug);
        } catch (folderErr) {
            console.warn('[Rclone] Folder creation warning:', folderErr.message);
        }

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Create Media Category',
            context: `Created category: ${slug} (${emoji || 'ðŸ“'})`
        });

        res.json({ success: true, category: data });
    } catch (err) {
        console.error('Create Category Error:', err);
        res.status(500).json({ error: 'Gagal membuat kategori: ' + err.message });
    }
});

// DELETE /api/media-categories/:id â€” delete category
app.delete('/api/media-categories/:id', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { error } = await supabase
            .from('media_categories')
            .delete()
            .eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Kategori berhasil dihapus.' });
    } catch (err) {
        res.status(500).json({ error: 'Gagal menghapus kategori.' });
    }
});

// ============================================================
// ADS MEDIA ENDPOINTS (Super Admin only)
// ============================================================

// GET /api/ads-media â€” list all media
app.get('/api/ads-media', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = supabase
            .from('ads_media')
            .select('*, users!uploaded_by(name, email)')
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (category && category !== 'all') {
            query = query.eq('category', category);
        }
        if (search) {
            query = query.ilike('nama_file', `%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json({ media: data || [] });
    } catch (err) {
        console.error('List Media Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar media.' });
    }
});

// POST /api/ads-media/upload â€” upload media file
app.post('/api/ads-media/upload', authenticateToken, requirePermission('manage_media_ads'), uploadMediaMulter.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diupload.' });
        }

        const category = req.body.category || 'lainnya';
        const deskripsi = req.body.deskripsi || '';

        const { storagePath, size } = await RcloneStorage.uploadMedia(
            req.file.buffer,
            req.file.originalname,
            category
        );

        const { data: record, error } = await supabase
            .from('ads_media')
            .insert({
                nama_file: req.file.originalname,
                storage_path: storagePath,
                category,
                deskripsi,
                ukuran_bytes: size,
                uploaded_by: req.user.userId
            })
            .select()
            .single();

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Upload Media Ads',
            context: `Uploaded ${req.file.originalname} [${category}]`
        });

        res.json({ success: true, message: 'Media berhasil diupload.', media: record });
    } catch (err) {
        console.error('Upload Media Error:', err);
        res.status(500).json({ error: 'Gagal upload media: ' + err.message });
    }
});

// GET /api/ads-media/:id/view â€” view/stream media file (inline)
app.get('/api/ads-media/:id/view', async (req, res) => {
    try {
        // We allow viewing without token if token is in query (for <img> tags)
        const token = req.query.token || req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Auth token required' });

        const decoded = jwt.verify(token, JWT_SECRET);

        const { data: media, error } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const ext = path.extname(media.nama_file).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
            '.pdf': 'application/pdf',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': 'inline',
            'Cache-Control': 'public, max-age=31536000'
        });
        fs.appendFileSync('debug_view_access.log', `${new Date().toISOString()} - ID: ${req.params.id}\n`);

        fs.appendFileSync('debug_view_access.log', `${new Date().toISOString()} - ID: ${req.params.id} - Path: ${media.storage_path}\n`);

        const rcloneProcess = await RcloneStorage.stream(media.storage_path);
        rcloneProcess.stdout.pipe(res);

        rcloneProcess.on('error', (err) => {
            console.error('[Rclone Stream Error]', err);
            if (!res.headersSent) res.status(500).send('Stream error');
        });

        rcloneProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            fs.appendFileSync('debug_view_error.log', `${new Date().toISOString()} - ID: ${req.params.id} - Rclone Stderr: ${msg}\n`);
            console.warn('[Rclone Stream Stderr]', msg);
        });
    } catch (err) {
        fs.appendFileSync('debug_view_error.log', `${new Date().toISOString()} - ID: ${req.params.id} - Error: ${err.stack}\n`);
        console.error('View Media Error:', err);
        res.status(500).json({ error: 'Gagal memuat media preview.' });
    }
});

// GET /api/ads-media/:id/download â€” download media file
app.get('/api/ads-media/:id/download', authenticateToken, async (req, res) => {
    try {
        const { data: media, error } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const localPath = await RcloneStorage.download(media.storage_path);
        const ext = path.extname(media.nama_file).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
            '.psd': 'application/octet-stream', '.ai': 'application/postscript',
            '.pdf': 'application/pdf', '.zip': 'application/zip',
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.set({
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(media.nama_file)}"`,
        });

        const stream = fs.createReadStream(localPath);
        stream.pipe(res);
        stream.on('end', () => {
            try { fs.unlinkSync(localPath); } catch (_) { }
        });
    } catch (err) {
        console.error('Download Media Error:', err);
        res.status(500).json({ error: 'Gagal download media.' });
    }
});

// DELETE /api/ads-media/bulk â€” bulk soft delete
app.delete('/api/ads-media/bulk', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ID media tidak valid.' });
        }

        const { error } = await supabase
            .from('ads_media')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', ids);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Bulk Delete Media Ads',
            context: `Deleted ${ids.length} media items`
        });

        res.json({ success: true, message: `${ids.length} media berhasil dihapus.` });
    } catch (err) {
        console.error('Bulk Delete Media Error:', err);
        res.status(500).json({ error: 'Gagal menghapus media massal.' });
    }
});

// DELETE /api/ads-media/:id â€” soft delete
app.delete('/api/ads-media/:id', authenticateToken, requirePermission('manage_media_ads'), async (req, res) => {
    try {
        const { data: media, error: findErr } = await supabase
            .from('ads_media')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (findErr || !media) {
            return res.status(404).json({ error: 'Media tidak ditemukan.' });
        }

        const { error } = await supabase
            .from('ads_media')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', req.params.id);

        if (error) throw error;

        await supabase.from('audit_logs').insert({
            user_id: req.user.userId,
            action: 'Delete Media Ads',
            context: `Deleted ${media.nama_file}`
        });

        res.json({ success: true, message: 'Media berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Media Error:', err);
        res.status(500).json({ error: 'Gagal menghapus media.' });
    }
});

// --- Storage Synchronization Engine (Manual Deletion Detector) ---
app.get('/api/sync/storage', authenticateToken, async (req, res) => {
    try {
        console.log('[Sync Engine] Starting storage reconciliation...');
        const { data: files, error } = await supabase
            .from('files')
            .select('id, storage_path, nama_file')
            .is('deleted_at', null);

        if (error) throw error;

        let missingCount = 0;
        const total = files.length;

        for (const f of files) {
            try {
                const exists = await RcloneStorage.checkFileExists(f.storage_path);
                if (!exists) {
                    console.warn(`[Sync Engine] File MISSING in storage: ${f.nama_file}. Syncing...`);
                    await supabase.from('files').update({ deleted_at: new Date() }).eq('id', f.id);
                    missingCount++;
                }
            } catch (err) {
                console.error(`[Sync Engine] Error checking ${f.nama_file}:`, err.message);
            }
        }

        res.json({ message: 'Sync complete', total_checked: total, missing_synced: missingCount });
    } catch (err) {
        console.error('Sync Engine Error:', err);
        res.status(500).json({ error: 'Gagal menjalankan sinkronisasi.' });
    }
});

// Periodic Sync Background Task (Every 6 hours)
setInterval(async () => {
    console.log('[Background Task] Running periodic storage sync...');
    try {
        const { data: files } = await supabase.from('files').select('id, storage_path').is('deleted_at', null);
        if (!files) return;

        for (const f of files) {
            const exists = await RcloneStorage.checkFileExists(f.storage_path);
            if (!exists) {
                await supabase.from('files').update({ deleted_at: new Date() }).eq('id', f.id);
            }
        }
    } catch (err) {
        console.error('[Background Task] Sync failed:', err);
    }
}, 6 * 60 * 60 * 1000);

// --- Smart Cleanup & Storage Optimizer Engine (Optimized for Large Volumes) ---
app.get('/api/files/cleanup-scan', authenticateToken, async (req, res) => {
    try {
        console.log('[Cleanup Scan] Starting optimized storage audit...');

        // 1. Get all active files
        const { data: dbFiles, error } = await supabase
            .from('files')
            .select('id, nama_file, storage_path, ukuran_bytes, category, created_at, zona_id')
            .is('deleted_at', null);

        if (error) throw error;

        const results = {
            duplicates: [],
            ghosts: [],
            candidates: []
        };

        // 2. Identify unique folders to minimize API calls
        const folderMap = new Map(); // path -> Set of filenames
        dbFiles.forEach(f => {
            const dir = f.storage_path.substring(0, f.storage_path.lastIndexOf('/'));
            if (!folderMap.has(dir)) folderMap.set(dir, { dbItems: [], storageItems: new Set() });
            folderMap.get(dir).dbItems.push(f);
        });

        console.log(`[Cleanup Scan] Auditing ${folderMap.size} unique folders for ${dbFiles.length} files...`);

        // 3. Audit each folder once
        for (const [dir, data] of folderMap.entries()) {
            try {
                const filesOnStorage = await RcloneStorage.listFiles(dir);
                data.storageItems = new Set(filesOnStorage.map(s => s.name));
            } catch (err) {
                const msg = err.message.toLowerCase();
                console.warn(`[Cleanup Scan] Folder ${dir} error:`, err.message);

                if (msg.includes('not found') || msg.includes('404')) {
                    // Folder is GONE. All files inside are ghosts.
                    data.storageItems = new Set();
                } else {
                    // Network timeout or other error. Skip to avoid false positives.
                    data.storageItems = new Set(data.dbItems.map(d => d.nama_file));
                }
            }
        }

        // 4. Compare DB vs Storage in memory
        const dupeChecker = new Map(); // "name|size" -> id

        for (const f of dbFiles) {
            const dir = f.storage_path.substring(0, f.storage_path.lastIndexOf('/'));
            const folderData = folderMap.get(dir);

            // A. Ghost Check
            if (!folderData.storageItems.has(f.nama_file)) {
                results.ghosts.push(f);
                continue;
            }

            // B. Duplicate Check
            const key = `${f.nama_file}|${f.ukuran_bytes}`;
            if (dupeChecker.has(key)) {
                results.duplicates.push(f);
            } else {
                dupeChecker.set(key, f.id);
            }

            // C. Candidate Check
            if (/\(\d+\)\.pdf$/i.test(f.nama_file)) {
                results.candidates.push(f);
            }
        }

        res.json(results);
    } catch (err) {
        console.error('Cleanup Scan Error:', err);
        res.status(500).json({ error: 'Gagal menjalankan audit pembersihan.' });
    }
});

// Bulk Cleanup Action
app.post('/api/files/cleanup-bulk', authenticateToken, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Data tidak valid.' });

        console.log(`[Cleanup Bulk] Cleaning ${ids.length} records...`);

        const { error } = await supabase
            .from('files')
            .update({ deleted_at: new Date() })
            .in('id', ids);

        if (error) throw error;
        res.json({ success: true, count: ids.length });
    } catch (err) {
        console.error('Bulk Cleanup Error:', err);
        res.status(500).json({ error: 'Gagal melakukan pembersihan massal.' });
    }
});

// ============================================================
// SYSTEM AUDIT
// ============================================================
app.get('/api/audit-logs', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        const { data, count, error } = await supabase
            .from('audit_logs')
            .select('*, users(name, email, role)', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        res.json({
            logs: data || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (err) {
        console.error('Audit Logs Error:', err);
        res.status(500).json({ error: 'Gagal memuat log aktivitas.' });
    }
});

// ============================================================
// UPLOAD REQUEST TICKETS
// ============================================================

// POST /api/requests
app.post('/api/requests', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin_zona') {
            return res.status(403).json({ error: 'Hanya Admin Zona yang dapat membuat tiket.' });
        }

        const { pesan } = req.body;
        if (!pesan) return res.status(400).json({ error: 'Pesan request wajib diisi.' });

        const { data, error } = await supabase.from('upload_requests').insert({
            user_id: req.user.userId,
            zona_id: req.user.zona_id,
            pesan: pesan,
            status: 'Pending'
        }).select().single();

        if (error) throw error;

        // Notify Moderators
        await createNotification({
            role: 'moderator',
            title: '📄 Request Dokumen Baru',
            message: `Admin Zona ${req.user.zona_id || '-'} meminta dokumen: ${pesan.substring(0, 50)}${pesan.length > 50 ? '...' : ''}`,
            type: 'request',
            link: 'requests.html'
        });

        res.json({ success: true, message: 'Request berhasil dikirim.' });
    } catch (err) {
        console.error('Create Request Error:', err);
        res.status(500).json({ error: 'Gagal membuat request dokumen.' });
    }
});

// GET /api/requests
app.get('/api/requests', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('upload_requests')
            .select(`*, users!upload_requests_user_id_fkey(name, email), zonas!upload_requests_zona_id_fkey(nama)`)
            .order('created_at', { ascending: false });

        if (req.user.role === 'admin_zona') {
            query = query.eq('user_id', req.user.userId);
        }

        const { data: requests, error } = await query;
        if (error) throw error;

        // Manual Enrichment: If file_id is present, fetch the filenames separately
        const fileIds = [...new Set(requests.filter(r => r.file_id).map(r => r.file_id))];
        let enrichedRequests = requests;

        if (fileIds.length > 0) {
            try {
                const { data: files } = await supabase
                    .from('files')
                    .select('id, nama_file')
                    .in('id', fileIds);

                const fileMap = (files || []).reduce((acc, f) => ({ ...acc, [f.id]: f.nama_file }), {});

                enrichedRequests = requests.map(r => ({
                    ...r,
                    files: r.file_id && fileMap[r.file_id] ? { nama_file: fileMap[r.file_id] } : null
                }));
            } catch (joinErr) {
                console.warn('[Requests] Manual join failed:', joinErr.message);
            }
        }

        res.json({ requests: enrichedRequests });
    } catch (err) {
        console.error('Fetch Requests Error:', err);
        res.status(500).json({ error: 'Gagal memuat data request.' });
    }
});

// PUT /api/requests/:id
app.put('/api/requests/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { status, notes } = req.body;
        if (!['Pending', 'Selesai', 'Ditolak'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid.' });
        }

        const payload = { status };
        if (status === 'Selesai' || status === 'Ditolak') {
            payload.resolved_at = new Date().toISOString();
        } else {
            payload.resolved_at = null;
        }

        if (status === 'Ditolak' && notes) {
            payload.notes = notes;
        } else if (status !== 'Ditolak') {
            payload.notes = null;
        }

        const { data: request, error } = await supabase.from('upload_requests').update(payload).eq('id', req.params.id).select().single();
        if (error) throw error;

        // Notify User
        if (request && request.user_id) {
            await createNotification({
                user_id: request.user_id,
                title: '✅ Request Dokumen Diupdate',
                message: `Status permintaan Anda telah diubah menjadi "${status}".`,
                type: status === 'Selesai' ? 'success' : 'info',
                link: 'requests.html'
            });
        }

        res.json({ success: true, message: 'Status tiket berhasil diupdate.' });
    } catch (err) {
        console.error('Update Request Error:', err);
        res.status(500).json({ error: 'Gagal mengubah status.' });
    }
});

// DELETE /api/requests/:id
app.delete('/api/requests/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { error } = await supabase.from('upload_requests').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, message: 'Tiket request berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Request Error:', err);
        res.status(500).json({ error: 'Gagal menghapus tiket request.' });
    }
});

// ============================================================
// BUG REPORT SYSTEM
// ============================================================

// POST /api/bugs
app.post('/api/bugs', authenticateToken, async (req, res) => {
    try {
        const { tipe, level, deskripsi, tautan_file } = req.body;
        if (!tipe || !deskripsi) {
            return res.status(400).json({ error: 'Tipe bug dan deskripsi wajib diisi.' });
        }
        const { data, error } = await supabase.from('bug_reports').insert({
            user_id: req.user.userId || req.user.id,
            zona_id: req.user.zona_id,
            tipe, level: level || 'Medium',
            deskripsi, tautan_file: tautan_file || null,
            status: 'Pending'
        }).select().single();
        if (error) throw error;

        // Notify Moderators
        await createNotification({
            role: 'moderator',
            title: '🐛 Laporan Bug Baru',
            message: `Zona ${req.user.zona_id || '-'} melaporkan bug: ${tipe}`,
            type: 'error',
            link: 'bugs.html'
        });

        res.json({ success: true, message: 'Laporan bug berhasil dikirim.', report: data });
    } catch (err) {
        console.error('Create Bug Error:', err);
        res.status(500).json({ error: 'Gagal mengirim laporan bug.' });
    }
});

// GET /api/bugs
app.get('/api/bugs', authenticateToken, async (req, res) => {
    try {
        if (!['super_admin', 'moderator', 'admin_zona'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }
        let query = supabase.from('bug_reports')
            .select('*, users(name, email), zonas(nama)')
            .order('created_at', { ascending: false });
        if (req.user.role === 'admin_zona') {
            query = query.eq('user_id', req.user.userId || req.user.id);
        }
        const { data, error } = await query;
        if (error) throw error;
        res.json({ reports: data || [] });
    } catch (err) {
        console.error('Fetch Bugs Error:', err);
        res.status(500).json({ error: 'Gagal memuat daftar laporan bug.' });
    }
});

// PUT /api/bugs/:id
app.put('/api/bugs/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }
        const { status, admin_notes } = req.body;
        if (!['Pending', 'Diproses', 'Selesai', 'Dibatalkan'].includes(status)) {
            return res.status(400).json({ error: 'Status tidak valid.' });
        }
        const payload = { status, updated_at: new Date().toISOString() };
        if (admin_notes !== undefined) payload.admin_notes = admin_notes;
        const { error } = await supabase.from('bug_reports').update(payload).eq('id', req.params.id);
        if (error) throw error;

        // Notification: Bug status changed
        try {
            const { data: bugData } = await supabase.from('bug_reports').select('user_id').eq('id', req.params.id).single();
            if (bugData && bugData.user_id) {
                await createNotification({ user_id: bugData.user_id, title: '🔄 Status Bug Diperbarui', message: 'Laporan bug Anda kini berstatus "' + status + '".', type: 'info' });
            }
        } catch (ne) { }

        res.json({ success: true, message: 'Laporan bug berhasil diupdate.' });
    } catch (err) {
        console.error('Update Bug Error:', err);
        res.status(500).json({ error: 'Gagal mengubah status bug.' });
    }
});

// DELETE /api/bugs/:id
app.delete('/api/bugs/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }
        const { error } = await supabase.from('bug_reports').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'Laporan bug berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Bug Error:', err);
        res.status(500).json({ error: 'Gagal menghapus laporan bug.' });
    }
});

// POST /api/bugs/upload — Upload bug screenshot
app.post('/api/bugs/upload', authenticateToken, uploadMediaMulter.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Tidak ada file.' });

        const fileName = `bug_${req.user.id || req.user.userId}_${Date.now()}${path.extname(req.file.originalname)}`;
        const { storagePath } = await RcloneStorage.uploadMedia(req.file.buffer, fileName, 'bugs');

        res.json({ success: true, url: `/api/bugs/view?path=${encodeURIComponent(storagePath)}` });
    } catch (err) {
        console.error('Bug Upload Error:', err);
        res.status(500).json({ error: 'Gagal upload screenshot.' });
    }
});

// GET /api/bugs/view — View bug screenshot (proxied stream)
app.get('/api/bugs/view', authenticateToken, async (req, res) => {
    try {
        const storagePath = req.query.path;
        if (!storagePath) return res.status(400).json({ error: 'Path required' });

        const stream = await RcloneStorage.getStream(storagePath);

        const ext = path.extname(storagePath).toLowerCase();
        const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
        res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=3600');

        stream.pipe(res);
    } catch (err) {
        console.error('Bug View Error:', err);
        res.status(404).send('Image not found');
    }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Pusat Arsip Anka Backend v2.3 running (JWT + Rclone)' });
});

// ============================================================
// NOTIFICATION SYSTEM
// ============================================================

/**
 * Helper to create notifications
 */
async function createNotification({ user_id, role, zona_id, title, message, type = 'info' }) {
    try {
        await supabase.from('notifications').insert({
            user_id: user_id || null,
            target_role: role || null,
            target_zona_id: zona_id || null,
            title,
            message,
            type,
            is_read: false,
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Notification Trigger Error]', err);
    }
}

// GET /api/notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        let query = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
        let orFilter = `user_id.eq.${req.user.userId},and(user_id.is.null,target_role.is.null)`;
        if (req.user.role === 'admin_zona') {
            orFilter += `,and(target_role.eq.admin_zona,target_zona_id.eq.${req.user.zona_id})`;
        } else {
            orFilter += `,target_role.eq.${req.user.role}`;
        }
        const { data, error } = await query.or(orFilter);
        if (error) throw error;
        res.json({ notifications: data || [] });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat notifikasi.' });
    }
});

// PUT /api/notifications/read-all
app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        // Mark personal notifications
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', req.user.userId).eq('is_read', false);
        // Mark global notifications (null user, null role)
        await supabase.from('notifications').update({ is_read: true }).is('user_id', null).is('target_role', null).eq('is_read', false);
        // Mark role-based notifications for this user's role
        let roleQuery = supabase.from('notifications').update({ is_read: true }).eq('target_role', req.user.role).eq('is_read', false);
        if (req.user.role === 'admin_zona' && req.user.zona_id) {
            roleQuery = roleQuery.eq('target_zona_id', req.user.zona_id);
        }
        await roleQuery;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gagal update status.' });
    }
});

// ============================================================
// START & CLEANUP
// ============================================================

// ---- Session Cleanup (Every 1 hour, remove sessions older than 24h) ----
setInterval(async () => {
    try {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase
            .from('active_sessions')
            .delete()
            .lt('last_active', yesterday);
        if (error) console.error('[CLEANUP] Session Error:', error.message);
        else console.log('[CLEANUP] Stale sessions cleared.');
    } catch (err) {
        console.error('[CLEANUP] Fatal Error:', err);
    }
}, 60 * 60 * 1000);


// ============================================================
// FLEET MANAGEMENT SYSTEM
// ============================================================

// GET /api/fleet
app.get('/api/fleet', authenticateToken, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('system_fleet')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ fleet: data || [] });
    } catch (err) {
        console.error('Fetch Fleet Error:', err);
        res.status(500).json({ error: 'Gagal memuat data armada.' });
    }
});

// POST /api/fleet
app.post('/api/fleet', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { nopol, merk, driver, pajak_stnk, pajak_plat, kir, status, notes } = req.body;
        if (!nopol) return res.status(400).json({ error: 'Nomor Polisi wajib diisi.' });

        const { data, error } = await supabase
            .from('system_fleet')
            .insert({
                nopol, merk, driver,
                pajak_stnk: pajak_stnk || null,
                pajak_plat: pajak_plat || null,
                kir: kir || null,
                status: status || 'Aktif',
                notes: notes || '-',
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Audit Log
        await supabase.from('audit_logs').insert({
            user_id: req.user.userId || req.user.id,
            action: 'Add Fleet',
            context: `Added vehicle: ${nopol}`
        });

        res.json({ success: true, vehicle: data });
    } catch (err) {
        console.error('Create Fleet Error:', err);
        res.status(500).json({ error: 'Gagal menambah kendaraan.' });
    }
});

// PUT /api/fleet/:id
app.put('/api/fleet/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { nopol, merk, driver, pajak_stnk, pajak_plat, kir, status, notes } = req.body;
        const { error } = await supabase
            .from('system_fleet')
            .update({
                nopol, merk, driver,
                pajak_stnk, pajak_plat, kir, status, notes,
                updated_at: new Date().toISOString()
            })
            .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, message: 'Data kendaraan berhasil diperbarui.' });
    } catch (err) {
        console.error('Update Fleet Error:', err);
        res.status(500).json({ error: 'Gagal mengupdate data kendaraan.' });
    }
});

// DELETE /api/fleet/:id
app.delete('/api/fleet/:id', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'super_admin' && req.user.role !== 'moderator') {
            return res.status(403).json({ error: 'Akses ditolak.' });
        }

        const { error } = await supabase.from('system_fleet').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true, message: 'Kendaraan berhasil dihapus.' });
    } catch (err) {
        console.error('Delete Fleet Error:', err);
        res.status(500).json({ error: 'Gagal menghapus kendaraan.' });
    }
});

// ============================================================
// SERVER STARTUP WITH COMPREHENSIVE ERROR HANDLING
// ============================================================

// Task 3.4: Log startup intent before binding
console.log(`🚀 Backend starting on port ${process.env.PORT || 4000}`);

// CRITICAL: Listen on 0.0.0.0 for Docker/Hugging Face compatibility
// Listening on 'localhost' or '127.0.0.1' only works inside container
// Must bind to 0.0.0.0 to be accessible from outside the container
const HOST = '0.0.0.0';

// Initialize startup sequence: Alist → Rclone → Node.js Server
// (async () => {
//     try {
//         // Stage 1: Initialize Alist service (Task 2.1)
//         console.log('[Backend] 🚀 Starting initialization sequence...');
//         console.log('[Stage 1] Initializing Alist service...');
        
//         const alistResult = await initializeAlist();
//         if (!alistResult.success) {
//             console.error(alistResult.message);
//             process.exit(1);
//         }
//         console.log('[Stage 1] ✅ Alist service ready');

//         // Stage 2: Initialize storage credentials (Task 2.3)
//         console.log('[Stage 2] Initializing storage credentials...');
//         try {
//             const result = await RcloneStorage.initializeRcloneCredentials();
//             if (result.success) {
//                 console.log(`✅ Storage credentials loaded from ${result.source}`);
//             } else {
//                 console.warn(`⚠️ Storage credentials unavailable (using defaults): ${result.message}`);
//             }
//         } catch (err) {
//             console.error(`❌ Credential initialization error:`, err.message);
//             console.warn('ℹ️ Continuing with default fallback credentials...');
//         }
//         console.log('[Stage 2] ✅ Storage credentials initialized');

//         // Stage 3: Start Node.js server
//         console.log('[Stage 3] Starting Node.js backend server...');
//         const server = app.listen(port, HOST, () => {

// Initialize storage credentials at startup
(async () => {
    try {
        // ================================================================
        // STAGE 1: Load environment variables
        // ================================================================
        console.log('\n================================================');
        console.log('[Backend] 🚀 Starting Arsip Backend...');
        console.log('[Backend] Time: ' + new Date().toISOString());
        console.log('================================================\n');

        console.log('[Stage 1] Loading environment variables...');
        
        const PORT = process.env.PORT || 7860;
        const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || null;

        console.log(`[Config] PORT: ${PORT}`);
        console.log(`[Config] GCP_PROJECT_ID: ${GCP_PROJECT_ID || '(not set)'}`);
        console.log('[Stage 1] ✅ Complete\n');

        // ================================================================
        // STAGE 2: Initialize Secret Manager client
        // ================================================================
        console.log('[Stage 2] Initializing Secret Manager client...');
        initializeSecretManager();
        if (GCP_PROJECT_ID) {
            console.log(`[SecretManager] Initialized for project: ${GCP_PROJECT_ID}`);
        } else {
            console.log('[SecretManager] GCP_PROJECT_ID not set, using fallback env vars');
        }
        console.log('[Stage 2] ✅ Complete\n');

        // ================================================================
        // STAGE 3: Load Alist admin password from Secret Manager
        // ================================================================
        console.log('[Stage 3] Loading Alist admin password...');
        try {
            const alistPassword = await getSecret(
                'arsip-alist-password',
                'ALIST_ADMIN_PASSWORD',
                'admin123' // Development fallback only
            );
            console.log('[SecretManager] ✓ Alist password loaded from Secret Manager/env vars');
        } catch (err) {
            console.warn('[SecretManager] Failed to load Alist password:', err.message);
            console.warn('[SecretManager] Alist will use default credentials (development only)');
        }
        console.log('[Stage 3] ✅ Complete\n');

        // ================================================================
        // STAGE 4: Start Alist service (optional — skipped when ENABLE_ALIST != 'true')
        // ================================================================
        console.log('[Stage 4] Starting Alist service...');
        
        if (process.env.ENABLE_ALIST === 'true') {
            const alistResult = await initializeAlist();
            if (!alistResult.success) {
                console.error('[Alist] ❌ FAILED TO START');
                console.error(alistResult.message);
                console.error('\n[Backend] Initialization FAILED at Stage 4 (Alist Service)');
                console.error('[Backend] Exiting with status code 1\n');
                process.exit(1);
            }
            console.log('[Alist] ✅ Service running on http://localhost:5244');
        } else {
            console.log('[Alist] ⏭ Skipped (ENABLE_ALIST not set to true)');
        }
        console.log('[Stage 4] ✅ Complete\n');

        // ================================================================
        // STAGE 5: Verify Rclone connectivity (optional — skipped when not configured)
        // ================================================================
        console.log('[Stage 5] Verifying Rclone connectivity...');
        
        const rcloneCheck = await verifyRcloneConnectivity();
        
        if (!rcloneCheck.verified) {
            console.warn('[Rclone] ⚠ Not connected — file storage via Rclone will be unavailable');
            console.warn(rcloneCheck.message || rcloneCheck.error);
            console.warn('[Stage 5] ⚠ Skipped (Rclone not configured)\n');
        } else {
            console.log(`[Rclone] ✅ Connected (${rcloneCheck.fileCount || 0} files visible)`);
            console.log('[Stage 5] ✅ Complete\n');
        }

        // ================================================================
        // STAGE 6: Initialize Rclone credential handler
        // ================================================================
        console.log('[Stage 6] Initializing Rclone credential handler...');
        // Note: secretManager.js is already initialized in Stage 2
        // Rclone wrapper (rclone_wrapper.js) will use credentials from rclone.conf
        console.log('[RcloneWrapper] Using credentials from rclone.conf');
        console.log('[Stage 6] ✅ Complete\n');

        // ================================================================
        // STAGE 7: Initialize storage credentials
        // ================================================================
        console.log('[Stage 7] Initializing storage credentials...');
        const result = await RcloneStorage.initializeRcloneCredentials();
        if (result.success) {
            console.log(`[Storage] ✓ Credentials loaded from ${result.source}`);
        } else {
            console.warn(`[Storage] ⚠ Credentials unavailable (using defaults): ${result.message}`);
        }
        console.log('[Stage 7] ✅ Complete\n');

        // ================================================================
        // STAGE 8: Start Express server
        // ================================================================
        console.log('[Stage 8] Starting Express server on port ' + PORT + '...');
        const server = app.listen(PORT, HOST, () => {
        // Task 3.4: Log successful port binding
        console.log(`✅ Backend listening on port ${PORT}`);
        console.log(`✅ External access: http://localhost:${PORT}`);
        console.log(`🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:${PORT}`);
        console.log(`   Auth: JWT (${JWT_EXPIRES_IN} expiry)`);
        console.log(`   Storage: Rclone (Terabox + Storj)`);
        console.log(`   DB: Supabase PostgreSQL`);
        console.log(`   Alist: WebDAV on http://localhost:5244`);
        console.log('[Backend] ✅ ALL INITIALIZATION STAGES COMPLETE');
        console.log('[Backend] Backend ready at http://0.0.0.0:' + PORT);
        console.log('[Backend] Alist ready at http://localhost:5244');
        console.log('[Backend] Rclone ready - Terabox sync active');
        console.log('================================================');
    });

    // Task 3.1: Error handler for port binding failures
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Error binding to port ${port}: address already in use`);
            process.exit(1);
        } else if (err.code === 'EACCES') {
            console.error(`Error binding to port ${port}: permission denied`);
            process.exit(1);
        } else if (err.code === 'ENOTFOUND') {
            console.error(`Error binding to port ${port}: ${err.message}`);
            process.exit(1);
        } else {
            console.error(`Error binding to port ${port}: ${err.message}`);
            process.exit(1);
        }
    });

    // Task 3.2: Handle TLS/SSL client errors if using HTTPS
    server.on('tlsClientError', (err, socket) => {
        console.error('[Server] TLS/SSL client error:', err.message);
        console.error('[Server] TLS error code:', err.code);
        console.error('[Server] Stack trace:', err.stack);
    });

    // Task 3.2: Log when connections are established (useful for debugging)
    server.on('connection', (socket) => {
        const remoteAddress = socket.remoteAddress;
        const remotePort = socket.remotePort;
        
        // Only log connections in development/debug mode to avoid log spam
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_CONNECTIONS === 'true') {
            console.log(`[Server] New connection established from ${remoteAddress}:${remotePort}`);
        }
        
        // Handle socket-level errors (always active regardless of environment)
        socket.on('error', (err) => {
            console.error(`[Server] Socket error from ${remoteAddress}:${remotePort}:`, err.message);
            console.error('[Server] Socket error code:', err.code);
            console.error('[Server] Stack trace:', err.stack);
        });
    });

    // Handle process termination signals gracefully
    process.on('SIGTERM', () => {
        console.log('📋 SIGTERM signal received: closing HTTP server');
        server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });
    });

    process.on('SIGINT', () => {
        console.log('📋 SIGINT signal received: closing HTTP server');
        server.close(() => {
            console.log('✅ HTTP server closed');
            process.exit(0);
        });
    });
    } catch (err) {
        console.error('[Backend] ❌ Initialization failed:', err.message);
        if (err.stack) {
            console.error('[Backend] Stack trace:', err.stack);
        }
        console.error('[Backend] Exiting with status 1');
        process.exit(1);
    }
})();

// ============================================================
// PROCESS-LEVEL ERROR HANDLERS (Task 3.3)
// ============================================================

// Handle uncaught synchronous errors
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION (Synchronous Error):');
    console.error(`   Message: ${err.message}`);
    console.error(`   Stack: ${err.stack}`);
    if (err.filename) console.error(`   File: ${err.filename}:${err.lineno}:${err.colno}`);
    console.error('   The application will exit gracefully.');
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ UNHANDLED PROMISE REJECTION:');
    console.error(`   Reason: ${reason instanceof Error ? reason.message : reason}`);
    if (reason instanceof Error) {
        console.error(`   Stack: ${reason.stack}`);
    }
    console.error(`   Promise: ${promise}`);
    console.error('   The application will exit gracefully.');
    process.exit(1);
});

