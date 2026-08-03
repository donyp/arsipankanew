# 📋 Pusat Arsip Anka - Deployment Checklist

## Pre-Deployment Checklist

### ✅ Repository Setup
- [ ] Local git repository initialized
- [ ] `.gitignore` sudah configured
- [ ] `.dockerignore` sudah ada
- [ ] Tidak ada large binary files (>100MB)
- [ ] Tidak ada secret files (.env, credentials)

### ✅ Code Review
- [ ] `Dockerfile` sudah updated
- [ ] `start.sh` sudah executable dan benar
- [ ] `backend/package.json` semua dependencies tercantum
- [ ] Frontend files (HTML, CSS, JS) di root atau `frontend/` folder
- [ ] API endpoints menggunakan environment PORT variable

### ✅ Configuration
- [ ] Supabase project ready dengan:
  - [ ] Database tables sudah dibuat
  - [ ] RLS policies sudah configured (optional tapi recommended)
  - [ ] Service role key tersedia
  - [ ] Project URL tersedia
- [ ] JWT_SECRET sudah digenerate (minimal 32 character)
- [ ] Fonnte token (optional) sudah ada jika perlu WhatsApp

### ✅ Hugging Face Setup
- [ ] Hugging Face account sudah active
- [ ] Space sudah dibuat (Docker SDK)
- [ ] Git remote sudah dikonfigurasi
- [ ] User credentials/token sudah setup untuk git push

---

## Deployment Steps

### Step 1: Prepare Local Changes
```bash
# Pastikan semua perubahan sudah committed
git status

# Bersihkan temporary files
rm -rf backend/tmp/*
rm -rf data/temp/*
rm -f *.log
rm -f *_dump.json
```

### Step 2: Push to Hugging Face
```bash
# Set git remote
git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/pusat-arsip-anka

# Push
git push -u hf main
```

### Step 3: Configure Environment Variables
Di Hugging Face Space > Settings > Variables and secrets:

| Key | Value | Type |
|-----|-------|------|
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | Secret |
| `JWT_SECRET` | Random 32+ chars | Secret |
| `PORT` | `7860` | Public |
| `NODE_ENV` | `production` | Public |

### Step 4: Monitor Build
1. Buka Space page
2. Pergi ke "App logs"
3. Tunggu sampai build selesai (2-5 menit)
4. Cek untuk error messages

Expected success indicators:
```
Container starting...
npm install...
[BOOT] Pusat Arsip Anka - v2.1.0-fixed
[INIT] PORT is set to: 7860
[BOOT] Express server listening on port 7860
```

### Step 5: Test Application
- [ ] Akses main URL: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space`
- [ ] Login page muncul
- [ ] Coba login dengan test account
- [ ] Test file upload functionality
- [ ] Check console logs untuk error

---

## Post-Deployment

### ✅ Verification
- [ ] Frontend tersedia dan responsive
- [ ] Login/authentication bekerja
- [ ] Database queries berjalan (cek network tab)
- [ ] File operations berfungsi
- [ ] No 500 errors di console

### ✅ Monitoring
- [ ] Set up Space notifications untuk crashes
- [ ] Monitor logs regularly untuk errors
- [ ] Test scheduled tasks (if any)
- [ ] Verify Supabase connection regularly

### ✅ Documentation
- [ ] Update README dengan Space URL
- [ ] Share access credentials ke team
- [ ] Document any custom deployments
- [ ] Setup backup strategy untuk database

---

## Troubleshooting Guide

### Problem: Docker Build Fails
**Solution:**
- [ ] Check `.dockerignore` - remove large files
- [ ] Check `Dockerfile` syntax
- [ ] Verify `start.sh` exists and is in repo
- [ ] Check file sizes: `du -sh .` (should be < 500MB)

### Problem: Container Starts but App Doesn't Load
**Solution:**
- [ ] Check `PORT` environment variable is `7860`
- [ ] Verify `start.sh` permissions: `chmod +x start.sh`
- [ ] Check logs untuk errors
- [ ] Verify `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` are correct

### Problem: 500 Errors on API Calls
**Solution:**
- [ ] Check Supabase credentials
- [ ] Verify database tables exist
- [ ] Check JWT_SECRET is set
- [ ] Look at browser console errors
- [ ] Check Space logs untuk backend errors

### Problem: File Upload Fails
**Solution:**
- [ ] Check multer limits in backend (100MB currently)
- [ ] Verify rclone configuration
- [ ] Check temp directory has write permission
- [ ] Verify storage backend (Terabox) is accessible

### Problem: Memory Issues or Crashes
**Solution:**
- [ ] Reduce NODE_OPTIONS memory limit
- [ ] Remove Alist service if not needed
- [ ] Clear logs dan temp files
- [ ] Monitor memory usage di HF logs

---

## Rollback Plan

If deployment fails:

```bash
# Revert last commit
git reset --soft HEAD~1

# Fix issues
# ... make changes ...

# Re-deploy
git add .
git commit -m "Fix: deployment issues"
git push -f hf main
```

---

## Success Criteria ✨

- [ ] App loads without errors
- [ ] Users dapat login
- [ ] Database operations work
- [ ] File uploads/downloads work
- [ ] Notifications system functional (if enabled)
- [ ] No persistent 500 errors
- [ ] Logs show normal operation

---

## Additional Resources

- Hugging Face Spaces: https://huggingface.co/docs/hub/spaces
- Docker Best Practices: https://docs.docker.com/develop/dev-best-practices/
- Node.js Production: https://nodejs.org/en/docs/guides/nodejs-docker-webapp/
- Supabase Docs: https://supabase.com/docs

---

**Last Updated:** June 22, 2026
**Version:** 2.0
