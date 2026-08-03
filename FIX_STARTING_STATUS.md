# Fix for "Starting" Status Issue

## Problem
App stuck in "starting" status on Hugging Face Spaces, not transitioning to "running".

## Root Causes Fixed

### 1. **Health Check Timeout** ✅ (Dockerfile)
**Issue**: Health check timeout was too short (40s start-period, 10s timeout)
**Solution**: Increased timeouts to handle Supabase connection delays
```dockerfile
# OLD: HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3
# NEW: HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5
```

### 2. **Environment Variables Loading** ✅ (backend/server.js)
**Issue**: `.env` file was loaded AFTER Supabase client initialization
**Solution**: Moved `require('dotenv').config()` to the very top (before using variables)

### 3. **Missing Configuration Logging** ✅ (backend/server.js)
**Issue**: No visibility into what environment variables were actually loaded
**Solution**: Added detailed logging showing:
- PORT configuration
- NODE_ENV status
- SUPABASE_URL (first 20 chars to verify it's loaded)
- SUPABASE_SERVICE_ROLE_KEY (first 20 chars)
- JWT_SECRET (first 20 chars)

## Changes Made

### File 1: Dockerfile
```dockerfile
# BEFORE
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:7860/api/heartbeat || exit 1

# AFTER
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:7860/api/heartbeat || exit 1
```

### File 2: backend/server.js
```javascript
// BEFORE: dotenv loaded after variable usage
const app = express();
const port = process.env.PORT || 4000;
require('dotenv').config(...);

// AFTER: dotenv loaded first
require('dotenv').config(...);
const app = express();
const port = process.env.PORT || 4000;
console.log('[CONFIG] SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
```

## Expected Startup Logs After Fix

```
================================================
[BOOT] Pusat Arsip Anka - v2.1.0-fixed
[BOOT] Time: 2026-06-22T07:57:09.363Z
================================================
[CONFIG] Reading environment variables...
[CONFIG] PORT: 7860
[CONFIG] NODE_ENV: production
[CONFIG] SUPABASE_URL: SET (https://xxxxx.supabase...)
[CONFIG] SUPABASE_SERVICE_ROLE_KEY: SET (eyJhbGciOi...)
[CONFIG] JWT_SECRET: SET (arsip-digital...)
[CONFIG] Environment configuration loaded.

🚀 Backend starting on port 7860
✅ Backend listening on port 7860
🚀 Pusat Arsip Anka Backend v2.1 running on http://localhost:7860
   Auth: JWT (8h expiry)
   Storage: Rclone (Terabox + Storj)
   DB: Supabase PostgreSQL
```

If you see the configuration logged, that means variables are loaded correctly!

## Deployment Steps

1. **Commit changes:**
   ```bash
   git add .
   git commit -m "Fix: Increase health check timeout + improve env var loading"
   ```

2. **Push to Hugging Face:**
   ```bash
   git push -u hf main
   ```

3. **Monitor Space:**
   - Watch the build logs
   - Space should transition: building → starting → running (within 3-5 min)
   - If still stuck, check app logs for config errors

## Troubleshooting Checklist

If app still won't transition to "running":

- [ ] **Check logs for "❌ NOT SET"** - If any secrets show "❌ NOT SET", they're not being passed correctly
  - Solution: Re-enter the secret in Hugging Face Space Settings > Secrets
  
- [ ] **Check SUPABASE_URL format** - Must be: `https://xxxxx.supabase.co`
  - Solution: Verify in Space Settings > Secrets
  
- [ ] **Check SUPABASE_SERVICE_ROLE_KEY format** - Must be long alphanumeric string
  - Solution: Verify in Space Settings > Secrets (compare first 20 chars)
  
- [ ] **Check JWT_SECRET** - Should be at least 32 random characters
  - Solution: Generate new: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  
- [ ] **Manual health check** - Try accessing the app directly
  - URL: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space/api/heartbeat`
  - Should return: `{"status":"alive","version":"2.0.1-fixed"}`
  
- [ ] **Check Supabase status** - Verify Supabase is accessible
  - Go to supabase.com and check your project status
  - Verify network connectivity from your location

## What These Changes Do

### Health Check Improvements
- **start-period 60s**: Waits 60 seconds before first health check (allows Supabase connection)
- **timeout 15s**: Allows up to 15 seconds for each health check (Supabase queries might take time)
- **retries 5**: Tries 5 times before marking unhealthy (more resilient)

### Configuration Logging
- Shows exactly what environment variables were loaded
- Makes it easy to spot if a secret is missing
- Helps debug production issues

### Variable Loading Order
- dotenv now loads before any code that uses `process.env`
- Ensures all variables are available when needed
- Prevents "undefined" errors from missing env vars

## Expected Result

✅ Container transitions to "Running" status within 3-5 minutes
✅ Health checks pass
✅ App is accessible at `https://YOUR_USERNAME-pusat-arsip-anka.hf.space`
✅ Startup logs show all configuration properly loaded

---

**Status**: Ready for deployment!
