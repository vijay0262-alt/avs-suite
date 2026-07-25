/**
 * Tests for licenseService — request, activate, refresh, cache, offline.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { licenseService } from '../licenseService';
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

const LICENSE_EXISTING = {
  license: {
    uuid: 'lic-uuid-001',
    license_key: 'AVS-ABCD-1234-EFGH-5678',
    edition: 'FREE',
    status: 'ACTIVE',
    issued_at: '2026-07-25T12:00:00+00:00',
    expires_at: null,
    signature: 'base64-signature-data-here-at-least-10-chars',
  },
  issued: false,
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
  last_successful_validation: '2026-07-20T10:00:00+00:00',
  grace_period_expiration: '2026-08-19T10:00:00+00:00',
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

describe('licenseService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch.mockReset();
    seedValidSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestLicense', () => {
    it('requests and stores a new license', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await licenseService.requestLicense('optimizer');

      expect(result.issued).toBe(true);
      expect(result.license.uuid).toBe('lic-uuid-001');
      expect(result.license.license_key).toBe('AVS-ABCD-1234-EFGH-5678');
      expect(licenseStorage.exists()).toBe(true);
    });

    it('returns existing license without re-issuing', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_EXISTING));

      const result = await licenseService.requestLicense('optimizer');

      expect(result.issued).toBe(false);
      expect(result.license.uuid).toBe('lic-uuid-001');
    });

    it('throws OFFLINE error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(licenseService.requestLicense('optimizer')).rejects.toMatchObject({
        code: 'OFFLINE',
      });
    });

    it('throws NO_ENTITLEMENT on 400 with entitlement message', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'No ACTIVE entitlement found for product optimizer' }, 400),
      );

      await expect(licenseService.requestLicense('optimizer')).rejects.toMatchObject({
        code: 'NO_ENTITLEMENT',
      });
    });

    it('throws PRODUCT_NOT_FOUND on 404', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: "Product 'optimizer' not found" }, 404),
      );

      await expect(licenseService.requestLicense('optimizer')).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    });

    it('throws SERVER_ERROR on 500', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error' }, 500),
      );

      await expect(licenseService.requestLicense('optimizer')).rejects.toMatchObject({
        code: 'SERVER_ERROR',
      });
    });
  });

  describe('loadCachedLicense', () => {
    it('returns null when no cache exists', () => {
      expect(licenseService.loadCachedLicense()).toBeNull();
    });

    it('returns cached license', () => {
      licenseStorage.save(VALID_CACHED);
      const loaded = licenseService.loadCachedLicense();
      expect(loaded).not.toBeNull();
      expect(loaded?.uuid).toBe('lic-uuid-cached');
    });
  });

  describe('activate', () => {
    it('uses cached license when valid', async () => {
      licenseStorage.save(VALID_CACHED);

      const result = await licenseService.activate('optimizer');

      expect(result.fromCache).toBe(true);
      expect(result.license.uuid).toBe('lic-uuid-cached');
      expect(result.validation.valid).toBe(true);
      // Should not make a network request
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('requests new license when no cache exists', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await licenseService.activate('optimizer');

      expect(result.fromCache).toBe(false);
      expect(result.issued).toBe(true);
      expect(result.license.uuid).toBe('lic-uuid-001');
      expect(result.validation.valid).toBe(true);
    });

    it('requests new license when cached license is expired', async () => {
      licenseStorage.save({
        ...VALID_CACHED,
        expires_at: '2020-01-01T00:00:00+00:00',
      });
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await licenseService.activate('optimizer');

      expect(result.fromCache).toBe(false);
      expect(result.license.uuid).toBe('lic-uuid-001');
    });

    it('requests new license when cached license is revoked', async () => {
      licenseStorage.save({
        ...VALID_CACHED,
        status: 'REVOKED',
      });
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await licenseService.activate('optimizer');

      expect(result.fromCache).toBe(false);
      expect(result.license.uuid).toBe('lic-uuid-001');
    });

    it('requests new license when cached signature is invalid', async () => {
      licenseStorage.save({
        ...VALID_CACHED,
        signature: 'short',
      });
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await licenseService.activate('optimizer');

      expect(result.fromCache).toBe(false);
      expect(result.license.uuid).toBe('lic-uuid-001');
    });
  });

  describe('refreshLicense', () => {
    it('refreshes from server', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LICENSE_ISSUED));

      const result = await licenseService.refreshLicense('optimizer');

      expect(result.license.uuid).toBe('lic-uuid-001');
    });

    it('falls back to cached license when offline', async () => {
      licenseStorage.save(VALID_CACHED);
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await licenseService.refreshLicense('optimizer');

      expect(result.license.uuid).toBe('lic-uuid-cached');
      expect(result.issued).toBe(false);
    });

    it('throws when offline and no valid cache', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(licenseService.refreshLicense('optimizer')).rejects.toMatchObject({
        code: 'OFFLINE',
      });
    });
  });

  describe('clearLicense', () => {
    it('clears the cache', () => {
      licenseStorage.save(VALID_CACHED);
      expect(licenseService.hasCachedLicense()).toBe(true);

      licenseService.clearLicense();

      expect(licenseService.hasCachedLicense()).toBe(false);
    });
  });

  describe('validateCachedLicense', () => {
    it('validates a valid cached license', async () => {
      const result = await licenseService.validateCachedLicense(VALID_CACHED);
      expect(result.valid).toBe(true);
    });

    it('returns invalid for null', async () => {
      const result = await licenseService.validateCachedLicense(null);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('MISSING_LICENSE');
    });
  });

  describe('corrupted cache', () => {
    it('loadCachedLicense returns null for corrupted data', () => {
      window.localStorage.setItem('avs-license-cache', '!!!corrupted!!!');
      expect(licenseService.loadCachedLicense()).toBeNull();
    });
  });
});
