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
import { licenseCacheService, type CacheStatus } from './licenseCacheService';
import { gracePeriodManager, type GracePeriodInfo } from './gracePeriodManager';
import type { OfflineValidationResult } from './offlineLicenseValidator';

export type ActivationState =
  | 'idle'          // No activation attempted yet
  | 'activating'    // Requesting/validating license
  | 'activated'     // License is valid and active (online)
  | 'offline'       // Server unreachable, using cached license within grace period
  | 'limited'       // Grace period expired, premium features disabled
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
  validation: ValidationResult | OfflineValidationResult | null;
  /** Last offline validation result (includes grace period info). */
  offlineValidation: OfflineValidationResult | null;
  /** Sync status for UI feedback. */
  syncStatus: SyncStatus;
  /** Error message if activation failed. */
  error: string | null;
  /** Error code if activation failed. */
  errorCode: LicenseErrorCode | null;
  /** ISO timestamp of the last successful activation/refresh. */
  lastRefreshAt: string | null;
  // ── M4.4: Offline cache & grace period state ──
  /** Whether the app is currently offline. */
  isOffline: boolean;
  /** Cache status from the last integrity check. */
  cacheStatus: CacheStatus;
  /** Grace period information. */
  gracePeriod: GracePeriodInfo | null;
  /** ISO timestamp of the last successful server validation. */
  lastSuccessfulValidation: string | null;
  /** ISO timestamp when the grace period expires. */
  gracePeriodExpiration: string | null;
  /** Whether the app is in Limited Mode (premium features disabled). */
  limitedMode: boolean;

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
  /** Validate cache integrity and update state. */
  validateCache: () => Promise<void>;
}

export const useLicenseStore = create<LicenseState>((set) => ({
  license: null,
  issued: false,
  fromCache: false,
  activationState: 'idle',
  validation: null,
  offlineValidation: null,
  syncStatus: 'idle',
  error: null,
  errorCode: null,
  lastRefreshAt: null,
  isOffline: false,
  cacheStatus: 'empty',
  gracePeriod: null,
  lastSuccessfulValidation: null,
  gracePeriodExpiration: null,
  limitedMode: false,

  activate: async (productCode: string = 'optimizer'): Promise<boolean> => {
    set({ activationState: 'activating', syncStatus: 'syncing', error: null, errorCode: null });
    try {
      const result = await licenseService.activate(productCode);
      const graceInfo = gracePeriodManager.evaluate(
        result.license.last_successful_validation,
        result.license.grace_period_expiration,
      );
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
        isOffline: false,
        cacheStatus: 'valid',
        gracePeriod: graceInfo,
        lastSuccessfulValidation: result.license.last_successful_validation,
        gracePeriodExpiration: result.license.grace_period_expiration,
        limitedMode: false,
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
            const graceInfo = gracePeriodManager.evaluate(
              cached.last_successful_validation,
              cached.grace_period_expiration,
            );
            set({
              license: cached,
              issued: false,
              fromCache: true,
              activationState: graceInfo.limitedMode ? 'limited' : 'offline',
              validation,
              syncStatus: 'success',
              lastRefreshAt: cached.last_refreshed,
              error: graceInfo.limitedMode ? graceInfo.message : 'Running in offline mode with cached license.',
              errorCode: 'OFFLINE',
              isOffline: true,
              cacheStatus: graceInfo.limitedMode ? 'expired' : 'valid',
              gracePeriod: graceInfo,
              lastSuccessfulValidation: cached.last_successful_validation,
              gracePeriodExpiration: cached.grace_period_expiration,
              limitedMode: graceInfo.limitedMode,
            });
            return !graceInfo.limitedMode;
          }
        }
      }

      set({
        activationState: 'error',
        syncStatus: 'error',
        error: svcErr.message ?? 'License activation failed.',
        errorCode: svcErr.code ?? 'UNKNOWN',
        isOffline: isOffline,
      });
      return false;
    }
  },

  refresh: async (productCode: string = 'optimizer'): Promise<boolean> => {
    set({ syncStatus: 'syncing', error: null, errorCode: null });
    try {
      const result = await licenseService.refreshLicense(productCode);
      const validation = await licenseService.validateCachedLicense(result.license);
      // Update cache with fresh grace period
      licenseCacheService.updateValidationTimestamp(result.license);
      const graceInfo = gracePeriodManager.evaluate(
        result.license.last_successful_validation,
        result.license.grace_period_expiration,
      );
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
        isOffline: false,
        cacheStatus: 'valid',
        gracePeriod: graceInfo,
        lastSuccessfulValidation: result.license.last_successful_validation,
        gracePeriodExpiration: result.license.grace_period_expiration,
        limitedMode: false,
      });
      return true;
    } catch (err) {
      const svcErr = err as LicenseServiceError;
      const isOffline = svcErr.code === 'OFFLINE';
      // If offline, keep using cached license but update grace period info
      if (isOffline) {
        const cached = licenseStorage.load();
        if (cached) {
          const graceInfo = gracePeriodManager.evaluate(
            cached.last_successful_validation,
            cached.grace_period_expiration,
          );
          set((s) => ({
            syncStatus: 'error',
            error: svcErr.message ?? 'License refresh failed.',
            errorCode: svcErr.code ?? 'UNKNOWN',
            isOffline: true,
            gracePeriod: graceInfo,
            limitedMode: graceInfo.limitedMode,
            activationState: graceInfo.limitedMode ? 'limited' : (s.activationState === 'activated' ? 'offline' : s.activationState),
          }));
          return !graceInfo.limitedMode;
        }
      }
      set({
        syncStatus: 'error',
        error: svcErr.message ?? 'License refresh failed.',
        errorCode: svcErr.code ?? 'UNKNOWN',
        isOffline: isOffline,
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
      offlineValidation: null,
      syncStatus: 'idle',
      error: null,
      errorCode: null,
      lastRefreshAt: null,
      isOffline: false,
      cacheStatus: 'empty',
      gracePeriod: null,
      lastSuccessfulValidation: null,
      gracePeriodExpiration: null,
      limitedMode: false,
    });
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },

  restoreFromCache: async (): Promise<boolean> => {
    const integrity = await licenseCacheService.validateIntegrity();

    if (integrity.status === 'empty' || integrity.status === 'corrupted' || integrity.status === 'invalid') {
      set({
        activationState: 'no_license',
        cacheStatus: integrity.status,
        offlineValidation: integrity.validation,
      });
      return false;
    }

    if (integrity.status === 'expired') {
      // License is valid but grace period expired → Limited Mode
      set({
        license: integrity.license,
        issued: false,
        fromCache: true,
        activationState: 'limited',
        validation: integrity.validation,
        offlineValidation: integrity.validation,
        syncStatus: 'success',
        lastRefreshAt: integrity.license?.last_refreshed ?? null,
        isOffline: true,
        cacheStatus: 'expired',
        gracePeriod: integrity.validation?.gracePeriod ?? null,
        lastSuccessfulValidation: integrity.license?.last_successful_validation ?? null,
        gracePeriodExpiration: integrity.license?.grace_period_expiration ?? null,
        limitedMode: true,
      });
      return false; // Not fully usable
    }

    // Valid cached license within grace period
    const cached = integrity.license!;
    const graceInfo = integrity.validation?.gracePeriod ?? null;
    set({
      license: cached,
      issued: false,
      fromCache: true,
      activationState: 'offline',
      validation: integrity.validation,
      offlineValidation: integrity.validation,
      syncStatus: 'success',
      lastRefreshAt: cached.last_refreshed,
      isOffline: true,
      cacheStatus: 'valid',
      gracePeriod: graceInfo,
      lastSuccessfulValidation: cached.last_successful_validation,
      gracePeriodExpiration: cached.grace_period_expiration,
      limitedMode: false,
    });
    return true;
  },

  validateCache: async (): Promise<void> => {
    const integrity = await licenseCacheService.validateIntegrity();
    set({
      cacheStatus: integrity.status,
      offlineValidation: integrity.validation,
      gracePeriod: integrity.validation?.gracePeriod ?? null,
    });
  },
}));

/**
 * Convenience hook for components that need license status.
 */
export function useLicense(): LicenseState {
  return useLicenseStore();
}
