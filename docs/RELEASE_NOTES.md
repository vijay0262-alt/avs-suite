# AVS PC Optimizer — Release Notes

## Version 1.0.0 — Build 1001 — Stable

**Release Date:** 2026-07-23  
**Channel:** Stable  
**Architecture:** x64

---

## New Features

### Commercial Foundation
- Centralized version management system (`src/config/version.ts`)
- Edition Manager framework (Free/Pro/Enterprise) with React context
- Reusable Upgrade Dialog with feature comparison table
- Professional About page with version, branding, legal links, and update check
- Update framework with manual "Check for Updates" capability
- Commercial settings sections (Edition, Version, Update Preferences, Telemetry)

### Branding
- Updated publisher name: Advanced Vision Software LLC
- Updated copyright: © 2024-2026 Advanced Vision Software LLC
- Consistent application name across TitleBar, Sidebar, splash screen, and installer

### Documentation
- User Guide
- Installation Guide
- Release Notes
- Changelog
- Known Limitations
- Commercial Checklist

---

## Bug Fixes (from pre-release)

- Fixed `dashboard.metrics` unavailable error caused by missing PyInstaller hidden imports
- Fixed `dashboard.live` NameError (`_ensure_live_metrics_thread` not defined in packaged exe)
- Fixed frontend RPC timeout for dashboard calls (30s → 120s)
- Fixed Windows Health page "View" button route mismatch (`/system-info` → `/system-information`)
- Fixed false Windows Defender disabled warnings when third-party AV is active
- Fixed false Firewall disabled warnings when third-party firewall is active
- Fixed Windows Updates detection to distinguish disabled service vs pending updates

---

## Known Issues

See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md)

---

## Upgrade Path

This is the first commercial release. No upgrade path is required.

---

## Download

- **Installer:** `AVS PC Optimizer-Setup-1.0.0.exe`
- **Portable:** `AVS PC Optimizer-1.0.0-portable.zip`

---

## Checksums

```
SHA-256: [To be generated at release time]
```

---

## Support

- Website: https://www.avs.example.com
- Email: support@avs.example.com
