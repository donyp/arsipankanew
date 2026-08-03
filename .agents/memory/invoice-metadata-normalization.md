---
name: Invoice metadata normalization
description: Konvensi penyimpanan tipe invoice NON dan tanggal dokumen
---

Nilai internal tipe invoice non-PPN harus disimpan sebagai `NON`; `NON_PPN` hanya boleh diperlakukan sebagai nilai legacy saat membaca data lama. Tanggal dokumen harus dinormalisasi dan disimpan sebagai `YYYY-MM-DD`, bukan format slash.

**Why:** Nilai legacy `NON_PPN` dan input tanggal slash menyebabkan label status tidak konsisten serta parsing tanggal berbeda antar-browser.

**How to apply:** Normalisasi di backend sebagai batas terakhir, normalisasi juga pada parser upload/batch, dan gunakan label tampilan `NON` tanpa menampilkan underscore atau slash.