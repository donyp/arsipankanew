---
name: Terabox sync pagination
description: Aturan sinkronisasi metadata file Terabox ke Supabase
---

## Aturan

Sinkronisasi Terabox harus memakai satu pemindaian `rclone lsjson --recursive`, mencocokkan berdasarkan `storage_path`, dan membaca tabel `files` dengan pagination. Hasil database default Supabase hanya 1.000 baris, sehingga query tanpa pagination dapat membuat file lama terimpor sebagai duplikat.

File yang belum punya pasangan toko di master tetap perlu diimpor dengan `toko_id = null` agar daftar arsip tidak kehilangan file.

**Why:** Folder Terabox berisi ribuan file dan tidak selalu identik dengan master toko. Sinkronisasi per toko/kategori timeout, sedangkan query Supabase yang terpotong menyebabkan duplikat.

**How to apply:** Saat mengubah proses sync, pertahankan pemindaian rekursif, pagination semua query metadata, batch insert, dan deduplikasi berdasarkan `storage_path`. Jangan menambahkan kolom metadata yang tidak ada di skema `files`.