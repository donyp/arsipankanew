# Alist Storage Integration Fix - Spec Overview

## What's the Problem?

Files uploaded successfully but **not reaching Terabox**. System shows:
- ✅ Upload works (files appear in local storage)
- ✅ Preview works (files downloadable from local storage)
- ❌ Backup to Alist failing: `gzip: invalid header` errors
- ❌ Alist unreachable: `http://localhost:5244/` down
- ❌ Files NOT visible in Terabox

**Why?** Alist service configuration, credentials, or connection is broken.

## What's the Solution?

1. **Diagnose**: Why is Alist unreachable? Service down, credentials wrong, or configuration issue?
2. **Verify**: Check rclone.conf configuration matches Alist setup
3. **Fix**: Get Alist running and reachable via WebDAV
4. **Test**: Verify Rclone can connect to Alist and backup files
5. **Deploy**: Make Alist primary storage, remove local storage fallback

## Quick Start

### 1. Understand the Scope
- **What we're fixing**: Alist WebDAV connection and credential sourcing
- **What we're NOT changing**: Frontend UI, database schema, local storage code (for now)
- **Success metric**: Files backed up to Terabox within 30 seconds of upload

### 2. Read the Spec
- **requirements.md** - What must work (R1-R4)
- **design.md** - Alist architecture, data flows, error recovery
- **tasks.md** - Implementation steps and verification

### 3. Root Cause Analysis
Current state indicates:
- Alist container crashed or failed to start
- OR Alist port 5244 is not exposed/accessible
- OR Alist password changed but rclone.conf not updated
- OR rclone.conf points to wrong Alist instance

### 4. Success Metrics
✅ Alist Web UI accessible at `http://localhost:5244/`
✅ Rclone can authenticate with `rclone lsjson terabox:/arsip` (no errors)
✅ Files appear in Terabox after upload
✅ Deployment succeeds with no "gzip: invalid header" errors

## Architecture at a Glance

```
Cloud Run Container
├─ Node.js Express Backend
│  ├─ Rclone Wrapper (calls rclone CLI)
│  ├─ Secret Manager (provides Alist password)
│  └─ Upload Handler (fires background Alist backup)
├─ Alist Service (WebDAV gateway)
│  └─ Authenticates with Terabox
│  └─ Exposes WebDAV at /dav/terabox
└─ Rclone CLI (installed in container)
   ├─ Connects to Alist via WebDAV
   ├─ Uploads files to /arsip/zona-XX/...
   └─ Files synced to Terabox
```

## Key Files

| File | Purpose |
|------|---------|
| `requirements.md` | What must work (R1-R4) |
| `design.md` | Architecture and data flows |
| `tasks.md` | Implementation steps |
| `../../../backend/rclone_wrapper.js` | Calls rclone for uploads |
| `../../../backend/server.js` | Orchestrates upload flow |
| `../../../Dockerfile` | Container definition, Alist startup |
| `../../../rclone.conf` | Rclone configuration (remote definitions) |
| `../../../start.sh` | Service startup orchestration |

## Troubleshooting Matrix

| Symptom | Likely Cause | Check First |
|---------|-------------|------------|
| "gzip: invalid header" | Alist sending corrupted response | Is Alist running? Check container logs |
| "port 5244 refused" | Alist not started or port not exposed | Check Dockerfile EXPOSE 5244 |
| "401 Unauthorized" | Alist password wrong | Verify password in Secret Manager |
| "directory not found" | File path format wrong or Alist root wrong | Check rclone.conf `url = ` setting |
| "connection timeout" | Alist unresponsive/slow | Check Alist container health |

## Credential Flow

```
1. Server starts
2. Secret Manager loads ALIST_ADMIN_PASSWORD
3. Rclone reads rclone.conf with password
4. User uploads file
5. Rclone authenticates with Alist
6. File uploaded via WebDAV to Terabox
7. File appears in Terabox (within seconds)
```

## Testing Approach

**Manual Verification**:
```bash
# 1. Check if Alist is running
curl http://localhost:5244/

# 2. Check rclone can see files
rclone lsjson --config rclone.conf terabox:/arsip

# 3. Upload a test file
echo "test" > test.txt
rclone copyto test.txt --config rclone.conf terabox:/arsip/test.txt

# 4. Check if file reached Terabox
rclone lsjson --config rclone.conf terabox:/arsip | grep test
```

**Automated Testing**:
- Integration tests for Alist connectivity
- Rclone command execution tests
- Error handling and retry logic tests
- End-to-end upload flow tests

## Rollback Plan

If fix breaks things:
1. Revert to local-storage-only mode (edit server.js, comment out Rclone calls)
2. Check Cloud Run service account IAM permissions
3. Verify Secret Manager secret value matches Alist password
4. Check Cloud Build logs for Dockerfile build errors

---

**Status**: Spec ready for bugfix diagnosis and implementation
**Estimated Timeline**: 2-3 days (diagnosis + fix + deployment)
**Risk Level**: Medium (changes storage layer, needs careful testing)
**Rollback**: Easy (revert code changes, can keep local storage as fallback)
