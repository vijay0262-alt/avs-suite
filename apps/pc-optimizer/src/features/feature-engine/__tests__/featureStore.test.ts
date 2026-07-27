/**
 * Tests for featureStore — Zustand store wrapping FeatureEngine,
 * integration with sync store, init/destroy, isEnabled.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFeatureStore } from '../featureStore';
import { useSyncStore } from '../../sync/syncStore';
import type { SyncResponse } from '../../sync/syncService';
import { tokenStorage } from '../../auth/tokenStorage';
import { Feature } from '../features';

// Import authService side-effect to configure apiClient
import '../../auth/authService';

function createSyncData(plan: string): SyncResponse {
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
      expires_at: null,
    },
    license: null,
    features: [],
    devices: [],
    server_time: '2025-07-27T12:00:00Z',
    server_version: '1.2.0',
  } as SyncResponse;
}

function seedValidSession() {
  tokenStorage.save({
    accessToken: 'valid-token',
    refreshToken: 'refresh-token',
    customerId: 'cust-uuid',
    customerName: 'Test User',
    customerEmail: 'test@example.com',
    accountStatus: 'ACTIVE',
    expiresAt: Date.now() + 3600 * 1000,
  });
}

describe('featureStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    seedValidSession();
    // Reset sync store
    useSyncStore.getState().clear();
    useFeatureStore.getState().destroy();
  });

  afterEach(() => {
    useFeatureStore.getState().destroy();
    useSyncStore.getState().clear();
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('initializes with FREE edition when no sync data', () => {
      useFeatureStore.getState().init();

      const state = useFeatureStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.edition).toBe('FREE');
      expect(state.enabledCount).toBe(3);
    });

    it('initializes with PROFESSIONAL edition from sync store', async () => {
      useSyncStore.setState({
        data: createSyncData('PROFESSIONAL'),
        phase: 'success',
      });

      useFeatureStore.getState().init();

      const state = useFeatureStore.getState();
      expect(state.edition).toBe('PROFESSIONAL');
      expect(state.isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
    });
  });

  describe('FREE features', () => {
    beforeEach(() => {
      useSyncStore.setState({
        data: createSyncData('FREE'),
        phase: 'success',
      });
      useFeatureStore.getState().init();
    });

    it('enables JUNK_CLEANER', () => {
      expect(useFeatureStore.getState().isEnabled(Feature.JUNK_CLEANER)).toBe(true);
    });

    it('disables STARTUP_MANAGER', () => {
      expect(useFeatureStore.getState().isEnabled(Feature.STARTUP_MANAGER)).toBe(false);
    });
  });

  describe('PROFESSIONAL features', () => {
    beforeEach(() => {
      useSyncStore.setState({
        data: createSyncData('PROFESSIONAL'),
        phase: 'success',
      });
      useFeatureStore.getState().init();
    });

    it('enables STARTUP_MANAGER', () => {
      expect(useFeatureStore.getState().isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
    });

    it('enables DISK_ANALYZER', () => {
      expect(useFeatureStore.getState().isEnabled(Feature.DISK_ANALYZER)).toBe(true);
    });

    it('enables REALTIME_MONITOR', () => {
      expect(useFeatureStore.getState().isEnabled(Feature.REALTIME_MONITOR)).toBe(true);
    });
  });

  describe('ULTIMATE features (maps to PROFESSIONAL)', () => {
    beforeEach(() => {
      useSyncStore.setState({
        data: createSyncData('ULTIMATE'),
        phase: 'success',
      });
      useFeatureStore.getState().init();
    });

    it('enables all features', () => {
      const state = useFeatureStore.getState();
      expect(state.enabledCount).toBe(14); // ALL_FEATURES.length
      expect(state.disabledCount).toBe(0);
    });

    it('enables UNINSTALL_MANAGER', () => {
      expect(useFeatureStore.getState().isEnabled(Feature.UNINSTALL_MANAGER)).toBe(true);
    });
  });

  describe('sync store update triggers feature recalculation', () => {
    it('updates features when sync data changes', async () => {
      // Start with FREE
      useSyncStore.setState({
        data: createSyncData('FREE'),
        phase: 'success',
      });
      useFeatureStore.getState().init();

      expect(useFeatureStore.getState().isEnabled(Feature.STARTUP_MANAGER)).toBe(false);

      // Update to PROFESSIONAL
      useSyncStore.setState({
        data: createSyncData('PROFESSIONAL'),
        phase: 'success',
      });

      expect(useFeatureStore.getState().isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
      expect(useFeatureStore.getState().edition).toBe('PROFESSIONAL');
    });
  });

  describe('destroy', () => {
    it('resets to initial state', () => {
      useFeatureStore.getState().init();
      expect(useFeatureStore.getState().initialized).toBe(true);

      useFeatureStore.getState().destroy();

      const state = useFeatureStore.getState();
      expect(state.initialized).toBe(false);
      expect(state.edition).toBe('FREE');
      expect(state.enabledCount).toBe(0);
    });
  });

  describe('requiresEdition', () => {
    beforeEach(() => {
      useFeatureStore.getState().init();
    });

    it('returns "Free" for JUNK_CLEANER', () => {
      expect(useFeatureStore.getState().requiresEdition(Feature.JUNK_CLEANER)).toBe('Free');
    });

    it('returns "Professional" for STARTUP_MANAGER', () => {
      expect(useFeatureStore.getState().requiresEdition(Feature.STARTUP_MANAGER)).toBe('Professional');
    });
  });

  describe('getFeatureLabel', () => {
    it('returns human-readable label', () => {
      useFeatureStore.getState().init();
      expect(useFeatureStore.getState().getFeatureLabel(Feature.JUNK_CLEANER)).toBe('Junk Cleaner');
    });
  });
});
