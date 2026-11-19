# AVS AI Shield — Web Shield Extension

Real-time scam/phishing protection for Chrome and Edge. Checks every
navigation against the local AVS backend (signed threat-intel bundle +
heuristics), blocks unsafe pages, and detects scareware and ClickFix
(fake-CAPTCHA clipboard) attacks.

## Architecture

```
page ──► content.js / inject.js ──► service_worker.js ──► native port
                                        │                    │
                                     block/allow      avs-backend.exe
                                     redirect         (native messaging)
                                                           │
                                                      WebShield.check_url
```

- `inject.js` (MAIN world): hooks clipboard writes (ClickFix commands),
  `requestFullscreen` + `beforeunload` traps (scareware).
- `content.js` (isolated): relays page signals, detects cross-domain
  password forms.
- `service_worker.js`: persistent `connectNative` port, per-URL result
  cache, session allowlist, redirects to `blocked.html`.

The browser launches `avs-backend.exe` via the registered host manifest;
it auto-detects the `chrome-extension://` argv and runs
`avs_backend.native_messaging.host` (length-prefixed JSON over stdio).

## Dev setup (unpacked)

1. Register the dev host (points at the repo's Python backend):

   ```powershell
   powershell -ExecutionPolicy Bypass -File register-dev-host.ps1
   ```

2. Chrome/Edge → `chrome://extensions` → Developer mode →
   **Load unpacked** → select this directory.

3. The extension ID is pinned by `manifest.key` to
   `cpcagcaoomclfhfdekidhfjfkiagfife`, matching `allowed_origins`.

4. Remove later with `unregister-dev-host.ps1`.

## Installed app

The NSIS installer writes the host manifest + registry keys pointing at
`resources\backend\avs-backend.exe` — no manual steps for end users.

## Publishing notes

- Store submission assigns a NEW extension ID — add it to
  `allowed_origins` in the installer manifest before release.
- `<all_urls>` host permission is required for content scripts on every
  site; expect extra review scrutiny and a privacy disclosure.
