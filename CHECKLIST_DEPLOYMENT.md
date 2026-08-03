# Checklist Deployment & Testing

## ✅ Phase 1: Deployment (SELESAI)

- [x] App running di Hugging Face ✅
- [x] Status "Running" (bukan "starting") ✅
- [x] Server listen pada 0.0.0.0:7860 ✅
- [x] Environment variables di-load dengan benar ✅

## ⏳ Phase 2: Setup Storage (IN PROGRESS)

### Step 1: Deploy Kode Terbaru

```bash
git add .
git commit -m "Add: Rclone config from env vars + localhost clarification"
git push -u hf main
```

- [ ] Kode ter-push ke Hugging Face
- [ ] Build selesai tanpa error
- [ ] App restart dengan sukses

### Step 2: Tambahkan Secrets untuk Rclone/Terabox

Di **Space Settings → Variables and Secrets → Secrets**, tambahkan:

- [ ] `TERABOX_WEBDAV_URL` = `http://localhost:5244/dav/terabox`
- [ ] `TERABOX_USER` = `admin`
- [ ] `TERABOX_PASS` = `jQWUqfvMZ6pXuG8G4epx4upNt6M-Soje9zIJZBecww`
- [ ] `TERABOX_CRYPT_PASSWORD` = `uR-oRsbNnnKcfycXNO_4o4i5luHbnE-ncDCN3JaRvC4`
- [ ] `ALIST_ADMIN_PASSWORD` = `AdminArsip2026!`
- [ ] `STORJ_ACCESS_KEY` = `dummy`
- [ ] `STORJ_SECRET_KEY` = `dummy`
- [ ] `STORJ_ENDPOINT` = `https://gateway.storjshare.io`

### Step 3: Restart Space

- [ ] Klik "Settings" → "Restart this space"
- [ ] Tunggu restart selesai (~2-3 menit)

### Step 4: Verifikasi Logs

Cek App logs, harus muncul:

```
[INIT] Generating rclone.conf from environment variables...
[RcloneConfig] Generated rclone.conf from environment variables
[RcloneConfig] Terabox URL: http://localhost:5244/dav/terabox
[RcloneConfig] Terabox User: admin
[RcloneConfig] Config written to: /app/rclone.conf
[INIT] ✅ Alist started with PID: XX on port 5244
✅ Backend listening on 0.0.0.0:7860
```

- [ ] Logs menampilkan "Generated rclone.conf"
- [ ] Logs menampilkan "Alist started with PID"
- [ ] Logs menampilkan "Backend listening on 0.0.0.0:7860"
- [ ] Tidak ada error di logs

## ⏳ Phase 3: Testing Aplikasi

### URL Aplikasi

**Akses melalui:**
```
https://YOUR_USERNAME-pusat-arsip-anka.hf.space
```

**JANGAN akses via:**
```
http://localhost:7860  ← INI TIDAK AKAN BERFUNGSI
```

### Test 1: Akses UI

- [ ] Buka `https://username-pusat-arsip-anka.hf.space`
- [ ] Halaman login muncul
- [ ] CSS/JS loaded dengan benar
- [ ] Tidak ada error 404 di console

### Test 2: Login

- [ ] Masukkan email admin (dari Supabase)
- [ ] Masukkan password admin
- [ ] Klik "Login"
- [ ] Redirect ke dashboard
- [ ] Dashboard tampil dengan benar

### Test 3: Database Connection (Supabase)

- [ ] Dashboard menampilkan data dari database
- [ ] List zona/toko muncul (jika ada)
- [ ] User info muncul di header
- [ ] Tidak ada error "Supabase connection failed"

### Test 4: File Upload (Rclone/Terabox)

- [ ] Klik tombol "Upload File"
- [ ] Pilih file PDF
- [ ] Isi metadata (zona, toko, category)
- [ ] Klik "Upload"
- [ ] Progress bar muncul
- [ ] Upload selesai tanpa error
- [ ] File muncul di list

**Jika upload gagal:**
- Cek logs untuk error message
- Pastikan semua secrets Rclone sudah ditambahkan
- Cek Alist running (PID di logs)

### Test 5: File Download

- [ ] Klik file yang sudah di-upload
- [ ] Klik tombol "Download"
- [ ] File ter-download dengan benar
- [ ] File bisa dibuka tanpa error

**Jika download gagal:**
- Cek logs untuk error
- Cek koneksi Alist ke Terabox
- Verifikasi file ada di Terabox

### Test 6: File Preview (Optional)

- [ ] Klik file PDF
- [ ] Preview muncul di browser
- [ ] PDF bisa di-scroll
- [ ] Preview tidak error

## 🐛 Troubleshooting

### Jika Upload Gagal

**Check:**
1. Logs menampilkan error apa?
2. Apakah semua secrets Rclone sudah ditambahkan?
3. Apakah Alist sudah running? (cek PID di logs)
4. Apakah rclone.conf ter-generate? (cek logs)

**Common Errors:**
- `Alist login failed` → Cek `ALIST_ADMIN_PASSWORD`
- `Failed to fetch raw URL` → Alist tidak running atau config salah
- `rclone mkdir failed` → Rclone config tidak valid

### Jika Database Error

**Check:**
1. Apakah `SUPABASE_URL` benar di secrets?
2. Apakah `SUPABASE_SERVICE_ROLE_KEY` benar?
3. Apakah Supabase project aktif?
4. Cek logs untuk "SUPABASE_URL: SET"

### Jika UI Tidak Load

**Check:**
1. Apakah app status "Running"?
2. Apakah menggunakan HTTPS URL HF (bukan localhost)?
3. Cek console browser untuk error JS/CSS
4. Cek Space logs untuk error backend

## 📊 Success Criteria

### Minimal Success ✅

- [x] App running di HF
- [ ] Login berfungsi (database connected)
- [ ] Dashboard tampil
- [ ] File upload berhasil (storage connected)
- [ ] File download berhasil

### Full Success ✅✅

- [ ] Semua fitur di atas ✅
- [ ] File preview berfungsi
- [ ] Multi-user login berfungsi
- [ ] Role-based access berfungsi
- [ ] Audit logs berfungsi
- [ ] Notifications berfungsi (jika setup)

## 📝 Next Steps

Setelah semua checklist di atas ✅:

1. **Test dengan user lain** (bukan admin)
2. **Setup database tables** jika belum ada
3. **Import data awal** (zona, toko, users)
4. **Configure notifications** (Fonnte - optional)
5. **Setup backup schedule** (Storj - optional)
6. **Documentation** untuk end users

---

**Mari mulai dari Phase 2!** Deploy kode dan tambahkan secrets. 🚀
