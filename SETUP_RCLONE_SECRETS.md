# Setup Rclone/Terabox Secrets di Hugging Face

## Problem

File `rclone.conf` berisi kredensial Terabox dan Storj, tapi file ini:
- ❌ Ada di `.gitignore` (tidak ter-commit ke git)
- ❌ Tidak ada di Hugging Face Spaces
- ❌ Tidak bisa di-hardcode (security risk)

## Solution

Menggunakan **Environment Variables** di Hugging Face Spaces Secrets untuk menyimpan kredensial.

## Secrets yang Perlu Ditambahkan

### 1. Terabox WebDAV Credentials

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `TERABOX_WEBDAV_URL` | `http://localhost:5244/dav/terabox` | Alist WebDAV URL |
| `TERABOX_USER` | `admin` | Alist admin username |
| `TERABOX_PASS` | `jQWUqfvMZ6pXuG8G4epx4upNt6M-Soje9zIJZBecww` | Alist admin password (encrypted) |

### 2. Terabox Encryption Password

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `TERABOX_CRYPT_PASSWORD` | `uR-oRsbNnnKcfycXNO_4o4i5luHbnE-ncDCN3JaRvC4` | Rclone crypt password (encrypted) |

### 3. Storj S3 Credentials

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `STORJ_ACCESS_KEY` | `dummy` (atau key sebenarnya) | Storj access key |
| `STORJ_SECRET_KEY` | `dummy` (atau secret sebenarnya) | Storj secret key |
| `STORJ_ENDPOINT` | `https://gateway.storjshare.io` | Storj S3 gateway |

### 4. Alist Admin Password (for API)

| Secret Name | Value | Purpose |
|-------------|-------|---------|
| `ALIST_ADMIN_PASSWORD` | `AdminArsip2026!` | Alist admin password untuk login API |

## Cara Menambahkan Secrets

1. **Buka Space Settings** di Hugging Face
2. **Klik "Variables and Secrets"**
3. **Klik tab "Secrets" (Private)**
4. **Klik "New secret"** untuk setiap secret
5. **Masukkan Name dan Value** dari tabel di atas
6. **Klik "Save"**
7. **Restart Space** setelah semua secrets ditambahkan

## Screenshot Expected

```
Secrets (Private)
├── JWT_SECRET
├── SUPABASE_URL
├── SUPABASE_SERVICE_ROLE_KEY
├── PORT
├── NODE_ENV
├── TERABOX_WEBDAV_URL          ← NEW
├── TERABOX_USER                ← NEW
├── TERABOX_PASS                ← NEW
├── TERABOX_CRYPT_PASSWORD      ← NEW
├── STORJ_ACCESS_KEY            ← NEW
├── STORJ_SECRET_KEY            ← NEW
├── STORJ_ENDPOINT              ← NEW
└── ALIST_ADMIN_PASSWORD        ← NEW
```

## Bagaimana Ini Bekerja

1. **Startup script** (`start.sh`) menjalankan `generate-rclone-config.js`
2. **Script generator** membaca environment variables
3. **Generate `rclone.conf`** dengan kredensial dari secrets
4. **Rclone** menggunakan config yang di-generate
5. **File storage berfungsi** ✅

## Startup Logs Yang Diharapkan

```
[INIT] PORT is set to: 7860
[INIT] NODE_ENV is set to: production
[INIT] Generating rclone.conf from environment variables...
[RcloneConfig] Generated rclone.conf from environment variables
[RcloneConfig] Terabox URL: http://localhost:5244/dav/terabox
[RcloneConfig] Terabox User: admin
[RcloneConfig] Storj Endpoint: https://gateway.storjshare.io
[RcloneConfig] Config written to: /app/rclone.conf
[INIT] ✅ Alist started with PID: 11 on port 5244
[INIT] Starting Node.js backend server...
```

## Testing Rclone Configuration

Setelah secrets ditambahkan dan app restart:

1. **Check logs** untuk memastikan config di-generate
2. **Test upload file** - harus berhasil upload ke Terabox
3. **Test download file** - harus bisa download dari Terabox
4. **Check Alist** di port 5244 (jika accessible)

## Troubleshooting

### Jika Upload Gagal

1. Cek logs untuk error message
2. Pastikan semua secrets sudah ditambahkan
3. Pastikan `TERABOX_PASS` dan `TERABOX_CRYPT_PASSWORD` benar
4. Restart Space setelah menambahkan secrets

### Jika Alist Tidak Connect

1. Cek `ALIST_ADMIN_PASSWORD` - harus sama dengan yang di Alist
2. Cek logs Alist di `/app/data/log/alist.log`
3. Pastikan Alist sudah running (PID muncul di logs)

### Jika Storj Gagal (Backup)

Storj adalah **optional backup**. Jika gagal:
- Primary storage (Terabox) tetap bekerja
- Upload akan berhasil ke Terabox
- Error storj di-ignore (non-critical)

## File Changes

```
A  generate-rclone-config.js    - Script untuk generate rclone.conf
M  start.sh                      - Tambah pemanggilan script generator
M  Dockerfile                    - Copy script generator
A  SETUP_RCLONE_SECRETS.md      - Dokumentasi ini
```

## Deploy

```bash
git add .
git commit -m "Add: Rclone config generation from environment variables"
git push -u hf main
```

Setelah deploy, tambahkan semua secrets di Hugging Face, lalu restart Space.

---

**Status**: Ready to add secrets and enable file storage! 🚀
