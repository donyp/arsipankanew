# Alist Service Startup Issue - Investigation & Fixes

**Status**: In Progress - Debugging  
**Issue**: Alist service dies immediately in Cloud Run container  
**Impact**: File uploads fail with "fetch failed" errors  

---

## Problem Summary

When file upload is attempted:
- Log shows: `[Background Upload] Attempt X... Alist authentication failed: fetch failed`
- Root cause: Alist service not running on `localhost:5244`
- Service crashes during startup in Cloud Run (but works locally)

---

## Debugging Process

### Revision History

| Rev | Fix Attempted | Result | Error |
|-----|-------|---------|-------|
| 00012 | Initial deploy | Alist crashes immediately | N/A |
| 00013 | Remove `exec`, use signal traps | Alist crashes immediately | N/A |
| 00014 | Add nohup wrapper | Alist crashes immediately | N/A |
| 00015 | Add permission fixes, chmod 777 | Process dies immediately | (empty log) |
| 00016 | Add `--data` and `--db-path` flags | Process dies with help text | `alist server [flags]` printed |
| 00017 | Simplify to `alist server -p 5244` | Process dies with error | `Error: unknown shorthand flag: 'p' in -p` |
| 00018 | Try `alist server --port 5244` | Process dies with error | `Error: unknown flag: --port` |
| 00019 | Simplify to `alist server` (no flags) | Process still dies | Empty log file (no output) |

---

## Root Causes Identified

1. **✅ Exec issue**: `exec node server.js` was killing background Alist
   - **Fix**: Run Node in foreground, not with `exec`
   - **Status**: Implemented in revision 00013+

2. **✅ Flag syntax**: Alist doesn't recognize `-p` or `--port` flags
   - **Tested**: Both flags rejected
   - **Current**: Running `alist server` without flags
   - **Result**: Unknown - Alist appears to start but logs are empty

3. **🔄 Unknown**: Why Alist doesn't output to log file
   - Alist may use stdout/stderr differently in this version
   - May require config file for port customization
   - May need different startup syntax

---

## Next Steps to Try

### Option 1: Check Alist config file format
```bash
# Connect to container and check what Alist created
gcloud run revisions exec --source rev-id -- /bin/bash
# Inside container:
ls -la /root/.config/alist/
cat /root/.config/alist/config.json  # Check if port can be configured here
```

### Option 2: Try alternative Alist startup methods
```bash
# Maybe Alist has a service/daemon command?
alist service
alist daemon
# Or maybe it requires different flags format
alist start
alist run
```

### Option 3: Check if Alist is actually running despite no log output
```bash
# Inside container:
ps aux | grep alist
netstat -tuln | grep 5244
curl http://localhost:5244/
```

### Option 4: Try running Alist with verbose/debug flags
```bash
alist server --verbose
alist server --debug
alist server -v
```

### Option 5: Use environment variables for configuration
```bash
export ALIST_PORT=5244
alist server
# Or
ALIST_PORT=5244 alist server
```

---

## Symptoms

✅ **Working**:
- Cloud Run service starts successfully
- Node.js backend listens on port 8080
- Health check `/api/heartbeat` returns 200
- No 401 errors (because we're not even reaching Alist)

❌ **Not Working**:
- Alist process doesn't survive startup
- File uploads fail with "fetch failed" errors
- All 16+ deployment attempts show same issue
- Alist log file remains empty

---

## Configuration Being Attempted

**Start Command**:
```bash
alist server
```

**Directory Created**:
- `/root/.config/alist` - Default Alist config directory

**Port Expected**:
- 5244 (Alist default)

**Node.js Backend**:
- Connects to `http://127.0.0.1:5244` for file operations
- Uses correct credentials
- All retry logic working

---

## Files Modified

1. `start.sh` - Multiple iterations of Alist startup
2. `Dockerfile` - No changes (uses default Alist installation)
3. `backend/rclone_wrapper.js` - No changes needed (credentials and retry logic working)

---

## Commits

```
06d1a60 fix: use correct Alist flag --port instead of -p
0b3151c fix: start Alist without port flag - use default configuration
... (earlier commits with other attempts)
```

---

## Questions to Investigate

1. Does this version of Alist actually support command-line port configuration?
2. Is Alist running but not accessible on port 5244?
3. Does Alist need a config file to specify port before startup?
4. Is there a permission/capability issue preventing Alist startup?
5. Does the Alist binary in this Docker image have specific requirements?

---

## Potential Solutions

### A. Modify Dockerfile to use different Alist version or installation method
- Current: Downloads latest via curl
- Alternative: Build from source with specific version
- Alternative: Use pre-configured Alist container

### B. Use Alist config file instead of CLI flags
- Create `/root/.config/alist/config.json` with port: 5244
- Start Alist after config is written

### C. Skip Alist entirely for uploads (workaround)
- Configure rclone to handle file operations directly
- Upload to Terabox without Alist middleware
- Not ideal but functional

### D. Use Docker Compose instead of single container
- Separate Alist service in its own container
- Network communication between services
- More reliable but more complex

---

## Impact Assessment

**Severity**: HIGH - File uploads completely blocked  
**Scope**: Cloud Run production deployment  
**Workaround**: None currently (local testing works fine)  
**Users Affected**: All file upload operations

---

## Success Criteria

When fixed:
- [ ] `alist server` command outputs startup messages to log
- [ ] Process stays running (PID doesn't die immediately)
- [ ] Listening on localhost:5244
- [ ] File uploads successful
- [ ] No "fetch failed" errors

---

**Last Updated**: 2026-06-24 08:59 UTC  
**Revision**: 00019-9bd  
**Next Action**: Connect to running container to investigate Alist behavior
