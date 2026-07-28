/**
 * Configuration Store — Zustand store wrapping ConfigurationManager.
 *
 * Provides reactive access to configuration state for React components.
 *
 * Architecture:
 *   UI → useConfigStore → ConfigurationManager → ConfigSyncService → Backend
 *                                    ↕
 *                              ConfigCache (localStorage)
 */
import { create } from 'zustand';
import { configManager } from './configManager';
import { configCache, createDefaultConfiguration } from './configCache';
import type {
  CustomerConfiguration,
  SyncResult,
  SyncStatus,
} from './types';

export interface ConfigStoreState {
  /** The current configuration. */
  config: CustomerConfiguration;
  /** Current sync phase. */
  phase: 'idle' | 'syncing' | 'success' | 'error' | 'offline';
  /** Last sync result. */
  lastSyncResult: SyncResult | null;
  /** ISO timestamp of the last successful sync. */
  lastSyncAt: string | null;
  /** Whether the store has been initialized. */
  initialized: boolean;
  /** Error message if sync failed. */
  error: string | null;

  /** Initialize: load from cache, then sync from backend. */
  init: () => Promise<void>;
  /** Trigger a sync cycle. Returns the SyncResult. */
  sync: () => Promise<SyncResult>;
  /** Load from cache only (for offline startup). */
  loadFromCache: () => boolean;
  /** Clear all configuration data (e.g. on logout). */
  clear: () => void;
  /** Get a specific config section. */
  getSection: <K extends keyof CustomerConfiguration>(name: K) => CustomerConfiguration[K];
  /** Check if a capability is available. */
  canUse: (capabilityId: string) => boolean;
}

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  config: createDefaultConfiguration(),
  phase: 'idle',
  lastSyncResult: null,
  lastSyncAt: null,
  initialized: false,
  error: null,

  init: async (): Promise<void> => {
    // Load from cache first for instant startup
    get().loadFromCache();

    // Then sync from backend
    await get().sync();
  },

  sync: async (): Promise<SyncResult> => {
    set({ phase: 'syncing', error: null });
    const result = await configManager.sync();

    const statusToPhase: Record<SyncStatus, 'success' | 'error' | 'offline' | 'syncing'> = {
      success: 'success',
      no_change: 'success',
      failed: 'error',
      offline: 'offline',
    };

    set({
      config: configManager.get_config(),
      phase: statusToPhase[result.status] ?? 'error',
      lastSyncResult: result,
      lastSyncAt: result.timestamp,
      initialized: configManager.is_initialized(),
      error: result.error ?? null,
    });

    return result;
  },

  loadFromCache: (): boolean => {
    const loaded = configManager.load_from_cache();
    if (loaded) {
      set({
        config: configManager.get_config(),
        phase: 'offline',
        lastSyncAt: configCache.getLastSync(),
        initialized: true,
      });
    }
    return loaded;
  },

  clear: () => {
    configManager.clear();
    set({
      config: createDefaultConfiguration(),
      phase: 'idle',
      lastSyncResult: null,
      lastSyncAt: null,
      initialized: false,
      error: null,
    });
  },

  getSection: (name) => {
    return configManager.get_section(name);
  },

  canUse: (capabilityId) => {
    return configManager.can_use(capabilityId);
  },
}));

// ── Convenience hooks ─────────────────────────────────────────

/**
 * Get the current configuration version.
 */
export function useConfigVersion(): number {
  return useConfigStore((s) => s.config.version);
}

/**
 * Get the maintenance scheduler section.
 */
export function useMaintenanceSchedules() {
  return useConfigStore((s) => s.config.maintenance_scheduler.schedules);
}

/**
 * Get the application preferences section.
 */
export function useAppPreferences() {
  return useConfigStore((s) => s.config.application_preferences);
}

/**
 * Get the notification preferences section.
 */
export function useNotificationPrefs() {
  return useConfigStore((s) => s.config.notification_preferences);
}

/**
 * Get the capabilities section.
 */
export function useCapabilities() {
  return useConfigStore((s) => s.config.capabilities);
}

/**
 * Check if a capability is available.
 */
export function useCapabilityEnabled(capabilityId: string): boolean {
  return useConfigStore((s) =>
    s.config.capabilities.available.some((cap) => cap.id === capabilityId),
  );
}

/**
 * Get the current sync phase.
 */
export function useConfigSyncPhase() {
  return useConfigStore((s) => s.phase);
}
