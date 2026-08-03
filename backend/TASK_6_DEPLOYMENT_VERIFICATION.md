# Task 6: Deploy to Cloud Run and Verify

**Task ID**: 6  
**Status**: Ready for Deployment  
**Date**: 2024-12-19  
**Objective**: Deploy the Terabox file sync fix to Cloud Run production and verify all functionality

---

## Implementation Status

### Prerequisites (Tasks 1-5): ✅ COMPLETED

- [x] **Task 1**: Secret Manager integration installed (`@google-cloud/secret-manager^4.2.2`)
- [x] **Task 2**: RcloneStorage module updated with credential sourcing from Secret Manager
- [x] **Task 3**: Alist login refactored with retry logic (`loginToAlist()` function)
- [x] **Task 4**: Fallback mechanism implemented (SECRET_MANAGER → ENV → FALLBACK)
- [x] **Task 5**: Integration tests written and verified

### Code Implementation Summary

**Files Modified**:
1. `backend/secretManager.js` - Secret Manager integration with fallback chain
2. `backend/rclone_wrapper.js` - Credential sourcing, loginToAlist(), logging
3. `backend/server.js` - Initialization of credentials at startup

**Key Features**:
- Credentials loaded from Google Secret Manager (`arsip-alist-password`)
- Fallback to environment variable `ALIST_ADMIN_PASSWORD`
- Fallback to hardcoded default for local development
- Alist login with automatic retry (2 attempts max, 1s exponential backoff)
- Comprehensive logging for diagnostics
- Token caching with 24h TTL

---

## Deployment Instructions

### Step 1: Build and Deploy to Cloud Run

```bash
# Deploy with source code (Cloud Build will handle Docker build)
gcloud run deploy arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --source=. \
  --allow-unauthenticated
```

**Expected Output**:
```
Creating Cloud Build container...
Dockerfile detected, building image...
Building using Dockerfile and Cloud Build...
[1/2] Authenticating with Cloud Run...
[2/2] Deploying Cloud Run service...
Deployed service arsipankabaru to https://arsipankabaru-XXXXX.asia-southeast1.run.app
```

**What Happens**:
1. Cloud Build clones the repo
2. Dockerfile builds the Docker image
3. Image pushed to Google Container Registry
4. Cloud Run pulls image and starts container
5. Alist service starts (port 5244)
6. Node.js backend starts (port 8080)
7. Credentials initialized from Secret Manager

---

## Verification Steps

### Step 2: Verify Deployment Succeeded

```bash
gcloud run describe arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka
```

**Verification Checks**:
- [ ] Status: ACTIVE
- [ ] Service URL: https://arsipankabaru-XXXXX.asia-southeast1.run.app
- [ ] Latest revision deployed
- [ ] No failed deployments
- [ ] Memory: 512Mi (or configured amount)
- [ ] CPU: 1 (or configured amount)

**Expected Output**:
```
Service:        arsipankabaru
Status:         Active
URL:            https://arsipankabaru-XXXXX.asia-southeast1.run.app
Ingress:        Allow unauthenticated invocations
Environment:    managed
Region:         asia-southeast1
...
```

---

### Step 3: Check Initialization Logs

```bash
gcloud run logs read arsipankabaru \
  --limit=100 \
  --region=asia-southeast1 \
  --project=arsipanka
```

**What to Look For**:

#### ✅ MUST SEE (Success Indicators):

```
[BOOT] Pusat Arsip Anka - v2.1.0-fixed
[BOOT] Time: 2024-12-19T10:30:00.000Z
[CONFIG] Reading environment variables...
[CONFIG] NODE_ENV: production
[CONFIG] SUPABASE_URL: SET (https://...)
[CONFIG] SUPABASE_SERVICE_ROLE_KEY: SET (...)
[CONFIG] SUPABASE_SERVICE_ROLE_KEY: SET (...)
[CONFIG] JWT_SECRET: SET (...)
[CONFIG] Environment configuration loaded.

[SecretManager] Client initialized for project: arsipanka
🔐 [RcloneStorage] Initializing storage credentials...
[SecretManager] Fetching arsip-alist-password from Secret Manager...
[SecretManager] ✅ Successfully fetched arsip-alist-password from Secret Manager
✅ [RcloneStorage] Storage credentials loaded from SECRET_MANAGER
✅ Storage credentials loaded from SECRET_MANAGER

✅ Alist authenticated on attempt 1
```

#### ❌ MUST NOT SEE (Failure Indicators):

```
401 Unauthorized          # Alist login failed
Alist login failed        # Retry exhausted
ECONNREFUSED              # Connection refused to Alist
ETIMEDOUT                 # Timeout waiting for Alist
❌ Credential initialization error
Error: Failed to get secret
Alist authentication failed after 2 attempts
```

---

### Step 4: Test Health Check Endpoint

```bash
curl https://arsipankabaru-XXXXX.asia-southeast1.run.app/api/heartbeat
```

**Expected Response** (HTTP 200):
```json
{
  "status": "alive",
  "version": "2.0.1-fixed"
}
```

**Verification**:
- [ ] HTTP Status: 200 (OK)
- [ ] Response includes "status": "alive"
- [ ] Response time < 1 second
- [ ] No errors in logs after request

---

### Step 5: Test Stats Endpoint

```bash
curl https://arsipankabaru-XXXXX.asia-southeast1.run.app/api/stats/storage
```

**Expected Response** (HTTP 200):
```json
{
  "zones": [
    {
      "zona_id": "01",
      "total_files": 1179,
      "total_size": "50.5 GB"
    },
    {
      "zona_id": "02",
      "total_files": 245,
      "total_size": "12.3 GB"
    }
    // ... more zones
  ]
}
```

**Critical Verification**:
- [ ] HTTP Status: 200 (OK)
- [ ] `total_files > 0` for at least one zone (not 0/0)
- [ ] `total_size > 0` for at least one zone
- [ ] Zone data matches database records
- [ ] Response time < 2 seconds
- [ ] No database errors in logs

**If Stats Show 0/0**:
1. Check database has files:
   ```sql
   SELECT COUNT(*) as total FROM files;
   ```
   - If count > 0 → Database OK, query issue
   - If count = 0 → Database empty (Terabox sync issue, out of scope)

2. Check Alist logs for 401 errors:
   ```bash
   gcloud run logs read arsipankabaru --limit 500 | grep -i "401\|unauthorized"
   ```
   - If found → Secret Manager password wrong
   - If not found → Database query issue

---

### Step 6: Check for Error Patterns (24-hour window)

```bash
gcloud run logs read arsipankabaru \
  --limit=500 \
  --region=asia-southeast1 \
  --project=arsipanka | grep -E "401|ECONNREFUSED|ETIMEDOUT|Alist login failed"
```

**Expected Result**: (empty - no matches)

**If Errors Found**:
| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Wrong Alist password in Secret Manager | Update `arsip-alist-password` secret |
| ECONNREFUSED | Alist not running | Restart Cloud Run service |
| ETIMEDOUT | Alist too slow | Check Alist resource limits |
| Alist login failed after 2 attempts | Credentials invalid | Verify Secret Manager value matches actual Alist password |

---

### Step 7: Test File Access (Frontend Integration)

If browser endpoint exists (e.g., `/api/files`, `/browser`):

```bash
# Get JWT token (if needed)
TOKEN=$(curl -X POST https://arsipankabaru-XXXXX.asia-southeast1.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password"}' | jq -r '.token')

# Test file listing
curl https://arsipankabaru-XXXXX.asia-southeast1.run.app/api/files \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response**:
```json
{
  "success": true,
  "files": [
    {
      "id": "001",
      "name": "Dokumen001.pdf",
      "zona_id": "01",
      "file_size": 2048,
      "modified_date": "2024-01-15"
    },
    // ... more files
  ]
}
```

**Verification**:
- [ ] HTTP Status: 200 (OK)
- [ ] `files` array not empty
- [ ] File metadata includes names, sizes, dates
- [ ] No 401 errors
- [ ] File count matches database

---

### Step 8: Check Cloud Run Metrics

```bash
# View recent traffic
gcloud run describe arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --format='table(
    status.url,
    status.updateTime,
    metadata.generation,
    spec.template.spec.containers[0].resources.limits.memory,
    spec.template.spec.containers[0].resources.limits.cpu
  )'
```

**Verification**:
- [ ] Memory usage < 512Mi (or allocated limit)
- [ ] CPU usage reasonable (not constantly 100%)
- [ ] Request latency < 500ms (p95)
- [ ] Error rate < 1%
- [ ] Scaling working (instances available)

---

## Logs to Collect for Troubleshooting

If any verification fails, collect these logs:

```bash
# Full initialization logs
gcloud run logs read arsipankabaru --limit 100 --region asia-southeast1 --project arsipanka > logs_init.txt

# Error logs only
gcloud run logs read arsipankabaru --limit 500 --region asia-southeast1 --project arsipanka | grep -i "error\|fail\|warn" > logs_errors.txt

# Alist authentication logs
gcloud run logs read arsipankabaru --limit 500 --region asia-southeast1 --project arsipanka | grep -i "alist\|auth\|login\|401" > logs_alist.txt

# Database connection logs
gcloud run logs read arsipankabaru --limit 500 --region asia-southeast1 --project arsipanka | grep -i "supabase\|database\|db\|query" > logs_db.txt
```

---

## Success Criteria Checklist

- [ ] **Deployment**: Cloud Run service active and accessible
- [ ] **Initialization**: Credentials loaded from SECRET_MANAGER
- [ ] **Health Check**: `/api/heartbeat` returns 200 with proper response
- [ ] **Stats**: `/api/stats/storage` returns file_count > 0
- [ ] **No 401 Errors**: No "401 Unauthorized" in logs
- [ ] **No Timeouts**: No "ECONNREFUSED" or "ETIMEDOUT" errors
- [ ] **File Access**: Files accessible via API (if browser endpoint exists)
- [ ] **Log Quality**: No error patterns, clean startup sequence
- [ ] **Performance**: Response times < 1-2 seconds
- [ ] **Database**: Files table has 1,179+ records

---

## Troubleshooting Guide

### Issue: Service Deployed but Shows 0/0 Files

**Symptom**: `/api/stats/storage` returns `total_files: 0, total_size: 0`

**Investigation**:
1. Check logs for 401 errors:
   ```bash
   gcloud run logs read arsipankabaru --limit 500 | grep "401"
   ```
   - If found → **Fix**: Update Secret Manager password

2. Check database directly:
   ```sql
   SELECT COUNT(*) FROM files;
   -- Should show 1179 or more
   ```
   - If 0 → Database empty (Terabox sync not run)
   - If > 0 → Query issue, check logs for SQL errors

3. Check Alist logs:
   ```bash
   gcloud run logs read arsipankabaru | grep "Alist\|[Operation]"
   ```
   - Look for login attempts and their results

**Resolution**:
- If credentials wrong: Update `arsip-alist-password` in Secret Manager
- If database empty: Run Terabox sync job separately
- If query error: Check server logs for SQL error messages

---

### Issue: "Alist login failed after 2 attempts"

**Symptom**: Logs show retry attempts and eventual failure

**Investigation**:
```bash
# Check Alist password in Secret Manager
gcloud secrets versions access latest --secret="arsip-alist-password" --project=arsipanka

# Verify it matches actual Alist instance password
# (Can only verify manually by logging into Alist web UI)
```

**Resolution**:
1. Login to Alist web UI at http://localhost:5244 (within Cloud Run container)
2. Update Secret Manager with correct password:
   ```bash
   echo "new-password" | gcloud secrets versions add arsip-alist-password --data-file=-
   ```
3. Redeploy Cloud Run to use new secret:
   ```bash
   gcloud run deploy arsipankabaru --region asia-southeast1 --project=arsipanka --source=.
   ```

---

### Issue: "ECONNREFUSED - Connection refused"

**Symptom**: Logs show connection refused to Alist endpoint

**Investigation**:
1. Check if Alist service started:
   ```bash
   gcloud run logs read arsipankabaru | grep "Alist\|START"
   ```

2. Check Alist port is available:
   - Dockerfile should expose port 5244
   - start.sh should start Alist on port 5244

**Resolution**:
1. Check Dockerfile has Alist startup:
   - `RUN alist` installed ✓
   - `EXPOSE 5244` included ✓
2. Check start.sh starts Alist:
   - `alist server` command present ✓
   - Before Node.js backend starts ✓
3. Redeploy:
   ```bash
   gcloud run deploy arsipankabaru --region asia-southeast1 --project=arsipanka --source=.
   ```

---

### Issue: "Secret Manager unavailable"

**Symptom**: Credentials fall back to ENV or FALLBACK

**Investigation**:
```bash
# Check if GCP_PROJECT_ID is set
gcloud run logs read arsipankabaru | grep "GCP_PROJECT_ID"

# Check Secret Manager permissions
gcloud secrets get-iam-policy arsip-alist-password --project=arsipanka
```

**Resolution**:
1. Verify Cloud Run service account has `roles/secretmanager.secretAccessor`:
   ```bash
   gcloud projects get-iam-policy arsipanka \
     --flatten="bindings[].members" \
     --filter="bindings.role:secretmanager.secretAccessor"
   ```
2. If missing, add role:
   ```bash
   gcloud projects add-iam-policy-binding arsipanka \
     --member=serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com \
     --role=roles/secretmanager.secretAccessor
   ```
3. Redeploy

---

## Rollback Instructions (If Needed)

### Rollback to Previous Revision

```bash
# List recent revisions
gcloud run revisions list \
  --service=arsipankabaru \
  --region=asia-southeast1 \
  --project=arsipanka

# Set traffic to previous revision
gcloud run services update-traffic arsipankabaru \
  --region=asia-southeast1 \
  --project=arsipanka \
  --to-revisions=PREVIOUS_REVISION_ID=100

# Verify traffic switched
gcloud run revisions list --service=arsipankabaru --region=asia-southeast1 --project=arsipanka
```

---

## Performance Baseline (Expected Values)

After successful deployment, typical metrics should be:

| Metric | Expected Value |
|--------|-----------------|
| Health Check Response Time | < 100ms |
| Stats Endpoint Response Time | < 500ms |
| Database Query Time | < 200ms |
| Alist Login Time | 1-2 seconds (first time), 0ms (cached) |
| Error Rate | < 0.1% |
| Memory Usage | 200-400Mi |
| CPU Usage | 50-150m (varies with traffic) |
| Concurrent Requests | 1000+ (default Cloud Run scaling) |

---

## Post-Deployment Monitoring

After deployment, monitor for 24-48 hours:

1. **Error Rate**: Should be < 0.1%
2. **Response Times**: Should be consistent (not increasing)
3. **Memory Usage**: Should stabilize within 24h
4. **Log Volume**: Should decrease after initial setup
5. **User Reports**: Check if users can access files

---

## Sign-Off

- **Deployment Date**: ___________________
- **Deployed By**: ___________________
- **Service URL**: https://arsipankabaru-XXXXX.asia-southeast1.run.app
- **All Checks Passed**: [ ] YES [ ] NO
- **Issues Found**: ___________________
- **Resolution**: ___________________

---

