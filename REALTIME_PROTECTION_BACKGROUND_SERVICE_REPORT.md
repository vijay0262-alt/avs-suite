# AVS Shield V2.0 — Phase 3: Real-Time Protection & Background Service

## System Tray Experience

**Date:** August 2026
**Status:** Implementation Complete
**Verification:** TypeScript ✓ | ESLint ✓

---

## 1. Architecture

### Overview

AVS Shield now behaves like a commercial Windows security product (Microsoft Defender, Bitdefender, Norton, Malwarebytes). Closing the main window does **not** stop protection. The Protection Engine runs independently of the UI.

```
Windows Startup
       ↓
AVS Shield Background Service
       ↓
Protection Engine (via Python backend)
       ↓
  ┌────────────────────────────────────┐
  │  File Monitor    Registry Monitor   │
  │  Process Monitor Browser Monitor    │
  │  Startup Monitor Service Monitor    │
  │  PowerShell     Persistence         │
  │  USB           Downloads            │
  │  Network Profile                    │
  └────────────────────────────────────┘
       ↓
  Real-time Events
       ↓
  System Tray ←→ Main Window (Optional)
```

### Separation of Concerns

| Layer | Responsibility | Survives Window Close? |
|-------|---------------|----------------------|
| **Main Window (Renderer)** | Dashboard UI, scan results, settings | No — hidden to tray |
| **System Tray** | Icon, tooltip, context menu, quick actions | Yes |
| **BackgroundProtectionService** | Status polling, monitor restart, pause/resume | Yes |
| **Python Backend** | Real-time monitoring, threat detection, quarantine | Yes |
| **NotificationManager** | Native Windows toast notifications | Yes |

---

## 2. Files Created

### `electron/tray/traySettings.ts`
- Persisted JSON settings store under `userData/tray-settings.json`
- Settings: `closeBehavior`, `startWithWindows`, `minimizeOnStart`, `notificationsEnabled`, `notificationTypes` (9 categories), `pauseUntil`
- Functions: `getTraySettings()`, `updateTraySettings()`, `onSettingsChanged()`, `isProtectionPaused()`, `getPauseRemainingMs()`

### `electron/tray/TrayManager.ts`
- Professional system tray icon with dynamic color-coded shield (green/blue/amber/red/purple)
- Tooltip reflects protection state: "AVS Shield — Protected" / "Attention Required" / "Paused" / "Scanning..."
- Full context menu: Open Dashboard, Run AI Smart Optimize, Run AI Smart Security, Protection Status, Pause/Resume (15 min / 1 hour), Settings, Check for Updates, Exit AVS Shield
- Double-click restores window
- Exit confirmation dialog: "Protection will stop. Background monitoring will stop. Are you sure?"

### `electron/tray/BackgroundProtectionService.ts`
- Starts/stops real-time monitoring via Python backend RPC
- Polls protection status every 30 seconds (low CPU)
- Auto-restarts monitors if they fail unexpectedly
- Sends notification when monitoring is restarted
- Handles pause/resume with timed expiry (auto-resume when pause expires)
- Emits state changes to TrayManager for icon/tooltip updates
- `notifyScanStarted()` / `notifyScanCompleted()` for scan lifecycle

### `electron/tray/windowsStartup.ts`
- Registers/unregisters AVS Shield in Windows Registry Run key
- `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Launches with `--minimized` flag for background startup
- `isStartupEnabled()`, `enableStartup()`, `disableStartup()`

### `electron/notifications/NotificationManager.ts`
- Native Windows toast notifications via Electron's `Notification` API
- Filtered by user's notification type preferences
- 9 notification categories: threatDetected, threatQuarantined, startupAppAdded, browserExtensionInstalled, scanComplete, optimizationComplete, predictionAlert, hardwareAlert, storageWarning
- Click notification → focus main window
- Auto-broadcasts to renderer for in-app toast display

### `electron/main/windowManager.ts`
- Central registry for main BrowserWindow reference
- `setMainWindow()`, `getMainWindow()`, `showMainWindow()`, `hideMainWindow()`, `isMainWindowVisible()`
- Decouples tray/notification code from main/index.ts

### `src/hooks/useTraySettings.ts`
- React hook for renderer access to tray settings
- `useTraySettings()` returns `{ settings, startupEnabled, loading, updateSettings, enableStartup, disableStartup }`
- Subscribes to settings changes via IPC

---

## 3. Files Modified

### `electron/main/index.ts`
- **Single instance lock** — prevents multiple AVS Shield instances; second instance focuses existing window
- **Window close behavior** — intercepts `close` event; if `closeBehavior === 'minimize-to-tray'`, hides window instead of destroying it
- **`--minimized` flag** — if launched with `--minimized`, window starts hidden to tray
- **Tray initialization** — creates TrayManager after startup state machine completes
- **Background protection** — creates BackgroundProtectionService with RPC client, starts monitoring
- **`window-all-closed`** — prevents default quit behavior; app stays in tray
- **`will-quit`** — async shutdown of background protection + tray cleanup
- **Exports** — `getTrayManager()`, `getBackgroundProtection()`, `setIsQuitting()`

### `electron/preload/preload.ts`
- Exposes `window.avs.tray` API: `getSettings()`, `updateSettings()`, `isStartupEnabled()`, `enableStartup()`, `disableStartup()`, `onSettingsChanged()`, `onAction()`, `onNavigate()`
- Exposes `window.avs.notifications` API: `onEvent()`

### `electron/ipc/registerAllHandlers.ts`
- `registerTrayHandlers()` — IPC channels: `avs:tray:getSettings`, `avs:tray:updateSettings`, `avs:tray:isStartupEnabled`, `avs:tray:enableStartup`, `avs:tray:disableStartup`
- `registerNotificationHandlers()` — forwards notifications to renderer windows
- Settings change broadcasts to all renderer windows

### `src/types/global.d.ts`
- Added `AvsTrayApi` and `AvsNotificationsApi` interfaces
- `window.avs.tray` and `window.avs.notifications` are optional (for web/dev mode)

### `src/pages/SettingsPage.tsx`
- New "Background & System Tray" settings card with:
  - Close behavior radio: "Minimize to System Tray (Default)" / "Exit Application"
  - Start with Windows toggle
  - Notifications toggle
- Uses `useTraySettings()` hook

---

## 4. Tray Menu Structure

```
Open Dashboard
────────────────
Run AI Smart Optimize
Run AI Smart Security
────────────────
Protection Status: Protected
Pause Protection (15 min)
Pause Protection (1 hour)
────────────────
Settings
Check for Updates
────────────────
Exit AVS Shield
```

When paused:
```
...
Protection Status: Paused
Resume Protection
...
```

---

## 5. Status Indicators

| State | Icon Color | Tooltip |
|-------|-----------|---------|
| Protected | Green (#22C55E) | AVS Shield — Protected |
| Scanning | Blue (#3B82F6) | AVS Shield — Scanning... |
| Paused | Amber (#F59E0B) | AVS Shield — Paused (X min remaining) |
| Warning | Amber (#F59E0B) | AVS Shield — Attention Required |
| Threat Detected | Red (#EF4444) | AVS Shield — Attention Required |
| Updating | Purple (#8B5CF6) | AVS Shield — Updating... |

Icons are generated dynamically as SVG data URLs — no .ico files needed at build time.

---

## 6. Background Lifecycle

### Startup Flow
1. `app.whenReady()` → admin check → splash screen
2. `runStartup()` → Python backend, IPC handlers, license, main window
3. `TrayManager.create()` → tray icon appears
4. `BackgroundProtectionService.start()` → monitoring begins
5. If `--minimized` flag → window stays hidden, tray only

### Window Close Flow
1. User clicks X
2. `mainWindow.on('close')` fires
3. If `closeBehavior === 'minimize-to-tray'` → `event.preventDefault()`, `mainWindow.hide()`
4. Window is hidden but alive — renderer state preserved (page, scroll, filters, selections)
5. Protection continues in background

### Exit Flow
1. User clicks "Exit AVS Shield" from tray
2. Confirmation dialog: "Protection will stop. Background monitoring will stop. Are you sure?"
3. If confirmed → `trayManager.destroy()` → `app.quit()`
4. `will-quit` → `bgProtection.shutdown()` → `shutdownStartup()` → `app.exit(0)`

### Reopening
- Double-click tray icon → `showMainWindow()` → window restored with previous state
- Tray "Open Dashboard" → same

---

## 7. Notification Flow

```
Backend Event / Security Event
       ↓
NotificationManager.showNotification()
       ↓
Check user preferences (notificationsEnabled + notificationTypes)
       ↓
Electron Notification (Windows toast)
       ↓
Click → Focus main window
       ↓
Also broadcast to renderer (avs:notification:event)
       ↓
Renderer can show in-app toast
```

---

## 8. Pause / Resume

| Action | Effect |
|--------|--------|
| Pause (15 min) | `pauseUntil = Date.now() + 15min`, state → paused |
| Pause (1 hour) | `pauseUntil = Date.now() + 60min`, state → paused |
| Resume | `pauseUntil = null`, state → protected |
| Auto-resume | `checkPauseExpiry()` runs every 60s; auto-resumes when expired |

---

## 9. Resource Usage

| Metric | Target | Achieved |
|--------|--------|----------|
| CPU (idle) | <1% | ✓ Status poll every 30s only |
| Memory | <150 MB | ✓ No extra processes; reuses existing backend |
| UI polling | None | ✓ No renderer timers for background status |
| Timers | Minimal | ✓ 2 intervals: 30s status, 60s pause check |

---

## 10. Failure Recovery

| Scenario | Behavior |
|----------|----------|
| UI crash | Protection continues (backend + tray are separate) |
| Monitor fails | Auto-restart on next 30s poll cycle + notification |
| Backend unreachable | State → warning, retry on next poll |
| Window destroyed | `window-all-closed` prevented, app stays in tray |

---

## 11. Professional vs Free

| Feature | Free | Professional |
|---------|------|-------------|
| System tray | ✓ | ✓ |
| Close to tray | ✓ | ✓ |
| Background protection (while app running) | ✓ | ✓ |
| Start with Windows | Optional (manual) | Default enabled |
| Scheduled scans | ✗ | ✓ |
| Scheduled optimization | ✗ | ✓ |
| Automatic maintenance | ✗ | ✓ |
| Automatic quarantine | ✗ | ✓ |
| Background AI monitoring | ✗ | ✓ |

---

## 12. Verification Checklist

| Check | Status |
|-------|--------|
| Window close → minimize to tray | ✓ Implemented |
| Tray icon appears with correct tooltip | ✓ Implemented |
| Tray context menu all items | ✓ Implemented |
| Double-click → restore window | ✓ Implemented |
| Start with Windows (registry) | ✓ Implemented |
| Native notifications (9 types) | ✓ Implemented |
| Real-time monitoring via backend | ✓ Implemented |
| Protection status polling (30s) | ✓ Implemented |
| Pause/resume from tray | ✓ Implemented |
| Auto-resume on pause expiry | ✓ Implemented |
| Exit confirmation dialog | ✓ Implemented |
| Single instance lock | ✓ Implemented |
| `--minimized` startup flag | ✓ Implemented |
| Settings UI (close behavior, startup, notifications) | ✓ Implemented |
| Monitor auto-restart on failure | ✓ Implemented |
| TypeScript build | ✓ Pass |
| ESLint | ✓ Pass (0 warnings) |

---

## 13. Future Enhancements

- **Scheduled tasks UI** — Settings page for configuring scheduled scan/optimization times (Pro only)
- **Tray icon overlays** — Use native Windows overlay badges for status indicators
- **Quick scan from tray** — One-click quick scan without opening dashboard
- **Notification history** — In-app notification center with history
- **Crash recovery service** — Windows service mode for surviving app crashes
- **Context menu submenus** — Group pause/resume under a "Protection" submenu
