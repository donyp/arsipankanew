# 🔗 Integration Guide - Third Party Services

Panduan untuk mengintegrasikan Pusat Arsip Anka dengan layanan pihak ketiga.

---

## 📊 Supabase Integration (REQUIRED)

### Setup

1. **Create Account**
   - Go to https://supabase.com
   - Sign up with email/GitHub
   - Create new project

2. **Get Credentials**
   - Dashboard > Settings > API
   - Copy: **Project URL** → `SUPABASE_URL`
   - Copy: **Service Role Secret** → `SUPABASE_SERVICE_ROLE_KEY`

3. **Set Environment Variables**
   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
   ```

### Database Setup

Supabase automatically creates tables. If needed to restore:

```bash
# Download schema
supabase db download > schema.sql

# Restore
supabase db push < schema.sql
```

### Authentication in Supabase

The app uses JWT with custom auth (not Supabase Auth):
- User login handled by backend
- Passwords hashed with bcryptjs
- JWT tokens issued by backend
- Supabase used only for data storage

---

## 📱 WhatsApp Integration (OPTIONAL)

### Setup Fonnte

1. **Create Account**
   - Go to https://fonnte.com
   - Register dengan nomor WhatsApp
   - Get API token

2. **Configure**
   ```env
   FONNTE_TOKEN=your-token-here
   ```

3. **Send Notification**
   ```javascript
   // Example: backend/server.js
   const sendWhatsApp = async (phone, message) => {
       const response = await fetch('https://api.fonnte.com/send', {
           method: 'POST',
           headers: {
               'Authorization': process.env.FONNTE_TOKEN,
               'Content-Type': 'application/json'
           },
           body: JSON.stringify({
               target: phone,
               message: message
           })
       });
       return response.json();
   };
   ```

### Features

- Notification notifications
- Upload alerts
- User registrations
- Admin alerts

---

## ☁️ Cloud Storage Integration

### Terabox (via Rclone)

**Already configured in project**

### Setup Rclone

1. **Install Rclone**
   - Download: https://rclone.org/downloads/
   - Or: `apt-get install rclone` (Linux)

2. **Configure Terabox**
   ```bash
   rclone config
   
   # Choose: new remote
   # Name: terabox
   # Type: Baidu (or Terabox)
   # Follow oauth flow
   ```

3. **Test Connection**
   ```bash
   rclone ls terabox:/
   ```

4. **Use in App**
   ```javascript
   // Already handled in backend/rclone_wrapper.js
   const { execSync } = require('child_process');
   
   // Upload file
   execSync(`rclone copy ${localFile} terabox:/uploads/`);
   ```

### Alternative Providers

**Support via Rclone:**
- Google Drive
- Dropbox
- OneDrive
- AWS S3
- Azure Blob Storage

**To switch:**
1. Run: `rclone config`
2. Add new remote (e.g., gdrive)
3. Update `STORAGE_BACKEND` in .env
4. Update rclone_wrapper.js

---

## 📂 Alist Integration (OPTIONAL)

### What is Alist?

- Open-source file manager
- Web-based interface
- Support multiple backends (Terabox, Google Drive, etc)
- Optional but useful

### Enable/Disable

**Enable:**
```bash
# Already enabled in start.sh
alist server --data /app/data
```

**Disable:**
```bash
# Comment out in start.sh:
# alist server --data /app/data > /app/data/log/alist.log 2>&1 &
```

### Access Alist

After deployment:
- URL: `https://YOUR_USERNAME-pusat-arsip-anka.hf.space:5244`
- Default: admin/admin123 (change on first login)

### Configure Alist Storage

1. Go to Alist > Storage
2. Add new storage
3. Connect Terabox/other providers
4. Set as display path

---

## 🔐 Security Integrations

### JWT Authentication

**Already configured**

```javascript
// Backend automatically handles:
// - Token generation
// - Token validation
// - Expiry (24 hours default)
// - Refresh tokens (optional)
```

### Password Security

```javascript
// Uses bcryptjs
// Already implemented in server.js
```

### SSL/HTTPS

✅ Automatic via Hugging Face

---

## 📈 Monitoring & Analytics (ADVANCED)

### Option 1: Sentry (Error Tracking)

```bash
npm install @sentry/node
```

```javascript
const Sentry = require("@sentry/node");

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV
});

app.use(Sentry.Handlers.requestHandler());
```

### Option 2: LogRocket (Session Replay)

```bash
npm install logrocket
```

```javascript
import LogRocket from 'logrocket';
LogRocket.init('app/org-slug');
```

### Option 3: Google Analytics

```html
<!-- Add to index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 💬 Communication Integrations

### Email (Optional)

```bash
npm install nodemailer
```

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: recipient,
    subject: 'File Upload Notification',
    text: 'Your file has been uploaded successfully'
});
```

### SMS (Optional)

```bash
npm install twilio
```

```javascript
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

client.messages.create({
    body: 'Your file is ready',
    from: process.env.TWILIO_PHONE,
    to: userPhone
});
```

---

## 🗄️ Database Integrations

### PostgreSQL Connection (Supabase)

```javascript
// Already integrated via @supabase/supabase-js
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Usage
const { data, error } = await supabase
    .from('table_name')
    .select('*');
```

### Backup to SQLite (Local)

```bash
npm install better-sqlite3
```

```javascript
const Database = require('better-sqlite3');
const db = new Database('backup.db');

// Sync data periodically
const stmt = db.prepare('INSERT INTO files VALUES (?, ?, ?)');
stmt.run(id, name, path);
```

---

## 🔄 Webhook Integrations

### Incoming Webhooks

```javascript
app.post('/api/webhooks/upload', (req, res) => {
    // Handle webhook from external service
    const { event, data } = req.body;
    
    if (event === 'file.uploaded') {
        // Process file
        processFile(data);
    }
    
    res.json({ success: true });
});
```

### Outgoing Webhooks

```javascript
// Notify external service on event
const notifyWebhook = async (url, data) => {
    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
};

// Usage
await notifyWebhook(
    process.env.WEBHOOK_URL,
    { event: 'file_uploaded', file: fileData }
);
```

---

## 🔌 API Integrations

### REST API Clients

The app already provides REST APIs:

```javascript
// Login
POST /api/login
{
    "email": "user@example.com",
    "password": "password"
}

// List files
GET /api/files
Authorization: Bearer <JWT_TOKEN>

// Upload file
POST /api/upload
(multipart/form-data)
Authorization: Bearer <JWT_TOKEN>
```

### Integration Example

```python
# Python client
import requests

# Login
response = requests.post('https://app.hf.space/api/login', json={
    'email': 'user@example.com',
    'password': 'password'
})
token = response.json()['token']

# List files
response = requests.get(
    'https://app.hf.space/api/files',
    headers={'Authorization': f'Bearer {token}'}
)
files = response.json()
```

---

## 🔑 API Key Management

### Generate Keys

```javascript
const generateApiKey = () => {
    return require('crypto').randomBytes(32).toString('hex');
};
```

### Store Keys Securely

```sql
-- Supabase
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    key_hash TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);
```

### Use Keys

```javascript
app.use((req, res, next) => {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json({ error: 'Missing key' });
    
    // Verify key in database
    next();
});
```

---

## 🎯 Integration Checklist

### Before Going Live

- [ ] Supabase connected and tested
- [ ] JWT_SECRET set securely
- [ ] CORS configured correctly
- [ ] Error handling in place
- [ ] Logging configured
- [ ] Database backups enabled
- [ ] SSL/HTTPS verified
- [ ] Rate limiting configured
- [ ] Input validation in place
- [ ] Security headers set

### Optional Integrations

- [ ] Fonnte (WhatsApp) configured
- [ ] Alist enabled/disabled as needed
- [ ] Rclone storage configured
- [ ] Monitoring/analytics setup
- [ ] Email notifications (optional)
- [ ] Webhooks configured

---

## 📚 API Documentation

### Authentication

```javascript
// POST /api/login
// Body: { email, password }
// Response: { token, user }

// Headers: Authorization: Bearer <token>
```

### File Operations

```javascript
// GET /api/files - List files
// POST /api/upload - Upload file
// GET /api/files/:id - Get file
// PUT /api/files/:id - Update file
// DELETE /api/files/:id - Delete file
```

### User Operations

```javascript
// GET /api/users - List users
// POST /api/users - Create user
// GET /api/users/:id - Get user
// PUT /api/users/:id - Update user
// DELETE /api/users/:id - Delete user
```

---

## 🚀 Deployment with Integrations

**Recommended sequence:**

1. Deploy to HF (Docker + basic config)
2. Verify Supabase integration
3. Test authentication
4. Add optional integrations
5. Configure monitoring
6. Go live

---

**Need help?**
- Check Supabase docs: https://supabase.com/docs
- Check Fonnte docs: https://fonnte.com/docs
- Check Rclone docs: https://rclone.org/docs
