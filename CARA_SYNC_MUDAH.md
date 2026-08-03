# Cara Sync File - Metode Termudah

## Problem dengan Metode Console

1. Browser warning "allow pasting" - security feature
2. Token expired atau tidak valid
3. Response undefined

## ✅ Solusi Termudah: Gunakan curl

### Step 1: Login dan Dapatkan Token

1. Buka: `https://ankaindonesia-e-arsipanka.hf.space`
2. Login dengan kredensial super_admin
3. Setelah login, buka DevTools (F12)
4. Klik tab "Console"
5. Ketik: `localStorage.getItem('token')`
6. Copy token yang muncul (tanpa tanda kutip)

### Step 2: Jalankan Sync via curl

Buka Command Prompt/Terminal dan jalankan:

```bash
curl -X POST https://ankaindonesia-e-arsipanka.hf.space/api/system/sync-terabox \
  -H "Authorization: Bearer PASTE_TOKEN_DISINI" \
  -H "Content-Type: application/json"
```

**Ganti `PASTE_TOKEN_DISINI` dengan token dari Step 1**

### Step 3: Tunggu Response

Response akan menampilkan:
```json
{
  "success": true,
  "totalFilesFound": 150,
  "totalFilesImported": 150,
  "totalFilesSkipped": 0,
  "message": "Successfully imported 150 files"
}
```

### Step 4: Refresh Dashboard

Buka kembali dashboard dan refresh (F5). File sekarang muncul!

---

## ⚠️ Troubleshooting

### "Token tidak valid atau expired"

**Penyebab:** Token JWT sudah expired (default 8 jam)

**Solusi:**
1. Logout dan login ulang
2. Dapatkan token baru dari localStorage
3. Jalankan curl lagi dengan token baru

### "Unauthorized" atau "403"

**Penyebab:** User bukan super_admin atau moderator

**Solusi:**
1. Pastikan login sebagai super_admin
2. Check role di database: `SELECT role FROM users WHERE email = 'your@email.com'`

### Response "undefined"

**Penyebab:** API error atau Alist tidak running

**Solusi:**
1. Check Hugging Face logs
2. Pastikan Alist running: `[INIT] Alist started with PID`
3. Check secrets Rclone sudah lengkap

---

## 🎯 Alternatif: Restart dengan Auto-Sync

Jika masih error, saya bisa tambahkan **auto-sync saat startup** sehingga tidak perlu manual.

---

**Coba metode curl di atas terlebih dahulu!**
