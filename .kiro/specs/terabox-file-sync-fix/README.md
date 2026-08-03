# Terabox File Sync Integration - Spec Overview

## What's the Problem?

Files showing **0/0** in Cloud Run, but database has **1,179 files**. Root cause: Alist authentication failing with 401 errors.

**Why?** Hard-coded Alist password `AdminArsip2026!` doesn't match actual password `admin123`.

## What's the Solution?

Load credentials from **Google Secret Manager** instead of hard-coding them. Add retry logic for robustness.

## Quick Start

### 1. Understand the Scope
- **What we're fixing**: Alist WebDAV authentication, file listing, storage stats
- **What we're NOT fixing**: File sync from Terabox (already happened in previous run)
- **What we're NOT changing**: Frontend UI, file download logic, database schema

### 2. Read the Spec

In this folder:
- **requirements.md** - What needs to work (R1-R6)
- **design.md** - Architecture, data flows, component design
- **tasks.md** - Implementation steps (6 tasks, 2 weeks estimated)

### 3. Implementation Order

**Phase 1** (Day 1): Install Secret Manager client, initialize credentials  
**Phase 2** (Days 1-2): Update RcloneStorage, refactor Alist login  
**Phase 3** (Day 2): Add fallback mechanism, comprehensive logging  
**Phase 4** (Days 3-4): Write integration tests  
**Phase 5** (Day 5): Deploy to Cloud Run, verify  

### 4. Success Metrics

✅ Stats endpoint returns `file_count > 0`  
✅ No 401 errors in logs  
✅ File access works  
✅ Deployment succeeds  

## Key Files

| File | Purpose |
|------|---------|
| `requirements.md` | What must work (R1-R6) |
| `design.md` | Architecture, data flows, error handling |
| `tasks.md` | 6 implementation tasks with detailed steps |
| `../../../backend/rclone_wrapper.js` | Core file to modify (Alist login, file ops) |
| `../../../backend/server.js` | Call credential init at startup |
| `../../../backend/tests/terabox-integration.test.js` | New test file (to create) |

## Architecture at a Glance

```
Cloud Run
├─ Node.js (Express)
├─ Secret Manager Client
│  └─ Fetch: arsip-alist-password
├─ RcloneStorage Module
│  ├─ Alist API calls
│  ├─ WebDAV via Alist
│  └─ Terabox files
└─ Database (Supabase)
   └─ 1,179 files in DB
```

## Credential Flow

```
1. Server starts
2. Load ALIST_ADMIN_PASSWORD from:
   a) Google Secret Manager (Cloud Run)
   b) Environment variable (local dev)
   c) Hardcoded default (fallback)
3. Store in memory
4. Use for all Alist logins

Result: No more hardcoded password!
```

## Testing Approach

**Unit Tests** (via Jest):
- Mock Alist API responses
- Mock Secret Manager
- Test each function in isolation
- 8 test cases covering success, failure, retry, caching

**Integration Tests** (live):
- Deploy to Cloud Run
- Call real API endpoints
- Verify no 401 errors
- Verify file counts > 0

## Rollback Plan

If deployment fails:
1. Check logs for error type
2. If "401": Update secret value and redeploy
3. If "timeout": Check Alist status and increase timeout
4. If "permission": Check Secret Manager IAM permissions
5. Last resort: Revert to previous Cloud Run revision

## Questions?

Refer to the detailed spec files:
- **"How do I implement this?"** → tasks.md (step by step)
- **"How does it work?"** → design.md (architecture, data flows)
- **"What must pass?"** → requirements.md (acceptance criteria)
- **"What should I test?"** → tasks.md, section 5 (test cases)

---

**Status**: Spec complete, ready for implementation  
**Estimated Timeline**: 5 days (1 week)  
**Risk Level**: Low (isolated to auth/file ops, no schema changes)  
**Rollback**: Easy (revert Cloud Run revision or update Secret Manager)
