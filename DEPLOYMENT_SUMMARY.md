# 🚀 Pusat Arsip Anka - Deployment to Hugging Face Spaces

## What's Ready for Deployment

Semua file sudah disiapkan untuk deploy ke Hugging Face Spaces:

### ✅ Files Created/Updated:
1. **`Dockerfile`** - Optimized untuk HF dengan healthcheck
2. **`.dockerignore`** - Exclude unnecessary files untuk faster builds
3. **`start.sh`** - Startup script yang handle semua services
4. **`.env.example`** - Template untuk environment variables
5. **`SETUP_HUGGINGFACE.md`** - Step-by-step setup guide
6. **`DEPLOYMENT_CHECKLIST.md`** - Comprehensive checklist
7. **`deploy.sh`** - Quick deployment script

---

## ⚡ Quick Start (5 Minutes)

### 1. Create Space di Hugging Face
```
1. Go to https://huggingface.co/spaces
2. Create new Space
3. Select "Docker" as SDK
4. Name: "pusat-arsip-anka"
```

### 2. Setup Git & Push
```bash
# Navigate ke project
cd "path/to/arsip anka"

# Configure git
git config user.email "your@email.com"
git config user.name "Your Name"

# Add HF remote
git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/pusat-arsip-anka

# Push
git add .
git commit -m "Deploy: Pusat Arsip Anka"
git push -u hf main
```

### 3. Configure Secrets
Di HF Space Settings > Variables and Secrets, add:
```
SUPABASE_URL = https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOi...
JWT_SECRET = (generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
PORT = 7860
NODE_ENV = production
```

### 4. Wait & Access
- Build takes 2-5 minutes
- Space URL: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space`
- Monitor logs in Space dashboard

---

## 📋 Architecture

```
Hugging Face Space (Docker Container)
├── Node.js Backend (Express)
│   ├── JWT Authentication
│   ├── Supabase Database
│   ├── File Upload (Multer)
│   └── Rclone Storage Integration
├── Frontend (HTML/CSS/JS Vanilla)
│   ├── Dashboard
│   ├── File Management
│   ├── User Management
│   └── Audit Logs
└── Optional Services
    ├── Alist (File Manager)
    ├── Rclone (Cloud Storage)
    └── SQLite (Local DB Backup)
```

---

## 🔒 Security Setup

### Database (Supabase)
```sql
-- Create tables jika belum ada
-- Sudah ada di backend setup

-- Set RLS policies untuk security (recommended)
-- Enable Row Level Security di Supabase dashboard
```

### JWT Authentication
```javascript
// Automatically configured di backend/server.js
// Requires JWT_SECRET environment variable (min 32 chars)
```

### Environment Variables
- Semua disimpan di HF Space Settings > Secrets
- Tidak di-commit ke git
- Automatically injected ke container

---

## 📊 Features Deployed

### ✅ Working
- User authentication (JWT)
- File upload/download
- Database operations
- API endpoints
- Frontend UI
- Notifications (WhatsApp via Fonnte)

### ⚙️ Optional
- Alist file manager (can be disabled)
- Rclone cloud storage integration
- Local SQLite backup

### ⏳ Auto-Handled by HF
- SSL/HTTPS (automatic)
- Domain & DNS
- Container orchestration
- Health checks

---

## 🐛 Common Issues & Solutions

### Build Fails
```
✓ Check .dockerignore for large files
✓ Verify Dockerfile syntax
✓ Ensure start.sh exists
✓ Check package.json dependencies
```

### App Crashes
```
✓ Check PORT=7860 is set
✓ Verify Supabase credentials
✓ Check logs in Space dashboard
✓ Verify JWT_SECRET format
```

### Slow Performance
```
✓ Disable Alist if not needed (edit start.sh)
✓ Optimize database queries
✓ Check Supabase performance
✓ Monitor memory in logs
```

See **`DEPLOYMENT_CHECKLIST.md`** untuk detailed troubleshooting.

---

## 📈 Monitoring & Maintenance

### Daily
- Check HF Space dashboard
- Monitor error logs
- Verify services running

### Weekly
- Review Supabase usage
- Check file storage
- Audit user activity

### Monthly
- Update dependencies: `cd backend && npm update`
- Review security policies
- Backup database (Supabase handles this)

### As Needed
- Deploy updates: `git push hf main`
- Restart container: HF Settings > Restart
- Scale resources: HF Pro tier

---

## 🔗 Resources

| Resource | Link |
|----------|------|
| Hugging Face Docs | https://huggingface.co/docs/hub/spaces |
| Docker Docs | https://docs.docker.com/ |
| Node.js Guide | https://nodejs.org/en/docs/guides/ |
| Supabase Docs | https://supabase.com/docs |
| Express.js | https://expressjs.com/ |
| Rclone | https://rclone.org/ |
| Alist | https://alist.org/ |

---

## 📞 Support

### If Deployment Fails
1. Check Space logs for error messages
2. Review DEPLOYMENT_CHECKLIST.md
3. Verify all environment variables set
4. Check Docker syntax

### If App Has Issues
1. Check browser console (F12)
2. Check Space logs
3. Test with different browser
4. Verify Supabase connectivity

### For More Help
- Check project README.md
- Review backend/server.js comments
- Check Hugging Face community forum

---

## ✅ Success Checklist

After deployment, verify:
- [ ] App loads without errors
- [ ] Login works
- [ ] Dashboard displays data
- [ ] File upload works
- [ ] File download works
- [ ] Database operations work
- [ ] Notifications sent (if enabled)
- [ ] No 500 errors in logs

---

## 🎉 You're Deployed!

Congratulations! Your Pusat Arsip Anka is now live on Hugging Face Spaces.

### Next Steps:
1. Share Space URL dengan team
2. Configure access control via Supabase
3. Test all features thoroughly
4. Setup monitoring alerts
5. Create backup strategy

---

**Version:** 2.0  
**Last Updated:** June 22, 2026  
**Status:** Ready for Deployment ✨
