---
name: Maintenance notice details
description: Format daftar detail perbaikan dan distribusi notifikasi maintenance
---

Form penyelesaian mode perbaikan menggunakan satu item sebagai default, tombol tambah untuk item berikutnya, dan dua field per item: ringkasan utama serta subteks/detail penjelasan. Data disimpan sebagai array objek. Notice login dan pusat notifikasi harus menampilkan daftar yang sama untuk semua pengguna.

**Why:** Rincian perbaikan perlu mudah diisi oleh admin, tidak terpotong menjadi satu pesan panjang, dan dapat dibaca oleh semua role tanpa bergantung pada zona.

**How to apply:** Pertahankan format array objek `{ summary, description }` saat menyimpan `lastResult.details`, gunakan notifikasi global untuk pusat notifikasi, dukung format teks lama saat membaca, dan escape seluruh teks sebelum dirender ke HTML.