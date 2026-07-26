/**
 * Tests for featureStore — Zustand store wrapping FeatureEngine,
 * integration with license store, init/destroy, isEnabled.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useFeatureStore } from '../featureStore';
import { useLicenseStore } from '../../license/licenseStore';
import { tokenStorage } from '../../auth/tokenStorage';
import { Feature } from '../features';

// Import authService side-effect to configure apiClient
import '../../auth/authService';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

const LICENSE_FREE = {
  license: {
    uuid: 'lic-001',
    license_key: 'AVS-ABCD-1234-EFGH-5678',
    edition: 'FREE',
    status: 'ACTIVE',
    issued_at: '2026-07-25T12:00:00+00:00',
    expires_at: null,
    signature: 'base64-signature-data-here-at-least-10-chars',
  },
  issued: true,
};

const LICENSE_PROFESSIONAL = {
  license: {
    ...LICENSE_FREE.license,
    uuid: 'lic-002',
    edition: 'PROFESSIONAL',
  },
  issued: true,
};

const LICENSE_ULTIMATE = {
  license: {
    ...LICENSE_FREE.license,
    uuid: 'lic-003',
    edition: 'ULTIMATE',
  },
  issued: true,
};

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
    mockFetch.mockReset();
    seedValidSession();
    // Reset both stores
    useLicenseStore.setState({
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
    useFeatureStore.getState().destroy();
  });

  afterEach(() => {
    useFeatureStore.getState().destroy();
    vi.restoreAllMocks();
  });

  describe('init', () => {
    it('initializes with FREE edition when no license', () => {
      useFeatureStore.getState().init();

      const state = useFeatureStore.getState();
      expect(state.initialized).toBe(true);
      expect(state.edition).toBe('FREE');
      expect(state.enabledCount).toBe(3);
    });

    it('initializes with edition from license store', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_PROFESSIONAL));
      await useLicenseStore.getState().activate('optimizer');

      useFeatureStore.getState().init();

      const state = useFeatureStore.getState();
      expect(state.edition).toBe('PROFESSIONAL');
      expect(state.isEnabled(Feature.STARTUP_MANAGER)).toBe(true);
    });
  });

  describe('FREE features', () => {
    beforeEach(() => {
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
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_PROFESSIONAL));
      await useLicenseStore.getState().activate('optimizer');
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
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ULTIMATE));
      await useLicenseStore.getState().activate('optimizer');
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

  describe('license refresh triggers feature recalculation', () => {
    it('updates features when license changes', async () => {
      // Start with FREE
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_FREE));
      await useLicenseStore.getState().activate('optimizer');
      useFeatureStore.getState().init();

      expect(useFeatureStore.getState().isEnabled(Feature.STARTUP_MANAGER)).toBe(false);

      // Refresh with PROFESSIONAL
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_PROFESSIONAL));
      await useLicenseStore.getState().refresh('optimizer');

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
