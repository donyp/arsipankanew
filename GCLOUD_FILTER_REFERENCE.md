# gcloud Filter Syntax Reference

Panduan lengkap untuk menggunakan filter di gcloud commands.

---

## Common gcloud Filter Issues

### Issue 1: Wildcard (*) Tidak Bekerja

❌ **WRONG:**
```powershell
gcloud secrets list --filter="name:arsip-*"
```

✅ **CORRECT OPTIONS:**

**Option 1: MATCHES (Regex) - RECOMMENDED**
```powershell
gcloud secrets list --filter="name:matches(arsip-.*)"
```

**Option 2: CONTAINS**
```powershell
gcloud secrets list --filter="name:contains(arsip)"
```

**Option 3: REGEX**
```powershell
gcloud secrets list --filter="name=~arsip-"
```

---

## Filter Syntax by Operation

### String Operations

| Operation | Syntax | Example |
|-----------|--------|---------|
| **Exact match** | `field:value` | `name:arsip-jwt-secret` |
| **Regex (MATCHES)** | `field:matches(regex)` | `name:matches(arsip-.*)` |
| **Contains** | `field:contains(text)` | `name:contains(arsip)` |
| **Regex shorthand** | `field=~regex` | `name=~arsip-` |
| **Not equal** | `field!=value` | `name!=old-secret` |
| **Starts with** | `field:matches(^value)` | `name:matches(^arsip)` |
| **Ends with** | `field:matches(value$)` | `name:matches(secret$)` |

---

## Gcloud Secrets Commands with Correct Filters

### List Commands

```powershell
# List ALL secrets
gcloud secrets list

# List secrets starting with "arsip"
gcloud secrets list --filter="name:matches(arsip-.*)"

# List secrets containing "terabox"
gcloud secrets list --filter="name:contains(terabox)"

# List secrets created after a date
gcloud secrets list --filter="created>=2024-06-01"

# List secrets with specific label
gcloud secrets list --filter="labels.env:production"

# Combine multiple filters (AND)
gcloud secrets list --filter="name:contains(arsip) AND created>=2024-06-01"

# OR condition
gcloud secrets list --filter="name:contains(jwt) OR name:contains(secret)"
```

### Detailed Output Formats

```powershell
# Table format (default)
gcloud secrets list

# JSON format
gcloud secrets list --format=json

# Custom format
gcloud secrets list --format="table(name, created, labels)"

# List only names
gcloud secrets list --format="value(name)"

# List with filter and format
gcloud secrets list --filter="name:matches(arsip-.*)" --format="table(name, created)"
```

### Create/Describe with Exact Matching

```powershell
# Describe specific secret
gcloud secrets describe arsip-jwt-secret

# Get specific version
gcloud secrets versions list arsip-jwt-secret

# Get latest version content (to verify)
gcloud secrets versions access latest --secret arsip-jwt-secret
```

---

## Your Current Secrets - Verify All Are There

### Quick Check

```powershell
# Lihat semua arsip secrets
gcloud secrets list --filter="name:matches(arsip-.*)"
```

**Expected output (7 secrets):**
```
NAME                      CREATED              REPLICATION    USER_MANAGED
arsip-jwt-secret          2026-06-24T04:16:44  automatic       -
arsip-supabase-key        2026-06-24T04:11:13  automatic       -
arsip-supabase-url        2026-06-24T04:10:13  automatic       -
arsip-terabox-crypt       2026-06-24T04:25:01  automatic       -
arsip-terabox-pass        2026-06-24T04:24:35  automatic       -
arsip-terabox-url         2026-06-24T04:21:10  automatic       -
arsip-terabox-user        2026-06-24T04:24:03  automatic       -
```

### Verify Individual Secrets

```powershell
# Check each secret
gcloud secrets describe arsip-jwt-secret
gcloud secrets describe arsip-supabase-url
gcloud secrets describe arsip-supabase-key
gcloud secrets describe arsip-terabox-url
gcloud secrets describe arsip-terabox-user
gcloud secrets describe arsip-terabox-pass
gcloud secrets describe arsip-terabox-crypt
```

---

## Common Filter Patterns for Cloud Run

### For Secrets

```powershell
# Production secrets
gcloud secrets list --filter="name:contains(prod)"

# Development secrets
gcloud secrets list --filter="name:contains(dev)"

# By creation date
gcloud secrets list --filter="created<2024-06-01"

# Multiple projects (if needed)
gcloud secrets list --filter="labels.project:arsipanka"
```

### For Services

```powershell
# List Cloud Run services
gcloud run services list

# Filter by region
gcloud run services list --region=asia-southeast1

# Filter by platform
gcloud run services list --platform=managed

# List arsip-anka service
gcloud run services list --filter="name:arsip-anka"
```

---

## Query Language Reference

### Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `AND` | Logical AND | `name:contains(arsip) AND created>=2024-06-01` |
| `OR` | Logical OR | `name:contains(jwt) OR name:contains(secret)` |
| `NOT` | Logical NOT | `NOT name:contains(old)` |
| `()` | Grouping | `(name:contains(jwt) OR name:contains(secret)) AND created>=2024-06-01` |

### Comparison Operators

| Operator | Meaning |
|----------|---------|
| `:` | Contains (for strings) |
| `=` | Equals |
| `!=` | Not equals |
| `>` | Greater than (numbers/dates) |
| `<` | Less than (numbers/dates) |
| `>=` | Greater or equal |
| `<=` | Less or equal |
| `=~` | Regex match |
| `:matches()` | Regex match function |

---

## Troubleshooting

### Filter not working?

1. **Check syntax:**
   - Use `:matches()` not `:*`
   - Use `--filter=""` (double quotes on Windows)

2. **No results?**
   - Try `gcloud secrets list` tanpa filter untuk lihat apa ada
   - Check apakah Anda di project yang benar

3. **Error message?**
   - Check di https://cloud.google.com/sdk/gcloud/reference/filter-expressions

---

## Your Working Commands

**Simpan ini untuk reference:**

```powershell
# List semua arsip secrets (YANG BEKERJA)
gcloud secrets list --filter="name:matches(arsip-.*)"

# Alternative yang juga bekerja
gcloud secrets list --filter="name:contains(arsip)"

# List hanya names
gcloud secrets list --filter="name:matches(arsip-.*)" --format="value(name)"

# Verify specific secret
gcloud secrets describe arsip-jwt-secret

# Check latest version of a secret
gcloud secrets versions access latest --secret arsip-jwt-secret
```

---

## Next: Proceed with Cloud Run Deployment

Sekarang semua secrets Anda sudah ada, Anda siap untuk:

**`START_CLOUD_RUN.md` → STEP 3: Deploy to Cloud Run**

Command deployment:
```powershell
.\CLOUD_RUN_DEPLOYMENT_SCRIPT.ps1
```

Atau manual:
```powershell
gcloud run deploy arsip-anka --source=. --region asia-southeast1 \
  --set-secrets SUPABASE_URL=arsip-supabase-url:latest \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=arsip-supabase-key:latest \
  --set-secrets JWT_SECRET=arsip-jwt-secret:latest \
  --set-secrets TERABOX_WEBDAV_URL=arsip-terabox-url:latest \
  --set-secrets TERABOX_USER=arsip-terabox-user:latest \
  --set-secrets TERABOX_PASS=arsip-terabox-pass:latest \
  --set-secrets TERABOX_CRYPT_PASSWORD=arsip-terabox-crypt:latest
```

Good luck! 🚀
