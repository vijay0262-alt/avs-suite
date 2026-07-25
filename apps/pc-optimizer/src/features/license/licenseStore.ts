/**
 * License store — Zustand store for desktop license activation state.
 *
 * Tracks: license data, activation state, validation result, sync status.
 * Bridges the licenseService (async) with React components.
 *
 * UI components must consume only this store — never call licenseService directly.
 */
import { create } from 'zustand';
import {
  licenseService,
  type LicenseServiceError,
  type LicenseErrorCode,
} from './licenseService';
import { licenseStorage, type StoredLicense } from './licenseStorage';
import type { ValidationResult } from './licenseValidator';

export type ActivationState =
  | 'idle'          // No activation attempted yet
  | 'activating'    // Requesting/validating license
  | 'activated'     // License is valid and active
  | 'offline'       // Server unreachable, using cached license
  | 'error'         // Activation failed
  | 'no_license';   // No license and couldn't get one

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface LicenseState {
  /** The active license, or null if not activated. */
  license: StoredLicense | null;
  /** Whether the license was newly issued (vs. from cache). */
  issued: boolean;
  /** Whether the current license came from cache. */
  fromCache: boolean;
  /** Current activation state. */
  activationState: ActivationState;
  /** Last validation result. */
  validation: ValidationResult | null;
  /** Sync status for UI feedback. */
  syncStatus: SyncStatus;
  /** Error message if activation failed. */
  error: string | null;
  /** Error code if activation failed. */
  errorCode: LicenseErrorCode | null;
  /** ISO timestamp of the last successful activation/refresh. */
  lastRefreshAt: string | null;

  /** Activate or restore the license. Returns true on success. */
  activate: (productCode?: string) => Promise<boolean>;
  /** Refresh the license from the server. Returns true on success. */
  refresh: (productCode?: string) => Promise<boolean>;
  /** Clear the license cache and reset state. */
  clear: () => void;
  /** Clear error state. */
  clearError: () => void;
  /** Restore from cache without network call (for offline startup). */
  restoreFromCache: () => Promise<boolean>;
}

export const useLicenseStore = create<LicenseState>((set) => ({
  license: null,
  issued: false,
  fromCache: false,
  activationState: 'idle',
  validation: null,
  syncStatus: 'idle',
  error: null,
  errorCode: null,
  lastRefreshAt: null,

  activate: async (productCode: string = 'optimizer'): Promise<boolean> => {
    set({ activationState: 'activating', syncStatus: 'syncing', error: null, errorCode: null });
    try {
      const result = await licenseService.activate(productCode);
      set({
        license: result.license,
        issued: result.issued,
        fromCache: result.fromCache,
        activationState: 'activated',
        validation: result.validation,
        syncStatus: 'success',
        lastRefreshAt: new Date().toISOString(),
        error: null,
        errorCode: null,
      });
      return true;
    } catch (err) {
      const svcErr = err as LicenseServiceError;
      const isOffline = svcErr.code === 'OFFLINE';

      // If offline, try to use cached license
      if (isOffline) {
        const cached = licenseStorage.load();
        if (cached) {
          const validation = await licenseService.validateCachedLicense(cached);
          if (validation.valid) {
            set({
              license: cached,
              issued: false,
              fromCache: true,
              activationState: 'offline',
              validation,
              syncStatus: 'success',
              lastRefreshAt: cached.last_refreshed,
              error: 'Running in offline mode with cached license.',
              errorCode: 'OFFLINE',
            });
            return true;
          }
        }
      }

      set({
        activationState: 'error',
        syncStatus: 'error',
        error: svcErr.message ?? 'License activation failed.',
        errorCode: svcErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  refresh: async (productCode: string = 'optimizer'): Promise<boolean> => {
    set({ syncStatus: 'syncing', error: null, errorCode: null });
    try {
      const result = await licenseService.refreshLicense(productCode);
      const validation = await licenseService.validateCachedLicense(result.license);
      set({
        license: result.license,
        issued: result.issued,
        fromCache: false,
        activationState: 'activated',
        validation,
        syncStatus: 'success',
        lastRefreshAt: new Date().toISOString(),
        error: null,
        errorCode: null,
      });
      return true;
    } catch (err) {
      const svcErr = err as LicenseServiceError;
      set({
        syncStatus: 'error',
        error: svcErr.message ?? 'License refresh failed.',
        errorCode: svcErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  clear: () => {
    licenseService.clearLicense();
    set({
      license: null,
      issued: false,
      fromCache: false,
      activationState: 'idle',
      validation: null,
      syncStatus: 'idle',
      error: null,
      errorCode: null,
      lastRefreshAt: null,
    });
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },

  restoreFromCache: async (): Promise<boolean> => {
    const cached = licenseStorage.load();
    if (!cached) {
      set({ activationState: 'no_license' });
      return false;
    }
    const validation = await licenseService.validateCachedLicense(cached);
    if (validation.valid) {
      set({
        license: cached,
        issued: false,
        fromCache: true,
        activationState: 'offline',
        validation,
        syncStatus: 'success',
        lastRefreshAt: cached.last_refreshed,
      });
      return true;
    }
    // Cached license is invalid — clear it
    licenseStorage.clear();
    set({
      activationState: 'no_license',
      validation,
    });
    return false;
  },
}));

/**
 * Convenience hook for components that need license status.
 */
export function useLicense(): LicenseState {
  return useLicenseStore();
}
