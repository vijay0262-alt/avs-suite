/**
 * Entitlement store — Zustand store for the customer's product entitlement.
 *
 * Stores the synced entitlement in memory (not persisted — re-synced on
 * every app startup via the provisioning endpoint, which is idempotent).
 *
 * Exposes:
 * - entitlement data (product, edition, status, etc.)
 * - sync state (idle, syncing, success, error)
 * - last sync timestamp
 * - created flag (whether this was a new provisioning)
 *
 * Future milestones will use this store for feature gating.
 */
import { create } from 'zustand';
import {
  entitlementService,
  type EntitlementData,
  type EntitlementSyncError,
  type ProvisionResponse,
} from './entitlementService';

export type SyncPhase = 'idle' | 'syncing' | 'success' | 'error';

export interface EntitlementState {
  /** The synced entitlement, or null if not yet synced. */
  entitlement: EntitlementData | null;
  /** Whether the entitlement was newly created (vs. already existed). */
  created: boolean;
  /** Current sync phase. */
  syncPhase: SyncPhase;
  /** Error message if sync failed. */
  syncError: string | null;
  /** Error code if sync failed. */
  syncErrorCode: string | null;
  /** ISO timestamp of the last successful sync. */
  lastSyncAt: string | null;

  /** Provision/sync the entitlement. Returns true on success. */
  syncEntitlement: (productCode?: string) => Promise<boolean>;
  /** Clear the entitlement (e.g. on logout). */
  clearEntitlement: () => void;
  /** Clear error state. */
  clearError: () => void;
}

export const useEntitlementStore = create<EntitlementState>((set) => ({
  entitlement: null,
  created: false,
  syncPhase: 'idle',
  syncError: null,
  syncErrorCode: null,
  lastSyncAt: null,

  syncEntitlement: async (productCode: string = 'optimizer'): Promise<boolean> => {
    set({ syncPhase: 'syncing', syncError: null, syncErrorCode: null });
    try {
      const resp: ProvisionResponse = await entitlementService.sync(productCode);
      set({
        entitlement: resp.entitlement,
        created: resp.created,
        syncPhase: 'success',
        lastSyncAt: new Date().toISOString(),
        syncError: null,
        syncErrorCode: null,
      });
      return true;
    } catch (err) {
      const syncErr = err as EntitlementSyncError;
      set({
        syncPhase: 'error',
        syncError: syncErr.message ?? 'Entitlement sync failed.',
        syncErrorCode: syncErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  clearEntitlement: () => {
    set({
      entitlement: null,
      created: false,
      syncPhase: 'idle',
      syncError: null,
      syncErrorCode: null,
      lastSyncAt: null,
    });
  },

  clearError: () => {
    set({ syncError: null, syncErrorCode: null });
  },
}));

/**
 * Convenience hook for components that need entitlement status.
 */
export function useEntitlement(): EntitlementState {
  return useEntitlementStore();
}
