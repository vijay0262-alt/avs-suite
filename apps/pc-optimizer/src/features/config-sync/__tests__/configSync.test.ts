/**
 * Tests for the Configuration Sync system.
 *
 * Covers:
 * - ConfigSyncService (fetch, version comparison, checksum comparison)
 * - ConfigCache (save, load, clear, expiry, corruption)
 * - ConfigEvents (subscribe, emit, unsubscribe)
 * - ConfigurationManager (sync, offline fallback, cache fallback, defaults)
 * - ConfigStore (Zustand store state transitions)
 * - Offline tests (backend unavailable → cache → defaults)
 * - Regression tests (existing sync/feature system unchanged)
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configSyncService, ConfigSyncError } from '../configSyncService';
import { configCache, createDefaultConfiguration } from '../configCache';
import { configEvents } from '../configEvents';
import { configManager } from '../configManager';
import { useConfigStore } from '../configStore';
import type { CustomerConfiguration, ConfigurationCacheEntry } from '../types';

// ── Mocks ─────────────────────────────────────────────────────

vi.mock('../../auth/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public readonly statusCode: number, public readonly detail?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
  AuthError: class AuthError extends Error {
    constructor(message: string) { super(message); this.name = 'AuthError'; }
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string, public kind: string = 'UNKNOWN') {
      super(message);
      this.name = 'NetworkError';
    }
  },
}));

import { apiClient, NetworkError, ApiError, AuthError } from '../../auth/apiClient';

// ── Helpers ───────────────────────────────────────────────────

function createMockConfig(version: number = 1, checksum: string = 'abc123'): CustomerConfiguration {
  return {
    version,
    updated_at: new Date().toISOString(),
    checksum,
    maintenance_scheduler: {
      schedules: [{
        id: 'sched-1',
        name: 'Daily Clean',
        enabled: true,
        frequency: 'daily',
        timezone: 'UTC',
        schedule_time: '03:00',
        day_of_week: null,
        day_of_month: null,
        custom_interval_hours: null,
        tasks: ['junk_cleaning'],
        device_id: null,
        last_run_at: null,
        next_run_at: null,
      }],
    },
    application_preferences: {
      theme: 'dark',
      language: 'en',
      timezone: 'America/New_York',
      country: 'US',
      update_channel: 'stable',
    },
    notification_preferences: {
      marketing_email_consent: true,
      marketing_sms_consent: false,
      channels: { email: true },
    },
    capabilities: {
      available: [
        { id: 'basic_cleaning', display_name: 'Basic Cleaning', description: 'Clean', category: 'cleaning', minimum_version: '1.0.0', status: 'active' },
      ],
      locked: [
        { id: 'smart_scheduler', display_name: 'Smart Scheduler', description: 'Schedule', category: 'automation', minimum_version: '1.0.0', status: 'active' },
      ],
      upcoming: [
        { id: 'ai_gaming_mode', display_name: 'AI Gaming Mode', description: 'AI', category: 'ai', minimum_version: '2.0.0', status: 'upcoming' },
      ],
    },
    ai_settings: { status: 'available' },
    cleaning_preferences: { status: 'available' },
    privacy_settings: { status: 'available' },
    browser_cleaning_preferences: { status: 'available' },
    startup_optimization: { status: 'available' },
  };
}

function createMockCacheEntry(version: number = 1): ConfigurationCacheEntry {
  return {
    version,
    checksum: 'cached-checksum',
    last_sync: new Date().toISOString(),
    sync_status: 'success',
    config: createMockConfig(version, 'cached-checksum'),
  };
}

// ── ConfigSyncService Tests ───────────────────────────────────

describe('ConfigSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    configCache.clear();
    configManager.clear();
  });

  describe('fetch()', () => {
    it('should fetch configuration successfully', async () => {
      const mockConfig = createMockConfig();
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockConfig);

      const result = await configSyncService.fetch();
      expect(result).toEqual(mockConfig);
      expect(apiClient.get).toHaveBeenCalledWith('/api/customer/configuration');
    });

    it('should throw OFFLINE error on network failure', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new NetworkError('Connection refused', 'CONNECTION_REFUSED'),
      );

      await expect(configSyncService.fetch()).rejects.toThrow();
      try {
        await configSyncService.fetch();
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigSyncError);
        expect((err as ConfigSyncError).code).toBe('OFFLINE');
      }
    });

    it('should throw TOKEN_EXPIRED on auth error', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new AuthError('Session expired'),
      );

      try {
        await configSyncService.fetch();
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigSyncError);
        expect((err as ConfigSyncError).code).toBe('TOKEN_EXPIRED');
      }
    });

    it('should throw SERVER_ERROR on 500', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new ApiError('Server error', 500, 'Internal error'),
      );

      try {
        await configSyncService.fetch();
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigSyncError);
        expect((err as ConfigSyncError).code).toBe('SERVER_ERROR');
      }
    });
  });

  describe('hasVersionChanged()', () => {
    it('should return true when no cache exists', () => {
      expect(configSyncService.hasVersionChanged(1)).toBe(true);
    });

    it('should return false when version matches cache', () => {
      configCache.save(createMockConfig(3), 'success');
      expect(configSyncService.hasVersionChanged(3)).toBe(false);
    });

    it('should return true when version differs from cache', () => {
      configCache.save(createMockConfig(2), 'success');
      expect(configSyncService.hasVersionChanged(3)).toBe(true);
    });
  });

  describe('hasChecksumChanged()', () => {
    it('should return true when no cache exists', () => {
      expect(configSyncService.hasChecksumChanged('abc')).toBe(true);
    });

    it('should return false when checksum matches cache', () => {
      configCache.save(createMockConfig(1, 'my-checksum'), 'success');
      expect(configSyncService.hasChecksumChanged('my-checksum')).toBe(false);
    });

    it('should return true when checksum differs from cache', () => {
      configCache.save(createMockConfig(1, 'old-checksum'), 'success');
      expect(configSyncService.hasChecksumChanged('new-checksum')).toBe(true);
    });

    it('should return true when remote checksum is null', () => {
      configCache.save(createMockConfig(1, 'some-checksum'), 'success');
      expect(configSyncService.hasChecksumChanged(null)).toBe(true);
    });
  });

  describe('sync()', () => {
    it('should return success when version changed', async () => {
      const mockConfig = createMockConfig(5, 'new-checksum');
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockConfig);

      const result = await configSyncService.sync();
      expect(result.status).toBe('success');
      expect(result.version).toBe(5);
    });

    it('should return no_change when version and checksum match', async () => {
      // First, populate cache
      const config = createMockConfig(3, 'stable-checksum');
      configCache.save(config, 'success');

      // Fetch same version
      vi.mocked(apiClient.get).mockResolvedValueOnce(config);

      const result = await configSyncService.sync();
      expect(result.status).toBe('no_change');
      expect(result.version).toBe(3);
    });
  });
});

// ── ConfigCache Tests ─────────────────────────────────────────

describe('ConfigCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load configuration', () => {
    const config = createMockConfig(2, 'test-checksum');
    configCache.save(config, 'success');

    const loaded = configCache.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(2);
    expect(loaded!.checksum).toBe('test-checksum');
    expect(loaded!.config).toEqual(config);
  });

  it('should return null when no cache exists', () => {
    expect(configCache.load()).toBeNull();
    expect(configCache.getConfig()).toBeNull();
  });

  it('should return null for corrupted cache', () => {
    localStorage.setItem('avs_config_cache', '{invalid json');
    expect(configCache.load()).toBeNull();
  });

  it('should clear cache', () => {
    configCache.save(createMockConfig(1), 'success');
    expect(configCache.exists()).toBe(true);

    configCache.clear();
    expect(configCache.exists()).toBe(false);
    expect(configCache.load()).toBeNull();
  });

  it('should expire cache after max age', () => {
    const entry = createMockCacheEntry(1);
    // Set last_sync to 31 days ago
    entry.last_sync = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('avs_config_cache', JSON.stringify(entry));

    expect(configCache.load()).toBeNull();
  });

  it('should get version from cache', () => {
    configCache.save(createMockConfig(7, 'v7-checksum'), 'success');
    expect(configCache.getVersion()).toBe(7);
  });

  it('should get checksum from cache', () => {
    configCache.save(createMockConfig(1, 'my-checksum'), 'success');
    expect(configCache.getChecksum()).toBe('my-checksum');
  });

  it('should get last sync from cache', () => {
    configCache.save(createMockConfig(1), 'success');
    expect(configCache.getLastSync()).not.toBeNull();
  });

  it('should return null version when no cache', () => {
    expect(configCache.getVersion()).toBeNull();
  });

  it('createDefaultConfiguration should return valid defaults', () => {
    const defaults = createDefaultConfiguration();
    expect(defaults.version).toBe(0);
    expect(defaults.maintenance_scheduler.schedules).toEqual([]);
    expect(defaults.application_preferences.theme).toBe('system');
    expect(defaults.capabilities.available).toEqual([]);
  });
});

// ── ConfigEvents Tests ────────────────────────────────────────

describe('ConfigEvents', () => {
  afterEach(() => {
    configEvents.clear();
  });

  it('should emit events to subscribers', () => {
    const listener = vi.fn();
    configEvents.on('configuration_updated', listener);

    configEvents.emit('configuration_updated', { old: null, new: createMockConfig() });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should support multiple subscribers', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    configEvents.on('sync_started', listener1);
    configEvents.on('sync_started', listener2);

    configEvents.emit('sync_started', {});

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should unsubscribe via returned function', () => {
    const listener = vi.fn();
    const unsub = configEvents.on('sync_failed', listener);

    configEvents.emit('sync_failed', { error: 'test', timestamp: 'now' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    configEvents.emit('sync_failed', { error: 'test', timestamp: 'now' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not crash when listener throws', () => {
    const badListener = () => { throw new Error('boom'); };
    const goodListener = vi.fn();
    configEvents.on('sync_started', badListener);
    configEvents.on('sync_started', goodListener);

    configEvents.emit('sync_started', {});

    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('should track listener count', () => {
    expect(configEvents.listenerCount('sync_started')).toBe(0);
    const unsub = configEvents.on('sync_started', () => {});
    expect(configEvents.listenerCount('sync_started')).toBe(1);
    unsub();
    expect(configEvents.listenerCount('sync_started')).toBe(0);
  });

  it('should clear all listeners', () => {
    configEvents.on('sync_started', () => {});
    configEvents.on('sync_failed', () => {});
    configEvents.clear();
    expect(configEvents.listenerCount('sync_started')).toBe(0);
    expect(configEvents.listenerCount('sync_failed')).toBe(0);
  });
});

// ── ConfigurationManager Tests ────────────────────────────────

describe('ConfigurationManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    configManager.clear();
  });

  it('should return default config before sync', () => {
    const config = configManager.get_config();
    expect(config.version).toBe(0);
    expect(config.maintenance_scheduler.schedules).toEqual([]);
  });

  it('should sync and apply new configuration', async () => {
    const mockConfig = createMockConfig(5, 'new-checksum');
    vi.mocked(apiClient.get).mockResolvedValue(mockConfig);

    await configManager.sync();

    const config = configManager.get_config();
    expect(config.version).toBe(5);
    expect(config.checksum).toBe('new-checksum');
  });

  it('should emit configuration_updated on sync with changes', async () => {
    const listener = vi.fn();
    configManager.on('configuration_updated', listener);

    const mockConfig = createMockConfig(2, 'check-2');
    vi.mocked(apiClient.get).mockResolvedValue(mockConfig);

    await configManager.sync();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should emit sync_started and sync_successful on successful sync', async () => {
    const startedListener = vi.fn();
    const successListener = vi.fn();
    configManager.on('sync_started', startedListener);
    configManager.on('sync_successful', successListener);

    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig(1));

    await configManager.sync();

    expect(startedListener).toHaveBeenCalledTimes(1);
    expect(successListener).toHaveBeenCalledTimes(1);
  });

  it('should fall back to cache when offline', async () => {
    // First, populate cache
    const config = createMockConfig(3, 'cached');
    configCache.save(config, 'success');

    // Now simulate offline
    vi.mocked(apiClient.get).mockRejectedValueOnce(
      new NetworkError('Connection refused'),
    );

    const result = await configManager.sync();

    expect(result.status).toBe('offline');
    expect(configManager.get_config().version).toBe(3);
  });

  it('should fall back to defaults when offline and no cache', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(
      new NetworkError('Connection refused'),
    );

    const result = await configManager.sync();

    expect(result.status).toBe('offline');
    expect(configManager.get_config().version).toBe(0);
  });

  it('should emit offline_mode event when offline', async () => {
    const listener = vi.fn();
    configManager.on('offline_mode', listener);

    configCache.save(createMockConfig(1), 'success');
    vi.mocked(apiClient.get).mockRejectedValueOnce(
      new NetworkError('Connection refused'),
    );

    await configManager.sync();

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as { using_cache: boolean }).using_cache).toBe(true);
  });

  it('should emit sync_failed on error', async () => {
    const listener = vi.fn();
    configManager.on('sync_failed', listener);

    vi.mocked(apiClient.get).mockRejectedValueOnce(
      new ApiError('Server error', 500),
    );

    await configManager.sync();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should load from cache', () => {
    configCache.save(createMockConfig(4, 'cached-4'), 'success');

    const loaded = configManager.load_from_cache();
    expect(loaded).toBe(true);
    expect(configManager.get_config().version).toBe(4);
  });

  it('should return false when no cache to load', () => {
    expect(configManager.load_from_cache()).toBe(false);
  });

  it('should check capabilities', async () => {
    const config = createMockConfig();
    vi.mocked(apiClient.get).mockResolvedValue(config);

    await configManager.sync();

    expect(configManager.can_use('basic_cleaning')).toBe(true);
    expect(configManager.can_use('smart_scheduler')).toBe(false);
  });

  it('should get capability info', async () => {
    const config = createMockConfig();
    vi.mocked(apiClient.get).mockResolvedValue(config);

    await configManager.sync();

    const cap = configManager.get_capability('basic_cleaning');
    expect(cap).not.toBeNull();
    expect(cap!.display_name).toBe('Basic Cleaning');
  });

  it('should return null for unknown capability', async () => {
    const config = createMockConfig();
    vi.mocked(apiClient.get).mockResolvedValue(config);

    await configManager.sync();

    expect(configManager.get_capability('nonexistent')).toBeNull();
  });

  it('should get section by name', async () => {
    const config = createMockConfig();
    vi.mocked(apiClient.get).mockResolvedValue(config);

    await configManager.sync();

    const section = configManager.get_section('application_preferences');
    expect(section.theme).toBe('dark');
  });

  it('should clear all data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig(1));
    await configManager.sync();

    configManager.clear();

    expect(configManager.get_config().version).toBe(0);
    expect(configManager.is_initialized()).toBe(false);
    expect(configCache.exists()).toBe(false);
  });
});

// ── ConfigStore Tests ─────────────────────────────────────────

describe('ConfigStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    configManager.clear();
    useConfigStore.getState().clear();
  });

  it('should start with default config', () => {
    const state = useConfigStore.getState();
    expect(state.config.version).toBe(0);
    expect(state.phase).toBe('idle');
    expect(state.initialized).toBe(false);
  });

  it('should sync and update state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig(5, 'v5'));

    await useConfigStore.getState().sync();

    const state = useConfigStore.getState();
    expect(state.config.version).toBe(5);
    expect(state.phase).toBe('success');
    expect(state.initialized).toBe(true);
  });

  it('should set offline phase when offline', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(
      new NetworkError('Connection refused'),
    );

    await useConfigStore.getState().sync();

    const state = useConfigStore.getState();
    expect(state.phase).toBe('offline');
  });

  it('should set error phase on server error', async () => {
    vi.mocked(apiClient.get).mockRejectedValueOnce(
      new ApiError('Server error', 500),
    );

    await useConfigStore.getState().sync();

    const state = useConfigStore.getState();
    expect(state.phase).toBe('error');
    expect(state.error).not.toBeNull();
  });

  it('should load from cache', () => {
    configCache.save(createMockConfig(3, 'cached-3'), 'success');

    const result = useConfigStore.getState().loadFromCache();
    expect(result).toBe(true);

    const state = useConfigStore.getState();
    expect(state.config.version).toBe(3);
    expect(state.phase).toBe('offline');
  });

  it('should clear state', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig(1));
    await useConfigStore.getState().sync();

    useConfigStore.getState().clear();

    const state = useConfigStore.getState();
    expect(state.config.version).toBe(0);
    expect(state.phase).toBe('idle');
    expect(state.initialized).toBe(false);
  });

  it('should check capabilities via canUse', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig());
    await useConfigStore.getState().sync();

    expect(useConfigStore.getState().canUse('basic_cleaning')).toBe(true);
    expect(useConfigStore.getState().canUse('smart_scheduler')).toBe(false);
  });

  it('should get section via getSection', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig());
    await useConfigStore.getState().sync();

    const prefs = useConfigStore.getState().getSection('application_preferences');
    expect(prefs.theme).toBe('dark');
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('ConfigSync Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    configManager.clear();
    useConfigStore.getState().clear();
  });

  it('should not interfere with existing sync store cache key', () => {
    // The existing sync store uses 'avs_sync_cache', config sync uses 'avs_config_cache'
    localStorage.setItem('avs_sync_cache', JSON.stringify({ data: 'test', cachedAt: new Date().toISOString() }));
    configCache.save(createMockConfig(1), 'success');

    expect(localStorage.getItem('avs_sync_cache')).not.toBeNull();
    expect(localStorage.getItem('avs_config_cache')).not.toBeNull();

    // Config cache should not affect sync cache
    const syncCache = localStorage.getItem('avs_sync_cache');
    expect(JSON.parse(syncCache!).data).toBe('test');
  });

  it('should use a different API endpoint than existing sync', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(createMockConfig());

    await configSyncService.fetch();

    expect(apiClient.get).toHaveBeenCalledWith('/api/customer/configuration');
    // Existing sync uses /api/customer/sync — not called here
  });

  it('default config should have all required sections', () => {
    const defaults = createDefaultConfiguration();
    expect(defaults.maintenance_scheduler).toBeDefined();
    expect(defaults.application_preferences).toBeDefined();
    expect(defaults.notification_preferences).toBeDefined();
    expect(defaults.capabilities).toBeDefined();
    expect(defaults.ai_settings).toBeDefined();
    expect(defaults.cleaning_preferences).toBeDefined();
    expect(defaults.privacy_settings).toBeDefined();
    expect(defaults.browser_cleaning_preferences).toBeDefined();
    expect(defaults.startup_optimization).toBeDefined();
  });
});
