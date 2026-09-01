/**
 * Sync Store — Zustand store that is the single source of truth for the
 * desktop application's state from the backend.
 *
 * Architecture:
 *   Login → sync() → SyncResponse → populate all stores/states
 *
 * The desktop app:
 *   1. On login → calls sync() to get everything
 *   2. On app startup → calls sync() if session exists
 *   3. Periodically (every 15 min) → background sync
 *   4. On manual refresh → sync()
 *   5. After purchase/renewal → sync()
 *   6. Offline → uses cached sync data with grace period
 *
 * No local business logic for:
 *   - Subscription management
 *   - License state
 *   - Feature gating
 *   - Edition selection
 *   - Device limits
 *
 * Everything is derived from the SyncResponse.
 */
import { create } from 'zustand';
import {
  syncService,
  type SyncResponse,
  type SyncServiceError,
  type SyncErrorCode,
} from './syncService';

// ── Cache persistence ───────────────────────────────────────────

const CACHE_KEY = 'avs_sync_cache';
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CachedSync {
  data: SyncResponse;
  cachedAt: string; // ISO timestamp
}

function loadCache(): CachedSync | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSync;
    const age = Date.now() - new Date(parsed.cachedAt).getTime();
    if (age > CACHE_MAX_AGE_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveCache(data: SyncResponse): void {
  try {
    const cached: CachedSync = { data, cachedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // localStorage might be full or unavailable — non-fatal
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

// ── Store types ─────────────────────────────────────────────────

export type SyncPhase = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface SyncStoreState {
  /** The full sync response from the backend, or null if not yet synced. */
  data: SyncResponse | null;
  /** Current sync phase. */
  phase: SyncPhase;
  /** Error message if sync failed. */
  error: string | null;
  /** Error code if sync failed. */
  errorCode: SyncErrorCode | null;
  /** ISO timestamp of the last successful sync. */
  lastSyncAt: string | null;
  /** Whether the app is currently offline (using cached data). */
  isOffline: boolean;
  /** Whether cached data is being used. */
  fromCache: boolean;

  /** Full sync from the backend. Returns true on success. */
  sync: () => Promise<boolean>;
  /** Restore from cache without network call (for offline startup). */
  restoreFromCache: () => boolean;
  /** Clear all sync data (e.g. on logout). */
  clear: () => void;
  /** Clear error state. */
  clearError: () => void;
}

// ── Helper: derive edition from sync data ───────────────────────

/**
 * Derive edition from subscription plan, with license edition as fallback.
 * If the subscription plan says FREE but a PRO license exists, use the license edition.
 */
export function planToEdition(
  plan: string,
  licenseEdition?: string | null,
): 'FREE' | 'PROFESSIONAL' {
  const upper = plan.toUpperCase();
  switch (upper) {
    case 'PROFESSIONAL':
    case 'PRO':
    case 'ULTIMATE':
    case 'ENTERPRISE':
      return 'PROFESSIONAL';
    default:
      break;
  }
  // Fallback: check license edition if subscription plan is FREE
  if (licenseEdition) {
    const ed = licenseEdition.toUpperCase();
    if (ed === 'PROFESSIONAL' || ed === 'PRO' || ed === 'ULTIMATE' || ed === 'ENTERPRISE') {
      return 'PROFESSIONAL';
    }
  }
  return 'FREE';
}

// ── Store ───────────────────────────────────────────────────────

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

export const useSyncStore = create<SyncStoreState>((set, _get) => ({
  data: null,
  phase: 'idle',
  error: null,
  errorCode: null,
  lastSyncAt: null,
  isOffline: false,
  fromCache: false,

  sync: async (): Promise<boolean> => {
    set({ phase: 'syncing', error: null, errorCode: null });
    try {
      const data = await syncService.sync();
      saveCache(data);
      set({
        data,
        phase: 'success',
        lastSyncAt: new Date().toISOString(),
        error: null,
        errorCode: null,
        isOffline: false,
        fromCache: false,
      });
      return true;
    } catch (err) {
      const syncErr = err as SyncServiceError;
      const isOffline = syncErr.code === 'OFFLINE';

      // If offline, try to use cached data
      if (isOffline) {
        const cached = loadCache();
        if (cached) {
          set({
            data: cached.data,
            phase: 'offline',
            lastSyncAt: cached.cachedAt,
            error: 'Running in offline mode with cached data.',
            errorCode: 'OFFLINE',
            isOffline: true,
            fromCache: true,
          });
          return true;
        }
      }

      set({
        phase: 'error',
        error: syncErr.message ?? 'Sync failed.',
        errorCode: syncErr.code ?? 'UNKNOWN',
        isOffline,
      });
      return false;
    }
  },

  restoreFromCache: (): boolean => {
    const cached = loadCache();
    if (!cached) return false;
    set({
      data: cached.data,
      phase: 'offline',
      lastSyncAt: cached.cachedAt,
      isOffline: true,
      fromCache: true,
    });
    return true;
  },

  clear: () => {
    clearCache();
    if (syncIntervalId) {
      clearInterval(syncIntervalId);
      syncIntervalId = null;
    }
    set({
      data: null,
      phase: 'idle',
      error: null,
      errorCode: null,
      lastSyncAt: null,
      isOffline: false,
      fromCache: false,
    });
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },
}));

// ── Periodic sync management ────────────────────────────────────

export function startPeriodicSync(): void {
  if (syncIntervalId) return;
  syncIntervalId = setInterval(() => {
    const store = useSyncStore.getState();
    // Only sync if we have data (meaning user is authenticated)
    if (store.data) {
      void store.sync().catch(() => {});
    }
  }, SYNC_INTERVAL_MS);
}

export function stopPeriodicSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
}

// ── Convenience hooks ───────────────────────────────────────────

/**
 * Get the current edition derived from the sync data.
 * Returns 'FREE' if no sync data is available.
 */
export function useEdition(): 'FREE' | 'PROFESSIONAL' {
  return useSyncStore((s) => {
    if (!s.data) return 'FREE';
    return planToEdition(s.data.subscription.plan, s.data.license?.edition);
  });
}

/**
 * Check if a feature is enabled based on backend feature flags.
 */
export function useFeatureEnabled(feature: string): boolean {
  return useSyncStore((s) => {
    if (!s.data) return false;
    return s.data.features.includes(feature);
  });
}

/**
 * Get the current subscription plan.
 */
export function usePlan(): string {
  return useSyncStore((s) => s.data?.subscription.plan ?? 'FREE');
}

/**
 * Check if the customer has an active PROFESSIONAL subscription.
 */
export function useIsPro(): boolean {
  return useSyncStore((s) => {
    if (!s.data) return false;
    return planToEdition(s.data.subscription.plan, s.data.license?.edition) === 'PROFESSIONAL';
  });
}

/**
 * Non-hook version of useIsPro — check if the customer has PROFESSIONAL
 * from the current store state. Safe to call outside React components.
 */
export function getIsPro(): boolean {
  const s = useSyncStore.getState();
  if (!s.data) return false;
  return planToEdition(s.data.subscription.plan, s.data.license?.edition) === 'PROFESSIONAL';
}

/**
 * Get the license info from sync data.
 */
export function useLicense(): SyncResponse['license'] | null {
  return useSyncStore((s) => s.data?.license ?? null);
}

/**
 * Get the list of registered devices from sync data.
 */
export function useDevices(): SyncResponse['devices'] {
  return useSyncStore((s) => s.data?.devices ?? []);
}
