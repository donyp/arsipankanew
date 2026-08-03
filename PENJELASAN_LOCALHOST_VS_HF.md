# Penjelasan: localhost vs Hugging Face URL

## ❌ Kesalahpahaman Umum

Ketika logs menampilkan:
```
Terabox URL: http://localhost:5244/dav/terabox
✅ External access: http://localhost:7860
```

Ini **BUKAN** berarti Anda bisa akses di browser dengan `http://localhost:7860`

## ✅ Penjelasan yang Benar

### Apa itu "localhost" di logs?

- `localhost` = localhost **INSIDE Docker container**
- Container punya network sendiri yang terpisah
- Service di dalam container pakai `localhost` untuk komunikasi internal

### Bagaimana cara akses aplikasi?

**Anda harus akses melalui URL Hugging Face Spaces:**

```
https://YOUR_USERNAME-pusat-arsip-anka.hf.space
```

**BUKAN** `http://localhost:7860`

## 🔍 Ilustrasi

```
[Komputer Anda]
      ↓ (tidak bisa akses localhost container)
      ❌ http://localhost:7860
      
[Internet]
      ↓ (akses melalui HF domain)
      ✅ https://username-pusat-arsip-anka.hf.space
      ↓
[Hugging Face Infrastructure]
      ↓ (routing ke container)
[Docker Container]
      ├── Backend: localhost:7860 (internal)
      ├── Alist: localhost:5244 (internal)
      └── Services berkomunikasi via localhost
```

## 📋 Port Mapping

| Service | Internal (Container) | External (Anda) |
|---------|---------------------|----------------|
| Backend | `localhost:7860` | `https://username-space.hf.space` |
| Alist | `localhost:5244` | **Tidak exposed** ke public |

## ⚠️ Catatan Penting

### 1. Backend (Port 7860)
- ✅ **Accessible** dari internet via HF URL
- ❌ **Tidak accessible** via localhost di komputer Anda
- Gunakan: `https://username-pusat-arsip-anka.hf.space`

### 2. Alist (Port 5244)
- ✅ **Accessible** dari dalam container (untuk rclone/backend)
- ❌ **Tidak exposed** ke public/internet (by design)
- Hanya untuk internal communication

### 3. Terabox WebDAV
- ✅ Backend akses via Alist API di `localhost:5244` (internal)
- ✅ File upload/download melalui backend API
- ❌ Tidak bisa diakses langsung dari browser Anda

## 🎯 Cara Menggunakan Aplikasi

### Step 1: Buka di Browser
```
https://YOUR_USERNAME-pusat-arsip-anka.hf.space
```

### Step 2: Login
- Gunakan kredensial admin yang sudah di-setup
- Email: sesuai database Supabase
- Password: sesuai database

### Step 3: Upload/Download File
- Upload file melalui UI
- Backend akan otomatis:
  1. Terima file dari browser
  2. Kontak Alist di `localhost:5244` (internal)
  3. Upload ke Terabox via Alist
  4. Return success ke UI

### Step 4: Verifikasi File
- File list akan muncul di dashboard
- Download file melalui backend
- Backend fetch dari Terabox via Alist (internal)

## 🐛 Troubleshooting

### "Situs ini tidak dapat dijangkau" di localhost:7860

**Normal!** Anda tidak bisa akses localhost container dari komputer Anda.

**Solusi:** Gunakan URL Hugging Face Spaces

### Bagaimana test file upload/download?

1. Buka: `https://username-pusat-arsip-anka.hf.space`
2. Login dengan kredensial admin
3. Coba upload file PDF
4. Cek di dashboard apakah file muncul
5. Coba download file

### Bagaimana cek Alist running?

**Dari logs container:**
```
[INIT] ✅ Alist started with PID: 11 on port 5244
```

Jika PID muncul, Alist sudah running (walaupun Anda tidak bisa akses dari browser).

### Bagaimana test Rclone config?

**Dari logs container:**
```
[RcloneConfig] Generated rclone.conf from environment variables
[RcloneConfig] Config written to: /app/rclone.conf
```

Jika muncul, config sudah di-generate dengan benar.

**Dari upload file:**
- Coba upload file di UI
- Cek logs untuk error
- Jika upload sukses, config Rclone benar

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────┐
│  Browser (Komputer Anda)                │
│  https://username-space.hf.space        │
└───────────┬─────────────────────────────┘
            │ HTTP/HTTPS Request
            ↓
┌─────────────────────────────────────────┐
│  Hugging Face Infrastructure            │
│  (Load Balancer, Routing)               │
└───────────┬─────────────────────────────┘
            │ Route to Container
            ↓
┌─────────────────────────────────────────┐
│  Docker Container                       │
│  ┌─────────────────────────────────┐   │
│  │ Backend (localhost:7860)        │   │
│  │ • Express Server                │   │
│  │ • API Endpoints                 │   │
│  │ • File Upload/Download Logic    │   │
│  └───────────┬─────────────────────┘   │
│              │ Internal Call           │
│              ↓                          │
│  ┌─────────────────────────────────┐   │
│  │ Alist (localhost:5244)          │   │
│  │ • File Manager                  │   │
│  │ • WebDAV Server                 │   │
│  │ • Terabox Connector             │   │
│  └───────────┬─────────────────────┘   │
│              │ Upload/Download         │
│              ↓                          │
│  ┌─────────────────────────────────┐   │
│  │ Rclone (rclone.conf)            │   │
│  │ • Config from env vars          │   │
│  │ • Terabox WebDAV                │   │
│  │ • Storj S3 Backup               │   │
│  └───────────┬─────────────────────┘   │
└──────────────┼─────────────────────────┘
               │ External API Call
               ↓
┌─────────────────────────────────────────┐
│  Terabox Cloud Storage                  │
│  • File Storage                         │
│  • File Retrieval                       │
└─────────────────────────────────────────┘
```

## ✅ Kesimpulan

- ❌ **Jangan** coba akses `http://localhost:7860` dari browser Anda
- ✅ **Gunakan** `https://username-pusat-arsip-anka.hf.space`
- ✅ Logs yang menampilkan `localhost` adalah **internal container**
- ✅ Aplikasi akan bekerja dengan benar via HF URL
- ✅ File storage akan berfungsi via backend API (tidak perlu akses langsung)

---

**Gunakan URL Hugging Face Spaces untuk akses aplikasi!** 🚀
