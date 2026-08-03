# Alist Storage Integration Fix - Requirements

## Problem Statement

Files uploaded to the system appear in local storage and can be previewed, but **fail to sync to Terabox** via Alist. Root cause: Alist WebDAV service is unreachable or misconfigured.

**Current Behavior** (Broken):
- ✅ User uploads file via web interface
- ✅ File stored in local `/app/data/files/`
- ✅ File preview works (streamed from local storage)
- ❌ Rclone backup command fails: `error when trying to read error from body: gzip: invalid header`
- ❌ Alist service at `http://localhost:5244/` unreachable
- ❌ File NEVER reaches Terabox
- ❌ On Cloud Run restart, files lost (not persistent)

**Expected Behavior** (Working):
- ✅ User uploads file
- ✅ File uploaded to Terabox via Alist WebDAV
- ✅ File immediately available in Terabox
- ✅ File persists across Cloud Run restarts
- ✅ File preview works (streamed from Terabox)
- ✅ Rclone backup completes without errors

## Acceptance Criteria

### R1: Alist Service Operational
- **Description**: Alist service must be running and accessible
- **Acceptance Criteria**:
  - `curl http://localhost:5244/` returns 200 OK (or redirects to Alist UI)
  - Alist Web UI loads at `http://localhost:5244/`
  - Alist admin login succeeds with credentials
  - `GET /api/public/settings` endpoint responds with Alist config
  - Cloud Run container logs show no "Alist" errors or crashes
  - Health check logs show Alist initialization completed

### R2: Rclone ↔ Alist WebDAV Connection
- **Description**: Rclone must authenticate and connect to Alist WebDAV endpoint
- **Acceptance Criteria**:
  - `rclone lsjson --config rclone.conf terabox:/arsip` returns file list (no auth errors)
  - No "401 Unauthorized" errors in output
  - No "gzip: invalid header" errors in logs
  - WebDAV URL in rclone.conf matches Alist configuration
  - Rclone can create directories: `rclone mkdir --config rclone.conf terabox:/test-dir`
  - Rclone can upload files: `rclone copyto test.txt --config rclone.conf terabox:/test.txt`

### R3: File Backup to Alist (Background Task)
- **Description**: Files uploaded must automatically backup to Terabox via Alist
- **Acceptance Criteria**:
  - Upload endpoint `/api/files/upload` completes within 30 seconds (local upload)
  - Background Rclone backup task starts within 1 second of local upload
  - Rclone backup completes within 60 seconds (or queues for retry)
  - Logs show: `[Background Upload] SUCCESS for {filename}`
  - File appears in Terabox within 2 minutes of upload (full sync)
  - Retry logic works: Failed backups retry up to 3 times with exponential backoff
  - Error logs include: retry count, error message, timestamp, filename

### R4: File Persistence Across Restarts
- **Description**: Files must survive Cloud Run restart/redeployment
- **Acceptance Criteria**:
  - After deploying new Cloud Run revision, files still accessible
  - File listing shows same file count and files before/after restart
  - File preview works post-restart
  - No "file not found" errors when accessing previously uploaded files
  - Terabox integration verified: Files listed in Terabox Web UI

## Assumptions

1. **Alist Password**: Provided by user in Secret Manager as `arsip-alist-password`
2. **Terabox Credentials**: Alist has valid Terabox account configured
3. **Network Access**: Cloud Run container can reach Alist service (localhost:5244)
4. **Rclone Binary**: Installed in Dockerfile, available at `/usr/bin/rclone`
5. **Port Exposure**: Container exposes port 5244 for Alist Web UI (defined in Dockerfile)
6. **Database**: Supabase database is operational and reachable
7. **Secret Manager**: Google Secret Manager accessible with proper IAM permissions

## Out of Scope

- Migration of existing locally-stored files to Terabox (handled separately)
- Frontend UI changes (file browser, upload form)
- Database schema changes
- Alist deployment/configuration on Terabox account
- Google Cloud IAM permissions (assuming already configured)
- Load testing or performance optimization

## Success Metrics

| Metric | Target | Verification |
|--------|--------|--------------|
| Alist uptime | 99.9% | Monitoring dashboard, container logs |
| Rclone success rate | 95%+ on first attempt | Backend logs: "[Background Upload] SUCCESS" count |
| File sync latency | < 2 minutes | Timestamp comparison: upload time vs Terabox appearance |
| Data persistence | 100% | Verify files after Cloud Run restart |
| Error logging | Comprehensive | All failures logged with context (filename, error, retry count) |

## Risk Analysis

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Alist service crashes | Files not backed up, data loss on restart | Implement health checks, auto-restart, fallback to local storage |
| Authentication failures | Files can't upload to Alist | Load password from Secret Manager, log auth attempts |
| Network timeouts | Backups slow or fail | Implement retry logic with exponential backoff, reasonable timeouts |
| Rclone errors | Unrecoverable upload failures | Comprehensive error logging, user notification system |
| Race conditions | Duplicate files or data corruption | Implement file locking, transaction-style operations |

## Testing Strategy

### Unit Tests
- Rclone command execution with mocked outputs
- Error parsing and handling
- Retry logic correctness
- Credential sourcing (Secret Manager, env var, fallback)

### Integration Tests
- Real Alist service connectivity (Docker compose for testing)
- Rclone upload/download operations
- Error scenarios (auth failure, timeout, directory not found)
- Background task execution timing

### System Tests
- End-to-end upload flow in Cloud Run staging environment
- File persistence across deployments
- Health check monitoring

### Manual Verification
- Upload file, check Terabox Web UI for appearance
- Check logs for error patterns
- Verify file counts match between database and Terabox

---

## Related Requirements

- **Deployment Startup Hang Fix Spec**: Tasks 3.1-3.5 (error handling, process-level handlers)
- **Terabox File Sync Spec**: Task 1 (Secret Manager client installation)
- **GitHub Repository**: https://github.com/donyp/arsipankabaru.git

## Next Steps

1. **Diagnosis** (Task 1): Investigate why Alist is unreachable
2. **Verification** (Task 2): Test rclone.conf and WebDAV connection
3. **Fix** (Task 3): Resolve Alist/Rclone issues
4. **Testing** (Task 4): Write and run integration tests
5. **Deployment** (Task 5): Deploy to Cloud Run and verify all requirements
