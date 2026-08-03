---
name: Alist migration safety
description: Safe physical archive migration between Terabox folders through the local Alist mount
---

Server-side WebDAV writes through rclone `copyto`/`rcat` are not reliable for this Alist/Terabox setup: reads can work while writes return HTTP 405 or `object not found`. Alist's filesystem copy API works when paths include the storage mount prefix (`/terabox/...`), not the application's rclone path (`/arsip/...`).

**Why:** A failed move attempt exposed that recursive Terabox listings can lag or disagree with folder-specific listings. Updating application metadata or deleting old zones while any path is unresolved can create records that point to inaccessible files.

**How to apply:** For migrations, use Alist's authenticated `/api/fs/copy` with `/terabox`-prefixed paths, verify the target size through a folder-specific API/listing, and retain the source until every file has a verified target. Treat unresolved paths as blockers; do not delete old zones or hard-delete archives.