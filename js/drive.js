// ============================================================
// Google Drive API Helper Module
// ============================================================

const DriveAPI = {
    // ---- Get Session Token ----
    getToken() {
        const token = sessionStorage.getItem('drive_token');
        if (!token) throw new Error('Google Drive belum diotorisasi. Silakan hubungkan akun.');
        return token;
    },

    // ---- Find or Create Folder ----
    async findOrCreateFolder(name, parentId = null) {
        const token = this.getToken();

        // Search for existing folder
        let query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        if (parentId) {
            query += ` and '${parentId}' in parents`;
        }

        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
            console.log(`[Drive] Folder found: "${name}" (ID: ${searchData.files[0].id})`);
            return searchData.files[0].id;
        }

        // Create folder
        const metadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentId && { parents: [parentId] })
        };

        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(metadata)
        });

        const folder = await createRes.json();
        console.log(`[Drive] Folder created: "${name}" (ID: ${folder.id})`);
        return folder.id;
    },

    // ---- Build Folder Path: ARSIP_KANTOR/ZONA_X/TOKO_X/CATEGORY ----
    async getOrCreateFolderPath(zona, toko, category) {
        const rootId = await this.findOrCreateFolder(CONFIG.GOOGLE_DRIVE_ROOT_FOLDER);
        const zonaId = await this.findOrCreateFolder(zona, rootId);
        const tokoId = await this.findOrCreateFolder(toko, zonaId);
        const catFolder = CONFIG.CATEGORY_FOLDERS[category] || category;
        const catId = await this.findOrCreateFolder(catFolder, tokoId);
        return catId;
    },

    // ---- Upload File to Drive ----
    async uploadFile(file, zona, toko, category, onProgress) {
        const token = this.getToken();

        const folderId = await this.getOrCreateFolderPath(zona, toko, category);
        console.log(`[Drive] Target folder determined: ${folderId}`);

        // Use resumable upload for progress tracking
        const metadata = {
            name: file.name,
            parents: [folderId]
        };

        // Initiate resumable upload
        const initRes = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Upload-Content-Type': file.type,
                    'X-Upload-Content-Length': file.size
                },
                body: JSON.stringify(metadata)
            }
        );

        const uploadUrl = initRes.headers.get('Location');

        // Upload with XMLHttpRequest for progress
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', file.type);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable && onProgress) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    onProgress(pct);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200 || xhr.status === 201) {
                    const result = JSON.parse(xhr.responseText);
                    // Set file to be accessible with link
                    this.setFilePermission(result.id).catch(console.error);
                    console.log(`[Drive] Upload Success! File ID: ${result.id}`);
                    resolve({
                        id: result.id,
                        name: result.name,
                        link: `https://drive.google.com/file/d/${result.id}/view`
                    });
                } else {
                    reject(new Error('Upload gagal: ' + xhr.statusText));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Upload gagal.')));
            xhr.send(file);
        });
    },

    // ---- Set File Permission (anyone with link can view) ----
    async setFilePermission(fileId) {
        const token = this.getToken();
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                role: 'reader',
                type: 'anyone'
            })
        });
    },

    // ---- Delete File from Drive ----
    async deleteFile(fileId) {
        const token = this.getToken();

        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok && res.status !== 204) {
            throw new Error('Gagal menghapus file dari Drive.');
        }
    },

    // ---- Get Preview URL ----
    getPreviewUrl(fileId) {
        return `https://drive.google.com/file/d/${fileId}/preview`;
    },

    // ---- Get Download URL ----
    getDownloadUrl(fileId) {
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
    },

    // ---- Auto Sync Drive to Supabase ----
    async syncWithDatabase(supabaseClient, currentUserStrId) {
        const token = this.getToken();
        console.log('[Drive Sync] Start Sync...');

        try {
            // 1. Get ARSIP_SISTEM folder
            const rootId = await this.findOrCreateFolder(CONFIG.GOOGLE_DRIVE_ROOT_FOLDER);
            if (!rootId) return;

            // 2. Fetch ALL folders in Drive to build a path map (much faster than recursive API calls)
            let allFolders = [];
            let pageToken = '';
            do {
                const url = `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.folder' and trashed=false&fields=nextPageToken,files(id,name,parents)&pageSize=1000${pageToken}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (data.files) allFolders = allFolders.concat(data.files);
                pageToken = data.nextPageToken ? `&pageToken=${data.nextPageToken}` : '';
            } while (pageToken);

            // Create a Map of folders id -> {name, parentId}
            const folderMap = new Map();
            allFolders.forEach(f => folderMap.set(f.id, { name: f.name, parent: f.parents ? f.parents[0] : null }));

            // Helper to trace full path from a folder ID up to root
            const getPathMetadata = (folderId) => {
                const path = [];
                let currentId = folderId;
                while (currentId && folderMap.has(currentId)) {
                    const fDelta = folderMap.get(currentId);
                    path.unshift(fDelta.name);
                    if (currentId === rootId) break; // Reached Root
                    currentId = fDelta.parent;
                }
                // Path format expected: [ARSIP_SISTEM, ZONA_X, TOKO_Y, KATEGORI]
                if (path[0] === CONFIG.GOOGLE_DRIVE_ROOT_FOLDER && path.length >= 3) {
                    return {
                        zona: path[1],
                        toko: path[2],
                        category: path[3] || 'GENERAL'
                    };
                }
                return null; // Not inside ARSIP_SISTEM
            };

            // 3. Fetch ALL files
            let allFiles = [];
            pageToken = '';
            do {
                const url = `https://www.googleapis.com/drive/v3/files?q=mimeType!='application/vnd.google-apps.folder' and trashed=false&fields=nextPageToken,files(id,name,parents,createdTime,webViewLink)&pageSize=1000${pageToken}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                const data = await res.json();
                if (data.files) allFiles = allFiles.concat(data.files);
                pageToken = data.nextPageToken ? `&pageToken=${data.nextPageToken}` : '';
            } while (pageToken);

            // 4. Process files and filter only those in our ARSIP_SISTEM
            const driveFiles = [];
            allFiles.forEach(file => {
                if (!file.parents || file.parents.length === 0) return;
                const metadata = getPathMetadata(file.parents[0]);
                if (metadata) {
                    // Match reverse categories if needed (e.g. folder "PPN" -> category "PPN")
                    let catVal = metadata.category;
                    Object.entries(CONFIG.CATEGORY_FOLDERS).forEach(([k, v]) => {
                        if (v === metadata.category) catVal = k;
                    });

                    driveFiles.push({
                        drive_file_id: file.id,
                        file_name: file.name,
                        zona: metadata.zona,
                        toko: metadata.toko,
                        category: catVal,
                        drive_link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
                        document_date: file.createdTime.split('T')[0]
                    });
                }
            });

            console.log(`[Drive Sync] Found ${driveFiles.length} files in Drive's ARSIP_SISTEM.`);

            // 5. Fetch Supabase records
            const { data: dbRecords, error: dbErr } = await supabaseClient
                .from('archives')
                .select('id, drive_file_id');

            if (dbErr) throw dbErr;

            const dbFileIds = new Set(dbRecords.map(r => r.drive_file_id));
            const driveFileIds = new Set(driveFiles.map(f => f.drive_file_id));

            let added = 0;
            let removed = 0;

            // 6. Compare & Insert New
            for (const dFile of driveFiles) {
                if (!dbFileIds.has(dFile.drive_file_id)) {
                    // It's a new file directly added to Drive
                    const { error } = await supabaseClient.from('archives').insert({
                        ...dFile,
                        uploaded_by: currentUserStrId, // Assumes Super Admin is inserting it
                    });
                    if (!error) added++;
                }
            }

            // 7. Compare & Delete Missing
            for (const record of dbRecords) {
                if (!driveFileIds.has(record.drive_file_id)) {
                    // File exists in Supabase but deleted in Drive
                    // We execute soft-delete (if supported) or hard delete. 
                    // Since soft-delete triggers via function/manual column update, we can use the archive_files table or delete directly.
                    // For safety, assuming hard delete triggers cascade soft delete or direct removal
                    const { error } = await supabaseClient.from('archives').delete().eq('id', record.id);
                    if (!error) removed++;
                }
            }

            console.log(`[Drive Sync] Finish. Added: ${added}, Removed/Synced: ${removed}`);
            return { added, removed, total: driveFiles.length };

        } catch (err) {
            console.error('[Drive Sync] Sync failed:', err);
            throw err;
        }
    }
};
