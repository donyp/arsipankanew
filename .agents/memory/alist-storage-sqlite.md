---
name: Alist storage add via SQLite
description: POST /api/admin/storage/add tidak berfungsi; gunakan insert langsung ke SQLite
---

## Aturan

`POST /api/admin/storage/add` di Alist v3.43.0 selalu mengembalikan HTML (bukan JSON) untuk semua request, bahkan dengan token yang valid. Endpoint ini tidak bisa digunakan dari Node.js.

**Workaround:** Insert langsung ke tabel `x_storages` di `/home/runner/workspace/data/alist/data.db` menggunakan sqlite3 Node module dari `backend/`.

**Why:** Bug atau routing conflict di Alist v3.43.0 untuk endpoint storage/add spesifik.

**How to apply:**
```js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/home/runner/workspace/data/alist/data.db');
const addition = JSON.stringify({ root_folder_path: '/', cookie: '...', download_api: 'official', order_by: 'name', order_direction: 'asc' });
db.run(`INSERT INTO x_storages (mount_path, [order], driver, cache_expiration, status, addition, remark, modified, disabled, disable_index, enable_sign, order_by, order_direction, extract_folder, web_proxy, webdav_policy, proxy_range, down_proxy_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ['/terabox', 0, 'Terabox', 30, 'work', addition, 'Terabox', now, 0, 0, 0, 'name', 'asc', '', 0, '302_redirect', 0, '']);
```
Restart workflow setelah insert.
