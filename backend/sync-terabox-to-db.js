#!/usr/bin/env node

/**
 * Sync Terabox Files to Supabase Database
 * 
 * This script scans all files in Terabox storage and creates database records
 * for files that exist in Terabox but not in database.
 * 
 * Usage: node sync-terabox-to-db.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const RcloneStorage = require('./rclone_wrapper');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncTeraboxToDatabase() {
    console.log('='.repeat(60));
    console.log('SYNC TERABOX FILES TO DATABASE');
    console.log('='.repeat(60));
    console.log();

    try {
        // 1. Get all zones from database
        console.log('[1/4] Fetching zones from database...');
        const { data: zones, error: zonesError } = await supabase
            .from('zonas')
            .select('id, kode, nama');
        
        if (zonesError) throw zonesError;
        console.log(`✅ Found ${zones.length} zones in database`);
        console.log();

        // 2. Get all tokos from database
        console.log('[2/4] Fetching tokos from database...');
        const { data: tokos, error: tokosError } = await supabase
            .from('toko')
            .select('id, kode, nama, zona_id');
        
        if (tokosError) throw tokosError;
        console.log(`✅ Found ${tokos.length} tokos in database`);
        console.log();

        // 3. Scan Terabox storage structure
        console.log('[3/4] Scanning Terabox storage...');
        const baseStoragePath = '/arsip';
        
        let totalFilesFound = 0;
        let totalFilesImported = 0;
        let totalFilesSkipped = 0;

        for (const zona of zones) {
            console.log(`\n📁 Scanning zona: ${zona.kode} (${zona.nama})`);
            
            const zonaTokos = tokos.filter(t => t.zona_id === zona.id);
            
            for (const toko of zonaTokos) {
                console.log(`  📁 Scanning toko: ${toko.kode} (${toko.nama})`);
                
                // Common categories
                const categories = ['PPN', 'PPH', 'INVOICE', 'FAKTUR', 'BUKTI_BAYAR', 'LAINNYA'];
                
                for (const category of categories) {
                    try {
                        const storagePath = `${baseStoragePath}/${zona.kode}/${toko.kode}/${category}`;
                        console.log(`    📂 Checking: ${storagePath}`);
                        
                        // List files in this category
                        const files = await RcloneStorage.listFiles(storagePath);
                        
                        if (files.length === 0) {
                            console.log(`      ℹ️  No files found`);
                            continue;
                        }
                        
                        console.log(`      ✅ Found ${files.length} files`);
                        totalFilesFound += files.length;
                        
                        // Check each file
                        for (const file of files) {
                            if (file.is_dir) continue; // Skip directories
                            
                            const fileName = file.name;
                            const fileStoragePath = `${storagePath}/${fileName}`;
                            
                            // Check if file already exists in database
                            const { data: existingFile } = await supabase
                                .from('files')
                                .select('id')
                                .eq('storage_path', fileStoragePath)
                                .maybeSingle();
                            
                            if (existingFile) {
                                console.log(`      ⏭️  Skip (exists): ${fileName}`);
                                totalFilesSkipped++;
                                continue;
                            }
                            
                            // Create database record
                            const fileRecord = {
                                name: fileName,
                                original_name: fileName,
                                zona_id: zona.id,
                                toko_id: toko.id,
                                category: category,
                                storage_path: fileStoragePath,
                                size: file.size || 0,
                                mime_type: 'application/pdf', // Assume PDF
                                status: 'Unread',
                                uploaded_by: 1, // Default to admin (ID: 1)
                                uploaded_at: file.modified || new Date().toISOString(),
                                is_archived: false,
                                deleted_at: null
                            };
                            
                            const { error: insertError } = await supabase
                                .from('files')
                                .insert(fileRecord);
                            
                            if (insertError) {
                                console.log(`      ❌ Error importing ${fileName}: ${insertError.message}`);
                            } else {
                                console.log(`      ✅ Imported: ${fileName}`);
                                totalFilesImported++;
                            }
                        }
                    } catch (err) {
                        if (err.message.includes('not found') || err.message.includes('404')) {
                            // Category folder doesn't exist, skip
                            console.log(`      ℹ️  Category not found: ${category}`);
                        } else {
                            console.error(`      ❌ Error scanning ${category}:`, err.message);
                        }
                    }
                }
            }
        }

        console.log();
        console.log('='.repeat(60));
        console.log('[4/4] SYNC COMPLETE');
        console.log('='.repeat(60));
        console.log(`📊 Total files found in Terabox: ${totalFilesFound}`);
        console.log(`✅ Total files imported to database: ${totalFilesImported}`);
        console.log(`⏭️  Total files skipped (already exist): ${totalFilesSkipped}`);
        console.log();
        
        if (totalFilesImported > 0) {
            console.log('✅ Success! Files are now visible in the dashboard.');
        } else if (totalFilesSkipped > 0) {
            console.log('ℹ️  All files already exist in database. No import needed.');
        } else {
            console.log('⚠️  No files found to import. Check Terabox storage structure.');
        }
        
    } catch (err) {
        console.error();
        console.error('❌ SYNC FAILED');
        console.error('='.repeat(60));
        console.error('Error:', err.message);
        console.error();
        console.error('Possible causes:');
        console.error('1. Supabase connection failed');
        console.error('2. Rclone/Alist not configured correctly');
        console.error('3. Storage path structure mismatch');
        console.error('4. Missing zones or tokos in database');
        console.error();
        process.exit(1);
    }
}

// Run the sync
syncTeraboxToDatabase()
    .then(() => {
        console.log('✅ Sync completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Sync failed:', err);
        process.exit(1);
    });
