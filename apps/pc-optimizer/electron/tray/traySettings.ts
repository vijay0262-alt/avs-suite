/**
 * Tray & background service settings — persisted in electron-store-like
 * JSON file under userData.  No external dependency; we read/write a
 * simple JSON file so the settings survive restarts.
 */
import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type CloseBehavior = 'minimize-to-tray' | 'exit';
export type ProtectionState = 'protected' | 'scanning' | 'paused' | 'warning' | 'threat' | 'updating';

export interface TraySettings {
  closeBehavior: CloseBehavior;
  startWithWindows: boolean;
  minimizeOnStart: boolean;
  notificationsEnabled: boolean;
  notificationTypes: {
    threatDetected: boolean;
    threatQuarantined: boolean;
    startupAppAdded: boolean;
    browserExtensionInstalled: boolean;
    scanComplete: boolean;
    optimizationComplete: boolean;
    predictionAlert: boolean;
    hardwareAlert: boolean;
    storageWarning: boolean;
  };
  pauseUntil: number | null;
}

const DEFAULT_SETTINGS: TraySettings = {
  closeBehavior: 'minimize-to-tray',
  startWithWindows: false,
  minimizeOnStart: false,
  notificationsEnabled: true,
  notificationTypes: {
    threatDetected: true,
    threatQuarantined: true,
    startupAppAdded: true,
    browserExtensionInstalled: true,
    scanComplete: true,
    optimizationComplete: true,
    predictionAlert: true,
    hardwareAlert: true,
    storageWarning: true,
  },
  pauseUntil: null,
};

const SETTINGS_FILE = 'tray-settings.json';

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

let cachedSettings: TraySettings | null = null;
const listeners = new Set<(s: TraySettings) => void>();

function loadSettings(): TraySettings {
  if (cachedSettings) return cachedSettings;
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<TraySettings>;
      cachedSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        notificationTypes: {
          ...DEFAULT_SETTINGS.notificationTypes,
          ...(parsed.notificationTypes ?? {}),
        },
      };
    } else {
      cachedSettings = { ...DEFAULT_SETTINGS };
    }
  } catch {
    cachedSettings = { ...DEFAULT_SETTINGS };
  }
  return cachedSettings;
}

function saveSettings(settings: TraySettings): void {
  cachedSettings = settings;
  try {
    const filePath = getSettingsPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    // Best-effort — settings are also kept in memory
  }
  for (const listener of listeners) {
    try { listener(settings); } catch { /* ignore */ }
  }
}

export function getTraySettings(): TraySettings {
  return { ...loadSettings() };
}

export function updateTraySettings(patch: Partial<TraySettings>): TraySettings {
  const current = loadSettings();
  const updated: TraySettings = {
    ...current,
    ...patch,
    notificationTypes: {
      ...current.notificationTypes,
      ...(patch.notificationTypes ?? {}),
    },
  };
  saveSettings(updated);
  return updated;
}

export function onSettingsChanged(listener: (s: TraySettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Check if protection is currently paused (based on pauseUntil timestamp).
 */
export function isProtectionPaused(): boolean {
  const settings = loadSettings();
  if (settings.pauseUntil === null) return false;
  if (Date.now() >= settings.pauseUntil) {
    // Pause expired — auto-resume
    updateTraySettings({ pauseUntil: null });
    return false;
  }
  return true;
}

/**
 * Get remaining pause time in ms (0 if not paused).
 */
export function getPauseRemainingMs(): number {
  const settings = loadSettings();
  if (settings.pauseUntil === null) return 0;
  const remaining = settings.pauseUntil - Date.now();
  if (remaining <= 0) {
    updateTraySettings({ pauseUntil: null });
    return 0;
  }
  return remaining;
}
