# Cloud Run Deployment Checklist

## Pre-Deployment (Before Pushing Code)

- [ ] **GCP Project Setup**
  - [ ] GCP account created
  - [ ] Project created (get PROJECT_ID)
  - [ ] Billing account linked
  - [ ] gcloud CLI installed

- [ ] **Environment Secrets Prepared**
  - [ ] SUPABASE_URL extracted (from Supabase dashboard)
  - [ ] SUPABASE_SERVICE_ROLE_KEY extracted (from Supabase settings)
  - [ ] JWT_SECRET available (same as current .env)
  - [ ] Rclone credentials ready (Terabox, Storj)
  - [ ] Alist password set

- [ ] **Code Ready**
  - [ ] All fixes from deployment-startup-hang-fix applied ✓
  - [ ] Dockerfile updated for Cloud Run (PORT handling) ✓
  - [ ] server.js uses PORT env var ✓
  - [ ] start.sh handles Cloud Run environment ✓
  - [ ] .gitignore proper (no secrets committed)

- [ ] **GitHub Setup (Optional but Recommended)**
  - [ ] Code pushed to GitHub repo
  - [ ] Branch: main (or your default branch)
  - [ ] Repo public or Cloud Build has access

## Step 1: GCP API Setup

```powershell
# Set PROJECT_ID
$PROJECT_ID = "your-project-id"
gcloud config set project $PROJECT_ID

# Enable APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable container.googleapis.com
```

- [ ] All APIs enabled successfully
- [ ] No permission errors
- [ ] gcloud project set correctly

## Step 2: Create Secrets in Secret Manager

```powershell
# Create secret untuk SUPABASE_URL
$SUPABASE_URL = "https://ehdqcxzdmmcw..."
echo $SUPABASE_URL | gcloud secrets create arsip-supabase-url --data-file=-

# Create secret untuk SUPABASE_SERVICE_ROLE_KEY
$SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIs..."
echo $SUPABASE_KEY | gcloud secrets create arsip-supabase-key --data-file=-

# Create secret untuk JWT_SECRET
$JWT_SECRET = "arsip-digital-super-..."
echo $JWT_SECRET | gcloud secrets create arsip-jwt-secret --data-file=-
```

- [ ] arsip-supabase-url created
- [ ] arsip-supabase-key created
- [ ] arsip-jwt-secret created
- [ ] Verified di Google Cloud Console

## Step 3: Deploy to Cloud Run

### Option A: Deploy dari Local Directory (First Time)

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
  --set-secrets JWT_SECRET=arsip-jwt-secret:latest
```

- [ ] Build started (should show "Creating Cloud Build container...")
- [ ] Build completed (should show "Deploying Cloud Run service...")
- [ ] Service deployed (should show "Cloud Run service deployed")
- [ ] Service URL displayed

### Option B: Deploy dari GitHub (Ongoing)

```powershell
gcloud run deploy arsip-anka `
  --source="https://github.com/YOUR_USERNAME/arsip-anka" `
  --branch main `
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
  --set-secrets JWT_SECRET=arsip-jwt-secret:latest
```

- [ ] GitHub authorization completed
- [ ] Build started
- [ ] Build completed
- [ ] Service deployed

## Step 4: Verify Deployment

```powershell
# Get service details
gcloud run services describe arsip-anka --region asia-southeast1

# Get service URL
$SERVICE_URL = (gcloud run services describe arsip-anka --region asia-southeast1 --format='value(status.url)')
Write-Host "Service URL: $SERVICE_URL"

# Test health check
curl "$SERVICE_URL/api/heartbeat"
# Should return: {"status":"alive","version":"2.0.1-fixed"}
```

- [ ] Service description retrieved successfully
- [ ] Service URL displayed
- [ ] Health check returns 200 OK
- [ ] Response body correct
- [ ] No errors in logs

## Step 5: Verify Services

```powershell
# View recent logs
gcloud run services logs read arsip-anka --region asia-southeast1 --limit 50

# Check startup sequence
# Should see:
# - [BOOT] Pusat Arsip Anka initialization
# - [CONFIG] Environment variables loaded
# - 🚀 Backend starting on port 8080
# - ✅ Backend listening on port 8080
# - No errors or warnings
```

- [ ] Startup logs reviewed
- [ ] No errors in logs
- [ ] Port binding successful (8080)
- [ ] Configuration loaded
- [ ] All services started

## Step 6: Test Core Functionality

```powershell
$SERVICE_URL = (gcloud run services describe arsip-anka --region asia-southeast1 --format='value(status.url)')

# Test 1: Health Check
curl "$SERVICE_URL/api/heartbeat"
# Expected: 200 OK with JSON response

# Test 2: Login endpoint (should reject without credentials)
curl -X POST "$SERVICE_URL/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"test@example.com","password":"test"}'
# Expected: 401 Unauthorized or error message

# Test 3: CORS headers
curl -i "$SERVICE_URL/api/heartbeat" | Select-String "Access-Control-Allow-Origin"
# Expected: Access-Control-Allow-Origin header present
```

- [ ] Health check endpoint working (200)
- [ ] Authentication endpoint working (401/error expected)
- [ ] CORS headers present
- [ ] No 500 errors
- [ ] Response times acceptable (<1s)

## Step 7: Verify Database Connection

```powershell
# Test login with valid credentials
curl -X POST "$SERVICE_URL/api/auth/login" `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@example.com","password":"your-password"}'
# Expected: 200 OK with token and user info
```

- [ ] Database connection successful
- [ ] Supabase accessible from Cloud Run
- [ ] JWT token issued
- [ ] User data retrieved

## Step 8: Verify File Storage

```powershell
# Check if file listing works
# This requires valid JWT token from login
$TOKEN = "your-jwt-token-from-login-above"

curl "$SERVICE_URL/api/files" `
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 OK with files array
```

- [ ] File listing works
- [ ] Rclone connectivity verified
- [ ] Terabox/Storj accessible
- [ ] No 500 errors

## Step 9: Monitor Performance

```powershell
# View metrics
gcloud run services describe arsip-anka --region asia-southeast1 --format=yaml

# View ongoing logs
gcloud run services logs read arsip-anka --region asia-southeast1 --follow --limit 20
```

- [ ] Response times monitored
- [ ] Error rate checked (should be <1%)
- [ ] Log volume reasonable
- [ ] No memory issues
- [ ] Scaling working (instances scale up/down)

## Step 10: Setup CI/CD (Optional)

```powershell
# If using GitHub, Cloud Build auto-deploys on push
git push origin main
# Deployment should trigger automatically

# Monitor build
gcloud builds list --filter="substitutions.BRANCH_NAME:main"
```

- [ ] GitHub connected (if using Option B)
- [ ] Automatic builds enabled
- [ ] Manual build/deploy tested

## Step 11: Configure Custom Domain (Optional)

```powershell
# Map custom domain
gcloud run domain-mappings create `
  --service=arsip-anka `
  --domain=arsip.example.com `
  --region=asia-southeast1

# Get DNS records to add
gcloud run domain-mappings describe arsip.example.com --region=asia-southeast1
```

- [ ] Custom domain mapped (if desired)
- [ ] DNS records updated in domain provider
- [ ] HTTPS certificate auto-provisioned
- [ ] Custom domain accessible

## Step 12: Setup Monitoring & Alerts (Optional)

```powershell
# View Cloud Run metrics in Cloud Console
# https://console.cloud.google.com/run?project=YOUR_PROJECT_ID

# Setup uptime checks
# https://console.cloud.google.com/monitoring/uptime
```

- [ ] Cloud Monitoring configured
- [ ] Uptime checks setup
- [ ] Alerts configured (if desired)

## Post-Deployment

- [ ] Document service URL: https://arsip-anka-XXX-aj.a.run.app
- [ ] Backup original Hugging Face deployment
- [ ] Gradual traffic migration (if applicable)
- [ ] Monitor logs for 24-48 hours
- [ ] Decommission Hugging Face deployment (when stable)

## Rollback Plan (If Issues)

```powershell
# View revisions
gcloud run revisions list --service=arsip-anka --region asia-southeast1

# Rollback to previous revision
gcloud run services update-traffic arsip-anka `
  --region asia-southeast1 `
  --to-revisions=REVISION_ID=100
```

- [ ] Rollback plan documented
- [ ] Previous revision ID noted
- [ ] Rollback tested (optional)

## Success Criteria

- ✅ Service deployed without errors
- ✅ Health check endpoint responding
- ✅ Database connectivity verified
- ✅ File storage working
- ✅ Authentication working
- ✅ No memory/CPU issues
- ✅ Logs clean (no errors)
- ✅ Response times acceptable
- ✅ Scaling working correctly
- ✅ Monitoring/alerts configured

## Estimated Time

- Setup: 15 minutes
- Deployment: 5-10 minutes
- Testing: 10-15 minutes
- Total: ~30-40 minutes

## Cost Estimate

- Monthly: $0-15 depending on traffic
- Free tier covers: 2M requests + 2M GB-seconds
- Beyond free tier: $0.40 per 1M requests

---

**Deployment Date**: ________________
**Deployed By**: ________________
**Service URL**: ________________
**Status**: [ ] ✅ Successful [ ] ⚠️ Issues [ ] ❌ Failed

---
