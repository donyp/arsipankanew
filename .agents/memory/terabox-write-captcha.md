---
name: Terabox write CAPTCHA
description: Batasan operasi tulis Terabox melalui Alist pada environment ini
---

Pada 3 Agustus 2026, listing dan pembacaan file Terabox masih berjalan, tetapi operasi tulis melalui WebDAV `rcat`/`copyto` menghasilkan HTTP 405. Upload melalui Alist `/api/fs/put` juga mengembalikan halaman verifikasi CAPTCHA dari driver Terabox. Ini menunjukkan cookie driver dapat dipakai untuk membaca tetapi tidak lagi valid untuk menulis.

**Why:** Mengganti metode tulis tidak menyelesaikan masalah ketika sesi Terabox meminta CAPTCHA; retry hanya mengulang kegagalan dan dapat meninggalkan metadata tanpa file remote.

**How to apply:** Simpan upload ke LocalStorage sebelum membuat metadata database, gunakan LocalStorage sebagai fallback preview/download dan validasi keberadaan, serta jangan menyatakan sinkronisasi remote berhasil sampai kredensial/cookie Terabox diperbarui dan upload benar-benar diverifikasi.

Upload otomatis juga perlu tetap berada di antrean persisten ketika precreate/CAPTCHA gagal. Retry untuk error tersebut harus diberi jeda panjang, dan worker harus menghapus job jika file ternyata sudah diunggah manual atau upload remote berhasil diverifikasi.

**Why:** CAPTCHA tidak selalu hilang setelah cookie diganti, sedangkan retry cepat hanya mengulang penolakan. File manual yang sudah ada di remote tidak boleh menghasilkan duplikat.

**How to apply:** Enqueue setelah salinan lokal berhasil dibuat, cek keberadaan remote sebelum mengirim ulang, simpan error/next-attempt ke disk, dan verifikasi remote setelah setiap upload otomatis.