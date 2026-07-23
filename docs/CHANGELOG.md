# AVS PC Optimizer — Changelog

All notable changes to AVS PC Optimizer are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-23

### Added
- Centralized version management system with build number, channel, and edition
- Edition Manager framework (Free/Pro/Enterprise) using React context
- Reusable Upgrade Dialog with Pro benefits and feature comparison table
- Professional About page with branding, version info, legal links, and update check
- Update framework with manual check-for-updates capability (auto-update disabled)
- Commercial settings: Application Edition, Version, Update Preferences, Telemetry
- Product branding consistency: publisher name, copyright, window titles
- Release documentation: User Guide, Installation Guide, Release Notes, Changelog
- Legal placeholders: Privacy Policy, Terms of Service, EULA, Open Source Licenses
- Commercial release checklist

### Fixed
- Missing PyInstaller hidden imports causing `dashboard.metrics` unavailable error
- `_ensure_live_metrics_thread` NameError in packaged backend exe
- Frontend RPC timeout for dashboard calls (30s → 120s)
- Windows Health page "View" button route mismatch (`/system-info` → `/system-information`)
- False Windows Defender disabled warnings when third-party AV is active
- False Firewall disabled warnings when third-party firewall is active
- Windows Updates detection: distinguish disabled service vs pending updates
- SmartScreen detection across multiple registry locations
- ThreadPoolExecutor blocking on shutdown in dashboard collectors
- `_ttl_cache` lock contention causing hangs

### Changed
- Updated publisher name to "Advanced Vision Software LLC"
- Updated copyright to "© 2024-2026 Advanced Vision Software LLC"
- Updated `APP_METADATA` with `publisherName` and `description` fields
- Module load order reordered to prevent import deadlocks
- Security detection redesigned to use Windows Security Center API

### Security
- Windows Security Center API integration for accurate AV/firewall detection
- Third-party antivirus detection via `root/SecurityCenter2` WMI namespace
- Third-party firewall detection via WSC products query

---

## [0.1.0] — 2026-07-15

### Added
- Initial scaffold with dashboard, junk cleaner, registry cleaner, startup manager
- Privacy cleaner, duplicate finder, disk analyzer, uninstaller
- Software updater, performance monitor, system information
- Security page, diagnostics page, settings page
- JSON-RPC backend with 105 registered methods across 18 modules
- Electron frontend with React, Vite, TailwindCSS
- PyInstaller packaging for Windows x64
