---
name: Rclone path on Replit
description: rclone binary location dan cara fix path agar tidak hilang saat restart
---

## Aturan

Binary rclone harus disimpan di `/home/runner/workspace/rclone` (dalam workspace), bukan di `/home/runner/.local/bin/rclone` yang hilang setiap kali Replit me-reset container.

## Cara apply

Di semua file backend yang memanggil rclone, gunakan:
```js
const rclonePath = process.env.RCLONE_BIN || path.resolve(__dirname, '..', 'rclone');
```

File yang sudah diupdate: `backend/rclone_wrapper.js`, `backend/rcloneConnectivityHandler.js`, `backend/server.js`.

**Why:** `/home/runner/.local/bin` tidak persisten antar restart di Replit. Workspace directory (`/home/runner/workspace`) persisten.

**How to apply:** Jika rclone hilang, download ulang ke workspace: `curl -sL https://downloads.rclone.org/v1.68.2/rclone-v1.68.2-linux-amd64.zip -o /tmp/rclone.zip && unzip -p /tmp/rclone.zip rclone-v1.68.2-linux-amd64/rclone > /home/runner/workspace/rclone && chmod +x /home/runner/workspace/rclone`
