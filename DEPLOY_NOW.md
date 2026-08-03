# 🚀 SIAP DEPLOY KE HUGGING FACE SPACES

Semua file dan konfigurasi sudah disiapkan untuk deployment. Ikuti panduan di bawah ini.

---

## 📦 Apa Yang Sudah Disiapkan

### ✅ Configuration Files
- ✅ `Dockerfile` - Optimized untuk Hugging Face dengan healthcheck
- ✅ `start.sh` - Entry point yang handle semua services
- ✅ `.dockerignore` - Exclude unnecessary files
- ✅ `backend/package.json` - Dependencies sudah complete

### ✅ Documentation
- ✅ `QUICK_DEPLOY.txt` - Quick reference (START HERE!)
- ✅ `SETUP_HUGGINGFACE.md` - Detailed step-by-step guide
- ✅ `DEPLOYMENT_CHECKLIST.md` - Comprehensive checklist
- ✅ `DEPLOYMENT_SUMMARY.md` - Full overview & features
- ✅ `.env.example` - Environment template

### ✅ Deployment Scripts
- ✅ `deploy.sh` - Linux/Mac deployment script
- ✅ `deploy.bat` - Windows deployment script

---

## ⚡ SUPER QUICK START (7 Steps)

### Step 1: Create Space
```
Go to: https://huggingface.co/spaces/create
- Space name: pusat-arsip-anka
- SDK: Docker
- Visibility: Your choice
```

### Step 2: Setup Git
```bash
# Configure git (if not done)
git config user.email "your@email.com"
git config user.name "Your Name"

# Add HF remote
git remote add hf https://huggingface.co/spaces/YOUR_USERNAME/pusat-arsip-anka
```

### Step 3: Deploy
```bash
# Windows
deploy.bat

# Or manual
git add .
git commit -m "Deploy: Pusat Arsip Anka"
git push -u hf main
```

### Step 4: Generate JWT_SECRET
```bash
# Run in terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5: Set Environment Variables
Di Space Settings > Variables and Secrets, add:
```
SUPABASE_URL = https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJhbGciOi...
JWT_SECRET = (paste from step 4)
PORT = 7860
NODE_ENV = production
```

### Step 6: Wait for Build
- Takes 2-5 minutes
- Monitor in Space > App logs
- Wait for "Running" status

### Step 7: Access App
```
https://YOUR_USERNAME-pusat-arsip-anka.hf.space
```

---

## 🎯 Getting Supabase Credentials

1. Go to https://supabase.com
2. Open your project
3. Settings > API
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **Service Role Secret** → `SUPABASE_SERVICE_ROLE_KEY`

---

## 📋 Files Reference

| File | Purpose | When to Read |
|------|---------|--------------|
| `QUICK_DEPLOY.txt` | Quick reference card | First time reading |
| `SETUP_HUGGINGFACE.md` | Detailed step-by-step | Need detailed instructions |
| `DEPLOYMENT_CHECKLIST.md` | Full checklist | Before deploying |
| `.env.example` | Environment template | Setup variables |
| `Dockerfile` | Container config | Understand Docker setup |
| `start.sh` | Entry point | Understand startup |
| `deploy.bat` | Windows script | Using Windows |
| `deploy.sh` | Linux/Mac script | Using Linux/Mac |

---

## 🔍 What's Inside Container

```
Hugging Face Space
├── Node.js 18 (Backend)
│   ├── Express Server (Port 7860)
│   ├── JWT Authentication
│   ├── Supabase Integration
│   ├── File Upload (Multer)
│   ├── Rclone Storage
│   └── Notifications (Fonnte)
│
├── Frontend (Vanilla JS)
│   ├── Dashboard
│   ├── File Management
│   ├── User Management
│   └── Audit Logs
│
└── Optional Services
    ├── Alist (File Manager)
    ├── Rclone (Cloud Storage)
    └── SQLite (Local Backup)
```

---

## ✨ Features Included

### ✅ Authentication
- JWT-based authentication
- User roles & permissions
- Secure password hashing (bcryptjs)

### ✅ File Management
- PDF file upload (max 100MB)
- File download/preview
- Soft delete (trash)
- File archiving

### ✅ Database
- Supabase PostgreSQL
- Real-time updates
- Full-text search
- Audit logging

### ✅ Multi-Tenant
- Multiple zones (zonas)
- Department management
- Permission-based access control

### ✅ Notifications
- WhatsApp via Fonnte (optional)
- In-app notifications
- Email-ready (extensible)

---

## ⚙️ Environment Variables

### Required
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
JWT_SECRET
```

### Recommended
```
PORT=7860
NODE_ENV=production
```

### Optional
```
FONNTE_TOKEN          (for WhatsApp)
ENABLE_ALIST=true     (file manager)
LOG_LEVEL=info        (logging)
```

---

## 🐛 If Something Goes Wrong

### Build Fails
1. Check `.dockerignore` - remove large files
2. Check file sizes: `du -sh .` (should be < 500MB)
3. Verify `Dockerfile` syntax
4. Check `start.sh` exists

### App Crashes
1. Check `PORT=7860` is set
2. Verify `SUPABASE_URL` and key
3. Check Space logs
4. Verify `JWT_SECRET` format

### Database Errors
1. Check Supabase is accessible
2. Verify credentials
3. Check database tables exist
4. Review Space logs

See **`DEPLOYMENT_CHECKLIST.md`** untuk detailed troubleshooting.

---

## 📊 Space Specifications (Hugging Face)

| Aspect | Value |
|--------|-------|
| CPU | Varies (usually 2-4 cores) |
| RAM | ~3.5GB (free tier) |
| Disk | Up to 50GB |
| Bandwidth | Unlimited |
| Container Runtime | Docker |
| Base URL | `https://username-spacename.hf.space` |
| HTTPS | Automatic |
| Restarts | Every 48h without activity |

---

## 🔒 Security Notes

### ⚠️ Before Deploying
- [ ] Change default admin password
- [ ] Set strong JWT_SECRET (min 32 chars)
- [ ] Enable RLS in Supabase (recommended)
- [ ] Review CORS settings
- [ ] Check file upload limits

### ⚠️ After Deploying
- [ ] Test authentication
- [ ] Verify encryption in transit (HTTPS)
- [ ] Monitor logs for errors
- [ ] Setup Supabase backups
- [ ] Document access procedures

---

## 📞 Helpful Resources

| Resource | Link |
|----------|------|
| Hugging Face Spaces | https://huggingface.co/docs/hub/spaces |
| Docker Documentation | https://docs.docker.com/ |
| Node.js Docs | https://nodejs.org/en/docs/ |
| Supabase Docs | https://supabase.com/docs |
| Express.js | https://expressjs.com/ |
| Rclone | https://rclone.org/docs/ |
| Alist | https://alist.org/ |

---

## ✅ Post-Deployment Checklist

After deployment, verify:
- [ ] App loads without errors
- [ ] Login page appears
- [ ] Can login with credentials
- [ ] Dashboard displays
- [ ] File upload works
- [ ] File download works
- [ ] Database queries work
- [ ] No 500 errors in logs
- [ ] Space shows "Running" status

---

## 🎉 You're Ready!

Semua persiapan sudah selesai. Silakan mulai deployment dengan:

**Windows:**
```bash
deploy.bat
```

**Linux/Mac:**
```bash
bash deploy.sh
```

**Or manually:**
```bash
git add .
git commit -m "Deploy: Pusat Arsip Anka"
git push -u hf main
```

---

## 📧 Questions?

1. Check `QUICK_DEPLOY.txt` for quick reference
2. Check `SETUP_HUGGINGFACE.md` for detailed steps
3. Check `DEPLOYMENT_CHECKLIST.md` for troubleshooting
4. Review project README.md
5. Check Hugging Face community forum

---

**Status:** ✅ READY FOR DEPLOYMENT  
**Last Updated:** June 22, 2026  
**Version:** 2.0

🚀 **Let's deploy!**
