# Implementation Plan: Alist Storage Integration Fix

## Notes

This implementation plan follows a wave-based execution approach with diagnostic tasks first, followed by core fixes, retry logic implementation, comprehensive testing, and final deployment verification. Each phase builds on previous work with integration checkpoints to ensure reliability.

## Overview

This implementation plan provides a structured approach to fix file sync failures to Terabox via Alist. The workflow addresses root causes in order:
1. Diagnose Alist service connectivity and configuration issues
2. Verify Rclone WebDAV connection to Alist
3. Implement reliable background upload with retry logic
4. Ensure file persistence across Cloud Run restarts
5. Deploy and verify end-to-end flow

Each task builds incrementally on previous steps with integration checkpoints to validate progress.

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2"],
      "description": "Diagnosis - Investigate Alist and Rclone connectivity issues"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3"],
      "description": "Fix Core Issues - Startup configuration and service initialization"
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "3.3"],
      "description": "Implement Background Upload - Retry logic and error handling"
    },
    {
      "wave": 4,
      "tasks": ["4.1", "4.2"],
      "description": "Write Tests - Unit and property-based tests for correctness"
    },
    {
      "wave": 5,
      "tasks": ["5.1", "5.2", "5.3"],
      "description": "Integration Testing - End-to-end flow and persistence"
    },
    {
      "wave": 6,
      "tasks": ["6.1", "6.2"],
      "description": "Deployment - Cloud Run deployment and verification"
    },
    {
      "wave": 7,
      "tasks": ["7"],
      "description": "Final Checkpoint - All acceptance criteria verified"
    }
  ]
}
```

---

## Tasks

### Phase 1: Diagnosis

- [x] 1.1 Investigate Alist Service Connectivity
  - Check if Alist process is running: `ps aux | grep alist`
  - Verify Alist binary location: `file alist/alist.exe`
  - Check if port 5244 is listening: `netstat -tuln | grep 5244` or `lsof -i :5244`
  - Test HTTP connectivity: `curl -v http://localhost:5244/`
  - Check Alist logs: `tail -50 alist/data/log/log.log`
  - Investigate startup errors or crashes in logs
  - Document findings: reachability, port status, error messages
  - _Requirements: R1_

- [x] 1.2 Investigate Rclone WebDAV Connection
  - Verify rclone.conf exists at expected path: `file rclone.conf`
  - Check rclone.conf configuration: `cat rclone.conf` (verify URL, credentials, vendor type)
  - Test rclone connectivity: `rclone --config rclone.conf lsjson terabox:/`
  - Capture error output: Check for "gzip: invalid header", "401 Unauthorized", "Connection refused"
  - Test rclone directory creation: `rclone --config rclone.conf mkdir terabox:/test-dir`
  - Document Rclone version: `rclone --version`
  - Identify root cause: Is it Alist unreachable? Auth failure? Configuration mismatch?
  - _Requirements: R2_

---

### Phase 2: Fix Core Issues

- [x] 2.1 Create Alist Startup Handler
  - Add Alist startup logic to backend/server.js (before Node.js server starts)
  - Spawn Alist process: `spawn('alist/alist.exe', ['server'])` (Windows) or `spawn('alist', ['server'])` (Linux)
  - Wait for Alist to bind to port 5244 (max 10 second timeout)
  - Verify HTTP health check succeeds: `curl http://localhost:5244/`
  - Log startup status: "[Alist] ✅ Service initialized on http://localhost:5244"
  - On startup failure: Log clear error and exit container with status 1
  - Handle error cases: Port already in use (EADDRINUSE), permission denied (EACCES), config error
  - _Requirements: R1_

- [x] 2.2 Implement Rclone Connectivity Verification
  - Add Rclone connection check during backend initialization
  - Execute: `rclone --config rclone.conf lsjson terabox:/` (should return JSON file list)
  - Parse Rclone output: Distinguish success (JSON parsed), auth failure (401), unreachable (connection error)
  - Log result: "[Rclone] ✅ WebDAV connection verified" or "[Rclone] ❌ Connection failed"
  - On auth failure: Log which credential failed (check rclone.conf against Alist admin account)
  - On unreachable: Log "Cannot reach Alist on localhost:5244" and check Alist process
  - Store connection status in memory for health checks
  - _Requirements: R2_

- [x] 2.3 Add Backend Initialization Sequence
  - Update backend/server.js startup to run in order:
    1. Load environment variables (PORT, GCP_PROJECT_ID, SUPABASE_URL)
    2. Initialize Secret Manager client (if GCP_PROJECT_ID set)
    3. Load Alist admin password from Secret Manager or env var
    4. Start Alist service (task 2.1)
    5. Verify Rclone connectivity (task 2.2)
    6. Initialize Rclone credential handler (existing secretManager.js)
    7. Start Node.js server on PORT (7860)
  - Add startup banner: "[Backend] 🚀 Starting Arsip Backend..."
  - Log each stage completion: "[Stage] ✅ Complete"
  - Exit with status 1 if any critical stage fails
  - _Requirements: R1, R2_

---

### Phase 3: Background Upload Implementation

- [x] 3.1 Implement Exponential Backoff Retry Logic
  - Create utility function: `getRetryDelay(attemptNumber, baseDelay = 5000)`
  - Implement formula: `delay = baseDelay * (2 ^ (attemptNumber - 1))`
  - Example: attempt 1 → 5s, attempt 2 → 10s, attempt 3 → 20s
  - Create retry wrapper function: `retryWithBackoff(fn, maxAttempts = 3, shouldRetry = defaultClassifier)`
  - Implement error classification: `shouldRetryError(error)` → true for transient, false for permanent
  - Transient errors: ETIMEDOUT, ECONNREFUSED, EAI_AGAIN, EHOSTUNREACH
  - Permanent errors: 401 Unauthorized, Invalid credentials, Wrong path
  - Return retry metadata: `{success, attempts, totalDelay, lastError}`
  - _Requirements: R3_

- [x] 3.2 Enhance Background Upload Task with Retry Logic
  - Modify backend/rclone_wrapper.js `uploadInBackground()` function
  - Wrap Rclone execution with retry logic from task 3.1
  - For each attempt:
    - Log: `[Background Upload] ATTEMPT {n} for {filename}`
    - Execute Rclone upload
    - Capture stderr and classify error
  - On success after retry: Log `[Background Upload] SUCCESS for {filename} after {attempts} attempts`
  - On failure after all retries: Log `[Background Upload] FAILED for {filename} after {attempts} attempts: {error}`
  - Update database field: `syncAttempts` with final attempt count
  - Update database field: `syncError` with last error message
  - _Requirements: R3_

- [x] 3.3 Implement Comprehensive Error Logging
  - Create StorageErrorLogger class in backend/storageErrorLogger.js
  - Implement method: `logOperation(operation, details)`
  - Log JSON-formatted context: timestamp, operation, filename, error type, attempt, stack trace
  - Implement method: `logError(operation, error, context)`
  - Include error classification in logs: TRANSIENT vs PERMANENT
  - Add suggestion/remediation hints in error logs
  - Examples:
    - "gzip: invalid header" → Suggestion: "Verify Alist WebDAV is responding correctly, check Alist health endpoint"
    - "401 Unauthorized" → Suggestion: "Check rclone.conf credentials match Alist admin account"
    - "ECONNREFUSED" → Suggestion: "Verify Alist service is running on localhost:5244, check port conflicts"
  - Write logs to: `console.log()` (captured by Cloud Run) and optional file: `backend/storage-errors.log`
  - _Requirements: R3_

---

### Phase 4: Write Tests

- [x]* 4.1 Write Unit Tests for Background Upload and Retry Logic
  - Create backend/tests/background-upload.test.js
  - Mock Rclone spawn/exec to simulate success/failure scenarios
  - Test 1: Successful upload on first attempt
    - Assert: Success status, 1 attempt, 0 delay
  - Test 2: Success after transient error on attempt 2
    - Simulate: First call fails with ETIMEDOUT, second succeeds
    - Assert: Success status, 2 attempts, ~5s delay between attempts
  - Test 3: Failure after 3 transient errors
    - Simulate: All 3 attempts fail with ECONNREFUSED
    - Assert: Failure status, 3 attempts, no retry on permanent errors
  - Test 4: Permanent error no retry (single attempt)
    - Simulate: 401 Unauthorized error
    - Assert: Failure status, 1 attempt (no retry)
  - Test 5: Error logging contains all fields
    - Assert: Log entries include timestamp, filename, error type, attempt count, stack trace
  - Run tests: `npm test backend/tests/background-upload.test.js`
  - _Requirements: R3_

- [x]* 4.2 Write Property-Based Tests for Correctness Properties
  - Create backend/tests/properties.test.js using fast-check library
  - Property 1: Background Task Timing (Property 1 from Design)
    - Generate random file uploads across concurrent tasks
    - Assert: Task start time - upload complete time ≤ 1000ms
  - Property 2: Exponential Backoff (Property 2 from Design)
    - Generate various failure scenarios (different attempt numbers)
    - Assert: Each delay = previous delay * 2, starting from 5s
  - Property 3: Error Logging Completeness (Property 3 from Design)
    - Generate random errors with varying contexts
    - Assert: All logs contain required fields (filename, errorType, timestamp, attempt)
  - Property 4: Terabox Queryability (Property 4 from Design)
    - Generate random filenames/content, mock Rclone responses
    - Assert: After successful upload, file appears in directory listing
  - Property 5: Post-Restart Persistence (Property 5 from Design)
    - Simulate restart cycle (save → shutdown → restart → query)
    - Assert: Files accessible before and after restart
  - Run tests: `npm test backend/tests/properties.test.js -- --run` (single execution)
  - _Requirements: R3, R4_

---

### Phase 5: Integration Testing

- [x] 5.1 End-to-End Upload Flow Test
  - Create backend/tests/e2e-upload.test.js
  - Setup: Start backend server, verify Alist and Rclone initialized
  - Test flow:
    1. POST /api/files/upload with test file (2MB PDF)
    2. Capture response: storage path, file ID
    3. Verify file exists in local storage: `fs.existsSync(localPath)`
    4. Wait for background upload (max 60 seconds)
    5. Query database: Verify `synced=true, syncAttempts=1, syncError=null`
    6. Verify file in Terabox: `rclone lsjson terabox:/arsip/ | grep filename`
    7. Request file preview: GET /api/files/{id}/preview
    8. Assert: Response is file stream with correct content-type
  - Test variations:
    - Small file (10KB)
    - Large file (50MB)
    - Special characters in filename
    - Concurrent uploads (3+ files simultaneously)
  - _Requirements: R3, R4_

- [x] 5.2 Error Recovery Test (Simulate Alist Failure)
  - Test scenario: Alist crashes mid-upload
  - Setup: Start backend, initiate upload
  - During background task execution: Kill Alist process: `kill -9 $(pgrep -f 'alist server')`
  - Expected behavior:
    - Upload attempt fails with ECONNREFUSED
    - Error classified as TRANSIENT
    - Retry logic activates (wait 5 seconds)
    - Attempt 2 fails (Alist still down)
    - After 3 attempts: Mark file synced=false, log error
  - Recovery:
    - Manually restart Alist: `alist/alist.exe server`
    - Trigger manual retry: POST /api/files/{id}/retry-sync
    - Verify file syncs successfully
  - Assert: Proper error logging at each stage, database state transitions correctly
  - _Requirements: R2, R3_

- [x] 5.3 File Persistence After Cloud Run Restart
  - Test scenario: Verify files survive container restart
  - Setup: Deploy backend to Cloud Run staging environment
  - Upload 5 test files via UI
  - Capture file metadata: IDs, names, sync status
  - Wait for all files to sync to Terabox (verify in Terabox UI)
  - Trigger new Cloud Run deployment: `gcloud run deploy arsip --source . --region us-central1`
  - Wait for new revision to be ready
  - Verify persistence:
    - Query database: All 5 files still present with correct metadata
    - List files via API: GET /api/files → should return same 5 files
    - Test preview for each file: GET /api/files/{id}/preview → should stream correctly
    - Verify files in Terabox Web UI: All 5 files visible
  - Assert: No data loss, all files queryable, preview functionality preserved
  - _Requirements: R4_

---

### Phase 6: Deployment

- [x] 6.1 Deploy to Cloud Run Staging
  - Build Docker image: `docker build -t gcr.io/PROJECT_ID/arsip:latest .`
  - Verify Dockerfile includes:
    - Alist binary: `COPY alist/ /app/alist/`
    - Rclone installation or binary
    - rclone.conf configuration
    - Volume mount for persistence: `--mount type=persistent-volume`
  - Push image: `docker push gcr.io/PROJECT_ID/arsip:latest`
  - Deploy to Cloud Run:
    ```bash
    gcloud run deploy arsip \
      --image gcr.io/PROJECT_ID/arsip:latest \
      --region us-central1 \
      --memory 2Gi \
      --cpu 2 \
      --set-env-vars PORT=7860,ALIST_PORT=5244 \
      --set-env-vars SUPABASE_URL=<value>,SUPABASE_KEY=<value> \
      --set-env-vars GCP_PROJECT_ID=<project-id>
    ```
  - Create persistent volume: Attach to Cloud Run service
  - Monitor deployment: Check logs, verify startup sequence completes
  - _Requirements: R1, R2, R3, R4_

- [x] 6.2 Verify All Requirements in Staging
  - Test R1 (Alist Operational):
    - Curl health endpoint: `curl https://STAGING_URL/alist-health`
    - Verify: HTTP 200, Alist logs show "listening on :5244"
    - Verify: Alist Web UI accessible
  - Test R2 (Rclone ↔ Alist Connection):
    - Rclone list test: `rclone --config /app/rclone.conf lsjson terabox:/`
    - Verify: Returns file list (JSON array), no "401 Unauthorized" errors
    - Verify: No "gzip: invalid header" errors
    - Test mkdir: `rclone --config /app/rclone.conf mkdir terabox:/test-final`
    - Verify: Directory created successfully
  - Test R3 (File Backup):
    - Upload file via UI: Wait for sync completion
    - Verify logs: `[Background Upload] SUCCESS for {filename}`
    - Verify database: `synced=true, syncAttempts=1`
    - Verify Terabox: File appears in listing
  - Test R4 (File Persistence):
    - Upload file, deploy new revision
    - Verify file still accessible after restart
    - Verify file still in Terabox
  - Document verification results: Screenshot logs, database query results
  - _Requirements: R1, R2, R3, R4_

---

### Phase 7: Final Checkpoint

- [x] 7.1 Checkpoint - All Requirements Verified
  - Verify task 6.2 completion: All acceptance criteria met in staging ✓
  - Verify no regressions: Existing upload/preview functionality still works ✓
  - Verify error handling: Error logs are comprehensive and actionable ✓
  - Verify performance: File sync completes within 60 seconds for typical files ✓
  - Verify monitoring: Alerts configured for Alist/Rclone failures ✓
  - Collect deployment artifacts:
    - Docker image: `gcr.io/PROJECT_ID/arsip:latest`
    - Cloud Run service URL: `https://arsip-XXXXX.a.run.app`
    - Configuration: Environment variables, Secret Manager entries
    - Database: Schema and sample queries for file metadata
    - Logs: Sample log output from successful and failed uploads
  - Create deployment checklist: Verify before production deployment
  - Confirm all tests pass: Unit tests, property tests, integration tests
  - If any issues arise, diagnose and resolve before marking complete
  - _Requirements: R1, R2, R3, R4_

---

## Testing Notes

### Property-Based Testing Approach

The property-based tests use **fast-check** library (JavaScript) to automatically generate many test cases:

- **Property 1 Test**: Generate 100+ concurrent file uploads, verify all start background tasks within 1 second
- **Property 2 Test**: Generate 100+ retry scenarios with different failure types, verify exponential backoff pattern
- **Property 3 Test**: Generate 100+ error conditions, verify all produce logs with complete context
- **Property 4 Test**: Generate 100+ file uploads with random names/sizes, verify all appear in Terabox listing
- **Property 5 Test**: Generate 20+ upload/restart cycles, verify persistence holds

**Minimum iterations**: 100 per property (higher is better, 1000+ for critical properties)

### Running Tests

```bash
# Unit tests (traditional)
npm test backend/tests/background-upload.test.js

# Property tests (fast-check with 100+ iterations)
npm test backend/tests/properties.test.js -- --run

# Integration tests (requires real Alist/Rclone services)
npm test backend/tests/e2e-upload.test.js

# All tests with coverage
npm run test:all -- --coverage
```

### Test Evidence to Document

- Test execution timestamp
- Node.js version, Rclone version
- Input conditions (file sizes, error types, concurrent operations)
- Expected vs actual results
- Counterexamples found (edge cases)
- Test result (PASS/FAIL)
- Coverage report (lines, branches, functions)

---

## Implementation Notes

### Error Classification Decision Tree

When implementing error handling, use this tree to classify errors:

```
Error from Rclone Execution
├─ Exit code 0? → SUCCESS
├─ Exit code ≠ 0? → ERROR
│  ├─ "gzip: invalid header"? → TRANSIENT (Alist responding with wrong protocol)
│  ├─ "401 Unauthorized"? → PERMANENT (auth failure, don't retry)
│  ├─ "Connection refused"? → TRANSIENT (Alist down, will retry)
│  ├─ "ETIMEDOUT"? → TRANSIENT (network issue, will retry)
│  ├─ "ECONNREFUSED"? → TRANSIENT (service unavailable, will retry)
│  ├─ "EACCES" or "Permission denied"? → PERMANENT (don't retry)
│  └─ "not found" or "404"? → PERMANENT (bad path, don't retry)
```

### File Path Construction

Files should be stored at:
```
/arsip/{zonaKode}/{tokoKode}/{category}/{filename}

Example:
/arsip/zona-01/toko-a/PPN/invoice-12345.pdf
/arsip/zona-02/toko-b/PPH21/payroll-2024-01.xlsx
```

### Database Schema (Backend)

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  size BIGINT,
  local_path VARCHAR(500),
  storage_path VARCHAR(500),
  synced BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMP,
  sync_attempts INTEGER DEFAULT 0,
  sync_error TEXT,
  checksum_md5 VARCHAR(32),
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by VARCHAR(100)
);

CREATE INDEX idx_files_synced ON files(synced);
CREATE INDEX idx_files_uploaded_at ON files(uploaded_at DESC);
```

---

## Known Issues and Workarounds

### Issue 1: "gzip: invalid header"
- **Root Cause**: Alist is not responding to WebDAV requests correctly (possibly returning HTML error page)
- **Workaround**: Check Alist logs (`alist/data/log/log.log`), verify config.json has correct WebDAV mount path
- **Fix**: Ensure Alist is properly initialized with correct config before Rclone attempts connection

### Issue 2: Port 5244 Already in Use
- **Root Cause**: Another service using port 5244 (previous Alist instance, or different service)
- **Workaround**: Kill process using port: `kill -9 $(lsof -t -i :5244)` or use different port
- **Fix**: Implement port conflict detection in startup, try alternative ports if 5244 unavailable

### Issue 3: Files Not Persisting After Restart
- **Root Cause**: Local files stored in ephemeral container filesystem
- **Workaround**: Ensure persistent volume mounted at `/app/data/` on Cloud Run
- **Fix**: OR treat Terabox as source of truth - after sync, stream files from Terabox instead of local storage

---

## Success Criteria

✅ All acceptance criteria from Requirements (R1-R4) verified in staging
✅ All tests pass: Unit tests, property tests, integration tests
✅ File sync latency < 2 minutes for typical files (< 50MB)
✅ Error logs are comprehensive and guide debugging
✅ No data loss on Cloud Run restarts (files persist)
✅ Alist uptime >= 99% (monitored via health checks)
✅ Rclone success rate >= 95% on first attempt (from logs)
✅ All team members can troubleshoot failures using error logs

