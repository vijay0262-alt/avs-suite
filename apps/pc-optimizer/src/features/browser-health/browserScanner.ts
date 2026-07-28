/**
 * Browser Scanner — discovers installed browsers, profiles, and metrics.
 *
 * Uses existing RPC methods:
 *   • privacy.detectBrowsers — browser detection
 *   • privacy.scan — privacy/browser data scan
 *   • cleaner.scan.start — cache scanning
 *
 * Supports pluggable browser definitions for future browsers.
 *
 * This module does NOT modify any existing service.
 */
import type {
  BrowserInfo,
  BrowserProfile,
  BrowserScanResult,
  BrowserType,
  BrowserExtension,
  NotificationPermission,
  BrowserDefinition,
} from './types';
import { BROWSER_DEFINITIONS, generateBrowserId, generateProfileId } from './types';
import { browserEvents } from './browserEvents';
import { getRpcBridge, isRpcAvailable } from '../maintenance-engine/tasks/BaseMaintenanceTask';
import { RPC_METHODS } from '@avs/shared/rpc';

interface RawBrowserData {
  browsers?: RawBrowserEntry[];
  profiles?: RawProfileEntry[];
}

interface RawBrowserEntry {
  type: string;
  name: string;
  version?: string;
  installPath?: string;
  isDefault?: boolean;
  isInstalled?: boolean;
  lastUsed?: string;
  executablePath?: string;
}

interface RawProfileEntry {
  browserType?: string;
  name?: string;
  path?: string;
  size?: number;
  lastUsed?: string;
  isActive?: boolean;
  extensionCount?: number;
  extensions?: RawExtensionEntry[];
  bookmarkCount?: number;
  historySize?: number;
  cookieCount?: number;
  cacheSize?: number;
  downloadHistoryCount?: number;
  savedPasswordCount?: number;
  autofillEntryCount?: number;
  notificationPermissions?: RawNotificationEntry[];
}

interface RawExtensionEntry {
  id: string;
  name: string;
  version?: string;
  enabled?: boolean;
  permissions?: string[];
  isSuspicious?: boolean;
}

interface RawNotificationEntry {
  origin: string;
  permission: string;
  lastAccessed?: string;
}

export class BrowserScanner {
  private _customDefinitions: Map<BrowserType, BrowserDefinition> = new Map();

  /**
   * Register a custom browser definition.
   */
  registerBrowser(def: BrowserDefinition): void {
    this._customDefinitions.set(def.type, def);
  }

  /**
   * Get all browser definitions (built-in + custom).
   */
  getAllDefinitions(): BrowserDefinition[] {
    return [...BROWSER_DEFINITIONS, ...this._customDefinitions.values()];
  }

  /**
   * Scan for installed browsers and their profiles.
   */
  async scan(): Promise<BrowserScanResult> {
    const startTime = Date.now();
    browserEvents.emit('browser_scan_started', { timestamp: new Date().toISOString() });

    const errors: string[] = [];
    const browsers: BrowserInfo[] = [];
    const profiles: BrowserProfile[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
      return this._buildResult(browsers, profiles, startTime, errors);
    }

    const rpc = getRpcBridge();
    if (!rpc) {
      errors.push('RPC bridge is null');
      return this._buildResult(browsers, profiles, startTime, errors);
    }

    try {
      const raw = await rpc.call(RPC_METHODS.PRIVACY_DETECT_BROWSERS) as RawBrowserData;
      if (raw.browsers) {
        for (const rb of raw.browsers) {
          browsers.push(this._convertBrowser(rb));
        }
      }
      if (raw.profiles) {
        for (const rp of raw.profiles) {
          const profile = this._convertProfile(rp);
          if (profile) profiles.push(profile);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Browser scan failed: ${msg}`);
    }

    const result = this._buildResult(browsers, profiles, startTime, errors);
    browserEvents.emit('browser_scan_completed', { result });
    return result;
  }

  private _convertBrowser(raw: RawBrowserEntry): BrowserInfo {
    return {
      id: generateBrowserId(raw.type as BrowserType),
      type: raw.type as BrowserType,
      name: raw.name,
      version: raw.version ?? null,
      installPath: raw.installPath ?? null,
      isDefault: raw.isDefault ?? false,
      isInstalled: raw.isInstalled ?? true,
      lastUsed: raw.lastUsed ?? null,
      executablePath: raw.executablePath ?? null,
    };
  }

  private _convertProfile(raw: RawProfileEntry): BrowserProfile | null {
    if (!raw.browserType || !raw.name) return null;
    const browserId = generateBrowserId(raw.browserType as BrowserType);
    return {
      id: generateProfileId(browserId, raw.name),
      browserId,
      name: raw.name,
      path: raw.path ?? '',
      size: raw.size ?? 0,
      lastUsed: raw.lastUsed ?? null,
      isActive: raw.isActive ?? false,
      extensionCount: raw.extensionCount ?? 0,
      extensions: (raw.extensions ?? []).map((e) => this._convertExtension(e)),
      bookmarkCount: raw.bookmarkCount ?? 0,
      historySize: raw.historySize ?? 0,
      cookieCount: raw.cookieCount ?? 0,
      cacheSize: raw.cacheSize ?? 0,
      downloadHistoryCount: raw.downloadHistoryCount ?? 0,
      savedPasswordCount: raw.savedPasswordCount ?? 0,
      autofillEntryCount: raw.autofillEntryCount ?? 0,
      notificationPermissions: (raw.notificationPermissions ?? []).map((n) => this._convertNotification(n)),
    };
  }

  private _convertExtension(raw: RawExtensionEntry): BrowserExtension {
    return {
      id: raw.id,
      name: raw.name,
      version: raw.version ?? null,
      enabled: raw.enabled ?? false,
      permissions: raw.permissions ?? [],
      isSuspicious: raw.isSuspicious ?? false,
    };
  }

  private _convertNotification(raw: RawNotificationEntry): NotificationPermission {
    return {
      origin: raw.origin,
      permission: raw.permission as 'granted' | 'denied' | 'default',
      lastAccessed: raw.lastAccessed ?? null,
    };
  }

  private _buildResult(
    browsers: BrowserInfo[],
    profiles: BrowserProfile[],
    startTime: number,
    errors: string[],
  ): BrowserScanResult {
    return {
      browsers,
      profiles,
      scannedAt: new Date().toISOString(),
      scanDurationMs: Date.now() - startTime,
      errors,
    };
  }
}

export const browserScanner = new BrowserScanner();
