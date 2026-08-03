# Cara Mendapatkan JWT Secret dan Terabox Credentials

Panduan lengkap untuk gather semua credentials yang diperlukan untuk Cloud Run deployment.

---

## 1️⃣ JWT SECRET

### Apa itu JWT Secret?

JWT (JSON Web Token) Secret adalah password/kunci yang digunakan untuk:
- Generate token saat login
- Verify token saat API request
- Secure komunikasi antar aplikasi

### Cara Mendapatkan JWT Secret

#### Option A: Sudah punya di .env local (RECOMMENDED)

**Paling Mudah - Langsung dari .env yang sudah ada:**

```powershell
# Buka file .env di project
cat backend/.env | Select-String "JWT_SECRET"
```

Atau buka file dengan text editor:
- Path: `backend/.env`
- Cari baris: `JWT_SECRET=...`

**Contoh format:**
```
JWT_SECRET=arsip-digital-super-secret-key-very-long-random-string-12345
```

Copy value-nya (dari tanda `=` sampai akhir baris).

#### Option B: Generate JWT Secret baru (Jika hilang)

Jika JWT_SECRET hilang atau tidak ada, generate baru:

**Menggunakan Node.js:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Output akan seperti:
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Menggunakan OpenSSL (Windows Command Prompt):**
```cmd
openssl rand -hex 32
```

**Menggunakan PowerShell:**
```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

#### Option C: Generate Online (Tidak Recommended untuk production)

1. Buka: https://www.uuidgenerator.net/
2. Atau: https://lastpass.com/generate-password.php
3. Generate string 32+ karakter

Tapi untuk security, lebih baik gunakan method A atau B.

### Simpan JWT Secret

Simpan value yang Anda dapat ke file temporary:
```
JWT_SECRET = [PASTE_VALUE_HERE]
```

Anda akan perlukan ini untuk step secrets creation nanti.

---

## 2️⃣ TERABOX CREDENTIALS

### Apa itu Terabox?

Terabox adalah cloud storage dari Baidu (versi internasional dari Baidu Pan). Aplikasi Anda menggunakan Terabox untuk file storage via Rclone.

### Credentials yang Dibutuhkan

1. **TERABOX_WEBDAV_URL** - URL untuk WebDAV access
2. **TERABOX_USER** - Username/email Baidu Anda
3. **TERABOX_PASS** - Password Baidu Anda (or App Password)
4. **TERABOX_CRYPT_PASSWORD** - Encryption password untuk Rclone

### Cara Mendapatkan Terabox Credentials

#### Step 1: Check Current .env (Jika sudah ada)

```powershell
# Lihat .env yang ada
cat backend/.env | Select-String "TERABOX"
```

Atau buka `backend/.env` dengan text editor dan cari baris:
```
TERABOX_WEBDAV_URL=
TERABOX_USER=
TERABOX_PASS=
TERABOX_CRYPT_PASSWORD=
```

**Jika sudah ada di .env:** Copy value-nya, skip ke step 3.

#### Step 2: Setup Terabox WebDAV (Jika belum ada)

**2.1 Buka Terabox:**
- Go to: https://www.terabox.com (atau https://pan.baidu.com untuk Baidu Pan)
- Login dengan akun Baidu/Terabox Anda

**2.2 Enable WebDAV:**

Cari menu Settings/Pengaturan:
1. Terabox/Baidu Pan → Settings → 账户安全 (Account Security)
2. Cari opsi "Third-party applications" atau "应用授权"
3. Cari "Rclone" atau "WebDAV"
4. Jika ada, enable/authorize Rclone

**Atau manual cara:**

1. Buka: https://www.terabox.com/settings/security atau https://pan.baidu.com/accountsecurity
2. Cari: "应用授权管理" (App Authorization) atau "第三方应用" (Third-party Apps)
3. Cari Rclone, jika ada authorize
4. Jika tidak ada, perlu setup manual

**2.3 Get WebDAV URL:**

Cara 1 (Dari Rclone config yang sudah ada):
```powershell
# Jika sudah punya rclone.conf
cat rclone.conf | Select-String -Pattern "https://", "\[terabox\]"
```

Cara 2 (Generate URL manual):
```
https://dav.jianguoyun.com/dav/
```

atau

```
https://webdav.terabox.com/dav/
```

Atau cari di:
- Terabox documentation
- Rclone documentation untuk Terabox
- Google: "Terabox WebDAV URL"

#### Step 3: Kumpulkan Terabox Credentials

| Credential | Cara Dapat | Contoh |
|------------|-----------|--------|
| **TERABOX_WEBDAV_URL** | Dari rclone.conf atau setup WebDAV | `https://dav.jianguoyun.com/dav/` |
| **TERABOX_USER** | Email/username Baidu Anda | `yourname@gmail.com` atau `user@baidu.com` |
| **TERABOX_PASS** | Password Baidu Anda | `yourpassword123` |
| **TERABOX_CRYPT_PASSWORD** | Dari rclone.conf atau generate baru | `crypt-key-random-string` |

### Cara Check Terabox yang Sudah Ada

**Check dari rclone.conf (Jika sudah ada):**

```powershell
# Lihat file rclone.conf
cat rclone.conf
```

Atau buka file di path:
- Windows: `%AppData%\rclone\rclone.conf`
- Linux: `~/.config/rclone/rclone.conf`
- Mac: `~/.config/rclone/rclone.conf`

Contoh isi:
```ini
[terabox]
type = webdav
url = https://dav.jianguoyun.com/dav/
vendor = baiducloud
user = your-baidu-email@gmail.com
pass = [encrypted-password-by-rclone]
```

**Dari .env backend:**

```powershell
cat backend/.env | grep -i terabox
```

Contoh output:
```
TERABOX_WEBDAV_URL=https://dav.jianguoyun.com/dav/
TERABOX_USER=yourname@gmail.com
TERABOX_PASS=yourpassword123
TERABOX_CRYPT_PASSWORD=random-crypt-key
```

---

## 3️⃣ CREDENTIAL COLLECTION CHECKLIST

Gunakan template ini untuk kumpulkan semua credentials:

```
═══════════════════════════════════════════════════════════
CLOUD RUN CREDENTIALS CHECKLIST
═══════════════════════════════════════════════════════════

DATE COLLECTED: ________________

[ ] SUPABASE_URL
    Location: Supabase Dashboard → Settings → API → Project URL
    Value: https://ehdqcxzdmmcw...
    
[ ] SUPABASE_SERVICE_ROLE_KEY
    Location: Supabase Dashboard → Settings → API → service_role key
    Value: eyJhbGciOiJIUzI1NiIs...

[ ] JWT_SECRET
    Location: backend/.env atau generated
    Value: arsip-digital-super-...
    
[ ] TERABOX_WEBDAV_URL
    Location: rclone.conf atau Terabox WebDAV settings
    Value: https://dav.jianguoyun.com/dav/
    
[ ] TERABOX_USER
    Location: Baidu/Terabox account email
    Value: yourname@gmail.com
    
[ ] TERABOX_PASS
    Location: Baidu/Terabox password
    Value: ••••••••••
    
[ ] TERABOX_CRYPT_PASSWORD
    Location: rclone.conf atau generated
    Value: crypt-key-random-string

═══════════════════════════════════════════════════════════
```

---

## 4️⃣ STORING CREDENTIALS SECURELY

### ⚠️ SECURITY WARNING

**JANGAN:**
- ❌ Commit credentials ke Git
- ❌ Share credentials di Slack/Email
- ❌ Simpan di file tidak terenkripsi
- ❌ Copy-paste ke console/chat tanpa mask

### ✅ DO's

- ✅ Simpan temporary di file lokal (.gitignore)
- ✅ Delete setelah upload ke Secret Manager
- ✅ Use Google Secret Manager (recommended)
- ✅ Rotate credentials regularly

### Temporary Storage (Safe)

**Create temporary credentials file (Windows):**

```powershell
# Create file
$content = @"
SUPABASE_URL=https://ehdqcxzdmmcw...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
JWT_SECRET=arsip-digital-super-...
TERABOX_WEBDAV_URL=https://dav.jianguoyun.com/dav/
TERABOX_USER=yourname@gmail.com
TERABOX_PASS=yourpassword123
TERABOX_CRYPT_PASSWORD=crypt-key-random-string
"@

$content | Out-File -FilePath "C:\Temp\cloud-run-credentials.txt" -Encoding UTF8
```

**IMPORTANT: Delete file after upload to Secret Manager!**

```powershell
# Delete when done
Remove-Item "C:\Temp\cloud-run-credentials.txt"
```

---

## 5️⃣ NEXT STEPS

Setelah Anda punya semua credentials:

1. ✅ Simpan di temporary file
2. ✅ Run `CLOUD_RUN_SETUP_SECRETS.sh` untuk upload ke Secret Manager
3. ✅ Delete temporary file
4. ✅ Lanjut ke `START_CLOUD_RUN.md` Step 3

---

## 6️⃣ TROUBLESHOOTING

### JWT Secret tidak ketemu

**Solution:**
```powershell
# Generate baru
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Atau dari Node REPL
node
> require('crypto').randomBytes(32).toString('hex')
```

### Terabox WebDAV URL tidak valid

**Solution:**
1. Test connection dengan Rclone existing
2. Atau gunakan default URL:
   - https://dav.jianguoyun.com/dav/
   - https://webdav.terabox.com/dav/

### Terabox password tidak bekerja

**Solution:**
1. Test login langsung ke https://www.terabox.com
2. Jika OK, password benar
3. Gunakan App-specific password jika available
4. Check jika 2FA enabled

### Credential format salah

**Solution:**
- Pastikan tidak ada spasi di awal/akhir
- Pastikan tidak ada quotes di nilai
- Pastikan special characters properly escaped

---

## 7️⃣ REFERENCE LINKS

- Terabox: https://www.terabox.com
- Baidu Pan: https://pan.baidu.com
- Rclone Terabox: https://rclone.org/webdav/
- Terabox WebDAV: https://www.terabox.com/web/share/link
- JWT Intro: https://jwt.io

---

## Ready?

Setelah Anda punya semua credentials, lanjut ke:

**`START_CLOUD_RUN.md` → STEP 2: Create Secrets**

Good luck! 🚀
