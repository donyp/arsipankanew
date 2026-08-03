---
name: Legacy files schema
description: Kompatibilitas schema tabel files pada alur upload
---

Schema database aktif untuk tabel `files` dapat lebih lama daripada field sinkronisasi yang digunakan kode. Alur upload harus hanya mengirim kolom yang tersedia dan tidak menjadikan metadata sinkronisasi opsional sebagai syarat insert.

**Why:** Database aktif pernah menolak upload karena schema cache tidak memiliki kolom sinkronisasi opsional, sehingga file tidak dapat masuk walaupun penyimpanan berhasil diproses.

**How to apply:** Saat menambah metadata upload, verifikasi schema aktif terlebih dahulu. Perlakukan field sinkronisasi tambahan sebagai opsional dan hindari memasukkannya ke payload insert/update utama jika belum dijamin tersedia.