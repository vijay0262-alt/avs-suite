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
  getDeviceInfo,
  type SyncResponse,
  type SyncServiceError,
  type SyncErrorCode,
} from './syncService';
import { rpc } from '../../services/rpc';

// ── Remote sign-out ───────────────────────────────────────────

/** Device statuses that mean "this PC must not stay signed in". */
const REVOKED_DEVICE_STATUSES = new Set([
  'disabled',
  'force_logged_out',
  'deactivated',
  'uninstalled',
  'removed', // tombstoned — admin hard-removed, fingerprint is banned
]);

/**
 * Check whether this device was revoked server-side (admin disable,
 * force-logout, or portal removal). If so, sign the app out.
 *
 * Dynamic import avoids the authStore ↔ syncStore circular dependency.
 */
async function enforceRemoteSignOut(data: SyncResponse): Promise<void> {
  try {
    const info = await getDeviceInfo();
    if (!info?.fingerprint) return;
    const own = data.devices.find((d) => d.device_fingerprint === info.fingerprint);
    if (!own || !REVOKED_DEVICE_STATUSES.has(own.status)) return;

    const { useAuthStore } = await import('../auth/authStore');
    useAuthStore.getState().logout();
    // Surface a reason on the login screen after logout clears state.
    useAuthStore.setState({
      error: 'This device was signed out remotely. Contact support if you believe this is a mistake.',
      errorCode: 'DEVICE_REVOKED',
    });
  } catch {
    // Best-effort enforcement — never break sync over it
  }
}

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

const SYNC_INTERVAL_MS = 60 * 1000; // 1 minute — keeps the license server's last_seen fresh
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Push the current edition to the backend so require_feature decorators
 * enforce the correct restrictions. The backend's license SDK may not
 * be able to reach the license server, so the frontend-pushed override
 * is the authoritative source for edition enforcement.
 */
async function pushEditionToBackend(data: SyncResponse): Promise<void> {
  try {
    const edition = planToEdition(data.subscription.plan, data.license?.edition);
    const backendEdition = edition === 'PROFESSIONAL' ? 'professional' : 'free';
    await rpc.raw('licensing.set_edition', { edition: backendEdition });
  } catch {
    // Backend may not be ready yet or running outside Electron — silently ignore
  }
}

/**
 * Push edition to backend (fire-and-forget). Safe to call anywhere,
 * including outside Electron (tests, Storybook). Synchronous errors
 * from the RPC client are caught and silently ignored.
 */
function syncEditionToBackend(data: SyncResponse | null): void {
  if (!data) return;
  void pushEditionToBackend(data);
}

/**
 * Reset backend edition to free (fire-and-forget). Safe to call anywhere.
 */
function resetBackendEdition(): void {
  try {
    void rpc.raw('licensing.set_edition', { edition: 'free' }).catch(() => {});
  } catch {
    // Running outside Electron — silently ignore
  }
}

/**
 * Deliver server-pushed notifications to the system tray.
 *
 * The sync response carries pending admin notifications; we forward
 * each to the Electron main process (which shows a native tray popup)
 * and then ack it so the server can track delivery. Best-effort —
 * never breaks sync.
 */
async function deliverNotifications(data: SyncResponse): Promise<void> {
  const notifications = data.notifications;
  if (!notifications || notifications.length === 0) return;

  const avs = (window as unknown as {
    avs?: { notifications?: { deliver?: (n: unknown) => void } };
  }).avs;
  if (!avs?.notifications?.deliver) return;

  let fingerprint = '';
  try {
    const info = await getDeviceInfo();
    fingerprint = info?.fingerprint ?? '';
  } catch { /* ignore */ }

  for (const n of notifications) {
    try {
      avs.notifications.deliver(n);
      if (fingerprint) {
        void syncService.ackNotification(n.id, fingerprint, 'shown');
      }
    } catch { /* ignore single-notification failures */ }
  }
}

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
      // Only allow device reactivation/transfer on the first sync after
      // login or startup. Periodic syncs should not resurrect a
      // user-removed device.
      const isFirstSync = _get().data === null;
      const data = await syncService.sync({ allowReactivate: isFirstSync });
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
      void pushEditionToBackend(data);
      void deliverNotifications(data);
      void enforceRemoteSignOut(data);
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
          syncEditionToBackend(cached.data);
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
    syncEditionToBackend(cached.data);
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
    // Reset backend edition to free on logout
    resetBackendEdition();
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
