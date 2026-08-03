# 🚀 Production Optimization Guide

Panduan untuk mengoptimalkan Pusat Arsip Anka di production (Hugging Face Spaces).

---

## 1. Docker Build Optimization

### Reduce Image Size

Current size: ~350-400MB (typical for Node.js 18 + dependencies)

**To reduce:**
```dockerfile
# Already optimized in provided Dockerfile:
✓ slim base image
✓ minimal dependencies
✓ .dockerignore configured
✓ npm cache cleared
```

**If needed:**
- Remove Alist: `# RUN curl -L ... alist` (saves ~50MB)
- Remove optional packages from package.json

### Faster Builds

```dockerfile
# Layer caching (already optimized)
✓ dependencies copied first (separate layer)
✓ application code copied last (faster rebuilds)
```

---

## 2. Memory & CPU Optimization

### Node.js Memory Settings

```env
NODE_OPTIONS=--max-old-space-size=512
```

**Tuning:**
- Default: 512MB
- For 3.5GB system: can increase to 1024
- For issues: reduce to 256

### Process Management

Recommended in `start.sh`:
```bash
# Single node process (no clustering for HF)
node server.js

# If needed: use clustering (more complex)
# node -e "require('cluster').isMaster ? ..." 
```

---

## 3. Database Optimization

### Supabase Query Optimization

```javascript
// ❌ Slow: fetch all, then filter
const all = await supabase.from('files').select('*');

// ✅ Fast: filter in database
const results = await supabase
    .from('files')
    .select('*')
    .eq('user_id', userId)
    .limit(20);
```

### Connection Pooling

Supabase handles this automatically - no action needed.

### Indexes

Create in Supabase dashboard for frequent queries:
```sql
-- Example: frequently searched fields
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_zona_id ON files(zona_id);
CREATE INDEX idx_users_email ON users(email);
```

---

## 4. API Performance

### Response Compression

```javascript
// Already in start.sh via Express
app.use(express.json());
```

### Caching Strategy

**Browser Cache:**
```javascript
app.use((req, res, next) => {
    res.set('Cache-Control', 'public, max-age=3600');
    next();
});
```

**Database Query Cache:** (via Supabase caching)

### Rate Limiting

```javascript
// Install: npm install express-rate-limit
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## 5. File Upload Optimization

### Current Configuration

```javascript
// backend/server.js
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
    }
});
```

### Optimizations

**Streaming to Storage:**
```javascript
// Current: Load to memory, then stream to rclone
// Future: Stream directly from request to rclone
```

**Compression:**
```javascript
// For PDF: already compressed format
// For other files: use gzip
```

---

## 6. Frontend Optimization

### Asset Minification

```html
<!-- Current: full files -->
<script src="js/dashboard.js"></script>

<!-- Optimized: minified versions -->
<script src="js/dashboard.min.js"></script>
```

**To minify:**
```bash
npm install -g terser
terser js/dashboard.js -o js/dashboard.min.js
```

### CSS Optimization

```css
/* Unused CSS removal */
npm install -D purgecss
purgecss --css css/style.css --content index.html js/*.js
```

### Lazy Loading Images

```html
<!-- Already optimized: no large images -->
<!-- If adding: use lazy loading -->
<img loading="lazy" src="image.jpg">
```

---

## 7. Monitoring & Logging

### Production Logging

```javascript
// In server.js
if (process.env.NODE_ENV === 'production') {
    console.log('[INFO]', message); // minimal logging
} else {
    console.log('[DEBUG]', message);
}
```

### Error Tracking

Consider adding (optional):
```javascript
// npm install sentry
const Sentry = require("@sentry/node");
Sentry.init({ dsn: process.env.SENTRY_DSN });
```

### Performance Monitoring

HF Spaces provides:
- CPU usage
- Memory usage
- Request logs
- Error logs

Access via Space dashboard > Analytics

---

## 8. Cold Start Optimization

### Reduce Startup Time

```bash
# Measure startup:
time node backend/server.js

# Target: < 10 seconds
```

**Current startup:**
1. Read environment (instant)
2. Connect Supabase (1-2 sec)
3. Start server (instant)
4. **Total: ~2-3 seconds**

**Optimizations:**
```javascript
// Lazy load Supabase
const supabase = null;

app.use(async (req, res, next) => {
    if (!supabase) {
        supabase = createClient(...);
    }
    next();
});
```

---

## 9. Container Health

### Health Check

```dockerfile
# Already in Dockerfile:
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:7860/api/heartbeat || exit 1
```

### Graceful Shutdown

```javascript
process.on('SIGTERM', async () => {
    console.log('Graceful shutdown...');
    await supabase.disconnect(); // if applicable
    process.exit(0);
});
```

---

## 10. Security in Production

### HTTPS

✅ Automatic via Hugging Face - no action needed

### Environment Variables

✅ Set in HF Space Settings (Secrets)

### CORS

Current setup: Allow all origins
```javascript
app.use(cors());
```

**For production:**
```javascript
app.use(cors({
    origin: 'https://YOUR_USERNAME-pusat-arsip-anka.hf.space',
    credentials: true
}));
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');
app.use('/api/login', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5 // only 5 login attempts per 15 minutes
}));
```

---

## 11. Scaling Considerations

### Horizontal Scaling

HF Spaces: Single container (no horizontal scaling)

**If needed more resources:**
- Upgrade to HF Pro tier
- Or deploy elsewhere (Railway, Render, etc)

### Vertical Scaling

Increase via HF:
- More CPU (GPU optional)
- More RAM
- Larger disk

---

## 12. Database Backups

### Supabase Auto-Backups

✅ Enabled by default

### Manual Backups

```bash
# Use Supabase CLI
supabase db download > backup.sql

# Or use Dashboard > Database > Backups
```

### Point-in-Time Recovery

✅ Available in Supabase Pro

---

## 13. Cost Optimization (HF Spaces Free Tier)

### Reduce Resource Usage

1. **Disable unused services:**
   - Comment out Alist in start.sh (saves memory)
   - Remove unnecessary npm packages

2. **Optimize database:**
   - Archive old data
   - Clean up unused files
   - Optimize queries

3. **Monitor usage:**
   - Check HF Space Analytics
   - Review request logs
   - Monitor memory/CPU

### Upgrade Path

If free tier insufficient:
- HF Pro: $9/month (more resources)
- Or switch to: Railway, Render, Vercel (serverless)

---

## 14. Deployment Checklist

Before deployment:

```bash
# Run health check
node health-check.js

# Verify environment
echo $NODE_ENV  # should be production
echo $PORT      # should be 7860

# Test locally (optional)
npm start  # in backend/

# Verify no secrets in code
grep -r "password\|secret\|key" . --exclude-dir=node_modules

# Clean up
rm -rf backend/tmp/*
rm -f *.log
```

---

## 15. Monitoring Alerts (Advanced)

Set up alerts for:
- High memory usage (>85%)
- High CPU usage (>80%)
- Response time > 2s
- Error rate > 1%
- Disk usage > 40GB

Tools:
- Sentry (error tracking)
- DataDog (monitoring)
- New Relic (APM)

---

## Summary

| Category | Current | Optimal | Effort |
|----------|---------|---------|--------|
| Docker Size | 350MB | <300MB | Low |
| Startup Time | 2-3s | <1s | Medium |
| Query Time | Varies | <100ms | Medium |
| Memory Use | ~200MB | ~150MB | Low |
| Response Time | <500ms | <200ms | High |

---

## Next Steps

1. Deploy to HF (as documented)
2. Monitor for 48 hours
3. Apply optimizations based on metrics
4. Scale if needed

---

**Questions?** Check production logs in HF Space dashboard.
