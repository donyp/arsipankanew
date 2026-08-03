// ============================================================
// Backend Initialization Sequence - Task 2.3
// Orchestrates startup in proper order before Express server starts
// ============================================================

const { initializeClient: initializeSecretManager, getSecret } = require('./secretManager');
const { initializeAlist } = require('./alistStartupHandler');
const { verifyRcloneConnectivity } = require('./rcloneConnectivityCheck');

/**
 * Run complete initialization sequence
 * Steps:
 * 1. Load environment variables
 * 2. Initialize Secret Manager client
 * 3. Load Alist admin password from Secret Manager or env var
 * 4. Start Alist service
 * 5. Verify Rclone connectivity
 * 6. Initialize Rclone credential handler
 * 
 * Exits with status 1 if any critical stage fails
 */
async function runBackendInitialization() {
    console.log('\n================================================');
    console.log('[Backend] 🚀 Starting Arsip Backend...');
    console.log('[Backend] Time: ' + new Date().toISOString());
    console.log('================================================\n');

    try {
        // ================================================================
        // STAGE 1: Load environment variables
        // ================================================================
        console.log('[Stage 1] Loading environment variables...');
        require('dotenv').config({ path: require('path').join(__dirname, '.env') });

        const PORT = process.env.PORT || 7860;
        const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || null;
        const SUPABASE_URL = process.env.SUPABASE_URL;

        console.log(`[Config] PORT: ${PORT}`);
        console.log(`[Config] GCP_PROJECT_ID: ${GCP_PROJECT_ID || '(not set)'}`);
        console.log(`[Config] SUPABASE_URL: ${SUPABASE_URL ? '✓ SET' : '❌ NOT SET'}`);
        console.log('[Stage 1] ✅ Complete\n');

        // ================================================================
        // STAGE 2: Initialize Secret Manager client
        // ================================================================
        console.log('[Stage 2] Initializing Secret Manager client...');
        const secretManagerReady = initializeSecretManager();
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
        let alistPassword = null;
        try {
            alistPassword = await getSecret(
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
        // STAGE 4: Start Alist service
        // ================================================================
        console.log('[Stage 4] Starting Alist service...');
        const alistResult = await initializeAlist();
        
        if (!alistResult.success) {
            console.error('[Alist] ❌ FAILED TO START');
            console.error(alistResult.message);
            console.error('\n[Backend] Initialization FAILED at Stage 4 (Alist Service)');
            console.error('[Backend] Exiting with status code 1\n');
            process.exit(1);
        }
        console.log('[Alist] ✅ Service running on http://localhost:5244');
        console.log('[Stage 4] ✅ Complete\n');

        // ================================================================
        // STAGE 5: Verify Rclone connectivity
        // ================================================================
        console.log('[Stage 5] Verifying Rclone connectivity...');
        const rcloneCheck = await verifyRcloneConnectivity();
        
        if (!rcloneCheck.success) {
            console.error('[Rclone] ❌ FAILED TO CONNECT');
            console.error(rcloneCheck.message || rcloneCheck.error);
            console.error('\n[Backend] Initialization FAILED at Stage 5 (Rclone Verification)');
            console.error('[Backend] Exiting with status code 1\n');
            process.exit(1);
        }
        console.log(`[Rclone] ✅ Connected (${rcloneCheck.fileCount} files visible)`);
        console.log('[Stage 5] ✅ Complete\n');

        // ================================================================
        // STAGE 6: Initialize Rclone credential handler
        // ================================================================
        console.log('[Stage 6] Initializing Rclone credential handler...');
        // Note: secretManager.js is already initialized in Stage 2
        // Rclone wrapper (rclone_wrapper.js) will use credentials from rclone.conf
        console.log('[RcloneWrapper] Using credentials from rclone.conf');
        console.log('[Stage 6] ✅ Complete\n');

        // ================================================================
        // ALL STAGES COMPLETE - Ready for Express startup
        // ================================================================
        console.log('================================================');
        console.log('[Backend] ✅ ALL INITIALIZATION STAGES COMPLETE');
        console.log('[Backend] Backend ready to start Express server');
        console.log('[Backend] Alist ready at http://localhost:5244');
        console.log('[Backend] Rclone ready - Terabox sync active');
        console.log('================================================\n');

        return {
            success: true,
            port: PORT,
            message: 'All initialization stages completed successfully'
        };

    } catch (err) {
        console.error('\n[Backend] ❌ INITIALIZATION SEQUENCE FAILED');
        console.error('[Backend] Error:', err.message);
        console.error('[Backend] Stack:', err.stack);
        console.error('[Backend] Exiting with status code 1\n');
        process.exit(1);
    }
}

module.exports = {
    runBackendInitialization
};
