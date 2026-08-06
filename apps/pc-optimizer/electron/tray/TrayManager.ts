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
import type { Logger } from '../ipc/registerAllHandlers';
import {
  updateTraySettings,
  onSettingsChanged,
  isProtectionPaused,
  getPauseRemainingMs,
  type ProtectionState,
} from './traySettings';
import { showMainWindow, getMainWindow } from '../main/windowManager';

// ── Icon generation ──────────────────────────────────────────

/**
 * Generate a 16×16 tray icon as a nativeImage from an SVG-like buffer.
 * We use a simple colored shield SVG rendered to PNG via data URL.
 * This avoids needing .ico files at build time.
 */
function createTrayIcon(state: ProtectionState): Electron.NativeImage {
  const colors: Record<ProtectionState, { bg: string; fg: string }> = {
    protected: { bg: '#22C55E', fg: '#FFFFFF' },  // green
    scanning:  { bg: '#3B82F6', fg: '#FFFFFF' },  // blue
    paused:    { bg: '#F59E0B', fg: '#FFFFFF' },  // amber
    warning:   { bg: '#F59E0B', fg: '#FFFFFF' },  // amber
    threat:    { bg: '#EF4444', fg: '#FFFFFF' },  // red
    updating:  { bg: '#8B5CF6', fg: '#FFFFFF' },  // purple
  };

  const { bg, fg } = colors[state] ?? colors.protected;

  // 16×16 SVG shield icon
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <path d="M8 1 L14 3 V8 C14 11.5 11.5 14 8 15 C4.5 14 2 11.5 2 8 V3 Z" fill="${bg}" stroke="${fg}" stroke-width="0.5" opacity="0.95"/>
    <path d="M5.5 8 L7 9.5 L10.5 6" stroke="${fg}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
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
