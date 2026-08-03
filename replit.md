# Pusat Arsip Anka — Multi-Zona

Sistem manajemen arsip digital dengan integrasi Terabox & notifikasi WhatsApp.

## Stack

- **Backend**: Node.js / Express (`backend/server.js`) — port 5000
- **Frontend**: Static HTML pages di root (index.html, dashboard.html, dst.)
- **Database**: Supabase (PostgreSQL)
- **Storage**: Rclone → Terabox/Storj (opsional)
- **Notifikasi**: Fonnte WhatsApp API (opsional)

## Cara Menjalankan

Workflow **Start application** sudah dikonfigurasi:

```
cd backend && node server.js
```

Server berjalan di port **5000** dan melayani file HTML statis dari root.

## Environment Variables / Secrets

| Key | Keterangan | Wajib |
|-----|-----------|-------|
| `SUPABASE_URL` | URL project Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase | ✅ |
| `JWT_SECRET` | Secret untuk JWT autentikasi | ✅ |
| `FONNTE_TOKEN` | Token API Fonnte (WhatsApp) | opsional |
| `PORT` | Port server (default: 5000) | ✅ (sudah di-set) |
| `NODE_ENV` | Environment (production/development) | ✅ (sudah di-set) |
| `ENABLE_ALIST` | Set `true` untuk mengaktifkan Alist binary | opsional |
| `RCLONE_CONFIG_PATH` | Path ke rclone.conf | opsional |

## Fitur Utama

- Login JWT dengan role admin/user
- Manajemen file multi-zona (upload, download, batch)
- Sinkronisasi Terabox via Rclone
- Notifikasi WhatsApp via Fonnte
- Dashboard, audit log, piutang, fleet management

## Catatan Replit

- **Alist** dinonaktifkan secara default (binary tidak tersedia di Replit). Set `ENABLE_ALIST=true` jika Anda mengupload binary Alist ke folder `/alist/`.
- **Rclone** bersifat opsional. Buat `rclone.conf` di root project untuk mengaktifkannya.
- Awalnya dirancang untuk Hugging Face Spaces / Google Cloud Run. File deployment terkait (`.cloudbuild.yaml`, `Dockerfile`, dll.) tetap ada sebagai referensi.

## User Preferences

- Bahasa Indonesia untuk komunikasi
- Setiap update atau perbaikan yang selesai harus langsung di-commit dan di-push ke GitHub branch `replit-source`, tanpa menyertakan secret, database runtime, konfigurasi rclone, atau binary rclone.
