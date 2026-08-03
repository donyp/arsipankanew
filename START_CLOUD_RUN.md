# 🚀 START CLOUD RUN DEPLOYMENT - STEP BY STEP

Panduan lengkap untuk deploy arsip-anka ke Google Cloud Run dengan project ID `arsipanka`.

---

## STEP 1: Prerequisites Check (5 minutes)

### 1.1 Install gcloud CLI
Download dari: https://cloud.google.com/sdk/docs/install

Verifikasi:
```powershell
gcloud --version
```

### 1.2 Authenticate dengan Google
```powershell
gcloud auth login
```

Ini akan membuka browser untuk login.

### 1.3 Set Project
```powershell
gcloud config set project arsipanka
gcloud config list
```

Output should show: `project = arsipanka`

---

## STEP 2: Create Secrets (10 minutes)

### 2.1 Option A: Interactive (Recommended)

Run script untuk setup secrets dengan interactive prompts:

```bash
# Linux/Mac
bash CLOUD_RUN_SETUP_SECRETS.sh

# Windows (gunakan Git Bash atau WSL)
bash CLOUD_RUN_SETUP_SECRETS.sh
```

### 2.2 Option B: Manual Setup

Jika script tidak bisa dijalankan:

```powershell
# Enable Secret Manager API
gcloud services enable secretmanager.googleapis.com

# Create Supabase secrets
$SUPABASE_URL = "https://ehdqcxzdmmcw..."  # Replace with actual value
echo $SUPABASE_URL | gcloud secrets create arsip-supabase-url --data-file=-

$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIs..."  # Replace with actual value
echo $SUPABASE_KEY | gcloud secrets create arsip-supabase-key --data-file=-

$JWT_SECRET = "arsip-digital-super-..."  # Replace with actual value
echo $JWT_SECRET | gcloud secrets create arsip-jwt-secret --data-file=-

# Create Terabox secrets
$TERABOX_URL = "https://pan.baidu.com/..."  # Replace with actual value
echo $TERABOX_URL | gcloud secrets create arsip-terabox-url --data-file=-

$TERABOX_USER = "your-baidu-account"  # Replace with actual value
echo $TERABOX_USER | gcloud secrets create arsip-terabox-user --data-file=-

$TERABOX_PASS = "your-password"  # Replace with actual value
echo $TERABOX_PASS | gcloud secrets create arsip-terabox-pass --data-file=-

$TERABOX_CRYPT = "encryption-password"  # Replace with actual value
echo $TERABOX_CRYPT | gcloud secrets create arsip-terabox-crypt --data-file=-
```

### 2.3 Verify Secrets
```powershell
gcloud secrets list --filter="name:arsip-*"
```

Output should show 7 secrets created.

---

## STEP 3: Deploy to Cloud Run (5-10 minutes)

### 3.1 Option A: Using PowerShell Script (Recommended)

```powershell
# Run deployment script
.\CLOUD_RUN_DEPLOYMENT_SCRIPT.ps1

# Or with custom parameters
.\CLOUD_RUN_DEPLOYMENT_SCRIPT.ps1 -ProjectId arsipanka -Region asia-southeast1
```

Script akan:
- ✓ Check all APIs enabled
- ✓ Verify all secrets exist
- ✓ Deploy to Cloud Run
- ✓ Show service URL
- ✓ Display recent logs

### 3.2 Option B: Manual Command

```powershell
gcloud run deploy arsip-anka `
  --source=. `
  --platform managed `
  --region asia-southeast1 `
  --allow-unauthenticated `
  --memory 512Mi `
  --cpu 1 `
  --timeout 300 `
  --port 8080 `
  --set-env-vars NODE_ENV=production `
  --set-secrets SUPABASE_URL=arsip-supabase-url:latest `
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=arsip-supabase-key:latest `
  --set-secrets JWT_SECRET=arsip-jwt-secret:latest `
  --set-secrets TERABOX_WEBDAV_URL=arsip-terabox-url:latest `
  --set-secrets TERABOX_USER=arsip-terabox-user:latest `
  --set-secrets TERABOX_PASS=arsip-terabox-pass:latest `
  --set-secrets TERABOX_CRYPT_PASSWORD=arsip-terabox-crypt:latest
```

Ini akan memulai build dan deployment. Tunggu sampai selesai (~5-10 menit).

---

## STEP 4: Verify Deployment (5 minutes)

### 4.1 Get Service URL
```powershell
$SERVICE_URL = (gcloud run services describe arsip-anka --region asia-southeast1 --format='value(status.url)')
Write-Host "Service URL: $SERVICE_URL"
```

Contoh output: `https://arsip-anka-abc123-aj.a.run.app`

### 4.2 Test Health Check
```powershell
curl "$SERVICE_URL/api/heartbeat"
```

Expected response:
```json
{"status":"alive","version":"2.0.1-fixed"}
```

### 4.3 View Logs
```powershell
gcloud run services logs read arsip-anka --region asia-southeast1 --limit 50
```

Look for:
- ✓ `🚀 Backend starting on port 8080`
- ✓ `✅ Backend listening on port 8080`
- ✓ No errors in logs

### 4.4 View Service Details
```powershell
gcloud run services describe arsip-anka --region asia-southeast1
```

Check:
- ✓ Status: Active
- ✓ URL displayed
- ✓ Revisions shown

---

## STEP 5: Setup GitHub Integration (Optional but Recommended)

Untuk automatic deployment setiap push ke main branch:

### 5.1 Connect GitHub Repository

```powershell
# Create Cloud Build trigger dari GitHub
gcloud builds connect --repository-name=arsip-anka --github-owner=YOUR_GITHUB_USERNAME
```

Ini akan membuka browser untuk authorize GitHub connection.

### 5.2 Create Build Trigger

Di Google Cloud Console:
1. Buka: https://console.cloud.google.com/cloud-build/triggers
2. Click "Create Trigger"
3. Name: `arsip-anka-deploy`
4. Repository: Select your repository
5. Branch: `main`
6. Build Configuration: `.cloudbuild.yaml`
7. Click "Create"

### 5.3 Test Automatic Deployment

```powershell
# Push change ke main branch
git add .
git commit -m "test: trigger cloud build"
git push origin main

# Check build status
gcloud builds list --limit 5
```

---

## STEP 6: Monitor & Maintain

### 6.1 View Real-time Logs
```powershell
gcloud run services logs read arsip-anka --region asia-southeast1 --follow
```

### 6.2 View Metrics
```powershell
# In Google Cloud Console
# https://console.cloud.google.com/run?project=arsipanka
```

### 6.3 Scale Configuration

```powershell
# Update memory/CPU
gcloud run services update arsip-anka `
  --region asia-southeast1 `
  --memory 1Gi `
  --cpu 2
```

---

## Troubleshooting

### Build Fails
```powershell
# Check build logs
gcloud builds log BUILD_ID --stream

# Common issues:
# - Missing secrets: Create them with gcloud secrets create
# - Port already in use: Cloud Run auto-handles this
# - Memory limit: Increase with --memory flag
```

### Service Not Responding
```powershell
# Check if service is running
gcloud run services list --region asia-southeast1

# Check recent logs
gcloud run services logs read arsip-anka --region asia-southeast1 --limit 100

# Restart service (soft restart)
gcloud run services update arsip-anka --region asia-southeast1 --no-traffic
gcloud run services update-traffic arsip-anka --region asia-southeast1 --to-revisions=LATEST=100
```

### Secrets Not Loading
```powershell
# List secrets
gcloud secrets list --filter="name:arsip-*"

# Verify permissions
gcloud projects get-iam-policy arsipanka

# Update secret
echo "new-value" | gcloud secrets versions add arsip-jwt-secret --data-file=-
```

---

## Costs

- **First 2M requests/month**: FREE
- **First 2M GB-seconds/month**: FREE
- **Beyond free tier**: ~$0.40 per 1M requests + compute costs

Expected monthly cost for typical usage: **$0-15**

---

## Rollback (If Issues)

```powershell
# List revisions
gcloud run revisions list --service=arsip-anka --region asia-southeast1

# Rollback to previous version
gcloud run services update-traffic arsip-anka `
  --region asia-southeast1 `
  --to-revisions=REVISION_ID=100
```

---

## Next: Setup Custom Domain (Optional Later)

```powershell
gcloud run domain-mappings create `
  --service=arsip-anka `
  --domain=arsip.example.com `
  --region=asia-southeast1
```

---

## Timeline

| Step | Estimated Time |
|------|--------|
| 1. Prerequisites | 5 min |
| 2. Create Secrets | 10 min |
| 3. Deploy | 10 min |
| 4. Verify | 5 min |
| 5. GitHub Setup | 5 min |
| **Total** | **~35 minutes** |

---

## Quick Command Reference

```powershell
# Authentication
gcloud auth login
gcloud config set project arsipanka

# Secrets
gcloud secrets list --filter="name:arsip-*"
echo "VALUE" | gcloud secrets create SECRET_NAME --data-file=-

# Deployment
gcloud run deploy arsip-anka --source=. --region asia-southeast1 ...

# Monitoring
gcloud run services describe arsip-anka --region asia-southeast1
gcloud run services logs read arsip-anka --region asia-southeast1 --follow

# Testing
curl "https://arsip-anka-XXX-aj.a.run.app/api/heartbeat"
```

---

## Support

Jika ada masalah:
1. Check logs: `gcloud run services logs read arsip-anka --region asia-southeast1`
2. Verify secrets: `gcloud secrets list`
3. Check Cloud Build: https://console.cloud.google.com/cloud-build
4. Check service status: `gcloud run services describe arsip-anka --region asia-southeast1`

---

**Ready? Start with STEP 1! 🚀**
