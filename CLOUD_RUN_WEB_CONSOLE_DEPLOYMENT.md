# 🌐 Deploy to Cloud Run via Web Console (No CLI Required)

This guide walks you through deploying arsip-anka to Google Cloud Run using only the web browser. No gcloud CLI needed.

---

## Prerequisites (Already Done ✓)

- ✅ Google Cloud Project: `arsipanka`
- ✅ All 7 secrets created in Secret Manager
- ✅ Code ready in repository (Hugging Face or GitHub)

---

## Step 1: Open Cloud Run Console

1. Go to: https://console.cloud.google.com/run?project=arsipanka
2. Sign in with your Google account
3. Make sure project is set to **arsipanka** (check top-left dropdown)

---

## Step 2: Create New Service

1. Click **"Create Service"** button (large blue button)
2. You'll see: "Deploy a container image"

### 2.1 Select Source

Choose one option:

**Option A: Deploy from source code (Recommended)**
- Select: **"Deploy one revision from an image repository"**
- Source: **"Artifact Registry"** 
- Or: **"GitHub"** (if using GitHub)

**Option B: Deploy from image**
- If you already have a Docker image in Artifact Registry
- Select: **"Cloud Run"** 
- Click **"Deploy from image"**

For this guide, we'll use **Option A - GitHub source code**:

---

## Step 3: Configure Source

### 3.1 Connect GitHub Repository

1. Click **"Set up with Cloud Build"**
2. Click **"GitHub (fully managed)"**
3. Click **"Authenticate with GitHub"** 
   - Authorize Google Cloud to access your repositories
   - Select your **arsip-anka** repository
   - Click **"Connect"**
4. Select branch: **main**
5. Build configuration: Select **".cloudbuild.yaml"**
6. Click **"Save"**

---

## Step 4: Configure Service Settings

After source is connected, you'll see service configuration form:

### 4.1 Basic Settings

| Setting | Value |
|---------|-------|
| **Service name** | `arsip-anka` |
| **Region** | `asia-southeast1` |
| **Authentication** | Allow unauthenticated invocations ✓ |

### 4.2 Container Settings

1. Expand **"Container, variables, connections, security"**
2. Set:
   - **Memory**: 512 MB
   - **CPU**: 1
   - **Timeout**: 300 seconds
   - **Port**: 8080

### 4.3 Environment Variables

1. Click **"Variables & Secrets"** tab
2. Add environment variable:
   - Name: `NODE_ENV`
   - Value: `production`

---

## Step 5: Add Secrets

1. In **"Variables & Secrets"** section, look for **"Reference a secret"**
2. Click **"Add Variable"** → Select **"Reference a Secret"**

For each of these 7 secrets, create a reference:

| Environment Variable | Secret Name | Latest Version |
|----------------------|-------------|-----------------|
| `SUPABASE_URL` | `arsip-supabase-url` | latest |
| `SUPABASE_SERVICE_ROLE_KEY` | `arsip-supabase-key` | latest |
| `JWT_SECRET` | `arsip-jwt-secret` | latest |
| `TERABOX_WEBDAV_URL` | `arsip-terabox-url` | latest |
| `TERABOX_USER` | `arsip-terabox-user` | latest |
| `TERABOX_PASS` | `arsip-terabox-pass` | latest |
| `TERABOX_CRYPT_PASSWORD` | `arsip-terabox-crypt` | latest |

**How to add each:**
1. Click **"Add Variable"** 
2. Select **"Reference a Secret"**
3. Enter the environment variable name (e.g., `SUPABASE_URL`)
4. Click **"Select Secret"** → Choose from dropdown (e.g., `arsip-supabase-url`)
5. Version: **latest**
6. Click **"Done"**
7. Repeat for all 7 secrets

---

## Step 6: Deploy

1. Scroll to bottom of the form
2. Click **"Deploy"** button (large blue button)
3. Wait for deployment to complete (~5-10 minutes)

You'll see:
- Build starting
- Building container image
- Pushing image to registry
- Deploying container
- Service Active ✓

---

## Step 7: Verify Deployment

Once deployment completes, you'll see:

### 7.1 Get Service URL

On the service page, you'll see **"Service URL"** at the top:
```
https://arsip-anka-[hash]-[region].a.run.app
```

Copy this URL.

### 7.2 Test Health Check

Open in browser or terminal:
```
https://arsip-anka-[hash]-[region].a.run.app/api/heartbeat
```

Expected response:
```json
{"status":"alive","version":"2.0.1-fixed"}
```

### 7.3 View Logs

1. On the service page, click **"Logs"** tab
2. Look for:
   - ✓ `🚀 Backend starting on port 8080`
   - ✓ `✅ Backend listening on port 8080`
   - ✓ No error messages

### 7.4 View Service Details

1. Click **"Details"** tab
2. Verify:
   - Status: **Active** ✓
   - Region: **asia-southeast1** ✓
   - URL is displayed ✓

---

## Step 8: Setup GitHub Auto-Deploy (Optional)

To automatically deploy when you push to main branch:

### 8.1 Enable Cloud Build API

1. Go to: https://console.cloud.google.com/apis/api/cloudbuild.googleapis.com?project=arsipanka
2. Click **"Enable"** if not already enabled

### 8.2 Create Build Trigger

1. Go to: https://console.cloud.google.com/cloud-build/triggers?project=arsipanka
2. Click **"Create Trigger"**
3. Configure:
   - **Name**: `arsip-anka-deploy`
   - **Repository**: Select `arsip-anka`
   - **Branch**: `main`
   - **Build configuration**: `.cloudbuild.yaml`
4. Click **"Create"**

Now every push to `main` will automatically build and deploy! 🚀

---

## Troubleshooting

### Deployment Failed

1. Click on failed deployment in "Revisions" section
2. Check logs at bottom of page
3. Common issues:
   - **Missing secrets**: Verify all 7 secrets are in Secret Manager
   - **Port mismatch**: Ensure port is 8080
   - **Build error**: Check `.cloudbuild.yaml` syntax

### Service Not Responding

1. Click **"Logs"** tab
2. Look for error messages
3. Common issues:
   - **Port binding error**: Server might have crashed during startup
   - **Environment variable**: Check that secrets are being injected
   - **Dependencies**: Check that all npm packages are installed

### Secrets Not Loading

1. Go to: https://console.cloud.google.com/security/secret-manager?project=arsipanka
2. Verify all 7 secrets exist
3. Click each secret and check it has a "latest" version
4. Go back to Cloud Run service → **"Edit"** → **"Deploy"** to re-run with fresh secret values

---

## Next: Custom Domain (Optional Later)

To use a custom domain like `arsip.example.com`:

1. On service page, click **"Manage Custom Domains"**
2. Click **"Add Mapping"**
3. Enter domain name
4. Follow DNS setup instructions
5. Once verified, domain will work ✓

---

## Service Management

### View All Services
https://console.cloud.google.com/run?project=arsipanka

### View Build History
https://console.cloud.google.com/cloud-build/builds?project=arsipanka

### View Secrets
https://console.cloud.google.com/security/secret-manager?project=arsipanka

### View Metrics & Logs
On service page → **"Metrics"** or **"Logs"** tabs

### Rollback to Previous Version

1. On service page, click **"Revisions"** tab
2. Find previous working revision
3. Click the revision
4. Click **"Set Traffic"** → Select **"100%"** for that revision

---

## Costs

- **First 2M requests/month**: FREE tier
- **First 2M GB-seconds/month**: FREE tier
- Beyond: ~$0.40 per 1M requests + compute
- **Estimated**: $0-15/month for typical usage

---

## Timeline

| Step | Estimated Time |
|------|--------|
| 1. Open Console | 1 min |
| 2. Create Service | 1 min |
| 3. Configure Source | 3 min |
| 4. Configure Settings | 3 min |
| 5. Add Secrets | 5 min |
| 6. Deploy | 10 min |
| 7. Verify | 5 min |
| **Total** | **~28 minutes** |

---

## Quick Links

- **Cloud Run Dashboard**: https://console.cloud.google.com/run?project=arsipanka
- **Secret Manager**: https://console.cloud.google.com/security/secret-manager?project=arsipanka
- **Cloud Build**: https://console.cloud.google.com/cloud-build?project=arsipanka
- **Logs**: https://console.cloud.google.com/logs?project=arsipanka

---

## Ready to Deploy?

Open your browser and go to: **https://console.cloud.google.com/run?project=arsipanka** 🚀

Then click **"Create Service"** and follow the steps above!

---

**Notes**:
- All clicks and navigation happen in your web browser
- No terminal commands needed
- All 7 secrets are already created ✓
- Code is ready in repository ✓
- Should take ~28 minutes total

