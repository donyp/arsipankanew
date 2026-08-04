---
name: Alist offline tool initialization
description: Alist v3.43 initializes built-in offline download clients even when their settings are blank.
---

Alist v3.43 calls `Init()` for aria2, qBittorrent, and Transmission during startup regardless of whether their database URLs are empty. Clearing `aria2_uri`, `qbittorrent_url`, and `transmission_uri` prevents accidental connections but still produces initialization warnings.

**Why:** The current binary registers these clients unconditionally and does not expose a disable flag in its configuration. Suppressing the logs would hide a real limitation rather than fix it.

**How to apply:** Keep the three unused settings empty and treat their warnings as non-critical while verifying that Alist HTTP, WebDAV, and the Terabox storage still start successfully. Remove the warnings only by upgrading to a version with a disable mechanism or rebuilding the binary without those clients.