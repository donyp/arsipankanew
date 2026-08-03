---
name: Terabox file streaming
description: Jalur preview dan download file dari Terabox melalui rclone
---

## Aturan

File arsip yang sudah disinkronkan dari Terabox harus dibaca kembali melalui rclone remote `terabox`. `getStream()` wajib mengembalikan `child.stdout` (Readable stream), bukan object `ChildProcess`, agar Express dapat memanggil `.pipe(res)`. Preview dan download tidak boleh mengandalkan LocalStorage untuk file hasil import Terabox.

**Why:** Metadata file berada di Supabase, sedangkan isi file berada di Terabox. LocalStorage tidak memiliki file hasil import, dan ChildProcess tidak mempunyai `.pipe()`.

**How to apply:** Untuk endpoint file baru, gunakan `RcloneStorage.getStream(storage_path)`, set content type/disposition, lalu pipe stdout ke response. Tangani stderr dan exit code rclone untuk melaporkan kegagalan stream.