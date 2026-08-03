---
name: Authenticated metadata downloads
description: Pola download file backup metadata yang tetap melewati autentikasi JWT.
---

Download file backup metadata harus menggunakan request terautentikasi lalu membuat Blob URL di browser; tautan biasa hanya aman bila token query sengaja didukung.

**Why:** Endpoint backup dilindungi middleware JWT, sehingga anchor biasa tanpa header Authorization gagal atau berisiko mendorong token ke URL.

**How to apply:** Validasi nama file backup di server, kirim file dengan `res.download`, dan gunakan `API.request(..., { rawResponse: true })` di frontend sebelum membuat link download lokal.