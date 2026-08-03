# Cloud Run Staging Deployment Guide

This guide provides comprehensive instructions for deploying the Arsip backend to Google Cloud Run staging environment. Follow each section sequentially to ensure a successful deployment.

---

## Section 1: Dockerfile Validation

Before building the Docker image, validate that the Dockerfile includes all required components for Cloud Run deployment.

### Dockerfile Validation Checklist

- [ ] **Alist Binary Configuration**
  - [ ] Verify: `COPY alist/ /app/alist/` exists in Dockerfile
  - [ ] Check that alist binary is included in the repository
  - [ ] Verify alist executable has correct permissions
  - [ ] Confirm alist/data directory structure exists with config.json
  - **Status**: Required for Terabox file mounting via WebDAV

- [ ] **Rclone Installation**
  - [ ] Verify: `apt-get install rclone` is in the RUN command
  - [ ] Confirm rclone binary will be available in container: `/usr/bin/rclone`
  - [ ] Check rclone version is compatible (v1.60+)
  - [ ] Verify rclone binary is copied or pre-compiled if using custom binary
  - **Status**: Required for WebDAV connection to Alist

- [ ] **Rclone Configuration**
  - [ ] Verify: rclone.conf exists at project root or will be generated at runtime
  - [ ] Check generate-rclone-config.js exists for runtime config generation
  - [ ] Confirm rclone.conf contains terabox remote definition:
    ```
    [terabox]
    type = webdav
    url = http://localhost:5244/dav/terabox
    vendor = other
    user = admin
    pass = <password-from-secrets>
    ```
  - [ ] Verify rclone.conf file permissions will be set to 600 (readable only by owner)
  - **Status**: Required for Terabox upload operations

- [ ] **Persistent Volume Mount Configuration**
  - [ ] Verify: Data directories are created: `RUN mkdir -p /app/data/...`
  - [ ] Check: Working directory is `/app` for consistency
  - [ ] Confirm: Local storage path `/app/data/` will be used for file persistence
  - [ ] Verify: Persistent volume will be mounted at `/app/data/` in Cloud Run configuration
  - **Status**: Required for file data persistence across container restarts

- [ ] **Port Environment Variables**
  - [ ] Verify: `PORT` environment variable is set (default 8080 for Cloud Run)
  - [ ] Check: `EXPOSE 8080` matches the PORT default
  - [ ] Confirm: Backend will listen on PORT environment variable
  - [ ] Verify: PORT variable flows from Dockerfile ENV → process.env.PORT in Node.js
  - [ ] Check: Alternative ports (5244 for Alist) are properly exposed if needed
  - **Status**: Required for Cloud Run to route traffic correctly

- [ ] **Health Check Configuration**
  - [ ] Verify: HEALTHCHECK instruction is present
  - [ ] Check: Health check endpoint is `/api/heartbeat`
  - [ ] Confirm: Health check interval (30s), timeout (10s), retries (3)
  - [ ] Verify: Health check uses correct port: `${PORT:-8080}`
  - **Status**: Required for Cloud Run container orchestration

### Pre-Build Verification Commands

```bash
# 1. Verify alist directory structure
ls -la alist/
ls -la alist/data/config.json

# 2. Check Dockerfile syntax and required instructions
grep -E "COPY alist|apt-get install rclone|mkdir -p /app/data|EXPOSE|HEALTHCHECK" Dockerfile

# 3. Verify rclone.conf exists or generate-rclone-config.js is present
ls -la rclone.conf generate-rclone-config.js

# 4. Check PORT environment variable in Dockerfile
grep "^ENV PORT" Dockerfile

# 5. Verify backend dependencies
ls -la backend/package.json
head -20 backend/package.json
```

---

## Section 2: Docker Build

Build the Docker image and verify the build completes without errors.

### Build Command

```bash
# Build Docker image for Cloud Run
docker build -t gcr.io/PROJECT_ID/arsip:latest .

# Replace PROJECT_ID with your actual Google Cloud Project ID
# Example: docker build -t gcr.io/my-project-123/arsip:latest .
```

### Build Verification Steps

1. **Monitor Build Output**
   ```
   Expected output includes:
   - Step 1: FROM node:18-slim (base image download)
   - Step 2-N: RUN apt-get update... (dependencies installation)
   - Step X: COPY backend/ (application files)
   - Step Y: EXPOSE 8080 (port exposure)
   - Successfully tagged gcr.io/PROJECT_ID/arsip:latest
   ```

2. **Check Build Success**
   ```bash
   # Verify build completed
   docker images | grep "arsip"
   # Output should show: gcr.io/PROJECT_ID/arsip  latest  <image-id>  <size>
   ```

3. **Verify Layer Caching**
   - Note build time (should be faster on subsequent builds due to layer caching)
   - Expected build time: 3-5 minutes for first build, 30-60 seconds for cache hits

### Common Build Errors and Troubleshooting

| Error Message | Root Cause | Solution |
|---------------|-----------|----------|
| `FROM node:18-slim: image not found` | Docker daemon not running or no internet | Ensure Docker is running, check internet connection |
| `E: Could not get lock /var/lib/apt/lists/lock` | Package manager locked | Retry build, or manually fix in Dockerfile |
| `COPY alist/ /app/alist/: stat alist: no such file or directory` | alist directory missing | Verify alist/ directory exists at project root |
| `bash: npm: command not found` | Node.js not installed in base image | Check base image is node:18-slim |
| `E: Package 'rclone' not found` | rclone not in apt repositories | Update apt cache or specify rclone version |

### Build Output Validation

```bash
# Inspect built image layers and size
docker inspect gcr.io/PROJECT_ID/arsip:latest | jq '.[0] | {Size, RootFS, Layers}'

# Check image history (layers)
docker history gcr.io/PROJECT_ID/arsip:latest

# Expected output: ~500-800 MB total size, 15-20 layers
```

---

## Section 3: Docker Push

Push the built image to Google Container Registry so Cloud Run can access it.

### Authentication Setup

```bash
# Configure Docker authentication with Google Cloud
gcloud auth configure-docker gcr.io

# Verify authentication
cat ~/.docker/config.json | grep gcr.io
```

### Push Command

```bash
# Push image to Container Registry
docker push gcr.io/PROJECT_ID/arsip:latest

# Expected output:
# Pushing layers...
# Layer 1 of 20: xxxxx
# ...
# Digest: sha256:xxxxxxxxxxxxxxxx
```

### Verification Steps

1. **Verify Image in Registry**
   ```bash
   # List images in Container Registry
   gcloud container images list --repository=gcr.io/PROJECT_ID | grep arsip
   
   # Output should show:
   # gcr.io/PROJECT_ID/arsip
   ```

2. **Verify Image Tags**
   ```bash
   # List all tags for arsip image
   gcloud container images list-tags gcr.io/PROJECT_ID/arsip
   
   # Output should show:
   # DIGEST                                 TAGS    TIMESTAMP
   # sha256:xxxxxxxxxxxxx                   latest  2024-01-15T10:30:00Z
   ```

3. **Check Image Size in Registry**
   ```bash
   # Get image metadata
   gcloud container images describe gcr.io/PROJECT_ID/arsip:latest --show-package-vulnerability=false
   
   # Expected: ~500-800 MB image size
   ```

### Push Troubleshooting

| Error | Solution |
|-------|----------|
| `denied: Permission denied` | Run `gcloud auth configure-docker gcr.io` and authenticate |
| `name unknown: manifest unknown` | Verify image exists locally: `docker images \| grep arsip` |
| `timeout waiting for connection` | Check internet connectivity, retry push |

---

## Section 4: Cloud Run Deployment

Deploy the image to Google Cloud Run with proper configuration for the staging environment.

### Pre-Deployment Checklist

- [ ] Google Cloud Project ID identified: `PROJECT_ID=_______________`
- [ ] Cloud Run API enabled in project
- [ ] Service account created with Cloud Run permissions
- [ ] Secret Manager secrets created for sensitive values
- [ ] Persistent volume created (if using local file storage)
- [ ] Region selected: `us-central1` or `asia-southeast1`

### Set Environment Variables

```bash
# Set variables for deployment script
export PROJECT_ID="your-gcp-project-id"
export IMAGE="gcr.io/${PROJECT_ID}/arsip:latest"
export REGION="us-central1"  # or asia-southeast1
export SERVICE_NAME="arsip"
export MEMORY="2Gi"
export CPU="2"
```

### Full Deployment Command

```bash
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE} \
  --region ${REGION} \
  --memory ${MEMORY} \
  --cpu ${CPU} \
  --port 8080 \
  --timeout 3600 \
  --max-instances 10 \
  --min-instances 1 \
  --allow-unauthenticated \
  --set-env-vars \
    PORT=8080,\
    ALIST_PORT=5244,\
    NODE_ENV=production,\
    GCP_PROJECT_ID=${PROJECT_ID} \
  --update-env-vars \
    SUPABASE_URL=$(gcloud secrets versions access latest --secret="supabase-url"),\
    SUPABASE_KEY=$(gcloud secrets versions access latest --secret="supabase-key"),\
    ALIST_ADMIN_PASSWORD=$(gcloud secrets versions access latest --secret="alist-admin-password"),\
    RCLONE_TERABOX_PASS=$(gcloud secrets versions access latest --secret="rclone-terabox-password") \
  --set-cloudsql-instances=${PROJECT_ID}:${REGION}:postgres \
  --service-account=arsip-service@${PROJECT_ID}.iam.gserviceaccount.com
```

### Deployment Output

Expected output after running the deploy command:

```
Deploying container to Cloud Run service [arsip] in project [PROJECT_ID] region [us-central1]...
✓ Deploying new service revision of [arsip]...
  ✓ Creating Revision...
  ✓ Routing traffic...
Done.
Service [arsip] revision [arsip-00001-abc] has been deployed and is serving 100 percent of traffic.
Service URL: https://arsip-xxxxx.a.run.app
```

### Persistent Volume Configuration (If Needed)

If using persistent storage for files:

```bash
# Create persistent volume
gcloud compute disks create arsip-data-disk \
  --region ${REGION} \
  --size 100GB \
  --type pd-standard

# Attach volume to Cloud Run service (requires Cloud Run v2 with volume support)
# This is typically configured through Cloud Console or infrastructure-as-code
```

### Alternative: Cloud Console Deployment

If using Google Cloud Console instead of CLI:

1. Navigate to Cloud Run → Create Service
2. Select "Deploy one revision from an existing container image"
3. Image URL: `gcr.io/PROJECT_ID/arsip:latest`
4. Service name: `arsip`
5. Region: `us-central1`
6. CPU: 2
7. Memory: 2Gi
8. Timeout: 3600 seconds
9. Set all environment variables from Section 4 above
10. Click "Create"

---

## Section 5: Deployment Verification

Verify that the Cloud Run service deployed successfully and all components are operational.

### Initial Service Status Check

```bash
# Get service details
gcloud run services describe ${SERVICE_NAME} --region ${REGION}

# Output should show:
# - Status: OK
# - URL: https://arsip-xxxxx.a.run.app
# - Last Modifier: <email>
# - Traffic: 100% → <latest-revision>
```

### Health Check Verification

1. **Heartbeat Endpoint Test**
   ```bash
   # Test health check endpoint
   SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')
   
   curl -v ${SERVICE_URL}/api/heartbeat
   
   # Expected response:
   # HTTP/2 200
   # Content-Type: application/json
   # {"status": "alive", "version": "2.0.1-fixed"}
   ```

2. **Curl Response Parsing**
   ```bash
   # Parse and validate response
   curl -s ${SERVICE_URL}/api/heartbeat | jq '.status'
   # Expected output: "alive"
   ```

3. **Network Reachability Test**
   ```bash
   # Test HTTPS connection
   curl -I ${SERVICE_URL}
   
   # Expected: HTTP/2 200 (various endpoints may return 404 or redirect)
   ```

### Service Log Monitoring

```bash
# Stream logs in real-time
gcloud run logs read ${SERVICE_NAME} --limit=50 --follow

# Or get last 50 log entries
gcloud run logs read ${SERVICE_NAME} --limit=50

# Filter for startup messages
gcloud run logs read ${SERVICE_NAME} --limit=100 | grep -E "🚀|✅|Starting|listening|initialized"
```

### Expected Startup Log Messages

When the service starts, look for these messages in the logs:

1. **Backend Startup Banner**
   ```
   [Backend] 🚀 Starting Arsip Backend...
   ```

2. **Alist Service Initialization**
   ```
   [Alist] ✅ Service initialized on http://localhost:5244
   ```

3. **Rclone WebDAV Connection Verification**
   ```
   [Rclone] ✅ WebDAV connection verified
   ```

4. **Backend Listen Confirmation**
   ```
   ✅ Backend listening on port 8080
   ```

### Complete Log Sample

Example of a successful startup:

```log
2024-01-15T10:30:45.123Z [Backend] 🚀 Starting Arsip Backend...
2024-01-15T10:30:45.234Z [Stage] Loading environment variables...
2024-01-15T10:30:45.345Z [Stage] ✅ Environment loaded: PORT=8080, GCP_PROJECT_ID=my-project
2024-01-15T10:30:45.456Z [Alist] Starting Alist service on port 5244...
2024-01-15T10:30:47.567Z [Alist] ✅ Service initialized on http://localhost:5244
2024-01-15T10:30:47.678Z [Rclone] Verifying WebDAV connection to Alist...
2024-01-15T10:30:48.789Z [Rclone] ✅ WebDAV connection verified
2024-01-15T10:30:48.890Z [Backend] Starting Node.js server...
2024-01-15T10:30:49.901Z ✅ Backend listening on port 8080
2024-01-15T10:30:50.012Z [Info] Server ready to accept requests
```

### Verification Status Dashboard

| Component | Status | Check Command | Expected Result |
|-----------|--------|----------------|-----------------|
| Cloud Run Service | ✓ | `gcloud run services describe arsip` | Status: OK |
| Container Image | ✓ | `gcloud container images list-tags gcr.io/PROJECT_ID/arsip` | latest tag present |
| Health Check | ✓ | `curl https://SERVICE_URL/api/heartbeat` | HTTP 200, JSON response |
| Alist Service | ✓ | Check logs for "[Alist] ✅" | Startup message present |
| Rclone Connection | ✓ | Check logs for "[Rclone] ✅" | Connection verified message |
| Backend Listening | ✓ | Check logs for "listening on port" | Port 8080 confirmed |
| Environment Variables | ✓ | `gcloud run services describe arsip --format='value(spec.template.spec.containers[0].env)'` | All vars set |

---

## Section 6: Troubleshooting

Common issues encountered during deployment and their solutions.

### Startup Issues

#### Issue 1: Service Fails to Start (Exit Code Non-Zero)

**Symptoms**:
- Cloud Run shows "Error: Failed to start container"
- Service URL returns "500 Internal Server Error"
- Logs show process exit without startup messages

**Root Causes**:
1. Environment variable missing or invalid
2. Alist binary not found or permission denied
3. Port 5244 or 8080 already in use
4. Secret not accessible from Secret Manager
5. Rclone connection failed on startup

**Diagnosis Steps**:

```bash
# 1. Check service status and error messages
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format json | jq '.status'

# 2. Get detailed error logs
gcloud run logs read ${SERVICE_NAME} --limit=200 2>&1 | tail -100

# 3. Check if service is in error state
gcloud run services describe ${SERVICE_NAME} --region ${REGION} | grep -A5 "Conditions"

# 4. Inspect environment variables
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(spec.template.spec.containers[0].env)' | sort
```

**Solutions**:

```bash
# Solution 1: Check environment variables
# Verify all required env vars are set:
# PORT, ALIST_PORT, NODE_ENV, GCP_PROJECT_ID, SUPABASE_URL, SUPABASE_KEY, ALIST_ADMIN_PASSWORD

# Solution 2: Verify secrets exist in Secret Manager
gcloud secrets list | grep -E "alist-admin|supabase|rclone"

# Solution 3: Check Secret Manager access permissions
gcloud secrets get-iam-policy alist-admin-password

# Solution 4: Update service with correct image
gcloud run deploy ${SERVICE_NAME} --image gcr.io/${PROJECT_ID}/arsip:latest --region ${REGION} --update-env-vars PORT=8080

# Solution 5: Increase startup timeout
gcloud run deploy ${SERVICE_NAME} --region ${REGION} --update-env-vars STARTUP_TIMEOUT=60000
```

#### Issue 2: "Alist Binary Not Found"

**Symptoms**:
- Log message: `Error: spawn alist: ENOENT`
- Service fails immediately at startup

**Solution**:

```bash
# 1. Verify alist directory structure
ls -la alist/
ls -la alist/alist.exe  # or alist (without .exe on Linux)

# 2. Check Dockerfile COPY instruction
grep "COPY alist" Dockerfile

# 3. Rebuild image and verify alist is included
docker build -t gcr.io/${PROJECT_ID}/arsip:latest . --no-cache
docker run --rm gcr.io/${PROJECT_ID}/arsip:latest ls -la /app/alist/

# 4. Push updated image
docker push gcr.io/${PROJECT_ID}/arsip:latest

# 5. Redeploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} --image gcr.io/${PROJECT_ID}/arsip:latest --region ${REGION}
```

#### Issue 3: "Port 5244 Already in Use"

**Symptoms**:
- Log message: `Error: bind EADDRINUSE 0.0.0.0:5244`
- Port binding fails during startup

**Solution**:

```bash
# Option 1: Use different port for Alist (requires Docker rebuild)
# Edit backend/server.js to use different port
# Or set ALIST_PORT environment variable to alternative port

# Option 2: Check if previous container is still running
gcloud run services describe ${SERVICE_NAME} --region ${REGION} | grep "Active"

# Option 3: Force new deployment with fresh container
gcloud run deploy ${SERVICE_NAME} --image gcr.io/${PROJECT_ID}/arsip:latest --region ${REGION} --force-unlock

# Option 4: Update Cloud Run timeout for cleaner shutdown
gcloud run deploy ${SERVICE_NAME} --region ${REGION} --timeout=3600
```

### Runtime Issues

#### Issue 4: Rclone Connection Fails

**Symptoms**:
- Log message: `[Rclone] ❌ Connection failed`
- Files fail to sync to Terabox

**Root Causes**:
1. rclone.conf not generated correctly
2. Alist WebDAV not responding
3. Invalid credentials

**Diagnosis**:

```bash
# 1. Check if rclone.conf was generated
gcloud run logs read ${SERVICE_NAME} --limit=200 | grep -i "rclone\|config"

# 2. Test rclone connectivity manually (if you have shell access)
gcloud run ssh --service=${SERVICE_NAME} --region=${REGION}
rclone --config /app/rclone.conf lsjson terabox:/

# 3. Check Alist health
curl http://localhost:5244/  # (from inside container)

# 4. Verify rclone.conf credentials
gcloud secrets versions access latest --secret="rclone-terabox-password"
```

**Solutions**:

```bash
# Solution 1: Regenerate rclone.conf
# Ensure generate-rclone-config.js exists and is executable
# Verify it's called in start.sh before backend startup

# Solution 2: Update rclone password secret
gcloud secrets versions add rclone-terabox-password --data-file=- <<< "new-password"

# Solution 3: Update RCLONE_TERABOX_PASS environment variable
gcloud run deploy ${SERVICE_NAME} --region ${REGION} --update-env-vars \
  RCLONE_TERABOX_PASS=$(gcloud secrets versions access latest --secret="rclone-terabox-password")

# Solution 4: Redeploy to pick up new configuration
gcloud run deploy ${SERVICE_NAME} --image gcr.io/${PROJECT_ID}/arsip:latest --region ${REGION}
```

#### Issue 5: Health Check Failing

**Symptoms**:
- Cloud Run shows service as "Not Ready"
- Health check endpoint returns 500 or timeout
- Service continuously restarts

**Diagnosis**:

```bash
# 1. Test health check endpoint directly
curl -v https://arsip-xxxxx.a.run.app/api/heartbeat

# 2. Check logs for errors around health check time
gcloud run logs read ${SERVICE_NAME} --limit=100 | tail -50

# 3. Verify backend server is listening
gcloud run logs read ${SERVICE_NAME} --limit=100 | grep "listening"
```

**Solutions**:

```bash
# Solution 1: Increase health check timeout (if startup is slow)
gcloud run deploy ${SERVICE_NAME} --region ${REGION} --timeout=600

# Solution 2: Increase startup delay before health check
# Update HEALTHCHECK in Dockerfile:
# HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
# Then rebuild and push image

# Solution 3: Check if heartbeat endpoint exists in code
grep -r "api/heartbeat" backend/

# Solution 4: Verify backend server starts on PORT env var
grep -r "process.env.PORT" backend/
```

### Log Inspection Procedures

#### Quick Log Search

```bash
# Search for error messages
gcloud run logs read ${SERVICE_NAME} --limit=500 | grep -i "error\|failed\|refused\|timeout"

# Search for specific service startup
gcloud run logs read ${SERVICE_NAME} --limit=500 | grep -E "🚀|✅|Alist|Rclone"

# Get last error in logs
gcloud run logs read ${SERVICE_NAME} --limit=100 | tail -20
```

#### Detailed Log Analysis

```bash
# Save logs to file for analysis
gcloud run logs read ${SERVICE_NAME} --limit=1000 > deployment-logs.txt

# Count occurrences of patterns
grep -c "\[ERROR\]" deployment-logs.txt
grep -c "\[WARNING\]" deployment-logs.txt

# Extract structured log entries
grep "^{" deployment-logs.txt | jq '.severity, .message' 2>/dev/null

# Timeline analysis
grep -E "T[0-9]{2}:[0-9]{2}:[0-9]{2}" deployment-logs.txt | head -20
```

### Quick Rollback Steps

If deployment is unsuccessful and needs to be rolled back:

```bash
# Option 1: Revert to previous revision
gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='value(status.traffic[*].revisionName)'
# Identify the previous revision name

# Redirect traffic to previous revision
gcloud run services update-traffic ${SERVICE_NAME} \
  --to-revisions PREVIOUS_REVISION_NAME=100 \
  --region ${REGION}

# Option 2: Deploy to new service name for testing
gcloud run deploy arsip-staging-v2 \
  --image gcr.io/${PROJECT_ID}/arsip:latest \
  --region ${REGION} \
  --[other options...]

# Option 3: Delete failed service and redeploy
gcloud run services delete ${SERVICE_NAME} --region ${REGION}
gcloud run deploy ${SERVICE_NAME} --image gcr.io/${PROJECT_ID}/arsip:latest --region ${REGION} --[options...]

# Option 4: Scale down problematic revision
gcloud run deploy ${SERVICE_NAME} --region ${REGION} --min-instances 0 --max-instances 1
```

---

## Section 7: Post-Deployment Checklist

After successful deployment, verify all acceptance criteria are met.

### Functional Verification

- [ ] Service is accessible at `https://SERVICE_URL`
- [ ] Health check endpoint responds: `curl https://SERVICE_URL/api/heartbeat`
- [ ] Response is valid JSON: `{"status": "alive", "version": "X.Y.Z"}`
- [ ] Backend accepts file uploads via `/api/files/upload`
- [ ] Files are stored in local storage or Terabox
- [ ] Background sync is triggered for uploaded files
- [ ] Logs show successful Alist initialization
- [ ] Logs show successful Rclone connection verification

### Performance Verification

- [ ] Service responds to requests within 2 seconds
- [ ] File upload completes within 30 seconds
- [ ] Background sync completes within 60 seconds
- [ ] Health check passes consistently
- [ ] No 500 errors or timeouts in logs

### Security Verification

- [ ] Service requires HTTPS (HTTP redirects to HTTPS)
- [ ] Secrets are not exposed in logs
- [ ] Service account has minimal required permissions
- [ ] Credentials in Secret Manager are properly managed
- [ ] rclone.conf file permissions are restricted (600)

### Configuration Verification

- [ ] All environment variables are set correctly
- [ ] PORT is set to 8080
- [ ] GCP_PROJECT_ID matches project
- [ ] Persistent volume is mounted (if using)
- [ ] Memory is set to 2Gi
- [ ] CPU is set to 2

### Monitoring Setup

- [ ] Cloud Run logs are being captured
- [ ] Health check is monitored by Cloud Run
- [ ] Error alerts are configured (optional)
- [ ] Deployment metrics are visible in Cloud Console
- [ ] Service revision history is tracked

---

## Deployment Configuration Summary

### Environment Variables Required

```bash
PORT=8080                           # Cloud Run port
ALIST_PORT=5244                     # Alist WebDAV service port
NODE_ENV=production                 # Node.js environment
GCP_PROJECT_ID=my-project-id        # Google Cloud project ID
SUPABASE_URL=https://...           # Database URL (from Secret Manager)
SUPABASE_KEY=eyJ...                # Database API key (from Secret Manager)
ALIST_ADMIN_PASSWORD=password123    # Alist admin password (from Secret Manager)
RCLONE_TERABOX_PASS=terabox-pwd    # Terabox password (from Secret Manager)
```

### Cloud Run Service Configuration

```yaml
Service Name: arsip
Region: us-central1
Memory: 2Gi
CPU: 2
Timeout: 3600 seconds
Max Instances: 10
Min Instances: 1
Allow Unauthenticated: true
Port: 8080
```

### Image Configuration

```bash
Repository: gcr.io/PROJECT_ID/arsip
Tag: latest
Size: ~600 MB
Layers: ~20
Architecture: amd64
```

---

## Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Run Deployment Guide](https://cloud.google.com/run/docs/deploying)
- [Rclone Configuration Guide](https://rclone.org/docs/)
- [Secret Manager Setup](https://cloud.google.com/secret-manager/docs/configuring-secret-manager)
- [Cloud Run Troubleshooting](https://cloud.google.com/run/docs/troubleshooting)

---

## Support and Next Steps

After successful staging deployment:

1. **Test End-to-End Flow**: Upload files and verify sync to Terabox
2. **Load Testing**: Test with multiple concurrent uploads
3. **Error Recovery**: Test failure scenarios (Alist crash, network timeout)
4. **Performance Monitoring**: Monitor latency and error rates
5. **User Acceptance Testing**: Have team test functionality
6. **Production Planning**: Plan production deployment after staging validation

For issues or questions, refer to the troubleshooting section or check Cloud Run logs for detailed error messages.

