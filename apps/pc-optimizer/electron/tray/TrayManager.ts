/**
 * TrayManager — professional system tray icon for AVS Shield.
 *
 * Features:
 *   - Dynamic tooltip reflecting protection state
 *   - Context menu with all required actions
 *   - Status indicator via icon overlay
 *   - Double-click to restore window
 *   - Pause/resume protection with timed expiry
 *   - Exit confirmation dialog
 */
import { app, Tray, Menu, nativeImage, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import type { Logger } from '../ipc/registerAllHandlers';
import {
  updateTraySettings,
  onSettingsChanged,
  isProtectionPaused,
  getPauseRemainingMs,
  type ProtectionState,
} from './traySettings';
import { showMainWindow, getMainWindow } from '../main/windowManager';

// ── Icon loading ──────────────────────────────────────────────

// Cache the base tray icon (loaded once from PNG file).
// We resize to 16×16 for standard DPI; Windows handles Hi-DPI scaling.
let _baseIcon: Electron.NativeImage | null = null;

function getBaseTrayIcon(): Electron.NativeImage {
  if (_baseIcon) return _baseIcon;

  // Try multiple icon locations and formats.
  // When running as admin, some asar paths may not resolve correctly,
  // so we also check the resources directory directly (outside asar).
  const candidates = [
    // 1. Direct in resources folder (outside asar — most reliable in admin mode)
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.png'),
    path.join(process.resourcesPath || '', 'tray-icon.png'),
    // 2. Inside asar via resourcesPath
    path.join(process.resourcesPath || '', 'app.asar', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'app.asar', 'build', 'icon.png'),
    path.join(process.resourcesPath || '', 'app.asar', 'build', 'tray-icon.png'),
    // 3. Inside asar via app.getAppPath()
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'build', 'icon.png'),
    path.join(app.getAppPath(), 'build', 'tray-icon.png'),
    // 4. Relative to __dirname (development)
    path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', '..', 'build', 'icon.png'),
    path.join(__dirname, '..', '..', 'build', 'tray-icon.png'),
    path.join(__dirname, '..', '..', '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', '..', '..', 'build', 'icon.png'),
    path.join(__dirname, '..', '..', '..', 'build', 'tray-icon.png'),
  ];

  // Log all candidate paths for debugging
  console.log('[tray-icon] Searching for tray icon...');
  for (const iconPath of candidates) {
    try {
      const exists = fs.existsSync(iconPath);
      console.log(`[tray-icon]   ${iconPath} -> exists: ${exists}`);
      if (!exists) continue;
      const img = nativeImage.createFromPath(iconPath);
      if (!img.isEmpty()) {
        // Resize to 16×16 for the system tray (Windows standard)
        const resized = img.resize({ width: 16, height: 16 });
        _baseIcon = resized.isEmpty() ? img : resized;
        console.log(`[tray-icon] SUCCESS: Loaded tray icon from: ${iconPath}`);
        break;
      } else {
        console.log(`[tray-icon]   -> icon loaded but empty`);
      }
    } catch (e) {
      console.log(`[tray-icon]   -> error: ${e}`);
    }
  }

  if (!_baseIcon || _baseIcon.isEmpty()) {
    // Fallback: generate a simple 16×16 green shield PNG programmatically
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <path d="M8 1 L14 3 V8 C14 11.5 11.5 14 8 15 C4.5 14 2 11.5 2 8 V3 Z" fill="#22C55E" stroke="#FFFFFF" stroke-width="0.5" opacity="0.95"/>
      <path d="M5.5 8 L7 9.5 L10.5 6" stroke="#FFFFFF" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    _baseIcon = nativeImage.createFromDataURL(dataUrl);
  }

  return _baseIcon;
}

/**
 * Create a tray icon for the given protection state.
 * Uses the loaded PNG icon; for non-protected states, we tint the icon
 * by overlaying a colored badge in the bottom-right corner.
 */
function createTrayIcon(state: ProtectionState): Electron.NativeImage {
  const baseIcon = getBaseTrayIcon();

  // For the default 'protected' state, just use the base icon as-is.
  if (state === 'protected') {
    return baseIcon;
  }

  // For other states, we could overlay a colored dot, but nativeImage
  // doesn't support compositing. Instead, we generate a small colored
  // badge icon and use it. For now, use the base icon for all states
  // — the tooltip and context menu text convey the state.
  // TODO: Generate state-specific overlay icons when multi-size PNGs are available.
  return baseIcon;
}

// ── Tray manager ─────────────────────────────────────────────

export class TrayManager {
  private tray: Tray | null = null;
  private currentState: ProtectionState = 'protected';
  private logger: Logger;
  private onRunScan: () => void;
  private onRunOptimize: () => void;
  private onCheckUpdates: () => void;

  constructor(
    logger: Logger,
    callbacks: {
      onRunScan: () => void;
      onRunOptimize: () => void;
      onCheckUpdates: () => void;
    },
  ) {
    this.logger = logger;
    this.onRunScan = callbacks.onRunScan;
    this.onRunOptimize = callbacks.onRunOptimize;
    this.onCheckUpdates = callbacks.onCheckUpdates;
  }

  /**
   * Create and show the system tray icon.
   */
  create(): void {
    if (this.tray) return;

    this.tray = new Tray(createTrayIcon(this.currentState));
    this.updateTooltip();
    this.buildMenu();

    // Double-click → restore window
    this.tray.on('double-click', () => {
      this.logger.info('[tray] Double-click — restoring window');
      showMainWindow();
    });

    // React to settings changes
    onSettingsChanged(() => {
      this.buildMenu();
      this.updateTooltip();
    });

    this.logger.info('[tray] System tray created');
  }

  /**
   * Update the protection state — changes icon and tooltip.
   */
  setProtectionState(state: ProtectionState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    if (this.tray) {
      this.tray.setImage(createTrayIcon(state));
    }
    this.updateTooltip();
    this.buildMenu();
    this.logger.info(`[tray] Protection state: ${state}`);
  }

  /**
   * Update the tray tooltip based on current state.
   */
  private updateTooltip(): void {
    if (!this.tray) return;

    const paused = isProtectionPaused();
    let tooltip: string;

    if (paused) {
      const remainingMin = Math.ceil(getPauseRemainingMs() / 60_000);
      tooltip = `AVS Shield\nPaused (${remainingMin} min remaining)`;
    } else {
      switch (this.currentState) {
        case 'protected':
          tooltip = 'AVS Shield\nProtected';
          break;
        case 'scanning':
          tooltip = 'AVS Shield\nScanning...';
          break;
        case 'threat':
          tooltip = 'AVS Shield\nAttention Required';
          break;
        case 'warning':
          tooltip = 'AVS Shield\nAttention Required';
          break;
        case 'paused':
          tooltip = 'AVS Shield\nPaused';
          break;
        case 'updating':
          tooltip = 'AVS Shield\nUpdating...';
          break;
        default:
          tooltip = 'AVS Shield';
      }
    }

    this.tray.setToolTip(tooltip);
  }

  /**
   * Build the tray context menu.
   */
  private buildMenu(): void {
    if (!this.tray) return;

    const paused = isProtectionPaused();

    const menu = Menu.buildFromTemplate([
      // Open Dashboard
      {
        label: 'Open Dashboard',
        click: () => {
          this.logger.info('[tray] Open Dashboard');
          showMainWindow();
        },
      },
      { type: 'separator' },
      // Run AI Smart Optimize
      {
        label: 'Run AI Smart Optimize',
        click: () => {
          this.logger.info('[tray] Run AI Smart Optimize');
          showMainWindow();
          this.onRunOptimize();
        },
      },
      // Run AI Smart Security
      {
        label: 'Run AI Smart Security',
        click: () => {
          this.logger.info('[tray] Run AI Smart Security');
          showMainWindow();
          this.onRunScan();
        },
      },
      { type: 'separator' },
      // Protection Status
      {
        label: `Protection Status: ${this.getStatusLabel(paused)}`,
        enabled: false,
      },
      // Pause / Resume
      ...(paused
        ? [
            {
              label: 'Resume Protection',
              click: () => {
                this.logger.info('[tray] Resume Protection');
                updateTraySettings({ pauseUntil: null });
                this.setProtectionState('protected');
              },
            },
          ]
        : [
            {
              label: 'Pause Protection (15 min)',
              click: () => {
                this.logger.info('[tray] Pause Protection (15 min)');
                updateTraySettings({ pauseUntil: Date.now() + 15 * 60_000 });
                this.setProtectionState('paused');
              },
            },
            {
              label: 'Pause Protection (1 hour)',
              click: () => {
                this.logger.info('[tray] Pause Protection (1 hour)');
                updateTraySettings({ pauseUntil: Date.now() + 60 * 60_000 });
                this.setProtectionState('paused');
              },
            },
          ]),
      { type: 'separator' },
      // Settings
      {
        label: 'Settings',
        click: () => {
          this.logger.info('[tray] Settings');
          showMainWindow();
          // Navigate to settings page via IPC
          const w = getMainWindow();
          w?.webContents.send('avs:tray:navigate', '/settings');
        },
      },
      // Check for Updates
      {
        label: 'Check for Updates',
        click: () => {
          this.logger.info('[tray] Check for Updates');
          this.onCheckUpdates();
        },
      },
      { type: 'separator' },
      // Exit
      {
        label: 'Exit AVS Shield',
        click: () => {
          this.logger.info('[tray] Exit requested');
          this.confirmExit();
        },
      },
    ]);

    this.tray.setContextMenu(menu);
  }

  private getStatusLabel(paused: boolean): string {
    if (paused) return 'Paused';
    switch (this.currentState) {
      case 'protected': return 'Protected';
      case 'scanning': return 'Scanning';
      case 'threat': return 'Threat Detected';
      case 'warning': return 'Warning';
      case 'updating': return 'Updating';
      default: return 'Unknown';
    }
  }

  /**
   * Show exit confirmation dialog.
   */
  private confirmExit(): void {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Exit', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Exit AVS Shield',
      message: 'Protection will stop.',
      detail:
        'Background monitoring will stop.\nScheduled scans will not run.\nReal-time protection will be disabled.\n\nAre you sure you want to exit AVS Shield?',
    });

    if (choice === 0) {
      this.logger.info('[tray] User confirmed exit — quitting application');
      // Destroy the tray before quitting
      this.destroy();
      app.quit();
    }
  }

  /**
   * Destroy the tray icon (on exit).
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
      this.logger.info('[tray] System tray destroyed');
    }
  }
}
