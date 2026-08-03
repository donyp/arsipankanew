// ============================================================
// Local File Storage Wrapper — Fallback/Temporary Storage
// Stores files locally in /app/data/ directory
// ============================================================
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.STORAGE_PATH || path.join(__dirname, '..', 'data', 'files');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[LocalStorage] Created directory: ${DATA_DIR}`);
}

const LocalStorage = {
    /**
     * Upload file to local storage
     */
    async uploadDirect(fileBuffer, originalName, storagePath) {
        try {
            // Ensure parent directories exist
            const fullPath = path.join(DATA_DIR, storagePath);
            const dir = path.dirname(fullPath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Write file
            fs.writeFileSync(fullPath, fileBuffer);
            
            console.log(`[LocalStorage] ✅ Upload successful: ${storagePath} (${fileBuffer.length} bytes)`);
            return { storagePath, size: fileBuffer.length };
        } catch (err) {
            console.error(`[LocalStorage] ❌ Upload failed:`, err.message);
            throw err;
        }
    },

    /**
     * Download file from local storage as buffer
     */
    async downloadBuffer(storagePath) {
        try {
            const fullPath = path.join(DATA_DIR, storagePath);
            
            if (!fs.existsSync(fullPath)) {
                throw new Error(`File not found: ${storagePath}`);
            }
            
            const buffer = fs.readFileSync(fullPath);
            console.log(`[LocalStorage] ✅ Download successful: ${storagePath} (${buffer.length} bytes)`);
            return buffer;
        } catch (err) {
            console.error(`[LocalStorage] ❌ Download failed:`, err.message);
            throw err;
        }
    },

    /**
     * Delete file from local storage
     */
    async deleteFile(storagePath) {
        try {
            const fullPath = path.join(DATA_DIR, storagePath);
            
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                console.log(`[LocalStorage] ✅ Delete successful: ${storagePath}`);
            }
            return true;
        } catch (err) {
            console.error(`[LocalStorage] ❌ Delete failed:`, err.message);
            throw err;
        }
    },

    /**
     * Check if file exists
     */
    fileExists(storagePath) {
        const fullPath = path.join(DATA_DIR, storagePath);
        return fs.existsSync(fullPath);
    },

    /**
     * Get file size
     */
    getFileSize(storagePath) {
        try {
            const fullPath = path.join(DATA_DIR, storagePath);
            const stats = fs.statSync(fullPath);
            return stats.size;
        } catch (err) {
            return 0;
        }
    }
};

module.exports = LocalStorage;
