# Terabox File Sync Integration - Implementation Tasks

## Overview

This implementation plan fixes the Terabox file sync issue in production (Cloud Run). The core problem: Alist WebDAV authentication failing with 401 errors, causing storage stats to show 0/0 files.

**Root Cause**: Alist admin password hardcoded as `AdminArsip2026!` in rclone_wrapper.js, but actual Alist instance was reset to `admin123` by user. Credentials need to come from Google Secret Manager instead.

**Solution**: 
1. Load credentials from Google Secret Manager (with fallback to env vars for local dev)
2. Implement retry logic for Alist login failures
3. Add comprehensive logging for diagnostics
4. Verify stats endpoint shows actual file counts (fixed in previous task)
5. Test all file operations (list, get, download)

**Expected Outcome**: 
- Files count showing 1,179+ in storage stats
- No 401 errors in Cloud Run logs
- File access working (download, preview, etc.)

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1"],
      "description": "Setup - Install Secret Manager client and initialize credentials"
    },
    {
      "wave": 2,
      "tasks": ["2", "3"],
      "description": "Core Implementation - Update RcloneStorage and Alist login logic",
      "parallel": true
    },
    {
      "wave": 3,
      "tasks": ["4"],
      "description": "Integration - Add fallback mechanism and error handling"
    },
    {
      "wave": 4,
      "tasks": ["5"],
      "description": "Testing - Write and run integration tests"
    },
    {
      "wave": 5,
      "tasks": ["6"],
      "description": "Verification - Deploy and verify in production"
    }
  ]
}
```

---

## Phase 1: Setup

- [x] 1. Install Secret Manager Client and Add Initialization

  **Description**: Add Google Cloud Secret Manager dependency and create initialization function to load credentials at server startup.

  **Requirements**: R1 (Credentials Management)

  **Steps**:
  1. Install `@google-cloud/secret-manager` package:
     ```bash
     cd backend && npm install @google-cloud/secret-manager@^4.0.0
     ```

  2. Create new file `backend/secretManager.js`:
     - Export `getSecret(secretName)` async function
     - Use `SecretManagerServiceClient` to fetch latest version
     - Include error handling with clear messages
     - Support both Cloud Run (GCP_PROJECT_ID set) and local dev (fallback to env vars)
     - Add logging: `[SecretManager] Fetched {secretName}` or `[SecretManager] Using fallback for {secretName}`

  3. In `backend/server.js`, add initialization at startup (before creating express app):
     - Call `initializeRcloneCredentials()` from rclone_wrapper.js
     - Log: `🔐 Initializing storage credentials...`
     - If successful: `✅ Storage credentials loaded from {source: SECRET_MANAGER | ENV | FALLBACK}`
     - If failed: `⚠️ Storage credentials unavailable (using defaults): {error}`

  4. Verify package.json updated with new dependency

  **Expected Outcome**:
  - `secretManager.js` created with `getSecret()` function
  - `backend/server.js` calls credential initialization at startup
  - Server logs show credential source at startup
  - Local dev still works (no credentials required)
  - Cloud Run has access to Secret Manager (service account already has permissions)

  **Test Locally**:
  ```bash
  cd backend
  npm install
  npm start
  # Look for: "✅ Storage credentials loaded from FALLBACK"
  # (or from ENV if you set ALIST_ADMIN_PASSWORD)
  ```

  **Test in Cloud Run**:
  ```bash
  gcloud run deploy arsipankabaru --region asia-southeast1 --project=arsipanka
  # Check logs for: "✅ Storage credentials loaded from SECRET_MANAGER"
  ```

  _Requirements: R1_

---

## Phase 2: Core Implementation

- [x] 2. Update RcloneStorage Module with Credential Sourcing

  **Description**: Modify `backend/rclone_wrapper.js` to use credentials loaded from Secret Manager instead of hardcoded values.

  **Requirements**: R2 (WebDAV Authentication Fix), R5 (Error Handling)

  **Steps**:
  1. Add module-level `alistCredentials` object:
     ```javascript
     let alistCredentials = {
       username: 'admin',
       password: process.env.ALIST_ADMIN_PASSWORD || 'AdminArsip2026!',
       source: 'env' // 'env' | 'secret-manager' | 'fallback'
     };
     ```

  2. Export `initializeCredentials(secretsManager)` function:
     - Parameter: secretsManager module (or null for local dev)
     - Call `getSecret('arsip-alist-password')` if secretsManager available
     - Store result in `alistCredentials.password`
     - Set `alistCredentials.source` to indicate where credentials came from
     - Log success: `✅ Alist credentials loaded from {source}`
     - Log failure: `⚠️ Using fallback credentials for {reason}`

  3. Replace all hardcoded password references:
     - In `getRawUrl()`: Use `alistCredentials.password` instead of `'AdminArsip2026!'`
     - In `uploadDirect()`: Use `alistCredentials.password`
     - In `uploadMedia()`: Use `alistCredentials.password`
     - In `deleteFile()`: Use `alistCredentials.password`
     - In `listFiles()`: Use `alistCredentials.password`

  4. Add logging when credentials change:
     - Log username/password changes (masked password)
     - Log source of credentials (SECRET_MANAGER vs ENV vs FALLBACK)

  **Expected Outcome**:
  - All Alist login calls use `alistCredentials.password`
  - No hardcoded `AdminArsip2026!` in code (except fallback default)
  - Credentials can be updated by changing Secret Manager (no code redeploy needed)
  - Local dev still works with env var or fallback

  **Files Modified**: `backend/rclone_wrapper.js`

  _Requirements: R2_

- [x] 3. Refactor Alist Login with Retry Logic

  **Description**: Extract Alist login into reusable function with retry logic and comprehensive error logging.

  **Requirements**: R2 (WebDAV Authentication Fix), R5 (Error Handling & Logging)

  **Steps**:
  1. Create new function in `backend/rclone_wrapper.js`: `async function loginToAlist(domain, credentials, attempt = 1)`
     - Parameters: domain (e.g. 'http://127.0.0.1:5244'), credentials object, current attempt number
     - Returns: token string or throws error
     - Max retries: 2 (initial + 1 retry)
     - Retry delay: 1 second * attempt number (exponential backoff)

  2. Implementation:
     ```javascript
     async function loginToAlist(domain, credentials, attempt = 1) {
       const maxRetries = 2;
       const timeoutMs = 30000;
       
       try {
         console.log(`[Alist] Login attempt ${attempt}/${maxRetries}...`);
         
         const controller = new AbortController();
         const timeout = setTimeout(() => controller.abort(), timeoutMs);
         
         const response = await fetch(`${domain}/api/auth/login`, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
             username: credentials.username,
             password: credentials.password
           }),
           signal: controller.signal
         });
         
         clearTimeout(timeout);
         const data = await response.json();
         
         if (!response.ok || !data.data?.token) {
           throw new Error(`Login failed: ${data.message || 'No token returned'} (HTTP ${response.status})`);
         }
         
         console.log(`✅ Alist authenticated on attempt ${attempt}`);
         return data.data.token;
         
       } catch (err) {
         const isRetryable = err.name === 'AbortError' || 
                            (err.message?.includes('401')) ||
                            (err.message?.includes('timeout'));
         
         if (isRetryable && attempt < maxRetries) {
           const delayMs = 1000 * attempt;
           console.warn(`⚠️ Alist login attempt ${attempt} failed: ${err.message}. Retrying in ${delayMs}ms...`);
           await new Promise(r => setTimeout(r, delayMs));
           return loginToAlist(domain, credentials, attempt + 1);
         }
         
         console.error(`❌ Alist login failed after ${attempt} attempts:`, {
           domain,
           username: credentials.username,
           error: err.message,
           credentials_source: alistCredentials.source
         });
         
         throw new Error(`Alist authentication failed: ${err.message}`);
       }
     }
     ```

  3. Replace all Alist login calls with new function:
     - In `getRawUrl()` - Replace token fetching
     - In `uploadDirect()` - Replace token fetching
     - In `uploadMedia()` - Replace token fetching (appears multiple times)
     - In `deleteFile()` - Replace token fetching
     - In `listFiles()` - Replace token fetching

  4. Update token caching to use new function:
     - If token expired and `loginToAlist()` succeeds, update cache
     - If `loginToAlist()` fails, clear cache and rethrow

  **Expected Outcome**:
  - Alist login logic centralized in one function
  - 401 errors trigger automatic retry (once)
  - Comprehensive logs show each login attempt and result
  - All file operations use consistent login mechanism
  - Error messages include context (credentials source, endpoint, attempt count)

  **Files Modified**: `backend/rclone_wrapper.js`

  **Testing**:
  ```bash
  # With correct credentials, should succeed on attempt 1:
  npm start
  # Should see: "✅ Alist authenticated on attempt 1"
  
  # With wrong credentials, should fail after 2 attempts:
  ALIST_ADMIN_PASSWORD=wrong npm start
  # Should see: "❌ Alist login failed after 2 attempts"
  ```

  _Requirements: R2, R5_

---

## Phase 3: Integration

- [x] 4. Add Fallback Mechanism and Complete Error Handling

  **Description**: Implement graceful degradation when Secret Manager unavailable, add context logging throughout data flow.

  **Requirements**: R1 (Credentials Management), R5 (Error Handling & Logging)

  **Steps**:
  1. In `backend/secretManager.js`, implement fallback chain:
     ```
     1. If GCP_PROJECT_ID not set → use env var
     2. If env var not set → use hardcoded default
     3. Log which source was used
     ```

  2. Add diagnostic logging in `rclone_wrapper.js`:
     - Log at module load: credential source (will be SECRET_MANAGER, ENV, or FALLBACK)
     - In `getRawUrl()`: Log if getting from cache vs fetching new token
     - In `listFiles()`: Log total files returned, any errors
     - In file operations: Log storagePath, operation type (upload/download/delete)

  3. Add error context throughout:
     - Include endpoint URL (masked if sensitive)
     - Include credentials source (not password value)
     - Include attempt count for retries
     - Include timing (how long each operation took)
     - Include response HTTP status code if available

  4. Create helper function `logContext(operation, details)`:
     ```javascript
     function logContext(operation, details = {}) {
       const context = {
         operation,
         timestamp: new Date().toISOString(),
         credentials_source: alistCredentials.source,
         ...details
       };
       console.log(`[Context]`, JSON.stringify(context));
     }
     ```

  5. Call `logContext()` in:
     - Module initialization (credential loading)
     - Each Alist login attempt
     - Each file operation (list, get, upload, delete)
     - Each error

  **Expected Outcome**:
  - Server starts even if Secret Manager unavailable
  - Logs clearly show where credentials came from
  - Debugging logs show operation type and context
  - No sensitive data (passwords, tokens) in logs
  - Error messages include actionable hints

  **Verification**:
  ```bash
  # Local dev: should see FALLBACK source
  npm start
  
  # Cloud Run: should see SECRET_MANAGER source
  gcloud run deploy ... && gcloud run logs read
  ```

  _Requirements: R1, R5_

---

## Phase 4: Testing

- [x] 5. Write Integration Tests

  **Description**: Write comprehensive tests to verify Alist authentication, file operations, and error handling.

  **Requirements**: R6 (Testing & Verification)

  **Steps**:
  1. Create `backend/tests/terabox-integration.test.js`:
     - Test suite: "Terabox RcloneStorage Integration"
     - Setup: Mock Alist responses, mock Secret Manager, setup test server
     - Teardown: Close connections, clear caches

  2. Test Cases:

     **TC1: Successful Alist Login with Valid Credentials**
     - Setup: Mock Secret Manager returns valid password
     - Call: `getRawUrl('/test-file.pdf')`
     - Assert: Token cached, returns valid raw URL
     - Logs: Should show "✅ Alist authenticated on attempt 1"

     **TC2: Alist Login Failure + Retry**
     - Setup: First login returns 401, second returns 200
     - Call: `getRawUrl('/test-file.pdf')`
     - Assert: Retries once, succeeds on second attempt
     - Logs: Should show "⚠️ Alist login attempt 1 failed" then "✅ Alist authenticated on attempt 2"

     **TC3: Token Caching**
     - Setup: Valid credentials, first login succeeds
     - Call: `getRawUrl('/file1.pdf')` then `getRawUrl('/file2.pdf')`
     - Assert: Only one Alist login call (token reused from cache)
     - Logs: Should show only one "✅ Alist authenticated"

     **TC4: Token Expiry**
     - Setup: Manually set token expiry to past timestamp
     - Call: `getRawUrl('/test-file.pdf')`
     - Assert: New token fetched (cache invalidated)
     - Logs: Should show new "✅ Alist authenticated" message

     **TC5: File Listing**
     - Setup: Mock Alist /api/fs/list response with file data
     - Call: `listFiles('/arsip/zona-01')`
     - Assert: Returns array of files with correct metadata
     - No 401 errors

     **TC6: Credentials from Secret Manager**
     - Setup: Mock Secret Manager client
     - Call: `initializeCredentials(mockSecretManager)`
     - Assert: Password retrieved from secret, source = 'SECRET_MANAGER'
     - Logs: Should show "✅ Alist credentials loaded from SECRET_MANAGER"

     **TC7: Fallback to Env Var**
     - Setup: Secret Manager fails, ALIST_ADMIN_PASSWORD set in env
     - Call: `initializeCredentials(mockSecretManager)`
     - Assert: Env var used, source = 'ENV'
     - Logs: Should show "⚠️ Using fallback credentials for" then show "✅ Alist credentials loaded from ENV"

     **TC8: Fallback to Hardcoded Default**
     - Setup: Secret Manager fails, no env var
     - Call: `initializeCredentials(null)`
     - Assert: Hardcoded default used, source = 'FALLBACK'
     - Logs: Should show "✅ Alist credentials loaded from FALLBACK"

  3. Mock Setup:
     ```javascript
     // Mock Alist API responses
     const mockAlistResponses = {
       login: (success) => ({
         code: success ? 200 : 401,
         data: success ? { token: 'test-token-abc123' } : null,
         message: success ? 'OK' : 'Unauthorized'
       }),
       fileList: () => ({
         code: 200,
         data: {
           content: [
             { name: 'file1.pdf', size: 1024, type: 'file' },
             { name: 'file2.pdf', size: 2048, type: 'file' }
           ]
         }
       }),
       fsGet: () => ({
         code: 200,
         data: { raw_url: 'https://example.com/raw-file' }
       })
     };

     // Mock Secret Manager
     const mockSecretManager = {
       getSecret: jest.fn((name) => {
         const secrets = {
           'arsip-alist-password': 'secret-password-123'
         };
         return Promise.resolve(secrets[name] || null);
       })
     };
     ```

  4. Run Tests:
     ```bash
     cd backend
     npm test -- terabox-integration.test.js
     ```

  **Expected Outcome**:
  - All 8 test cases pass
  - Coverage: >90% for rclone_wrapper.js key functions
  - Clear test output showing each test and result
  - Tests runnable locally and in CI/CD

  **Files Created**: `backend/tests/terabox-integration.test.js`

  _Requirements: R6_

---

## Phase 5: Verification

- [x] 6. Deploy to Cloud Run and Verify

  **Description**: Deploy fixed code to Cloud Run and verify all functionality works in production.

  **Requirements**: R6 (Testing & Verification), R2 (WebDAV Auth), R3 (File Sync), R4 (Stats Accuracy)

  **Steps**:
  1. Build and deploy:
     ```bash
     gcloud run deploy arsipankabaru \
       --region asia-southeast1 \
       --project=arsipanka \
       --source=. \
       --allow-unauthenticated
     ```
     This triggers Cloud Build (from .cloudbuild.yaml)

  2. Verify deployment succeeded:
     ```bash
     gcloud run describe arsipankabaru --region asia-southeast1 --project=arsipanka
     # Check: status = ACTIVE, generation > previous generation
     ```

  3. Check initialization logs:
     ```bash
     gcloud run logs read arsipankabaru \
       --limit=50 \
       --region asia-southeast1 \
       --project=arsipanka | grep -E "Storage credentials|Alist|ERROR|401"
     ```
     Should see:
     - ✅ "🔐 Initializing storage credentials..."
     - ✅ "✅ Storage credentials loaded from SECRET_MANAGER"
     - ✅ "✅ Alist authenticated on attempt 1"
     - ❌ No "401 Unauthorized" or "Alist login failed"

  4. Test health check:
     ```bash
     curl https://arsipankabaru-64816679768.asia-southeast1.run.app/api/heartbeat
     # Should return: {"status":"alive","version":"..."}
     ```

  5. Test stats endpoint:
     ```bash
     curl https://arsipankabaru-64816679768.asia-southeast1.run.app/api/stats/storage
     # Should return: { zones: [{ zona_id: "01", total_files: N > 0, total_size: "X GB" }] }
     # NOT: { zones: [{ total_files: 0, total_size: 0 }] }
     ```

  6. Check for errors in logs (24-hour window):
     ```bash
     gcloud run logs read arsipankabaru \
       --limit=500 \
       --region asia-southeast1 \
       --project=arsipanka | grep -E "401|ECONNREFUSED|ETIMEDOUT|Alist login failed"
     # Should return: (empty - no errors)
     ```

  7. If stats still show 0:
     - Check database:
       ```sql
       SELECT COUNT(*) as total_files FROM files;
       -- Should show: 1179 or similar
       
       SELECT zona_id, COUNT(*) as file_count FROM files GROUP BY zona_id;
       -- Should show: multiple zones with file counts
       ```
     - If DB has files but API shows 0, query issue (not Alist issue)
     - If DB shows 0, files not synced (Terabox sync issue, out of scope)

  8. Test file access (if browser endpoint exists):
     - Load file browser in frontend
     - Should show file count > 0
     - Should not show "0/0 files"
     - Click file to download (should work without 401 errors)

  **Expected Outcome**:
  - Deployment succeeds (no build errors)
  - Server starts without crashes
  - Logs show credentials loaded from SECRET_MANAGER
  - No 401 or timeout errors in logs
  - Stats endpoint shows file_count > 0
  - File browser displays files (if applicable)
  - Users can access files

  **Troubleshooting**:
  | Issue | Check | Fix |
  |-------|-------|-----|
  | Stats still 0 | Database query | Check if `files` table has records |
  | 401 errors | Credentials | Verify secret in Secret Manager matches Alist password |
  | Alist timeout | Network | Ensure Alist container running in Cloud Run, health check passes |
  | Logs not visible | Permissions | Verify Cloud Run logs readable in GCP console |

  **Rollback (if needed)**:
  ```bash
  # Revert to previous working revision:
  gcloud run services update-traffic arsipankabaru \
    --to-revisions=PREVIOUS_REVISION_ID=100 \
    --region asia-southeast1 \
    --project=arsipanka
  ```

  _Requirements: R6, R2, R3, R4_

---

## Success Criteria

All tasks complete when:

1. ✅ Secret Manager client installed and credentials initialized
2. ✅ RcloneStorage uses Secret Manager credentials (not hardcoded)
3. ✅ Alist login refactored with retry logic (2 attempts max)
4. ✅ Fallback mechanism in place (SECRET_MANAGER → ENV → FALLBACK)
5. ✅ Comprehensive logging throughout (operation type, context, source)
6. ✅ All 8 integration tests passing (mocked Alist, Secret Manager)
7. ✅ Deployed to Cloud Run successfully
8. ✅ No 401 or timeout errors in production logs
9. ✅ Storage stats endpoint returns file_count > 0
10. ✅ File access working (no errors in user-facing operations)

---

## Deployment Checklist

- [x] `@google-cloud/secret-manager` added to package.json
- [x] `backend/secretManager.js` created and tested locally
- [x] `backend/rclone_wrapper.js` updated with credential sourcing
- [x] Alist login refactored to `loginToAlist()` function
- [x] All hardcoded passwords removed (except fallback default)
- [x] Error handling added throughout with logging
- [x] Integration tests created and passing locally
- [x] Code committed to git with clear commit messages
- [x] Pushed to GitHub repo: https://github.com/donyp/arsipankabaru.git
- [x] Cloud Build triggered automatically (from .cloudbuild.yaml)
- [x] Deployment verified (health check, stats endpoint, no errors)
- [x] Users notified: "Files are now accessible" or similar message

---

## Notes

### Why This Approach?

1. **Secret Manager**: Credentials updated without code redeploy (just update secret value)
2. **Retry Logic**: Handles transient failures (network blip, Alist restart)
3. **Fallback**: Local dev works without GCP setup, Cloud Run uses secrets
4. **Comprehensive Logging**: Easier debugging in production without leaking sensitive data
5. **Integration Tests**: Catch regressions before deployment

### Known Limitations

- Token TTL: 24 hours (Alist default). Longer TTL = fewer logins, shorter = more logins
- File listing: Paginated to 3000 files max. If >3000 files, needs pagination logic
- Encryption: terabox_crypt remote decryption not implemented (rclone handles it)
- Rate limiting: No request throttling implemented. If Terabox rate limits, implement backoff

### Future Improvements

1. Implement request throttling for large file operations
2. Add metrics/monitoring (login count, failure rate, file access patterns)
3. Implement file metadata caching (TTL-based)
4. Add support for parallel uploads/downloads
5. Migrate to native Baidu Pan driver when available in Alist

