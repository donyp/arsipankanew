---
name: Maintenance notice details
description: Format daftar detail perbaikan dan distribusi notifikasi maintenance
---

Form penyelesaian mode perbaikan menggunakan satu detail sebagai default, tombol tambah untuk item berikutnya, dan menyimpan detail sebagai array. Notice login dan pusat notifikasi harus menampilkan daftar yang sama untuk semua pengguna.

**Why:** Rincian perbaikan perlu mudah diisi oleh admin, tidak terpotong menjadi satu pesan panjang, dan dapat dibaca oleh semua role tanpa bergantung pada zona.

**How to apply:** Pertahankan format array saat menyimpan `lastResult.details`, gunakan notifikasi global untuk pusat notifikasi, dan escape seluruh teks detail sebelum dirender ke HTML.