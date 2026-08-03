# Cara Sync File Lama dari Terabox ke Database

## Problem

File **sudah ada di Terabox** tapi **tidak muncul di dashboard** karena tidak ada record di database Supabase.

## Solution

Gunakan **Sync API** untuk import metadata file dari Terabox ke database.

## Cara Menggunakan

### Option 1: Via Browser (Recommended)

1. **Login sebagai Super Admin**
   - Buka: `https://username-pusat-arsip-anka.hf.space`
   - Login dengan kredensial super_admin

2. **Buka Browser Console**
   - Tekan `F12` atau `Ctrl+Shift+I`
   - Klik tab "Console"

3. **Jalankan Script Sync**
   
   Copy-paste script ini ke console:
   
   ```javascript
   // Get auth token from localStorage
   const token = localStorage.getItem('token');
   
   // Call sync API
   fetch('/api/system/sync-terabox', {
       method: 'POST',
       headers: {
           'Authorization': 'Bearer ' + token,
           'Content-Type': 'application/json'
       }
   })
   .then(res => res.json())
   .then(data => {
       console.log('✅ Sync Result:', data);
       alert(`Sync Complete!\n\nFiles Found: ${data.totalFilesFound}\nFiles Imported: ${data.totalFilesImported}\nFiles Skipped: ${data.totalFilesSkipped}`);
       // Reload page to see new files
       location.reload();
   })
   .catch(err => {
       console.error('❌ Sync Error:', err);
       alert('Sync failed: ' + err.message);
   });
   ```

4. **Tunggu Proses Selesai**
   - Script akan scan semua zona/toko/category
   - Progress muncul di console
   - Alert akan muncul setelah selesai

5. **Refresh Dashboard**
   - Page akan auto-reload
   - File sekarang muncul di dashboard

### Option 2: Via curl (Command Line)

```bash
# Get your JWT token first by logging in and checking localStorage

curl -X POST https://username-pusat-arsip-anka.hf.space/api/system/sync-terabox \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### Option 3: Via Node.js Script (Local)

Jika ada akses ke server/container:

```bash
cd /app/backend
node sync-terabox-to-db.js
```

## Apa Yang Dilakukan Sync?

1. **Scan Zona** - Ambil semua zona dari database
2. **Scan Toko** - Ambil semua toko per zona
3. **Scan Category** - Cek setiap category (PPN, PPH, INVOICE, dll)
4. **List Files** - Ambil list file dari Terabox via Alist API
5. **Check Database** - Cek apakah file sudah ada di database
6. **Import New** - Import file yang belum ada di database
7. **Skip Existing** - Skip file yang sudah ada

## Expected Result

```json
{
  "success": true,
  "totalFilesFound": 150,
  "totalFilesImported": 150,
  "totalFilesSkipped": 0,
  "errors": null,
  "message": "Successfully imported 150 files"
}
```

## Struktur Storage yang Di-Scan

```
/arsip/
├── ZONA-01/
│   ├── TOKO-A/
│   │   ├── PPN/
│   │   │   ├── file1.pdf
│   │   │   └── file2.pdf
│   │   ├── PPH/
│   │   ├── INVOICE/
│   │   ├── FAKTUR/
│   │   ├── BUKTI_BAYAR/
│   │   └── LAINNYA/
│   └── TOKO-B/
│       └── ...
└── ZONA-02/
    └── ...
```

## Requirements

### 1. Database Sudah Ada Zona & Toko

Sebelum sync, pastikan sudah ada data:

```sql
-- Check zones
SELECT id, kode, nama FROM zonas;

-- Check tokos
SELECT id, kode, nama, zona_id FROM toko;
```

### 2. Rclone/Alist Configured

Pastikan secrets Rclone sudah ditambahkan di HF:
- `TERABOX_WEBDAV_URL`
- `TERABOX_USER`
- `TERABOX_PASS`
- `TERABOX_CRYPT_PASSWORD`
- `ALIST_ADMIN_PASSWORD`

### 3. Alist Running

Check logs:
```
[INIT] ✅ Alist started with PID: XX on port 5244
```

## Troubleshooting

### "Sync failed: Alist login failed"

**Cause:** `ALIST_ADMIN_PASSWORD` salah atau Alist tidak running

**Solution:**
1. Cek logs: `[INIT] Alist started with PID`
2. Cek secret `ALIST_ADMIN_PASSWORD` di HF
3. Restart Space

### "No files found to import"

**Cause:** 
- Storage path tidak cocok dengan struktur zona/toko
- Zona/toko belum ada di database
- File belum di-upload ke Terabox

**Solution:**
1. Cek struktur folder di Terabox
2. Pastikan zona/toko sudah ada di database
3. Pastikan path `/arsip/ZONA-XX/TOKO-XX/CATEGORY/file.pdf`

### "Files imported but still not showing"

**Cause:** Cache browser atau query filter

**Solution:**
1. Hard refresh: `Ctrl+F5`
2. Clear localStorage dan login ulang
3. Check database query filter (zona, toko, status)

## Verification

Setelah sync, verify dengan SQL:

```sql
-- Check total files in database
SELECT COUNT(*) FROM files WHERE deleted_at IS NULL;

-- Check files per zona
SELECT z.nama, COUNT(f.id) as total_files
FROM zonas z
LEFT JOIN files f ON f.zona_id = z.id AND f.deleted_at IS NULL
GROUP BY z.id, z.nama;

-- Check files per category
SELECT category, COUNT(*) as total
FROM files
WHERE deleted_at IS NULL
GROUP BY category;
```

## Re-Sync

Jika perlu sync ulang:
- Jalankan script lagi
- File yang sudah ada akan di-skip (totalFilesSkipped)
- Hanya file baru yang di-import

## Performance

- **Small**: 10-50 files → 1-2 menit
- **Medium**: 50-200 files → 2-5 menit
- **Large**: 200-1000 files → 5-15 menit
- **Very Large**: 1000+ files → 15+ menit

Sync berjalan sequential untuk menghindari rate limit Alist API.

---

**Deploy dan jalankan sync untuk import file lama!** 🚀
