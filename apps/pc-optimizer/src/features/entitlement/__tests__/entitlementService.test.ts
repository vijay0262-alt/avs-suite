/**
 * Tests for entitlementService — provisioning, error handling.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { entitlementService, type EntitlementSyncError } from '../entitlementService';
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

const PROVISION_RESPONSE_CREATED = {
  entitlement: {
    uuid: 'ent-uuid-123',
    product_code: 'optimizer',
    product_name: 'AVS AI Shield',
    edition: 'FREE',
    status: 'ACTIVE',
    activation_type: 'LIFETIME',
    valid_from: '2026-07-25T12:00:00+00:00',
    valid_until: null,
    auto_renew: false,
  },
  created: true,
};

const PROVISION_RESPONSE_EXISTING = {
  entitlement: {
    uuid: 'ent-uuid-456',
    product_code: 'optimizer',
    product_name: 'AVS AI Shield',
    edition: 'PROFESSIONAL',
    status: 'ACTIVE',
    activation_type: 'SUBSCRIPTION',
    valid_from: '2026-01-01T00:00:00+00:00',
    valid_until: '2027-01-01T00:00:00+00:00',
    auto_renew: true,
  },
  created: false,
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

describe('entitlementService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch.mockReset();
    seedValidSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('provision', () => {
    it('returns newly created entitlement on first provisioning', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_RESPONSE_CREATED));

      const result = await entitlementService.provision('optimizer');

      expect(result.created).toBe(true);
      expect(result.entitlement.uuid).toBe('ent-uuid-123');
      expect(result.entitlement.product_code).toBe('optimizer');
      expect(result.entitlement.edition).toBe('FREE');
      expect(result.entitlement.status).toBe('ACTIVE');
      expect(result.entitlement.activation_type).toBe('LIFETIME');
      expect(result.entitlement.auto_renew).toBe(false);
      expect(result.entitlement.valid_until).toBeNull();
    });

    it('returns existing entitlement on repeated provisioning', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_RESPONSE_EXISTING));

      const result = await entitlementService.provision('optimizer');

      expect(result.created).toBe(false);
      expect(result.entitlement.uuid).toBe('ent-uuid-456');
      expect(result.entitlement.edition).toBe('PROFESSIONAL');
      expect(result.entitlement.auto_renew).toBe(true);
    });

    it('calls the correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_RESPONSE_CREATED));

      await entitlementService.provision('optimizer');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('/api/customer/products/optimizer/provision');
      const opts = call[1] as RequestInit;
      expect(opts.method).toBe('POST');
    });

    it('handles product not found (404)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: "Product 'unknown' not found" }, 404),
      );

      try {
        await entitlementService.provision('unknown');
        expect.fail('Should have thrown');
      } catch (err) {
        const syncErr = err as EntitlementSyncError;
        expect(syncErr.code).toBe('PRODUCT_NOT_FOUND');
      }
    });

    it('handles inactive product', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: "Product 'optimizer' is not active" }, 400),
      );

      try {
        await entitlementService.provision('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        const syncErr = err as EntitlementSyncError;
        expect(syncErr.code).toBe('PRODUCT_INACTIVE');
      }
    });

    it('handles unauthorized (401)', async () => {
      // 401 on authenticated request triggers refresh attempt.
      // Refresh also fails (mock returns 401 for refresh too).
      mockFetch
        .mockResolvedValueOnce(mockResponse({ detail: 'Unauthorized' }, 401)) // provision
        .mockResolvedValueOnce(mockResponse({ detail: 'Invalid refresh token' }, 401)); // refresh

      try {
        await entitlementService.provision('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        const syncErr = err as EntitlementSyncError;
        // After refresh fails, apiClient throws AuthError which is classified as TOKEN_EXPIRED
        expect(syncErr.code).toBe('TOKEN_EXPIRED');
      }
    });

    it('handles server error (500)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error' }, 500),
      );

      try {
        await entitlementService.provision('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        const syncErr = err as EntitlementSyncError;
        expect(syncErr.code).toBe('SERVER_ERROR');
      }
    });

    it('handles offline / network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await entitlementService.provision('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        const syncErr = err as EntitlementSyncError;
        expect(syncErr.code).toBe('OFFLINE');
        expect(syncErr.message).toContain('Unable to connect');
      }
    });

    it('handles timeout as offline error', async () => {
      // Simulate AbortError (timeout) — DOMException with name 'AbortError'
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await entitlementService.provision('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        const syncErr = err as EntitlementSyncError;
        expect(syncErr.code).toBe('OFFLINE');
      }
    });
  });

  describe('sync (alias)', () => {
    it('works the same as provision', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_RESPONSE_CREATED));

      const result = await entitlementService.sync('optimizer');

      expect(result.entitlement.product_code).toBe('optimizer');
    });
  });
});
