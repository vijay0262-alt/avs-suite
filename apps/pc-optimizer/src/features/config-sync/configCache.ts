/**
 * Configuration Cache — persists configuration locally for offline use.
 *
 * Storage: localStorage (browser/dev) or file system (Electron production).
 *
 * Fallback chain:
 *   1. Cached configuration (if available and not expired)
 *   2. Default configuration (hardcoded)
 *
 * The desktop app must never block or crash if the cache is missing
 * or corrupted — it falls back to defaults.
 */
import type {
  CustomerConfiguration,
  ConfigurationCacheEntry,
  SyncStatus,
} from './types';

const CACHE_KEY = 'avs_config_cache';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Default configuration ─────────────────────────────────────

export function createDefaultConfiguration(): CustomerConfiguration {
  return {
    version: 0,
    updated_at: new Date(0).toISOString(),
    checksum: null,
    maintenance_scheduler: {
      schedules: [],
    },
    application_preferences: {
      theme: 'system',
      language: null,
      timezone: null,
      country: null,
      update_channel: 'stable',
    },
    notification_preferences: {
      marketing_email_consent: false,
      marketing_sms_consent: false,
      channels: {},
    },
    capabilities: {
      available: [],
      locked: [],
      upcoming: [],
    },
    ai_settings: { status: 'not_implemented' },
    cleaning_preferences: { status: 'not_implemented' },
    privacy_settings: { status: 'not_implemented' },
    browser_cleaning_preferences: { status: 'not_implemented' },
    startup_optimization: { status: 'not_implemented' },
  };
}

// ── Cache operations ──────────────────────────────────────────

export const configCache = {
  /**
   * Save configuration to cache.
   */
  save(config: CustomerConfiguration, syncStatus: SyncStatus = 'success'): void {
    try {
      const entry: ConfigurationCacheEntry = {
        version: config.version,
        checksum: config.checksum,
        last_sync: new Date().toISOString(),
        sync_status: syncStatus,
        config,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      // localStorage might be full or unavailable — non-fatal
    }
  },

  /**
   * Load configuration from cache.
   * Returns null if cache is missing, expired, or corrupted.
   */
  load(): ConfigurationCacheEntry | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as ConfigurationCacheEntry;
      const age = Date.now() - new Date(parsed.last_sync).getTime();
      if (age > CACHE_MAX_AGE_MS) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  /**
   * Get the cached configuration, or null if not available.
   */
  getConfig(): CustomerConfiguration | null {
    const entry = this.load();
    return entry?.config ?? null;
  },

  /**
   * Get the cached version number, or null if not available.
   */
  getVersion(): number | null {
    const entry = this.load();
    return entry?.version ?? null;
  },

  /**
   * Get the cached checksum, or null if not available.
   */
  getChecksum(): string | null {
    const entry = this.load();
    return entry?.checksum ?? null;
  },

  /**
   * Get the last sync timestamp, or null if not available.
   */
  getLastSync(): string | null {
    const entry = this.load();
    return entry?.last_sync ?? null;
  },

  /**
   * Clear the cache.
   */
  clear(): void {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      // ignore
    }
  },

  /**
   * Check if a cache entry exists.
   */
  exists(): boolean {
    try {
      return localStorage.getItem(CACHE_KEY) !== null;
    } catch {
      return false;
    }
  },
};
