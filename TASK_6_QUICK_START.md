# Task 6: Quick Start Deployment Guide

**TL;DR**: Deploy the completed Terabox file sync fix to Cloud Run in 2 commands

---

## Prerequisites

- [ ] GCP account with project `arsipanka`
- [ ] gcloud CLI installed and authenticated
- [ ] Google Secret Manager secret created: `arsip-alist-password` = current Alist admin password

---

## Deployment (2 Steps)

### Step 1: Deploy to Cloud Run

```bash
gcloud run deploy arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --source=. \
  --allow-unauthenticated
```

⏱️ Takes ~5-10 minutes (Docker build + deployment)

### Step 2: Verify Deployment

**Option A: Automated Verification (Recommended)**
```bash
# PowerShell (Windows)
.\TASK_6_VERIFY_DEPLOYMENT.ps1

# Bash (Linux/Mac)
bash ./TASK_6_VERIFY_DEPLOYMENT.sh
```

**Option B: Manual Verification**
```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe arsipankabaru \
  --region=asia-southeast1 --project=arsipanka --format='value(status.url)')

# Test health check (should return HTTP 200)
curl $SERVICE_URL/api/heartbeat

# Test stats (should show file_count > 0)
curl $SERVICE_URL/api/stats/storage

# Check logs (should not show 401 or ECONNREFUSED)
gcloud run logs read arsipankabaru --limit=100 --region=asia-southeast1 --project=arsipanka
```

---

## What Gets Deployed

✅ All code changes from Tasks 1-5:
- Secret Manager integration for credentials
- Alist login with automatic retry
- Comprehensive error logging
- Fallback credential chain

✅ Infrastructure:
- Docker image with Node.js + Alist
- Cloud Run container with 512Mi memory
- Automatic scaling and health checks

---

## Expected Results

### Successful Deployment:
```
✅ Service deployed successfully
✅ Health check returns 200 OK
✅ Stats endpoint shows files > 0
✅ No 401 or timeout errors in logs
✅ Credentials loaded from SECRET_MANAGER
```

### Startup Logs (Should Show):
```
🔐 [RcloneStorage] Initializing storage credentials...
✅ [RcloneStorage] Storage credentials loaded from SECRET_MANAGER
✅ Alist authenticated on attempt 1
✅ Backend listening on port 8080
```

---

## If Deployment Fails

### Issue: "401 Unauthorized"
```bash
# Fix: Update Secret Manager password
echo "correct-password" | gcloud secrets versions add arsip-alist-password --data-file=-

# Redeploy
gcloud run deploy arsipankabaru --region asia-southeast1 --project=arsipanka --source=.
```

### Issue: "ECONNREFUSED" (Alist not running)
- Verify Dockerfile installs Alist
- Verify start.sh starts Alist service
- Redeploy

### Issue: Stats showing 0/0 files
- Check database: `SELECT COUNT(*) FROM files;`
- Check logs for SQL/Alist errors
- See detailed guide: `TASK_6_DEPLOYMENT_VERIFICATION.md`

---

## Service URL

After deployment, your service will be at:
```
https://arsipankabaru-XXXXX.asia-southeast1.run.app
```

Endpoints:
- Health: `/api/heartbeat`
- Stats: `/api/stats/storage`
- Files: `/api/files` (requires JWT token)

---

## Rollback (If Needed)

```bash
# View previous revision
gcloud run revisions list --service=arsipankabaru --region=asia-southeast1 --project=arsipanka

# Switch traffic back to previous revision
gcloud run services update-traffic arsipankabaru \
  --region=asia-southeast1 --project=arsipanka \
  --to-revisions=REVISION_ID=100
```

---

## Monitoring

View live logs:
```bash
gcloud run logs read arsipankabaru --follow --limit=50 --region=asia-southeast1 --project=arsipanka
```

View service dashboard:
```
https://console.cloud.google.com/run?project=arsipanka
```

---

## Support

For detailed troubleshooting:
- `TASK_6_DEPLOYMENT_VERIFICATION.md` - Full verification checklist
- `backend/TASK_6_COMPLETION_SUMMARY.md` - Implementation details
- `backend/tests/terabox-integration.test.js` - Test cases showing expected behavior

---

## Done!

Your Terabox file sync fix is now deployed to Cloud Run production. Users can access files at:
```
https://arsipankabaru-XXXXX.asia-southeast1.run.app
```

Monitor logs for 24-48 hours to ensure stability.
