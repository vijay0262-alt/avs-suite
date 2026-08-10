# FULL SYSTEM SCAN REPORT

## AVS Shield v2.0 — Phase 19: Real Full System Scan

**Status:** Complete

---

## 1. Summary

Extended the scan engine from predefined optimization-only locations to a real full system scanner covering all drives, user profile, system directories, browser profiles, startup, scheduled tasks, registry, services, drivers, event logs, DNS cache, hosts file, and security status — with real-time streaming.

## 2. Backend Module

**File:** `backend/src/avs_backend/full_system_scan/__init__.py`

### Scan Coverage

| Module | Target | Method |
|--------|--------|--------|
| Drive Enumeration | All fixed/removable/network drives | `GetLogicalDrives` + `GetDriveTypeW` |
| User Profile | `%USERPROFILE%` (depth 2) | `os.scandir` |
| Downloads | `Downloads` folder | `os.scandir` |
| Desktop | `Desktop` folder | `os.scandir` |
| Documents | `Documents` folder | `os.scandir` |
| ProgramData | `%PROGRAMDATA%` (depth 2) | `os.scandir` |
| Windows | `%SystemDrive%\Windows` (depth 2) | `os.scandir` |
| User Temp | `%TEMP%` | `os.scandir` |
| Windows Temp | `C:\Windows\Temp` | `os.scandir` |
| Prefetch | `C:\Windows\Prefetch` | `os.scandir` |
| Fonts Cache | `C:\Windows\Fonts` | `os.scandir` |
| Windows Update Cache | `SoftwareDistribution\Download` | `os.scandir` |
| Thumbnail Cache | `%LOCALAPPDATA%\...\Explorer` | `os.scandir` |
| Recycle Bin | `C:\$Recycle.Bin` (depth 2) | `os.scandir` |
| Startup Folder | User + Common startup folders | `os.scandir` |
| Chrome Profile | `Google\Chrome\User Data` (depth 3) | `os.scandir` |
| Edge Profile | `Microsoft\Edge\User Data` (depth 3) | `os.scandir` |
| Brave Profile | `BraveSoftware\...` (depth 3) | `os.scandir` |
| Firefox Profile | `Mozilla\Firefox\Profiles` (depth 3) | `os.scandir` |
| Registry | Run keys (HKLM/HKCU, RunOnce, WOW64) | `winreg.EnumValue` |
| Services | Running services | PowerShell `Get-CimInstance Win32_Service` |
| Drivers | Installed drivers | PowerShell `Get-WmiObject Win32_PnPSignedDriver` |
| Scheduled Tasks | Active tasks | PowerShell `Get-ScheduledTask` |
| Event Logs | System + Application (7 days, errors/warnings) | PowerShell `Get-WinEvent` |
| DNS Cache | DNS resolver cache | PowerShell `Get-DnsClientCache` |
| Hosts File | `hosts` file entries | `open()` + parse |
| Browser Extensions | Chrome/Edge/Brave/Firefox | `manifest.json` parsing |

### Security Scan

| Module | Target | Method |
|--------|--------|--------|
| Windows Defender | AV status, RTP | PowerShell `Get-MpComputerStatus` |
| Firewall | All profiles | PowerShell `Get-NetFirewallProfile` |
| SmartScreen | Explorer SmartScreen | `winreg` registry check |
| PowerShell Policy | Execution policies | PowerShell `Get-ExecutionPolicy -List` |
| WMI Subscriptions | Event consumers | PowerShell `Get-WmiObject __EventConsumer` |
| Browser Extensions | Extension manifests | `manifest.json` parsing with permissions |
| Hosts File | Suspicious entries | File parsing |
| Registry Persistence | Run keys | `winreg` enumeration |
| Services | Running services | WMI query |
| Scheduled Tasks | Active tasks | PowerShell query |

## 3. Real-Time Streaming

### Backend (`fullscan.status` RPC)

- `currentModule`: Currently scanning module name
- `currentFolder`: Current directory being walked
- `currentFile`: Latest file scanned (updated every 100 files)
- `itemsScanned`: Total items scanned so far
- `elapsedMs`: Elapsed time in milliseconds
- `progress`: 0-100 percentage
- `activityLog`: Last 50 activity entries with module, action, detail, path

### Frontend (`DashboardViewModel.ts`)

- `fullScanId`: Active scan ID
- `fullScanStatus`: Polled status object
- `fullScanResults`: Final results
- `fullScanRunning`: Boolean flag
- `runFullSystemScan()`: Starts scan, polls every 300ms
- `cancelFullSystemScan()`: Cancels running scan

## 4. Performance

- **Asynchronous**: Scan runs in a background `threading.Thread(daemon=True)`
- **Non-blocking**: UI polls `fullscan.status` at 300ms intervals
- **Cancellable**: `threading.Event` checked at each directory and module
- **Efficient**: `os.scandir` with cached stats, no symlink following
- **Bounded**: File results capped at 500 per module, activity log at 200 entries

## 5. RPC Methods

| Method | Description |
|--------|-------------|
| `fullscan.start` | Start async scan, returns `{ scanId, status }` |
| `fullscan.status` | Poll progress with `scanId` |
| `fullscan.result` | Get final results with `scanId` |
| `fullscan.cancel` | Cancel running scan |

## 6. Files Created/Modified

### Created
- `backend/src/avs_backend/full_system_scan/__init__.py` — Full scanner module (759 lines)
- `apps/pc-optimizer/src/features/full-system-scan/fullSystemScan.types.ts` — TypeScript types
- `apps/pc-optimizer/src/features/full-system-scan/fullSystemScan.service.ts` — RPC service wrapper

### Modified
- `backend/src/avs_backend/api/rpc_server.py` — Registered `avs_backend.full_system_scan` module
- `apps/pc-optimizer/src/features/dashboard/DashboardViewModel.ts` — Added state fields, `runFullSystemScan()`, `cancelFullSystemScan()`

## 7. Compilation Status

- **TypeScript**: `npx tsc --noEmit` — 0 errors
- **Python**: `py_compile` — 0 errors
