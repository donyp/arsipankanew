# Staging Environment Verification Checklist

**Task**: 6.2 Verify All Requirements in Staging  
**Date**: [FILL IN DATE]  
**Tester**: [FILL IN NAME]  
**Environment**: Cloud Run Staging (asia-southeast1)  
**Service URL**: https://arsipankabaru-[REVISION].asia-southeast1.run.app  

---

## Executive Summary

This checklist verifies all 4 requirements (R1-R4) are working correctly in the staging environment before production deployment. Each requirement has step-by-step verification procedures, expected outputs, and troubleshooting guidance.

**Requirements Verified**:
- ✅ R1: Alist Operational
- ✅ R2: Rclone ↔ Alist Connection
- ✅ R3: File Backup to Alist
- ✅ R4: File Persistence

---

## Table of Contents

1. [Pre-Verification Checklist](#pre-verification-checklist)
2. [R1: Alist Operational](#r1-alist-operational)
3. [R2: Rclone ↔ Alist Connection](#r2-rclone--alist-connection)
4. [R3: File Backup to Alist](#r3-file-backup-to-alist)
5. [R4: File Persistence](#r4-file-persistence)
6. [Summary Table](#summary-table)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Sign-Off](#sign-off)

---

## Pre-Verification Checklist

Before starting detailed verification, ensure:

- [ ] **Staging Service Deployed**: Cloud Run service is in ACTIVE status
  ```bash
  gcloud run describe arsipankabaru \
    --region asia-southeast1 \
    --project=arsipanka
  # Check: Status = "ACTIVE", Revision has recent timestamp
  ```

- [ ] **Backend Running**: Service responds to health check
  ```bash
  STAGING_URL="https://arsipankabaru-[REVISION].asia-southeast1.run.app"
  curl -s "${STAGING_URL}/api/heartbeat"
  # Expected: {"status":"alive","version":"..."}
  ```

- [ ] **Logs Accessible**: Can read Cloud Run logs
  ```bash
  gcloud run logs read arsipankabaru \
    --region asia-southeast1 \
    --project=arsipanka \
    --limit=20
  # Should show recent logs, no errors
  ```

- [ ] **Database Connected**: Supabase is reachable
  ```bash
  curl -s "${STAGING_URL}/api/files/list" \
    -H "Authorization: Bearer [token]"
  # Expected: Returns file list (empty or with files)
  ```

- [ ] **Storage Credentials Loaded**: Logs show successful initialization
  ```bash
  gcloud run logs read arsipankabaru \
    --region asia-southeast1 \
    --project=arsipanka \
    --limit=50 | grep -i "credential\|alist\|rclone"
  # Expected: See messages like:
  # "✅ Storage credentials loaded"
  # "✅ Alist authenticated"
  ```

---

## R1: Alist Operational

**Requirement**: Alist service must be running and accessible on port 5244

### 1.1: Health Endpoint Test

**Procedure**:
```bash
# Test Alist health endpoint
curl -v http://localhost:5244/ 2>&1 | head -20
```

**Expected Output**:
- HTTP status: 200 OK or 301 redirect (to /web/)
- Response includes HTML with "Alist" or redirects to Alist Web UI

**Success Criteria**: ✅ HTTP 200 or 3xx redirect, no timeout or connection refused

**Log Evidence**: Screenshot of curl output

---

### 1.2: Alist Web UI Accessibility

**Procedure**:
```bash
# Open browser to Alist Web UI
# Expected: Alist login page or dashboard
```

**Expected Output**:
- Page title: "Alist"
- Login form or dashboard visible
- CSS/JS loaded correctly (no 404 errors)

**Success Criteria**: ✅ Alist Web UI loads without errors

**Log Evidence**: Screenshot of Alist Web UI

---

### 1.3: Alist Startup Logs

**Procedure**:
```bash
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=100 | grep -i "alist"
```

**Expected Output**:
```
[Alist] ✅ Service initialized on http://localhost:5244
[Alist] Listening on :5244
[Alist] 🚀 Alist daemon started successfully
```

**Success Criteria**: ✅ Logs show Alist started successfully, listening on port 5244

**Log Evidence**: Paste relevant log lines

---

### 1.4: Alist Configuration Verification

**Procedure**:
```bash
# Check Alist config file in logs or via API
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=100 | grep -i "config"
```

**Expected Output**:
```
[Alist] Config loaded from: /app/alist/data/config.json
[Alist] WebDAV mount point: /dav/terabox
[Alist] Terabox storage configured
```

**Success Criteria**: ✅ Config file exists, WebDAV mount configured, no errors

**Log Evidence**: Log lines showing config loaded

---

### 1.5: Database Schema Verification (Alist)

**Procedure**:
```bash
# Verify Alist database has data
# From within container or via Cloud Run shell:
ls -la /app/alist/data/
# Expected: config.json, data.db, log.log exist
```

**Expected Output**:
```
-rw-r--r--  config.json        (bytes)
-rw-r--r--  data.db            (bytes)
drwxr-xr-x  log/
```

**Success Criteria**: ✅ All config/data files present, no errors

**Log Evidence**: Screenshot of file listing

---

### ✅ R1 Verification Result

| Check | Status | Evidence |
|-------|--------|----------|
| Health endpoint (200 OK) | ☐ PASS ☐ FAIL | [Evidence] |
| Web UI accessible | ☐ PASS ☐ FAIL | [Evidence] |
| Startup logs show success | ☐ PASS ☐ FAIL | [Evidence] |
| Config file present | ☐ PASS ☐ FAIL | [Evidence] |
| Data files present | ☐ PASS ☐ FAIL | [Evidence] |
| **R1 OVERALL** | ☐ **PASS** ☐ **FAIL** | |

**Notes**: ___________________________________________________________________________

---

## R2: Rclone ↔ Alist Connection

**Requirement**: Rclone must authenticate and connect to Alist WebDAV endpoint

### 2.1: Rclone Binary Verification

**Procedure**:
```bash
# Check if rclone is available in container
which rclone
rclone --version
```

**Expected Output**:
```
/usr/bin/rclone
rclone v1.60+ (version number may vary)
```

**Success Criteria**: ✅ Rclone installed and accessible

**Log Evidence**: Screenshot of rclone version output

---

### 2.2: Rclone Configuration File

**Procedure**:
```bash
# Verify rclone.conf exists and is readable
ls -la /app/rclone.conf
cat /app/rclone.conf | head -20
```

**Expected Output**:
```
-rw-r--r--  /app/rclone.conf  (file exists and readable)

[terabox]
type = webdav
url = http://localhost:5244/dav/terabox
vendor = other
user = admin
pass = [MASKED]  # Should NOT show actual password
```

**Success Criteria**: ✅ Config file exists, WebDAV type, correct URL and credentials

**Log Evidence**: Paste relevant config lines (mask password)

---

### 2.3: Rclone Authentication Test

**Procedure**:
```bash
# Test Rclone can authenticate to Alist WebDAV
rclone --config /app/rclone.conf lsjson terabox:/
```

**Expected Output**:
- **Success**: JSON array with file list:
```json
[
  {"Path":"file1.pdf","Name":"file1.pdf","Size":1024,"ModTime":"..."},
  {"Path":"file2.pdf","Name":"file2.pdf","Size":2048,"ModTime":"..."}
]
```

- **Partial success** (empty directory):
```json
[]
```

**NOT Expected**:
```
error: 401 Unauthorized
error: gzip: invalid header
error: Connection refused
```

**Success Criteria**: ✅ Returns JSON array (may be empty if no files), no auth/connection errors

**Log Evidence**: Paste JSON response or screenshot

---

### 2.4: Rclone Directory Creation Test

**Procedure**:
```bash
# Test Rclone can create directories
rclone --config /app/rclone.conf mkdir terabox:/test-final
# Verify creation
rclone --config /app/rclone.conf lsjson terabox:/test-final
```

**Expected Output**:
- First command: No error (exit code 0)
- Second command: Returns empty JSON array `[]` or list of subdirectories

**NOT Expected**:
```
error: 401 Unauthorized
error: Permission denied
error: Connection refused
```

**Success Criteria**: ✅ Directory created successfully, no permission errors

**Log Evidence**: Screenshot of mkdir and lsjson commands

---

### 2.5: Rclone File Upload Test

**Procedure**:
```bash
# Create test file
echo "Test content" > /tmp/test-file.txt

# Upload via Rclone
rclone --config /app/rclone.conf copyto \
  /tmp/test-file.txt \
  terabox:/test-final/test-file.txt

# Verify upload
rclone --config /app/rclone.conf lsjson terabox:/test-final/
```

**Expected Output**:
- Upload: No error (exit code 0)
- Listing: File appears in JSON array with correct size

```json
[
  {"Path":"test-file.txt","Name":"test-file.txt","Size":12,"ModTime":"..."}
]
```

**NOT Expected**:
```
error: 401 Unauthorized
error: File exists
error: Connection refused
```

**Success Criteria**: ✅ File uploaded and appears in directory listing

**Log Evidence**: Screenshot of listing showing test file

---

### 2.6: Backend Rclone Connectivity Check

**Procedure**:
```bash
# Check backend logs for Rclone connectivity verification
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=100 | grep -i "rclone\|webdav"
```

**Expected Output**:
```
[Rclone] ✅ WebDAV connection verified
[Rclone] Successfully listed files: 5 files found
[RcloneConfig] Terabox URL: http://localhost:5244/dav/terabox
```

**NOT Expected**:
```
[Rclone] ❌ Connection failed: 401 Unauthorized
error: gzip: invalid header
```

**Success Criteria**: ✅ Backend logs show successful Rclone connection verification

**Log Evidence**: Paste relevant log lines

---

### ✅ R2 Verification Result

| Check | Status | Evidence |
|-------|--------|----------|
| Rclone binary installed | ☐ PASS ☐ FAIL | [Evidence] |
| rclone.conf exists | ☐ PASS ☐ FAIL | [Evidence] |
| Authentication succeeds | ☐ PASS ☐ FAIL | [Evidence] |
| Directory creation works | ☐ PASS ☐ FAIL | [Evidence] |
| File upload works | ☐ PASS ☐ FAIL | [Evidence] |
| Backend verified connection | ☐ PASS ☐ FAIL | [Evidence] |
| **R2 OVERALL** | ☐ **PASS** ☐ **FAIL** | |

**Notes**: ___________________________________________________________________________

---

## R3: File Backup to Alist

**Requirement**: Files uploaded must automatically backup to Terabox via Alist

### 3.1: Upload File via API

**Procedure**:
```bash
# Create test file
echo "Test file content - $(date)" > /tmp/test-document.txt

# Upload via backend API
curl -X POST "${STAGING_URL}/api/files/upload" \
  -F "file=@/tmp/test-document.txt" \
  -F "zona=zona-01" \
  -F "toko=toko-a" \
  -F "category=TEST" \
  -H "Authorization: Bearer [AUTH_TOKEN]"
```

**Expected Output**:
```json
{
  "id": "uuid-12345",
  "filename": "test-document.txt",
  "size": 45,
  "storagePath": "/arsip/zona-01/toko-a/TEST/test-document.txt",
  "synced": false,
  "uploadedAt": "2024-01-15T10:30:45Z"
}
```

**Success Criteria**: ✅ HTTP 200, file ID returned, synced=false initially

**Log Evidence**: Screenshot of API response

---

### 3.2: Background Upload Task Triggers

**Procedure**:
```bash
# Check logs for background upload task start
# Wait 2-3 seconds after upload
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=50 | grep -i "background\|upload"
```

**Expected Output**:
```
[Background Upload] ATTEMPT 1 for test-document.txt
[Background Upload] Rclone command: /usr/bin/rclone copyto /app/data/files/... terabox:/arsip/zona-01/toko-a/TEST/test-document.txt
```

**Success Criteria**: ✅ Log shows background upload started within 1 second of upload

**Log Evidence**: Paste relevant log lines

---

### 3.3: Background Upload Completion

**Procedure**:
```bash
# Wait 10-30 seconds for upload to complete
# Check logs for success message
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=100 | grep -i "background.*success\|background.*failed"
```

**Expected Output** (Success):
```
[Background Upload] SUCCESS for test-document.txt after 1 attempt
[Background Upload] File synced to terabox:/arsip/zona-01/toko-a/TEST/test-document.txt
```

**NOT Expected** (Failure):
```
[Background Upload] FAILED for test-document.txt after 3 attempts: Connection refused
[Background Upload] ERROR: Rclone upload failed
```

**Success Criteria**: ✅ Logs show "SUCCESS" within 60 seconds, no timeout/auth errors

**Log Evidence**: Paste success log lines

---

### 3.4: Database Sync Status Update

**Procedure**:
```bash
# Query database to verify sync status
# Via API or direct database query
curl -s "${STAGING_URL}/api/files/status?id=uuid-12345" \
  -H "Authorization: Bearer [AUTH_TOKEN]"
```

**Expected Output**:
```json
{
  "id": "uuid-12345",
  "filename": "test-document.txt",
  "synced": true,
  "syncedAt": "2024-01-15T10:30:55Z",
  "syncAttempts": 1,
  "syncError": null,
  "storagePath": "/arsip/zona-01/toko-a/TEST/test-document.txt"
}
```

**Success Criteria**: ✅ synced=true, syncAttempts=1, syncError=null

**Log Evidence**: Screenshot of API response

---

### 3.5: Verify File in Terabox Listing

**Procedure**:
```bash
# Verify file appears in Terabox via Rclone listing
rclone --config /app/rclone.conf lsjson terabox:/arsip/zona-01/toko-a/TEST/
```

**Expected Output**:
```json
[
  {
    "Path": "test-document.txt",
    "Name": "test-document.txt",
    "Size": 45,
    "ModTime": "2024-01-15T10:30:55Z"
  }
]
```

**Success Criteria**: ✅ File appears in Terabox directory listing with correct size

**Log Evidence**: Screenshot of listing

---

### 3.6: Error Logging Completeness

**Procedure**:
```bash
# Check logs contain all required error context fields
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=200 | grep -A 5 "ERROR\|FAILED"
```

**Expected Output** (if any errors occurred):
```json
{
  "timestamp": "2024-01-15T10:30:46Z",
  "operation": "Background Upload",
  "filename": "test-document.txt",
  "attempt": 1,
  "maxRetries": 3,
  "errorType": "RCLONE_UPLOAD_FAILED",
  "errorMessage": "Connection timeout",
  "nextRetryIn": "5s"
}
```

**Success Criteria**: ✅ Error logs (if any) contain: filename, attempt count, error type, timestamp

**Log Evidence**: Paste sample error log

---

### 3.7: Retry Logic Test (Optional - Simulate Failure)

**Procedure** (requires manual Alist stop):
```bash
# Stop Alist service to simulate failure
# (This requires container access - may not be possible in Cloud Run)
# OR trigger upload and observe retry behavior in logs

gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=200 | grep "ATTEMPT"
```

**Expected Output** (if retries occurred):
```
[Background Upload] ATTEMPT 1 for test-document.txt: FAILED
[Background Upload] ATTEMPT 2 for test-document.txt: FAILED (retrying in 10s)
[Background Upload] ATTEMPT 3 for test-document.txt: SUCCESS
```

**Success Criteria**: ✅ Retries show exponential backoff (5s → 10s → 20s delays)

**Log Evidence**: Screenshot of retry attempts

---

### ✅ R3 Verification Result

| Check | Status | Evidence |
|-------|--------|----------|
| Upload API returns success | ☐ PASS ☐ FAIL | [Evidence] |
| Background task triggers | ☐ PASS ☐ FAIL | [Evidence] |
| Upload completes successfully | ☐ PASS ☐ FAIL | [Evidence] |
| Database synced flag updated | ☐ PASS ☐ FAIL | [Evidence] |
| File appears in Terabox | ☐ PASS ☐ FAIL | [Evidence] |
| Error logs are complete | ☐ PASS ☐ FAIL | [Evidence] |
| **R3 OVERALL** | ☐ **PASS** ☐ **FAIL** | |

**Notes**: ___________________________________________________________________________

---

## R4: File Persistence

**Requirement**: Files must survive Cloud Run restart/redeployment

### 4.1: Pre-Restart File Upload and Verification

**Procedure**:
```bash
# Upload multiple test files before restart
for i in {1..3}; do
  echo "Test file $i - $(date)" > /tmp/test-persist-$i.txt
  curl -X POST "${STAGING_URL}/api/files/upload" \
    -F "file=@/tmp/test-persist-$i.txt" \
    -F "zona=zona-01" \
    -F "toko=toko-b" \
    -F "category=PERSIST-TEST" \
    -H "Authorization: Bearer [AUTH_TOKEN]"
done

# Wait for all uploads to sync (60 seconds)
echo "Waiting for file sync..."
sleep 60

# List files before restart
curl -s "${STAGING_URL}/api/files/list?zona=zona-01&toko=toko-b" \
  -H "Authorization: Bearer [AUTH_TOKEN]" | jq '.files | length'
```

**Expected Output**:
```
File 1 uploaded: id=uuid-1
File 2 uploaded: id=uuid-2
File 3 uploaded: id=uuid-3
Files synced: 3
File count: 3
```

**Success Criteria**: ✅ All 3 files uploaded and synced (synced=true)

**Log Evidence**: Screenshot of file count and synced status

**Record Pre-Restart State**:
- File 1 ID: ________________
- File 2 ID: ________________
- File 3 ID: ________________
- Total file count: ________
- All synced: ☐ YES ☐ NO

---

### 4.2: Deploy New Revision (Restart)

**Procedure**:
```bash
# Deploy new revision to trigger restart
gcloud run deploy arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --source=. \
  --allow-unauthenticated

# Wait for deployment to complete (5-10 minutes)
# Check status
gcloud run describe arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka | grep -A 2 "Latest Revision\|Status"
```

**Expected Output**:
```
Status: Active
Latest Revision: arsipankabaru-[NEW_REVISION]
Update Status: Successful
```

**Success Criteria**: ✅ Deployment completes successfully, new revision active

**Log Evidence**: Screenshot of deployment status

**Record Post-Restart State**:
- New revision ID: ________________
- Deployment completed at: ________________

---

### 4.3: Post-Restart File Listing

**Procedure**:
```bash
# Query file list after restart
curl -s "${STAGING_URL}/api/files/list?zona=zona-01&toko=toko-b" \
  -H "Authorization: Bearer [AUTH_TOKEN]" | jq '.files'

# Count files
curl -s "${STAGING_URL}/api/files/list?zona=zona-01&toko=toko-b" \
  -H "Authorization: Bearer [AUTH_TOKEN]" | jq '.files | length'
```

**Expected Output**:
```json
[
  {"id":"uuid-1","filename":"test-persist-1.txt","synced":true},
  {"id":"uuid-2","filename":"test-persist-2.txt","synced":true},
  {"id":"uuid-3","filename":"test-persist-3.txt","synced":true}
]
Files: 3
```

**NOT Expected**:
```
[]  # Empty list
Files: 0
Error: Database connection failed
```

**Success Criteria**: ✅ Same file count (3), all files still present

**Log Evidence**: Screenshot of file listing

**Record Post-Restart Files**:
- File count: ________
- All files present: ☐ YES ☐ NO
- All synced=true: ☐ YES ☐ NO

---

### 4.4: File Preview After Restart

**Procedure**:
```bash
# Request preview for each file
for FILE_ID in uuid-1 uuid-2 uuid-3; do
  echo "Testing preview for $FILE_ID"
  curl -s "${STAGING_URL}/api/files/$FILE_ID/preview" \
    -H "Authorization: Bearer [AUTH_TOKEN]" \
    -I  # Show headers only
done
```

**Expected Output**:
```
HTTP/2 200
Content-Type: text/plain
Content-Length: 45

HTTP/2 200
Content-Type: text/plain
Content-Length: 45

HTTP/2 200
Content-Type: text/plain
Content-Length: 45
```

**NOT Expected**:
```
HTTP/2 404  # File not found
HTTP/2 500  # Server error
```

**Success Criteria**: ✅ All previews return HTTP 200, no 404 or 500 errors

**Log Evidence**: Screenshot of preview requests

---

### 4.5: File Verification in Terabox

**Procedure**:
```bash
# Verify files still in Terabox after restart
rclone --config /app/rclone.conf lsjson terabox:/arsip/zona-01/toko-b/PERSIST-TEST/

# Count files
rclone --config /app/rclone.conf lsjson terabox:/arsip/zona-01/toko-b/PERSIST-TEST/ | jq '. | length'
```

**Expected Output**:
```json
[
  {"Path":"test-persist-1.txt","Name":"test-persist-1.txt","Size":...},
  {"Path":"test-persist-2.txt","Name":"test-persist-2.txt","Size":...},
  {"Path":"test-persist-3.txt","Name":"test-persist-3.txt","Size":...}
]
Files: 3
```

**Success Criteria**: ✅ All 3 files present in Terabox, file count matches pre-restart

**Log Evidence**: Screenshot of Terabox file listing

---

### 4.6: Database Integrity After Restart

**Procedure**:
```bash
# Query database to verify metadata consistency
curl -s "${STAGING_URL}/api/files/stats" \
  -H "Authorization: Bearer [AUTH_TOKEN]"

# Or direct database query (if accessible):
# SELECT COUNT(*) as total, COUNT(CASE WHEN synced=true THEN 1 END) as synced FROM files;
```

**Expected Output**:
```json
{
  "total_files": 3,
  "synced_files": 3,
  "failed_syncs": 0,
  "pending_syncs": 0,
  "total_size_bytes": 135
}
```

**Success Criteria**: ✅ All files present, all synced, no pending/failed syncs

**Log Evidence**: Screenshot of statistics

---

### 4.7: Deployment Logs for Errors

**Procedure**:
```bash
# Check deployment logs for any errors during restart
gcloud run logs read arsipankabaru \
  --region asia-southeast1 \
  --project=arsipanka \
  --limit=500 | grep -i "error\|fatal\|crash\|died" | head -20
```

**Expected Output**:
```
# Should be mostly empty or contain only non-critical warnings
```

**NOT Expected**:
```
[FATAL] Database connection lost
[ERROR] Files corrupted during restart
[CRASH] Unexpected signal received
```

**Success Criteria**: ✅ No critical errors in logs

**Log Evidence**: Screenshot showing log search (or "no errors found")

---

### ✅ R4 Verification Result

| Check | Status | Evidence |
|-------|--------|----------|
| Pre-restart files uploaded | ☐ PASS ☐ FAIL | [Evidence] |
| Deployment completes successfully | ☐ PASS ☐ FAIL | [Evidence] |
| Post-restart file count matches | ☐ PASS ☐ FAIL | [Evidence] |
| All files still accessible | ☐ PASS ☐ FAIL | [Evidence] |
| File preview works | ☐ PASS ☐ FAIL | [Evidence] |
| Files in Terabox verified | ☐ PASS ☐ FAIL | [Evidence] |
| No critical deployment errors | ☐ PASS ☐ FAIL | [Evidence] |
| **R4 OVERALL** | ☐ **PASS** ☐ **FAIL** | |

**Notes**: ___________________________________________________________________________

---

## Summary Table

### Overall Verification Status

| Requirement | Component | Status | Issues Found |
|-------------|-----------|--------|--------------|
| R1 | Alist Operational | ☐ PASS ☐ FAIL | ________________ |
| R2 | Rclone ↔ Alist Connection | ☐ PASS ☐ FAIL | ________________ |
| R3 | File Backup to Alist | ☐ PASS ☐ FAIL | ________________ |
| R4 | File Persistence | ☐ PASS ☐ FAIL | ________________ |

### Checklist Summary

**Pre-Verification**: ☐ All checks passed

**R1 Verification**:
- ☐ Health endpoint responsive
- ☐ Web UI accessible
- ☐ Startup logs show success
- ☐ Config files present
- ☐ All checks PASSED / SOME FAILED

**R2 Verification**:
- ☐ Rclone installed
- ☐ Config file exists
- ☐ Authentication succeeds
- ☐ Directory operations work
- ☐ File operations work
- ☐ Backend verified connection
- ☐ All checks PASSED / SOME FAILED

**R3 Verification**:
- ☐ Upload API works
- ☐ Background tasks trigger
- ☐ Upload completes
- ☐ Database updated
- ☐ File in Terabox
- ☐ Logs complete
- ☐ All checks PASSED / SOME FAILED

**R4 Verification**:
- ☐ Pre-restart upload successful
- ☐ Deployment completes
- ☐ Post-restart files present
- ☐ File preview works
- ☐ Terabox verified
- ☐ Database integrity maintained
- ☐ No critical errors
- ☐ All checks PASSED / SOME FAILED

---

### Test Artifacts and Screenshots

**Location**: Collect all screenshots and evidence in this section.

#### R1 Artifacts:
- [ ] Curl health endpoint response
- [ ] Alist Web UI screenshot
- [ ] Startup logs screenshot
- [ ] File listing screenshot

#### R2 Artifacts:
- [ ] Rclone version output
- [ ] Config file content (masked)
- [ ] Authentication test output
- [ ] Directory listing output
- [ ] File upload screenshot

#### R3 Artifacts:
- [ ] Upload API response
- [ ] Background upload logs
- [ ] Database status query
- [ ] Terabox listing
- [ ] Error log sample (if any)

#### R4 Artifacts:
- [ ] Pre-restart file list
- [ ] Deployment status
- [ ] Post-restart file list
- [ ] Preview request responses
- [ ] Terabox persistence verification
- [ ] Database integrity check

---

## Troubleshooting Guide

### Issue 1: Alist Service Unreachable (R1)

**Symptoms**:
- `curl http://localhost:5244/` returns "Connection refused"
- Logs show "ECONNREFUSED" or "Port 5244 not listening"

**Root Causes**:
1. Alist process not started
2. Port 5244 already in use by another service
3. Alist crashed during startup
4. Container doesn't have port 5244 exposed

**Diagnostic Steps**:
```bash
# Check if Alist process is running
ps aux | grep -i alist

# Check if port 5244 is listening
netstat -tuln | grep 5244
lsof -i :5244

# Check Alist logs
tail -100 /app/alist/data/log/log.log

# Check Cloud Run logs for Alist errors
gcloud run logs read arsipankabaru --limit=200 | grep -i "alist\|error"
```

**Fix Recommendations**:
1. **Alist not starting**: Check startup script in backend/server.js, verify binary exists at `alist/alist.exe`
2. **Port in use**: Kill existing process: `kill -9 $(lsof -t -i :5244)` or use different port
3. **Alist crashed**: Check `alist/data/log/log.log` for crash reason
4. **Not exposed**: Verify Dockerfile exposes port 5244: `EXPOSE 5244`

**Resolution Checklist**:
- [ ] Alist binary exists and is executable
- [ ] Port 5244 is not in use
- [ ] Container startup script includes Alist initialization
- [ ] Alist logs show successful startup
- [ ] Health endpoint responds

---

### Issue 2: Rclone Authentication Failed (R2)

**Symptoms**:
- `rclone lsjson terabox:/` returns "401 Unauthorized"
- Logs show "gzip: invalid header"

**Root Causes**:
1. Wrong Alist admin password in rclone.conf
2. Alist WebDAV endpoint not properly configured
3. Rclone.conf syntax error
4. Alist WebDAV not mounted for Terabox

**Diagnostic Steps**:
```bash
# Verify rclone.conf exists and is readable
cat /app/rclone.conf

# Test authentication with verbose output
rclone --config /app/rclone.conf lsjson terabox:/ -vv 2>&1 | head -30

# Check Alist config for WebDAV settings
cat /app/alist/data/config.json | grep -i webdav

# Check Alist logs for auth attempts
tail -50 /app/alist/data/log/log.log | grep -i "auth\|login\|webdav"
```

**Fix Recommendations**:
1. **Wrong password**: Verify Alist admin password matches in Secret Manager
   ```bash
   # Check current password source
   gcloud secrets versions access latest --secret="arsip-alist-password"
   ```

2. **Config syntax error**: Check rclone.conf format
   ```bash
   rclone config show  # Shows parsed config
   ```

3. **WebDAV not mounted**: Check Alist config.json includes WebDAV mount for Terabox
   ```bash
   cat /app/alist/data/config.json | jq '.storage | select(.mount_path == "/dav")'
   ```

**Resolution Checklist**:
- [ ] Rclone.conf syntax is valid
- [ ] Alist admin password matches Secret Manager
- [ ] WebDAV endpoint URL is correct (http://localhost:5244/dav/terabox)
- [ ] Rclone can list directory without auth errors
- [ ] Rclone config parsed correctly (rclone config show)

---

### Issue 3: Background Upload Fails (R3)

**Symptoms**:
- Upload API returns success, but file not in Terabox
- Logs show "[Background Upload] FAILED for {filename}"
- Database shows synced=false after 60 seconds

**Root Causes**:
1. Rclone upload command failed (covered in Issue 2)
2. File not saved to local storage before upload
3. Rclone timeout (file too large, network slow)
4. Terabox account quota exceeded

**Diagnostic Steps**:
```bash
# Check local file exists
ls -la /app/data/files/{uuid}/{filename}

# Check background upload logs
gcloud run logs read arsipankabaru --limit=500 | grep -B2 -A2 "Background Upload"

# Check for timeout errors
gcloud run logs read arsipankabaru --limit=500 | grep -i "timeout\|ETIMEDOUT"

# Check database for sync error
# SELECT sync_error FROM files WHERE id = '{file_id}';
curl -s "${STAGING_URL}/api/files/{id}/status" -H "Authorization: Bearer [TOKEN]"
```

**Fix Recommendations**:
1. **Local file not saved**: Check disk space: `df -h /app/data/`
   ```bash
   # If low on space, clean up old files
   du -sh /app/data/files/
   ```

2. **Rclone timeout**: Increase timeout in rclone_wrapper.js
   ```bash
   # Check current timeout setting
   grep -n "timeout\|maxRetries" backend/rclone_wrapper.js
   ```

3. **File too large**: Verify file size is reasonable
   ```bash
   # Check uploaded file size
   ls -lh /app/data/files/{uuid}/{filename}
   ```

4. **Terabox quota exceeded**: Check Terabox account storage usage in Terabox Web UI

**Resolution Checklist**:
- [ ] Local file exists and is readable
- [ ] Disk space available (> 1GB free)
- [ ] Rclone timeout is reasonable (30-60 seconds)
- [ ] Rclone can upload small test file successfully
- [ ] Terabox account has available space

---

### Issue 4: File Not Persisting After Restart (R4)

**Symptoms**:
- Files exist before restart
- After deployment/restart, file count is 0 or less than before
- File preview returns 404

**Root Causes**:
1. Persistent volume not mounted on Cloud Run
2. Database not persisted (separate issue from files)
3. Files deleted during deployment
4. File metadata not restored from database

**Diagnostic Steps**:
```bash
# Check if persistent volume is mounted
df -h | grep "/app/data"
mount | grep "/app/data"

# Check file count before restart
curl -s "${STAGING_URL}/api/files/list" | jq '.files | length'

# After restart, check again
curl -s "${STAGING_URL}/api/files/list" | jq '.files | length'

# Check Terabox to verify files still there
rclone --config /app/rclone.conf lsjson terabox:/arsip/ | jq '. | length'

# Check database for file metadata
# SELECT COUNT(*) FROM files;
```

**Fix Recommendations**:
1. **Persistent volume not mounted**: 
   ```bash
   # Check Cloud Run deployment config
   gcloud run describe arsipankabaru --region asia-southeast1 | grep -i "volume\|mount"
   
   # Deploy with persistent volume
   gcloud run deploy arsipankabaru \
     --region asia-southeast1 \
     --source=. \
     --volumes mount-path=/app/data,name=data \
     --volume-mounts /app/data
   ```

2. **Database not persisted**: Ensure Supabase database URL is set and accessible
   ```bash
   echo $SUPABASE_URL
   # Should not be empty
   ```

3. **Strategy**: Use Terabox as source of truth - after sync, stream files from Terabox instead of local storage

**Resolution Checklist**:
- [ ] Persistent volume mounted at /app/data
- [ ] Database connection working post-restart
- [ ] Files in Terabox verified
- [ ] File metadata restored from database
- [ ] File preview works post-restart

---

### Issue 5: "gzip: invalid header" Error (R2, R3)

**Symptoms**:
- Rclone command fails with: `error when trying to read error from body: gzip: invalid header`
- Logs show Rclone trying to parse HTML as gzip response

**Root Cause**:
- Alist WebDAV endpoint is returning HTML (error page) instead of WebDAV response
- Usually indicates Alist service crashed or returned 500 error

**Diagnostic Steps**:
```bash
# Test HTTP response from Alist directly
curl -v http://localhost:5244/dav/terabox/ 2>&1 | head -20

# Check if Alist is returning error page
curl -s http://localhost:5244/dav/terabox/ | file -

# Check Alist process status
ps aux | grep -i alist

# Check Alist logs for errors
tail -50 /app/alist/data/log/log.log | grep -i error
```

**Fix Recommendations**:
1. **Alist service crashed**: Restart container
   ```bash
   gcloud run deploy arsipankabaru --region asia-southeast1 --source=.
   ```

2. **Alist WebDAV not properly configured**: Check config.json
   ```bash
   cat /app/alist/data/config.json | jq '.storage[]'
   ```

3. **Port 5244 responding but not with WebDAV**: Verify Alist startup completed
   ```bash
   # Wait 10 seconds and retry
   sleep 10
   rclone --config /app/rclone.conf lsjson terabox:/
   ```

**Resolution Checklist**:
- [ ] Alist process is running (ps aux | grep alist)
- [ ] Port 5244 is listening (netstat -tuln | grep 5244)
- [ ] Alist logs show no errors
- [ ] HTTP response is 200 (curl -I http://localhost:5244/dav/terabox/)
- [ ] Rclone can list files successfully

---

### Issue 6: Database Connection Failed

**Symptoms**:
- Upload API returns 500 error
- Logs show "Supabase connection error"
- File metadata not saved

**Root Causes**:
1. SUPABASE_URL or SUPABASE_KEY not set
2. Supabase service down or unreachable
3. Database table doesn't exist (schema not migrated)
4. Row-level security (RLS) policy blocking inserts

**Diagnostic Steps**:
```bash
# Check environment variables
echo $SUPABASE_URL
echo $SUPABASE_KEY

# Test Supabase connection
curl -X GET "$SUPABASE_URL/rest/v1/files?limit=1" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "apikey: $SUPABASE_KEY"

# Check database schema
# SELECT * FROM information_schema.tables WHERE table_name = 'files';

# Check backend logs for Supabase errors
gcloud run logs read arsipankabaru --limit=200 | grep -i supabase
```

**Fix Recommendations**:
1. **Missing environment variables**: Set in Cloud Run
   ```bash
   gcloud run services update arsipankabaru \
     --region asia-southeast1 \
     --update-env-vars SUPABASE_URL=<url>,SUPABASE_KEY=<key>
   ```

2. **Database table missing**: Create table via Supabase CLI or UI
   ```sql
   CREATE TABLE IF NOT EXISTS files (
     id UUID PRIMARY KEY,
     filename VARCHAR(255),
     size BIGINT,
     synced BOOLEAN DEFAULT FALSE,
     synced_at TIMESTAMP,
     sync_attempts INTEGER DEFAULT 0,
     sync_error TEXT,
     uploaded_at TIMESTAMP DEFAULT NOW()
   );
   ```

3. **RLS policy blocking inserts**: Check policy settings in Supabase console

**Resolution Checklist**:
- [ ] Environment variables set and non-empty
- [ ] Supabase project is active
- [ ] Database table "files" exists
- [ ] RLS policies allow authenticated inserts
- [ ] Database connection test succeeds

---

## Sign-Off

### Verification Conducted By

- **Tester Name**: _______________________________
- **Date**: _______________________________
- **Time**: _____________ to _____________
- **Environment**: Cloud Run Staging (asia-southeast1)
- **Service URL**: https://arsipankabaru-[REVISION].asia-southeast1.run.app

### Verification Results

**Overall Status**: ☐ **ALL PASS** ☐ **SOME FAIL** ☐ **MAJOR FAIL**

**Summary of Findings**:

_____________________________________________________________________________

_____________________________________________________________________________

_____________________________________________________________________________

### Requirements Sign-Off

| Requirement | Status | Sign-Off |
|-------------|--------|----------|
| R1: Alist Operational | ☐ PASS ☐ FAIL | _________________ |
| R2: Rclone ↔ Alist Connection | ☐ PASS ☐ FAIL | _________________ |
| R3: File Backup to Alist | ☐ PASS ☐ FAIL | _________________ |
| R4: File Persistence | ☐ PASS ☐ FAIL | _________________ |

### Issues Found

| Issue ID | Description | Severity | Status | Owner |
|----------|-------------|----------|--------|-------|
| 1 | | ☐ CRITICAL ☐ HIGH ☐ MEDIUM ☐ LOW | ☐ NEW ☐ IN PROGRESS ☐ RESOLVED | |
| 2 | | ☐ CRITICAL ☐ HIGH ☐ MEDIUM ☐ LOW | ☐ NEW ☐ IN PROGRESS ☐ RESOLVED | |
| 3 | | ☐ CRITICAL ☐ HIGH ☐ MEDIUM ☐ LOW | ☐ NEW ☐ IN PROGRESS ☐ RESOLVED | |

### Approval for Production Deployment

**Can this build be deployed to production?**

- [ ] **YES** - All requirements verified, no critical issues, ready for production
- [ ] **NO** - Issues found, needs investigation/fixes before production deployment
- [ ] **CONDITIONAL** - Some tests failed but issues are non-blocking (document exceptions)

**Exception Justification** (if conditional):

_____________________________________________________________________________

_____________________________________________________________________________

### Approvers

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | | _________________ | _________ |
| DevOps Lead | | _________________ | _________ |
| Product Manager | | _________________ | _________ |

---

## Appendix A: Command Reference

### Quick Verification Commands

```bash
# 1. Check deployment status
gcloud run describe arsipankabaru --region asia-southeast1 --project=arsipanka | grep -E "Status|Latest Revision"

# 2. Test Alist health
curl -s http://localhost:5244/ | head -5

# 3. Test Rclone connectivity
rclone --config /app/rclone.conf lsjson terabox:/ | head -5

# 4. Check backend logs
gcloud run logs read arsipankabaru --region asia-southeast1 --project=arsipanka --limit=50

# 5. Upload test file via API
curl -X POST "https://STAGING_URL/api/files/upload" \
  -F "file=@/path/to/test.txt" \
  -F "zona=zona-01" \
  -F "toko=toko-a" \
  -F "category=TEST" \
  -H "Authorization: Bearer [TOKEN]"

# 6. List synced files
curl -s "https://STAGING_URL/api/files/list" | jq '.files[] | select(.synced==true)'

# 7. Check database stats
curl -s "https://STAGING_URL/api/files/stats" -H "Authorization: Bearer [TOKEN]"
```

### Environment Variables Needed

```bash
# Set these before running commands
export STAGING_URL="https://arsipankabaru-[REVISION].asia-southeast1.run.app"
export GCP_PROJECT="arsipanka"
export GCP_REGION="asia-southeast1"
export AUTH_TOKEN="[Your Bearer Token]"
```

### Useful Diagnostic Commands

```bash
# Check if Alist is running
ps aux | grep -i alist

# Check if port 5244 is listening
netstat -tuln | grep 5244
lsof -i :5244

# View Alist logs
tail -f /app/alist/data/log/log.log

# View Rclone config
cat /app/rclone.conf

# List files in Terabox
rclone --config /app/rclone.conf lsjson terabox:/arsip/

# Test file upload with Rclone
echo "test" > /tmp/test.txt
rclone --config /app/rclone.conf copyto /tmp/test.txt terabox:/test-final/test.txt

# Check disk usage
df -h /app
du -sh /app/data/

# Database query (if accessible)
# SELECT COUNT(*) as total_files, COUNT(CASE WHEN synced=true THEN 1 END) as synced FROM files;
```

---

## Appendix B: Log Sample Analysis

### Expected Success Log Pattern

```
[INIT] 🚀 Starting Arsip Backend...
[INIT] Loading environment variables...
[INIT] ✅ Database connected to Supabase
[SecretManager] Fetching credentials from Secret Manager...
[SecretManager] ✅ Alist password loaded from SECRET_MANAGER
[INIT] Spawning Alist service...
[Alist] ✅ Service initialized on http://localhost:5244
[Alist] Listening on :5244
[RcloneConfig] Generated rclone.conf from environment variables
[RcloneConfig] Terabox URL: http://localhost:5244/dav/terabox
[RcloneConfig] Config written to: /app/rclone.conf
[Rclone] Testing WebDAV connectivity...
[Rclone] ✅ WebDAV connection verified
[Rclone] Successfully listed files: 0 files found
[Backend] ✅ Backend listening on 0.0.0.0:7860
```

### Expected Upload Success Log Pattern

```
POST /api/files/upload
[Upload] Received file: invoice-001.pdf (45 KB)
[Upload] Saving to: /app/data/files/uuid-123/invoice-001.pdf
[Upload] ✅ File saved locally
[Upload] Inserting metadata to database...
[Upload] ✅ File metadata saved (id: uuid-123)
[Upload] 📤 Queuing background upload task...
[Upload] ✅ Background task queued
HTTP 200 OK - File uploaded successfully

[Background Upload] ATTEMPT 1 for invoice-001.pdf
[Background Upload] Executing: rclone copyto /app/data/files/uuid-123/invoice-001.pdf terabox:/arsip/zona-01/toko-a/PPN/invoice-001.pdf
[Background Upload] ✅ SUCCESS for invoice-001.pdf after 1 attempt
[Background Upload] Updating database: synced=true
[Background Upload] ✅ File metadata updated
```

### Expected Error Log Pattern (with Retry)

```
[Background Upload] ATTEMPT 1 for invoice-001.pdf
[Background Upload] Error: Connection refused (ECONNREFUSED)
[Background Upload] ⚠️ Transient error, retrying in 5s...

[Background Upload] ATTEMPT 2 for invoice-001.pdf (after 5s delay)
[Background Upload] Error: Connection refused (ECONNREFUSED)
[Background Upload] ⚠️ Transient error, retrying in 10s...

[Background Upload] ATTEMPT 3 for invoice-001.pdf (after 10s delay)
[Background Upload] ✅ SUCCESS for invoice-001.pdf after 3 attempts
```

---

## Appendix C: Acceptance Criteria Details

### R1: Alist Operational - Full Criteria

✅ `curl http://localhost:5244/` returns 200 OK or redirect to Alist UI  
✅ Alist Web UI loads successfully at `http://localhost:5244/`  
✅ Alist admin login succeeds with credentials  
✅ `GET /api/public/settings` endpoint responds with Alist configuration  
✅ Cloud Run logs show no "Alist" errors or crashes  
✅ Alist health check logs show initialization completed  

### R2: Rclone ↔ Alist Connection - Full Criteria

✅ `rclone lsjson --config rclone.conf terabox:/arsip` returns file list (JSON)  
✅ No "401 Unauthorized" errors in output  
✅ No "gzip: invalid header" errors in logs  
✅ WebDAV URL in rclone.conf matches Alist configuration  
✅ `rclone mkdir --config rclone.conf terabox:/test-dir` succeeds  
✅ `rclone copyto test.txt --config rclone.conf terabox:/test.txt` succeeds  

### R3: File Backup to Alist - Full Criteria

✅ `/api/files/upload` endpoint completes within 30 seconds  
✅ Background upload task starts within 1 second of local upload  
✅ Rclone backup completes within 60 seconds (or queues for retry)  
✅ Logs show: `[Background Upload] SUCCESS for {filename}`  
✅ File appears in Terabox within 2 minutes of upload  
✅ Retry logic works: Failed backups retry up to 3 times with exponential backoff  
✅ Error logs include: retry count, error message, timestamp, filename  

### R4: File Persistence - Full Criteria

✅ After deploying new Cloud Run revision, files still accessible  
✅ File listing shows same file count before and after restart  
✅ File preview works post-restart  
✅ No "file not found" errors when accessing previously uploaded files  
✅ Terabox integration verified: Files listed in Terabox Web UI  

---

## Appendix D: Deployment Checklist

Before deploying to production, verify:

- [ ] All R1-R4 requirements verified in staging
- [ ] No critical issues found during verification
- [ ] All logs reviewed and no concerning patterns observed
- [ ] File persistence tested (restart/redeployment)
- [ ] Error handling and retry logic verified
- [ ] Performance meets requirements:
  - [ ] Upload endpoint: < 30 seconds
  - [ ] Background sync: < 60 seconds
  - [ ] File sync latency: < 2 minutes
- [ ] Secret Manager configured with correct credentials
- [ ] Persistent volume mounted on Cloud Run
- [ ] Database schema verified
- [ ] Monitoring/alerts configured for failures
- [ ] Documentation updated for ops team
- [ ] Rollback plan in place
- [ ] Team members trained on troubleshooting

---

**END OF VERIFICATION CHECKLIST**

For questions or issues, contact: [SUPPORT EMAIL/SLACK]
