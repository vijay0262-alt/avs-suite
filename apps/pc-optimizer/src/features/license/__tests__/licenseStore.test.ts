/**
 * Tests for licenseStore — state transitions, activate, refresh, clear, offline.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useLicenseStore } from '../licenseStore';
import { licenseStorage, type StoredLicense } from '../licenseStorage';
import { tokenStorage } from '../../auth/tokenStorage';
import '../../auth/authService'; // side-effect: configures apiClient callbacks

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

const LICENSE_ISSUED = {
  license: {
    uuid: 'lic-uuid-001',
    license_key: 'AVS-ABCD-1234-EFGH-5678',
    edition: 'FREE',
    status: 'ACTIVE',
    issued_at: '2026-07-25T12:00:00+00:00',
    expires_at: null,
    signature: 'base64-signature-data-here-at-least-10-chars',
  },
  issued: true,
};

const VALID_CACHED: StoredLicense = {
  uuid: 'lic-uuid-cached',
  license_key: 'AVS-OLD1-1234-OLD2-5678',
  edition: 'FREE',
  status: 'ACTIVE',
  issued_at: '2026-07-20T10:00:00+00:00',
  expires_at: null,
  signature: 'cached-signature-data-here-at-least-10',
  last_refreshed: '2026-07-20T10:00:00+00:00',
  last_successful_validation: '2026-08-20T10:00:00+00:00',
  grace_period_expiration: '2026-09-19T10:00:00+00:00',
  product_version: '1.0.0',
  cache_version: 2,
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

describe('licenseStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch.mockReset();
    seedValidSession();
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('activate', () => {
    it('activates from server when no cache exists', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await useLicenseStore.getState().activate('optimizer');

      expect(result).toBe(true);
      const state = useLicenseStore.getState();
      expect(state.activationState).toBe('activated');
      expect(state.license).not.toBeNull();
      expect(state.license?.uuid).toBe('lic-uuid-001');
      expect(state.issued).toBe(true);
      expect(state.fromCache).toBe(false);
      expect(state.validation?.valid).toBe(true);
      expect(state.syncStatus).toBe('success');
      expect(state.error).toBeNull();
      expect(state.lastRefreshAt).not.toBeNull();
    });

    it('activates from cache when valid cache exists', async () => {
      licenseStorage.save(VALID_CACHED);

      const result = await useLicenseStore.getState().activate('optimizer');

      expect(result).toBe(true);
      const state = useLicenseStore.getState();
      expect(state.activationState).toBe('activated');
      expect(state.fromCache).toBe(true);
      expect(state.license?.uuid).toBe('lic-uuid-cached');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('falls back to cached license when offline', async () => {
      licenseStorage.save(VALID_CACHED);
      // Remove cache so activate tries server first
      // Actually, activate checks cache first, so with valid cache it won't hit network
      // This test verifies the offline path when cache is invalid + network fails
      licenseStorage.save({ ...VALID_CACHED, status: 'REVOKED' });
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await useLicenseStore.getState().activate('optimizer');

      // Should fail since cache is invalid and server is offline
      expect(result).toBe(false);
      const state = useLicenseStore.getState();
      expect(state.activationState).toBe('error');
      expect(state.errorCode).toBe('OFFLINE');
    });

    it('sets error state on no entitlement', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'No ACTIVE entitlement found' }, 400),
      );

      const result = await useLicenseStore.getState().activate('optimizer');

      expect(result).toBe(false);
      const state = useLicenseStore.getState();
      expect(state.activationState).toBe('error');
      expect(state.errorCode).toBe('NO_ENTITLEMENT');
      expect(state.error).not.toBeNull();
    });

    it('sets error state on server error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error' }, 500),
      );

      const result = await useLicenseStore.getState().activate('optimizer');

      expect(result).toBe(false);
      expect(useLicenseStore.getState().errorCode).toBe('SERVER_ERROR');
    });

    it('sets error state on product not found', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: "Product 'optimizer' not found" }, 404),
      );

      const result = await useLicenseStore.getState().activate('optimizer');

      expect(result).toBe(false);
      expect(useLicenseStore.getState().errorCode).toBe('PRODUCT_NOT_FOUND');
    });

    it('transitions through activating state', async () => {
      let resolveFn: (v: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        resolveFn = resolve;
      });
      mockFetch.mockReturnValueOnce(pending);

      const activatePromise = useLicenseStore.getState().activate('optimizer');

      expect(useLicenseStore.getState().activationState).toBe('activating');
      expect(useLicenseStore.getState().syncStatus).toBe('syncing');

      resolveFn!(mockResponse(LICENSE_ISSUED));
      await activatePromise;

      expect(useLicenseStore.getState().activationState).toBe('activated');
    });
  });

  describe('refresh', () => {
    it('refreshes license from server', async () => {
      licenseStorage.save(VALID_CACHED);
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await useLicenseStore.getState().refresh('optimizer');

      expect(result).toBe(true);
      const state = useLicenseStore.getState();
      expect(state.license?.uuid).toBe('lic-uuid-001');
      expect(state.syncStatus).toBe('success');
    });

    it('sets error on refresh failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await useLicenseStore.getState().refresh('optimizer');

      expect(result).toBe(false);
      expect(useLicenseStore.getState().syncStatus).toBe('error');
    });
  });

  describe('clear', () => {
    it('clears all license state', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));
      await useLicenseStore.getState().activate('optimizer');
      expect(useLicenseStore.getState().license).not.toBeNull();

      useLicenseStore.getState().clear();

      const state = useLicenseStore.getState();
      expect(state.license).toBeNull();
      expect(state.activationState).toBe('idle');
      expect(state.syncStatus).toBe('idle');
      expect(state.lastRefreshAt).toBeNull();
      expect(licenseStorage.exists()).toBe(false);
    });
  });

  describe('clearError', () => {
    it('clears error without clearing license', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Server error' }, 500),
      );
      await useLicenseStore.getState().activate('optimizer');
      expect(useLicenseStore.getState().error).not.toBeNull();

      useLicenseStore.getState().clearError();

      expect(useLicenseStore.getState().error).toBeNull();
      expect(useLicenseStore.getState().errorCode).toBeNull();
    });
  });

  describe('restoreFromCache', () => {
    it('restores valid cached license', async () => {
      licenseStorage.save(VALID_CACHED);

      const result = await useLicenseStore.getState().restoreFromCache();

      expect(result).toBe(true);
      const state = useLicenseStore.getState();
      expect(state.license?.uuid).toBe('lic-uuid-cached');
      expect(state.activationState).toBe('offline');
      expect(state.fromCache).toBe(true);
    });

    it('returns false when no cache exists', async () => {
      const result = await useLicenseStore.getState().restoreFromCache();

      expect(result).toBe(false);
      expect(useLicenseStore.getState().activationState).toBe('no_license');
    });

    it('clears invalid cached license', async () => {
      licenseStorage.save({ ...VALID_CACHED, status: 'REVOKED' });

      const result = await useLicenseStore.getState().restoreFromCache();

      expect(result).toBe(false);
      expect(licenseStorage.exists()).toBe(false);
    });
  });

  describe('re-activate after error', () => {
    it('can successfully activate after a previous error', async () => {
      // First attempt fails
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error' }, 500),
      );
      await useLicenseStore.getState().activate('optimizer');
      expect(useLicenseStore.getState().activationState).toBe('error');

      // Second attempt succeeds
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));
      const result = await useLicenseStore.getState().activate('optimizer');

      expect(result).toBe(true);
      expect(useLicenseStore.getState().activationState).toBe('activated');
    });
  });
});
