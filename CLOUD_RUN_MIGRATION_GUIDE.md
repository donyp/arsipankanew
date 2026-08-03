# Google Cloud Run Migration Guide

## Prerequisites

1. **Google Cloud Account** - Sudah punya ✓
2. **gcloud CLI** - Download dari https://cloud.google.com/sdk/docs/install
3. **Docker** - Untuk testing local (opsional)
4. **GitHub/GitLab Access** - Repository dengan code

## Setup Langkah-Langkah

### Step 1: Authenticate gcloud

```powershell
gcloud auth login
```

Ini akan membuka browser untuk login dengan Google account Anda.

### Step 2: Set Project ID

Ganti `YOUR_PROJECT_ID` dengan ID project Anda:

```powershell
$PROJECT_ID = "YOUR_PROJECT_ID"
gcloud config set project $PROJECT_ID
```

Verifikasi:
```powershell
gcloud config list
```

### Step 3: Enable Required APIs

```powershell
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

Tunggu hingga selesai (2-5 menit).

### Step 4: Create Secrets di Secret Manager

Cloud Run bisa reference secrets dari Google Secret Manager. Mari buat secrets Anda:

```powershell
# SUPABASE_URL
echo "https://ehdqcxzdmmcw..." | gcloud secrets create arsip-supabase-url --data-file=-

# SUPABASE_SERVICE_ROLE_KEY
echo "eyJhbGciOiJIUzI1NiIs..." | gcloud secrets create arsip-supabase-key --data-file=-

# JWT_SECRET
echo "arsip-digital-super-..." | gcloud secrets create arsip-jwt-secret --data-file=-
```

Atau gunakan UI Console: https://console.cloud.google.com/security/secret-manager

### Step 5: Deploy ke Cloud Run

**Option A: Deploy dari Local Directory (Recommended untuk first time)**

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

**Option B: Deploy dari GitHub (Ongoing)**

Setup automatic deployment:

```powershell
gcloud run deploy arsip-anka `
  --source="https://github.com/YOUR_GITHUB_USERNAME/arsip-anka" `
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

### Step 6: Verify Deployment

```powershell
# View service details
gcloud run services describe arsip-anka --region asia-southeast1

# View logs
gcloud run services logs read arsip-anka --region asia-southeast1 --limit 50

# Test health check
$SERVICE_URL = (gcloud run services describe arsip-anka --region asia-southeast1 --format='value(status.url)')
curl "$SERVICE_URL/api/heartbeat"
```

### Step 7: Setup Custom Domain (Optional)

```powershell
gcloud run domain-mappings create `
  --service=arsip-anka `
  --domain=arsip.example.com `
  --region=asia-southeast1
```

Kemudian update DNS records sesuai instruksi yang keluar.

## Dockerfile Changes

Cloud Run menggunakan port 8080 secara default. Dockerfile sudah compatible:

```dockerfile
ENV PORT=8080
EXPOSE 8080
```

Server.js sudah support dynamic PORT dari env var:
```javascript
const port = process.env.PORT || 4000;
```

## Environment Variables Mapping

| Hugging Face | Cloud Run (Secret Manager) | Notes |
|---|---|---|
| SUPABASE_URL | arsip-supabase-url | Reference via --set-secrets |
| SUPABASE_SERVICE_ROLE_KEY | arsip-supabase-key | Reference via --set-secrets |
| JWT_SECRET | arsip-jwt-secret | Reference via --set-secrets |
| NODE_ENV | production | Set via --set-env-vars |
| PORT | 8080 | Automatically set by Cloud Run |

## Troubleshooting

### Service tidak start
```powershell
gcloud run services logs read arsip-anka --region asia-southeast1 --limit 100
```

### Port binding error
Pastikan Dockerfile dan server.js menggunakan PORT yang benar. Cloud Run selalu menggunakan port 8080.

### Secret tidak ter-load
```powershell
gcloud secrets list
gcloud secrets versions list arsip-supabase-url
```

### Cold start lambat
Normal untuk first request. Cloud Run auto-scale ke 0 replicas saat idle.

## Cost Estimation

- **Free tier**: 2 juta requests/bulan, 2 juta GB-seconds/bulan
- **Typical usage**: ~$5-15/bulan tergantung traffic

## Rollback

Jika ada masalah dengan deployment baru:

```powershell
# List revisions
gcloud run revisions list --service=arsip-anka --region asia-southeast1

# Rollback ke revision sebelumnya
gcloud run services update-traffic arsip-anka `
  --region asia-southeast1 `
  --to-revisions REVISION_ID=100
```

## Next Steps

1. ✅ Setup secrets di Secret Manager
2. ✅ Deploy dengan option A (local source)
3. ✅ Test health check dan endpoints
4. ✅ Verify database connection works
5. ✅ Verify file storage (Rclone/Terabox) works
6. ✅ Test file upload/download
7. ✅ Monitor logs dan performance
8. ✅ Setup GitHub connection untuk automatic deployment
9. ✅ Redirect traffic dari Hugging Face ke Cloud Run
10. ✅ Decommission Hugging Face deployment

## Reference Links

- Cloud Run Documentation: https://cloud.google.com/run/docs
- Secret Manager: https://cloud.google.com/secret-manager
- gcloud CLI Reference: https://cloud.google.com/sdk/gcloud/reference/run
- Cloud Run Pricing: https://cloud.google.com/run/pricing
