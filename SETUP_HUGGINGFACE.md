# Setup Hugging Face Spaces - Step by Step

## 1️⃣ Create Space di Hugging Face

1. Buka https://huggingface.co/spaces
2. Klik **"Create new Space"**
3. Fill form:
   - **Space name**: `pusat-arsip-anka` (atau nama lain)
   - **License**: Pilih yang sesuai (MIT, Apache 2.0, etc)
   - **Space SDK**: Pilih **Docker**
   - **Visibility**: Private atau Public (sesuai kebutuhan)
4. Klik **Create Space**

## 2️⃣ Setup Git Remote

Di local machine Anda:

```bash
# Navigate ke project directory
cd /c/Users/ANKA\ BEKASI/Downloads/arsip\ anka

# Set git remote ke HF Space
git remote remove origin 2>/dev/null || true
git remote add origin https://huggingface.co/spaces/YOUR_USERNAME/pusat-arsip-anka

# Configure git credentials
git config user.email "your-email@example.com"
git config user.name "Your Name"
```

## 3️⃣ Commit dan Push ke Hugging Face

```bash
# Add all files
git add .

# Commit
git commit -m "Initial deployment: Pusat Arsip Anka v2.0"

# Push to HF (ini akan trigger build)
git push -u origin main
```

**Note**: Pertama kali push mungkin diminta login. Gunakan HF API token Anda.

## 4️⃣ Configure Secrets di HF Spaces

Setelah Space dibuat, pergi ke **Settings > Variables and secrets** dan tambahkan:

### Database (Supabase)
```
SUPABASE_URL = https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOiJIUzI1NiIsInR5...
```

### Authentication
```
JWT_SECRET = your-super-secret-random-string-min-32-characters-long
```

### Optional: WhatsApp Notifications
```
FONNTE_TOKEN = your-fonnte-api-token
```

### Environment
```
NODE_ENV = production
PORT = 7860
```

**Cara generate JWT_SECRET yang aman:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5️⃣ Monitor Deployment

1. Di HF Space, pergi ke **App logs**
2. Tunggu sampai status berubah menjadi **Running**
3. Cek bahwa backend berhasil start

Expected log output:
```
[BOOT] Pusat Arsip Anka - v2.1.0-fixed
[INIT] PORT is set to: 7860
[INIT] Starting Node.js backend server...
[BOOT] Supabase connected
[BOOT] JWT Auth enabled
[BOOT] Express server listening on port 7860
```

## 6️⃣ Access Application

URL akan tersedia di:
- **Main App**: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space`

## Troubleshooting

### Build gagal: "Docker build failed"
- Cek `.dockerignore` - mungkin ada file besar yang tidak perlu
- Cek `Dockerfile` syntax
- Pastikan `start.sh` ada di root directory

### Container tidak jalan: "Port already in use"
- Pastikan `PORT=7860` di environment variables
- start.sh harus listen di $PORT, bukan hardcoded port

### App jalan tapi error 500
- Check HF Space logs untuk error details
- Pastikan semua environment variables sudah set
- Test Supabase connection

### Supabase connection error
- Pastikan SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY benar
- Cek security rules di Supabase
- Pastikan Supabase project masih aktif

## Tips & Tricks

### Disable Alist (jika tidak perlu)
Edit `start.sh`, comment out Alist startup:
```bash
# echo "[INIT] Starting Alist service..."
# alist server --data /app/data > /app/data/log/alist.log 2>&1 &
```

### View Real-time Logs
```bash
# Dari HF Space dashboard, klik "View full logs"
```

### Restart Container
Di HF Space Settings, ada tombol **Restart** - gunakan jika ada issue

### Update Deployment
```bash
# Edit file lokal
# Commit dan push
git add .
git commit -m "Update: description"
git push
# HF akan auto-rebuild
```

## Advanced: Custom Domain (Pro Users)

Kalau punya HF Pro, bisa attach custom domain di Space settings.

## Maintenance

### Regular Updates
```bash
# Update dependencies
cd backend
npm update
git add backend/package-lock.json
git commit -m "Update dependencies"
git push
```

### Database Backups
Karena menggunakan Supabase, data automatically backed up. Tidak perlu khawatir tentang persistent storage.

### Monitor Usage
Di HF Space Settings > Analytics, bisa lihat:
- CPU/Memory usage
- Request logs
- Error rates

---

**Questions?** 
- Hugging Face Docs: https://huggingface.co/docs/hub/spaces
- Project Repo: Check README.md
- Docker: https://docs.docker.com/
