# AVS PC Optimizer — Known Limitations

**Version 1.0.0** | Build 1001

---

## Licensing

- **License activation is not yet available.** The application runs in Free Edition by default.
- The `@avs/licensing` package provides interfaces and a `NullLicensingService` placeholder.
- No payment processing, license key validation, or subscription management is implemented.
- The Upgrade Dialog displays Pro benefits but cannot process purchases.

## Updates

- **Automatic updates are not enabled.** The "Check for Updates" button in About performs a placeholder check.
- No update server or feed URL is configured.
- The `@avs/updater` package provides interfaces and a `NullUpdateService` placeholder.
- Manual updates require downloading and installing a new version.

## Telemetry

- **Telemetry is not implemented.** The settings toggle is disabled and labeled as "future feature."

## Internationalization

- **Only English is supported.** German locale file exists but is not actively used.
- Language selection in Settings is informational only.

## Features

### Free Edition
- Deep Scan cleaning (browser caches, app data) requires Pro
- Duplicate Finder requires Pro
- Performance Boost presets require Pro
- Scheduled Maintenance requires Pro

### Pro Edition (Framework Only)
- Pro edition is defined in the feature flag registry but not activatable
- No Pro-specific UI gating is enforced beyond the Upgrade Dialog

## Platform

- **Windows only.** No macOS or Linux support.
- **64-bit only.** No 32-bit (x86) build.
- Requires administrator privileges for full functionality.

## Backend

- Module loading takes 25-35 seconds on first launch due to PowerShell and WMI queries
- Windows Update status query may timeout (8s) if the COM API is slow to respond
- Some dashboard collectors may timeout (15s) if system is under heavy load

## UI

- No drag-and-drop support
- No keyboard shortcuts for navigation
- No multi-monitor window position persistence
- Theme is limited to Light, Dark, and System

## Security Detection

- SmartScreen detection relies on registry keys; may not detect all configurations
- Windows Update pending count requires the `wuauserv` service to be running
- Third-party AV detection depends on WSC registration; unregistered AVs may not be detected
