# Terabox File Sync Integration - Requirements

## Problem Statement

**Status**: Production issue - Files showing 0/0 in storage stats after Cloud Run deployment  
**Impact**: Users cannot see or access 1,179 files stored in Terabox  
**Root Cause**: Terabox WebDAV authentication failing (401 Unauthorized) in Alist  

### Current Behavior
- Database contains 1,179 file records (`files` table)
- Dashboard stats API returns 0/0 for total files and storage
- Logs show 401 errors from Alist WebDAV endpoint
- rclone commands fail with `401 Unauthorized`
- Alist admin password is hardcoded, not using Secret Manager

### Expected Behavior (After Fix)
- Files sync correctly from Terabox via Alist WebDAV
- Storage stats show accurate file counts from database
- No 401 errors in logs
- Admin credentials sourced from Google Secret Manager
- File metadata loads from database (sync from previous runs)
- Users can browse and download files from archive

---

## Requirements

### R1: Credentials Management
**Description**: Move Alist admin credentials from hardcoded values to Google Secret Manager  
**Acceptance Criteria**:
- Alist admin password retrieved from `arsip-alist-password` secret
- WebDAV credentials (if different) retrieved from `arsip-terabox-pass`
- Default fallback values only used for local development
- Cloud Run service account has `roles/secretmanager.secretAccessor`

### R2: WebDAV Authentication Fix
**Description**: Establish valid WebDAV connection to Terabox via Alist  
**Acceptance Criteria**:
- Alist API login succeeds with retrieved credentials
- WebDAV requests to `http://localhost:5244/dav/terabox` return 200/401 instead of connection refused
- rclone can authenticate and list files from terabox remote
- No 401 errors in Cloud Run logs

### R3: File Sync Restoration
**Description**: Enable file listing from Terabox through the storage wrapper  
**Acceptance Criteria**:
- `rcloneStorage.listFiles()` returns file list instead of 401 error
- `rcloneStorage.getRawUrl()` successfully retrieves Alist raw URLs
- Files from database can be downloaded via proxy
- File browser endpoint works (if exists)

### R4: Storage Stats Accuracy
**Description**: Fix stats endpoint to show actual file counts  
**Acceptance Criteria**:
- `/api/stats/storage` returns file counts > 0
- Query filters by `zona_id` (zone-based organization)
- No database column errors (user_id vs zona_id fixed in previous task)
- Response matches schema: `{zona_id, total_files, total_size}`

### R5: Error Handling & Logging
**Description**: Add robust error handling for credential and authentication failures  
**Acceptance Criteria**:
- Clear error logs when Secret Manager credentials unavailable
- Timeouts (>30s) logged with context (which operation timed out)
- Alist login failures logged before retry
- Fallback to local credentials for development environments

### R6: Testing & Verification
**Description**: Validate all fixes work in deployed environment  
**Acceptance Criteria**:
- Health check `/api/heartbeat` returns 200
- Stats endpoint shows file counts > 0
- File list endpoint returns actual files
- No 401 or timeout errors in production logs
- Terabox file access works (if browser endpoint used)

---

## Dependencies & Constraints

### External Services
- **Alist**: Running on `http://localhost:5244` in Cloud Run container
- **Terabox**: Connected to Alist via WebDAV at `/dav/terabox`
- **Google Secret Manager**: Contains credentials (arsip-alist-password, arsip-terabox-user, arsip-terabox-pass)
- **Supabase**: Database with `files` table (1,179 records)

### Environment Assumptions
- Node.js 18+ (supports global fetch)
- Cloud Run service has Secret Manager permissions
- Alist WebDAV driver working (verified locally)
- rclone.conf exists with correct remotes (terabox, terabox_crypt, storj)

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|-----------|
| Secret Manager latency | 401 errors, timeouts | Cache credentials for 24h, use fallback |
| Alist crash/restart | 0 files, connection refused | Health check, auto-retry with backoff |
| Terabox API limits | Rate limiting, 429 errors | Implement request throttling, caching |
| Large file lists | Timeout (>30s) | Paginate results, increase timeout |

---

## Out of Scope

- Migrating from WebDAV to native Baidu Pan driver (driver unavailable in current Alist)
- Syncing new files from Terabox to database (only using existing records)
- Frontend UI changes to file browser
- Performance optimization beyond 30s timeout
- Implementing rclone encryption decryption in browser (security risk)

---

## Acceptance Test Plan

### AT1: Credential Sourcing
```bash
# Verify secrets are retrieved, not hardcoded
grep -n "AdminArsip2026" backend/server.js  # Should be 0 matches
grep -n "secret.*alist" backend/server.js  # Should find Secret Manager calls
```

### AT2: Alist Authentication
```bash
# On deployed Cloud Run, check logs:
# Should see: "✅ Alist authenticated"
# Should NOT see: "401 Unauthorized", "Alist login failed"
```

### AT3: File Listing
```bash
# Query database:
SELECT COUNT(*) FROM files;  # Should show 1,179

# Call API:
GET https://arsipankabaru-64816679768.asia-southeast1.run.app/api/stats/storage
# Response should include: total_files > 0, storage > 0
```

### AT4: No Errors in Logs
```bash
# Check Cloud Run logs for 24h period
# Search patterns should be EMPTY:
# - "401 Unauthorized"
# - "ECONNREFUSED"
# - "ETIMEDOUT"
# - "Alist login failed"
```

---

## Success Metrics

1. **File Count**: Storage stats show 1,179 files (or accurate subset per zone)
2. **Availability**: Stats API responds within 2 seconds
3. **Error Rate**: 0 401/timeout errors in production logs
4. **User Access**: Files can be browsed and downloaded from Terabox

---

## Requirement Mapping to Fixes

| Requirement | Implementation Task | File | Lines |
|-------------|-------------------|------|-------|
| R1 | Add Secret Manager calls for credentials | `backend/server.js`, `backend/rclone_wrapper.js` | TBD |
| R2 | Pass correct creds to Alist login in getRawUrl | `backend/rclone_wrapper.js` | ~50-70 |
| R3 | Remove hardcoded password fallback | `backend/rclone_wrapper.js` | ~105-110 |
| R4 | Stats already fixed in previous task | `backend/server.js` | 2005-2045 |
| R5 | Add try-catch with logging | `backend/rclone_wrapper.js` | Throughout |
| R6 | Write integration tests | `backend/tests/terabox-integration.test.js` | New file |

