---
name: Maintenance notice details
description: Format daftar detail perbaikan dan distribusi notifikasi maintenance
---

Form penyelesaian mode perbaikan menggunakan satu item sebagai default, tombol tambah untuk item berikutnya, dan dua field per item: ringkasan utama serta subteks/detail penjelasan yang opsional. Setelah item ketiga, daftar detail harus memakai scroll internal agar tombol aksi tetap terlihat. Data disimpan sebagai array objek. Notice login dan pusat notifikasi harus menampilkan daftar yang sama untuk semua pengguna.

**Why:** Rincian perbaikan perlu mudah diisi oleh admin, tidak terpotong menjadi satu pesan panjang, dan dapat dibaca oleh semua role tanpa bergantung pada zona. Subteks membantu memberi konteks tetapi tidak boleh menghambat penyelesaian perbaikan.

**How to apply:** Pertahankan format array objek `{ summary, description }` saat menyimpan `lastResult.details`, aktifkan scroll internal mulai item ketiga, gunakan notifikasi global untuk pusat notifikasi, buka detail notifikasi langsung dalam mode fokus dan tandai sebagai sudah dibaca, dukung format teks lama saat membaca, dan escape seluruh teks sebelum dirender ke HTML.