---
name: Alist WebDAV permission fix
description: Admin user Alist butuh semua bit permission agar WebDAV berfungsi
---

## Aturan

Alist admin user (id=1) harus punya `permission = 32767` (semua 15 bit aktif) agar WebDAV endpoint `/dav/` mengembalikan 207 bukan 403.

Permission default 12543 tidak menyertakan bit 8 (webdav_manage=256) dan bit-bit lain di 9-11, yang menyebabkan 403 pada PROPFIND meski bit 7 (webdav_read=128) sudah aktif.

**Why:** Alist v3.43.0 tampaknya memeriksa bit-bit permission tambahan untuk WebDAV PROPFIND, tidak hanya webdav_read saja.

**How to apply:** Jika WebDAV kembali 403 dengan admin:password yang benar, jalankan:
```js
// via Node.js + sqlite3
db.run("UPDATE x_users SET permission=32767 WHERE username='admin'", ...)
```
Kemudian restart workflow agar Alist reload dari DB.
