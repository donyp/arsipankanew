# Terabox File Sync Integration - Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloud Run Container                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │ Node.js App  │───▶│ Alist WebDAV │───▶│  Terabox     │ │
│  │              │    │  (5244)      │    │  (Encrypted) │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│         │                   │                                │
│         │ Fetch credentials │ WebDAV auth                   │
│         ▼                   ▼                                │
│  ┌──────────────────────────────────────┐                  │
│  │  Google Secret Manager              │                  │
│  │  - arsip-alist-password             │                  │
│  │  - arsip-terabox-user               │                  │
│  │  - arsip-terabox-pass               │                  │
│  └──────────────────────────────────────┘                  │
│         ▲                                                   │
│         │                                                   │
│  ┌──────────────────────────────────────┐                  │
│  │  Environment Variables (Cloud Run)   │                  │
│  │  - GCP_PROJECT_ID                    │                  │
│  │  - ALIST_ADMIN_PASSWORD (from secret)│                  │
│  └──────────────────────────────────────┘                  │
│                                                              │
│  ┌──────────────────────────────────────┐                  │
│  │  Database (Supabase)                │                  │
│  │  - files table (1,179 records)      │                  │
│  │  - zona_id, toko_id, category...    │                  │
│  └──────────────────────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow: File Retrieval

```
1. User requests file stats → GET /api/stats/storage
                                     │
2. Server queries database ────────▶ SELECT COUNT(*) FROM files GROUP BY zona_id
                                     │
3. For each file, get metadata ────▶ Query files table (zona_id, file_size, etc)
                                     │
4. Return aggregated stats ────────▶ { total_files: 1179, total_size: XXX GB }
```

## Data Flow: File Access (getRawUrl)

```
1. Request file ─────────────────────┬──────────────────────────────┐
                                      │                              │
2. Check Alist token cache            │                              │
   - If expired, login to Alist ──────┤─ Secret Manager fetch ─────▶ arsip-alist-password
   - Get token, cache for 24h         │                              │
                                      │                              │
3. Call Alist /api/fs/get ────────────┤─ With Authorization header ▶ Token
   - Returns raw_url pointing         │                              │
     to encrypted Terabox file        │                              │
                                      │                              │
4. Return raw_url to caller ──────────┘                              │
                                                                     │
5. Caller uses raw_url ─────────────────────────────────────────────▶ Proxy to user
```

---

## Component Design

### 1. Secret Manager Integration

**File**: `backend/server.js`, `backend/rclone_wrapper.js`  
**Pattern**: Lazy-load secrets with fallback

```javascript
async function getSecret(secretName) {
  const projectId = process.env.GCP_PROJECT_ID;
  if (!projectId) {
    // Local dev: use env vars or hardcoded fallback
    return process.env[secretName] || DEFAULT_VALUES[secretName];
  }
  // Cloud Run: fetch from Secret Manager
  const secretClient = new SecretManagerServiceClient();
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`
  });
  return version.payload.data.toString('utf8');
}
```

**Secrets to load**:
| Secret Name | Used For | Fallback |
|------------|----------|----------|
| `arsip-alist-password` | Alist admin login | `AdminArsip2026!` (dev only) |
| `arsip-terabox-user` | rclone terabox remote | `admin` (not used in current WebDAV setup) |
| `arsip-terabox-pass` | rclone terabox remote | `admin123` (not used in current WebDAV setup) |

### 2. Credential Sourcing in RcloneStorage

**File**: `backend/rclone_wrapper.js`  
**Changes**:
1. Store credentials in module scope (loaded once at startup)
2. In `getRawUrl()`, use stored credentials for Alist login
3. In `uploadDirect()`, use stored credentials for Alist login
4. Add logging for credential retrieval

```javascript
// At module level
let alistCredentials = {
  username: 'admin',
  password: process.env.ALIST_ADMIN_PASSWORD || 'AdminArsip2026!'
};

// Initialize credentials (called at server startup)
async function initializeCredentials() {
  if (process.env.GCP_PROJECT_ID) {
    try {
      alistCredentials.password = await getSecret('arsip-alist-password');
      console.log('✅ Alist credentials loaded from Secret Manager');
    } catch (err) {
      console.warn('⚠️ Failed to load Alist password from Secret Manager:', err.message);
      console.log('ℹ️ Using fallback credentials for local development');
    }
  }
}

// In getRawUrl(), use alistCredentials:
const tokenResponse = await fetch(`${alistDomain}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    username: alistCredentials.username, 
    password: alistCredentials.password 
  }),
  signal: controller.signal
});
```

### 3. Alist Token Caching

**Current Implementation**: `alistTokenCache` (module-level object)  
**TTL**: 24 hours  
**Cache Key**: None (single token for admin user)  
**Invalidation**: On login failure, retry once

**Improvement**: Add cache metadata for diagnostics
```javascript
let alistTokenCache = {
  token: null,
  expiry: 0,
  fetchedAt: null,
  source: 'none'  // 'secret-manager' | 'env-var' | 'fallback'
};
```

### 4. Error Handling Strategy

**Scenario**: Alist login fails (401, timeout, network error)  
**Current**: Throws error immediately  
**Improved**:
1. Log with context (which secret was used, IP, timing)
2. Retry once with exponential backoff (1s wait)
3. If still fails, throw with actionable error message
4. Include in error: credentials used (masked), Alist endpoint

```javascript
async function loginToAlist(domain, credentials, attempt = 1) {
  const maxRetries = 2;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
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
      throw new Error(`Login failed: ${data.message} (HTTP ${response.status})`);
    }
    
    console.log(`✅ Alist authenticated (attempt ${attempt})`);
    return data.data.token;
    
  } catch (err) {
    const isRetryable = err.name === 'AbortError' || 
                       (err.message && err.message.includes('401'));
    
    if (isRetryable && attempt < maxRetries) {
      console.warn(`⚠️ Alist login attempt ${attempt} failed: ${err.message}. Retrying...`);
      await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
      return loginToAlist(domain, credentials, attempt + 1);
    }
    
    console.error(`❌ Alist login failed after ${attempt} attempts:`, {
      endpoint: domain,
      username: credentials.username,
      error: err.message,
      credentials_source: alistCredentials.source
    });
    throw err;
  }
}
```

### 5. Storage Stats Query

**File**: `backend/server.js` (already fixed in task 9)  
**Current Implementation**: Groups by `zona_id`, sums file counts and storage  
**Verification**: Query returns > 0 for each zona (or subset with data)

```javascript
// In /api/stats/storage endpoint
const { data: stats, error } = await supabase
  .from('files')
  .select('zona_id, file_size')
  .group_by('zona_id')
  .sum('file_size'); // Aggregate by zone
```

---

## Implementation Tasks

### Task 1: Add Secret Manager Client
- Install `@google-cloud/secret-manager` dependency
- Initialize client with retry logic
- Export `getSecret()` function

### Task 2: Update RcloneStorage Initialization
- Load credentials at module startup
- Cache in memory (24h token TTL)
- Implement `initializeCredentials()` function
- Call from server.js at startup

### Task 3: Update Alist Login in RcloneStorage
- Refactor Alist login into separate function
- Use `loginToAlist()` with retry logic
- Log success/failure with context
- Used by: `getRawUrl()`, `uploadDirect()`, `uploadMedia()`, `deleteFile()`, `listFiles()`

### Task 4: Add Fallback Mechanism
- If Secret Manager unavailable, use env vars
- If env vars missing, use hardcoded dev defaults
- Log which source was used (SECRET_MANAGER | ENV | FALLBACK)
- Only use FALLBACK in dev environments

### Task 5: Add Integration Tests
- Test successful Alist login
- Test Alist login failure + retry
- Test file listing via RcloneStorage
- Test getRawUrl with valid/invalid credentials
- Mock Secret Manager for tests

### Task 6: Verify Deployment
- Deploy to Cloud Run
- Check logs for credential sourcing
- Verify stats endpoint returns > 0 files
- Test file download via getRawUrl
- Confirm no 401 errors

---

## Error Handling Matrix

| Scenario | Error | Current Behavior | New Behavior |
|----------|-------|-----------------|--------------|
| Alist password wrong | 401 Unauthorized | Throw, process dies | Log context, retry, throw with hint |
| Secret Manager unavailable | Permission denied | N/A | Use env var/fallback, log warning |
| Alist timeout | ETIMEDOUT | Throw immediately | Retry once, log duration, throw |
| Network unreachable | ECONNREFUSED | Throw immediately | Log endpoint, throw with diagnosis |
| Token expired | Implicit (new login) | Get new token | Refresh from cache if available |

---

## Rollback & Recovery

**If deployment fails**:
1. Revert to previous Cloud Run revision (automatic in GCP)
2. Check Secret Manager values with:
   ```bash
   gcloud secrets versions list arsip-alist-password --project=arsipanka
   ```
3. Manually trigger redeploy:
   ```bash
   gcloud run deploy arsipankabaru --region asia-southeast1 --project=arsipanka
   ```

**If Alist service is down**:
- Users will see 0 files (database still shows them)
- Health check `/api/heartbeat` still responds (server is up)
- File download will fail with "Alist unavailable" error
- Resolution: Restart Alist container or check Alist logs

---

## Dependencies & Libraries

### New Dependencies
- `@google-cloud/secret-manager@^4.0.0` - Access Secret Manager from Cloud Run

### Existing Dependencies (Already in package.json)
- `@supabase/supabase-js` - Database queries
- `dotenv` - Environment variables
- `express` - HTTP server

### Testing Dependencies
- `jest@^29.7.0` - Test framework
- `supertest@^7.2.2` - HTTP testing

