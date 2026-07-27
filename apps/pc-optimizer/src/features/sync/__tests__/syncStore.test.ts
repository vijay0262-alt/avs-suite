/**
 * Tests for syncStore — Zustand store wrapping syncService.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSyncStore, planToEdition, startPeriodicSync, stopPeriodicSync } from '../syncStore';
import { syncService, SyncServiceError, type SyncResponse } from '../syncService';

vi.mock('../syncService', () => ({
  syncService: {
    sync: vi.fn(),
    fetchSubscription: vi.fn(),
    fetchFeatures: vi.fn(),
  },
  SyncServiceError: class SyncServiceError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'SyncServiceError';
    }
  },
}));

function createMockSyncResponse(plan: string = 'FREE'): SyncResponse {
  return {
    customer: {
      id: 'cust-1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      display_name: 'Test User',
      account_status: 'ACTIVE',
    },
    subscription: {
      plan,
      status: 'ACTIVE',
      started_at: '2025-01-01T00:00:00Z',
      expires_at: plan === 'PROFESSIONAL' ? '2026-01-01T00:00:00Z' : null,
    },
    license: plan === 'PROFESSIONAL' ? {
      uuid: 'lic-1',
      license_key: 'XXXX-XXXX-XXXX-XXXX',
      edition: 'PROFESSIONAL',
      status: 'ACTIVE',
      activation_type: 'ONLINE',
      issuance_type: 'AUTOMATIC_PURCHASE',
      issued_at: '2025-01-01T00:00:00Z',
      expires_at: '2026-01-01T00:00:00Z',
      last_refreshed_at: null,
      signature: 'sig',
      product_code: 'optimizer',
      product_name: 'AVS PC Optimizer',
    } : null,
    features: plan === 'PROFESSIONAL' ? ['JUNK_CLEANER', 'REGISTRY_CLEANER', 'STARTUP_MANAGER'] : ['JUNK_CLEANER'],
    devices: [],
    server_time: '2025-07-27T12:00:00Z',
    server_version: '1.2.0',
  };
}

describe('syncStore', () => {
  beforeEach(() => {
    // Reset store state
    useSyncStore.getState().clear();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopPeriodicSync();
    vi.restoreAllMocks();
  });

  describe('sync()', () => {
    it('should sync successfully and update state', async () => {
      const mockData = createMockSyncResponse('PROFESSIONAL');
      vi.mocked(syncService.sync).mockResolvedValueOnce(mockData);

      const result = await useSyncStore.getState().sync();

      expect(result).toBe(true);
      const state = useSyncStore.getState();
      expect(state.data).toEqual(mockData);
      expect(state.phase).toBe('success');
      expect(state.isOffline).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastSyncAt).not.toBeNull();
    });

    it('should fall back to cache when offline', async () => {
      // First, populate cache with a successful sync
      const mockData = createMockSyncResponse('FREE');
      vi.mocked(syncService.sync).mockResolvedValueOnce(mockData);
      await useSyncStore.getState().sync();

      // Now simulate offline
      vi.mocked(syncService.sync).mockRejectedValueOnce(
        new SyncServiceError('Network error', 'OFFLINE'),
      );

      const result = await useSyncStore.getState().sync();

      expect(result).toBe(true);
      const state = useSyncStore.getState();
      expect(state.phase).toBe('offline');
      expect(state.isOffline).toBe(true);
      expect(state.fromCache).toBe(true);
      expect(state.data?.subscription.plan).toBe('FREE');
    });

    it('should set error state when sync fails and no cache', async () => {
      vi.mocked(syncService.sync).mockRejectedValueOnce(
        new SyncServiceError('Server error', 'SERVER_ERROR'),
      );

      const result = await useSyncStore.getState().sync();

      expect(result).toBe(false);
      const state = useSyncStore.getState();
      expect(state.phase).toBe('error');
      expect(state.error).not.toBeNull();
      expect(state.errorCode).toBe('SERVER_ERROR');
      expect(state.data).toBeNull();
    });
  });

  describe('restoreFromCache()', () => {
    it('should restore from cache when available', () => {
      // Populate cache
      const mockData = createMockSyncResponse('PROFESSIONAL');
      localStorage.setItem('avs_sync_cache', JSON.stringify({
        data: mockData,
        cachedAt: new Date().toISOString(),
      }));

      const result = useSyncStore.getState().restoreFromCache();

      expect(result).toBe(true);
      const state = useSyncStore.getState();
      expect(state.data?.subscription.plan).toBe('PROFESSIONAL');
      expect(state.isOffline).toBe(true);
      expect(state.fromCache).toBe(true);
    });

    it('should return false when no cache available', () => {
      const result = useSyncStore.getState().restoreFromCache();
      expect(result).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should clear all state and cache', async () => {
      const mockData = createMockSyncResponse('FREE');
      vi.mocked(syncService.sync).mockResolvedValueOnce(mockData);
      await useSyncStore.getState().sync();

      useSyncStore.getState().clear();

      const state = useSyncStore.getState();
      expect(state.data).toBeNull();
      expect(state.phase).toBe('idle');
      expect(state.lastSyncAt).toBeNull();
      expect(localStorage.getItem('avs_sync_cache')).toBeNull();
    });
  });

  describe('planToEdition()', () => {
    it('should convert FREE to FREE', () => {
      expect(planToEdition('FREE')).toBe('FREE');
    });

    it('should convert PROFESSIONAL to PROFESSIONAL', () => {
      expect(planToEdition('PROFESSIONAL')).toBe('PROFESSIONAL');
    });

    it('should convert PRO to PROFESSIONAL', () => {
      expect(planToEdition('PRO')).toBe('PROFESSIONAL');
    });

    it('should convert ULTIMATE to PROFESSIONAL', () => {
      expect(planToEdition('ULTIMATE')).toBe('PROFESSIONAL');
    });

    it('should default unknown plans to FREE', () => {
      expect(planToEdition('UNKNOWN')).toBe('FREE');
    });
  });

  describe('startPeriodicSync() / stopPeriodicSync()', () => {
    it('should not crash when starting and stopping', () => {
      startPeriodicSync();
      stopPeriodicSync();
      // No assertion needed — just verify no exceptions
    });
  });
});
