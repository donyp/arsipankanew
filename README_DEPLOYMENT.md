# Deployment Guide: Pusat Arsip Anka ke Hugging Face Spaces

## Prerequisites
1. Akun Hugging Face (free)
2. Repository di Hugging Face (dengan Git configured)
3. Semua required secrets sudah disiapkan

## Langkah-langkah Deployment

### 1. **Setup Repository di Hugging Face**

```bash
# Clone existing space atau create new
git clone https://huggingface.co/spaces/YOUR_USERNAME/pusat-arsip-anka
cd pusat-arsip-anka

# Copy files dari local ke HF Space
cp -r /path/to/local/arsip-anka/* .

git add .
git commit -m "Initial deployment: Pusat Arsip Anka"
git push
```

### 2. **Configure Environment Variables di Hugging Face**

Pergi ke **Settings > Variables and Secrets** dan tambahkan:

| Variable | Value | Type |
|----------|-------|------|
| `SUPABASE_URL` | Your Supabase project URL | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key | Secret |
| `JWT_SECRET` | Random secret string (min 32 chars) | Secret |
| `FONNTE_TOKEN` | WhatsApp notification token (optional) | Secret |
| `PORT` | 7860 | Public |
| `NODE_ENV` | production | Public |

### 3. **Dockerfile Configuration**

Dockerfile sudah dikonfigurasi dengan:
- ✅ Node.js 18 slim base
- ✅ System dependencies (curl, unzip, rclone, ca-certificates)
- ✅ Alist installation
- ✅ Port 7860 (Hugging Face default)
- ✅ Startup script

### 4. **Access the App**

Setelah deployment selesai (~2-5 menit):
- Frontend UI: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space`
- API: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space/api/*`
- Alist (if enabled): `https://YOUR_USERNAME-pusat-arsip-anka.hf.space:5244`

## Troubleshooting

### Build Fails
- Check logs di HF Space > App logs
- Pastikan semua dependencies tersedia di `package.json`
- Cek ukuran container (max 15GB di HF)

### Runtime Errors
- Cek environment variables di Settings
- Pastikan Supabase credentials valid
- Check JWT_SECRET format

### Performance Issues
- Alist service bisa dihapus dari start.sh jika tidak perlu
- Adjust NODE_ENV settings
- Monitor memory usage di HF logs

## Important Notes

⚠️ **Limitations di Hugging Face Spaces:**
- Max 50GB disk space
- Max ~10GB RAM (varies by tier)
- No persistent storage by default (use external DB like Supabase)
- Container restart setiap 48 jam tanpa aktivitas
- Free tier: CPU only, Pro tier: GPU optional

⚠️ **File Upload Considerations:**
- Max file size configured: 100MB
- Gunakan Terabox/rclone untuk large files
- Database queries disimpan di Supabase (tidak local)

## SSL/HTTPS

Hugging Face Spaces automatically provides HTTPS. Tidak perlu setup manual.

## Need Help?

1. Check HF Spaces documentation: https://huggingface.co/docs/hub/spaces
2. Check Docker documentation
3. Review application logs dalam HF Space dashboard
