/**
 * Configuration Manager — centralized service for desktop configuration.
 *
 * This is the single entry point for all desktop modules to access
 * configuration. Modules should NEVER call APIs directly.
 *
 * Responsibilities:
 *   • Trigger sync cycles (download, compare, cache, apply)
 *   • Expose configuration to modules via get_config() / get_section()
 *   • Expose capability checks via can_use()
 *   • Emit events when configuration changes
 *   • Handle offline fallback (cache → defaults)
 *
 * Architecture:
 *   Desktop modules → ConfigurationManager → ConfigSyncService → Backend
 *                                    ↕
 *                              ConfigCache (localStorage)
 */
import type {
  CustomerConfiguration,
  SyncResult,
  ConfigurationEvent,
} from './types';
import { configSyncService } from './configSyncService';
import type { ConfigSyncError } from './configSyncService';
import { configCache, createDefaultConfiguration } from './configCache';
import { configEvents } from './configEvents';

// ── Logging helper ────────────────────────────────────────────

const log = {
  info: (msg: string, ...args: unknown[]) => console.info(`[AVS Config] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[AVS Config] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[AVS Config] ${msg}`, ...args),
  debug: (msg: string, ...args: unknown[]) => console.debug(`[AVS Config] ${msg}`, ...args),
};

// ── Configuration Manager ─────────────────────────────────────

class ConfigurationManagerImpl {
  private _config: CustomerConfiguration;
  private _initialized = false;

  constructor() {
    this._config = createDefaultConfiguration();
  }

  /**
   * Get the current configuration.
   */
  get_config(): CustomerConfiguration {
    return this._config;
  }

  /**
   * Get a specific section of the configuration.
   */
  get_section<K extends keyof CustomerConfiguration>(
    name: K,
  ): CustomerConfiguration[K] {
    return this._config[name];
  }

  /**
   * Check if a capability is available to the customer.
   */
  can_use(capabilityId: string): boolean {
    return this._config.capabilities.available.some(
      (cap) => cap.id === capabilityId,
    );
  }

  /**
   * Get a capability info by ID, or null if not found.
   */
  get_capability(capabilityId: string): { id: string; display_name: string; description: string; category: string; minimum_version: string; status: string } | null {
    const all = [
      ...this._config.capabilities.available,
      ...this._config.capabilities.locked,
      ...this._config.capabilities.upcoming,
    ];
    return all.find((cap) => cap.id === capabilityId) ?? null;
  }

  /**
   * Subscribe to configuration events.
   */
  on(event: ConfigurationEvent, listener: (payload: unknown) => void): () => void {
    return configEvents.on(event, listener);
  }

  /**
   * Load configuration from cache (for offline startup).
   * Returns true if cache was available.
   */
  load_from_cache(): boolean {
    const cached = configCache.getConfig();
    if (cached) {
      this._config = cached;
      this._initialized = true;
      configEvents.emit('configuration_loaded', { config: cached });
      log.info('Configuration loaded from cache: version=%d', cached.version);
      return true;
    }
    log.info('No cache available, using default configuration');
    return false;
  }

  /**
   * Full sync cycle:
   *   1. Emit sync_started
   *   2. Fetch configuration from backend
   *   3. Compare version/checksum
   *   4. If changed: cache, apply, emit events
   *   5. Emit sync_successful or sync_failed
   *
   * Returns SyncResult. On failure, falls back to cache or defaults.
   */
  async sync(): Promise<SyncResult> {
    configEvents.emit('sync_started', {});

    try {
      const result = await configSyncService.sync();

      if (result.status === 'no_change') {
        log.debug('Sync no change: version=%d', result.version);
        configEvents.emit('sync_successful', { result });
        return result;
      }

      // Fetch the full config (sync() already fetched it, but we need the object)
      const config = await configSyncService.fetch();

      // Detect version and checksum changes
      const oldConfig = this._config;
      const oldVersion = configCache.getVersion();
      const oldChecksum = configCache.getChecksum();

      if (oldVersion !== null && config.version !== oldVersion) {
        log.info('Version changed: %d → %d', oldVersion, config.version);
        configEvents.emit('version_changed', { old: oldVersion, new: config.version });
      }

      if (oldChecksum !== config.checksum) {
        log.info('Checksum changed');
        configEvents.emit('checksum_changed', { old: oldChecksum, new: config.checksum });
      }

      // Cache and apply
      configCache.save(config, 'success');
      this._config = config;
      this._initialized = true;

      configEvents.emit('configuration_updated', { old: oldConfig, new: config });
      configEvents.emit('sync_successful', { result });

      log.info('Configuration applied: version=%d', config.version);
      return result;
    } catch (err) {
      const syncErr = err as ConfigSyncError;
      const timestamp = new Date().toISOString();

      log.error('Sync failed: %s', syncErr.message);

      if (syncErr.code === 'OFFLINE') {
        // Try cache fallback
        const cached = configCache.getConfig();
        if (cached) {
          this._config = cached;
          this._initialized = true;
          configEvents.emit('offline_mode', { using_cache: true });
          log.warn('Offline mode: using cached configuration (version=%d)', cached.version);
        } else {
          this._config = createDefaultConfiguration();
          configEvents.emit('offline_mode', { using_cache: false });
          log.warn('Offline mode: using default configuration');
        }
      }

      configEvents.emit('sync_failed', { error: syncErr.message, timestamp });

      return {
        status: syncErr.code === 'OFFLINE' ? 'offline' : 'failed',
        version: this._config.version,
        checksum: this._config.checksum,
        previous_version: configCache.getVersion(),
        timestamp,
        error: syncErr.message,
      };
    }
  }

  /**
   * Initialize the configuration manager.
   * Loads from cache first (for fast startup), then syncs from backend.
   */
  async init(): Promise<void> {
    // Try cache first for instant startup
    this.load_from_cache();

    // Then sync from backend
    await this.sync();
  }

  /**
   * Get the current sync status info.
   */
  get_sync_info(): {
    version: number;
    checksum: string | null;
    last_sync: string | null;
    initialized: boolean;
  } {
    return {
      version: this._config.version,
      checksum: this._config.checksum,
      last_sync: configCache.getLastSync(),
      initialized: this._initialized,
    };
  }

  /**
   * Clear all configuration data (e.g. on logout).
   */
  clear(): void {
    configCache.clear();
    configEvents.clear();
    this._config = createDefaultConfiguration();
    this._initialized = false;
    log.info('Configuration cleared');
  }

  /**
   * Whether the manager has been initialized with real data.
   */
  is_initialized(): boolean {
    return this._initialized;
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const configManager = new ConfigurationManagerImpl();
