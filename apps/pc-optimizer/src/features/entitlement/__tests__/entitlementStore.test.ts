/**
 * Tests for entitlementStore — state transitions, sync, clear, error.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useEntitlementStore } from '../entitlementStore';
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

const PROVISION_CREATED = {
  entitlement: {
    uuid: 'ent-uuid-123',
    product_code: 'optimizer',
    product_name: 'AVS Shield Optimizer',
    edition: 'FREE',
    status: 'ACTIVE',
    activation_type: 'LIFETIME',
    valid_from: '2026-07-25T12:00:00+00:00',
    valid_until: null,
    auto_renew: false,
  },
  created: true,
};

const PROVISION_EXISTING = {
  entitlement: {
    uuid: 'ent-uuid-456',
    product_code: 'optimizer',
    product_name: 'AVS Shield Optimizer',
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

describe('entitlementStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch.mockReset();
    seedValidSession();
    useEntitlementStore.setState({
      entitlement: null,
      created: false,
      syncPhase: 'idle',
      syncError: null,
      syncErrorCode: null,
      lastSyncAt: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('syncEntitlement', () => {
    it('stores entitlement on successful first provisioning', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_CREATED));

      const result = await useEntitlementStore.getState().syncEntitlement('optimizer');

      expect(result).toBe(true);
      const state = useEntitlementStore.getState();
      expect(state.syncPhase).toBe('success');
      expect(state.entitlement).not.toBeNull();
      expect(state.entitlement?.uuid).toBe('ent-uuid-123');
      expect(state.entitlement?.edition).toBe('FREE');
      expect(state.created).toBe(true);
      expect(state.lastSyncAt).not.toBeNull();
      expect(state.syncError).toBeNull();
    });

    it('stores existing entitlement on repeated provisioning', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_EXISTING));

      const result = await useEntitlementStore.getState().syncEntitlement('optimizer');

      expect(result).toBe(true);
      const state = useEntitlementStore.getState();
      expect(state.created).toBe(false);
      expect(state.entitlement?.edition).toBe('PROFESSIONAL');
    });

    it('sets error state on provisioning failure', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: "Product 'optimizer' not found" }, 404),
      );

      const result = await useEntitlementStore.getState().syncEntitlement('optimizer');

      expect(result).toBe(false);
      const state = useEntitlementStore.getState();
      expect(state.syncPhase).toBe('error');
      expect(state.syncError).not.toBeNull();
      expect(state.syncErrorCode).toBe('PRODUCT_NOT_FOUND');
      expect(state.entitlement).toBeNull();
    });

    it('sets error state on offline', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await useEntitlementStore.getState().syncEntitlement('optimizer');

      expect(result).toBe(false);
      const state = useEntitlementStore.getState();
      expect(state.syncPhase).toBe('error');
      expect(state.syncErrorCode).toBe('OFFLINE');
    });

    it('sets error state on server error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error' }, 500),
      );

      const result = await useEntitlementStore.getState().syncEntitlement('optimizer');

      expect(result).toBe(false);
      const state = useEntitlementStore.getState();
      expect(state.syncErrorCode).toBe('SERVER_ERROR');
    });

    it('transitions through syncing phase', async () => {
      let resolveFn: (v: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        resolveFn = resolve;
      });
      mockFetch.mockReturnValueOnce(pending);

      const syncPromise = useEntitlementStore.getState().syncEntitlement('optimizer');

      // Check syncing state
      expect(useEntitlementStore.getState().syncPhase).toBe('syncing');

      resolveFn!(mockResponse(PROVISION_CREATED));
      await syncPromise;

      expect(useEntitlementStore.getState().syncPhase).toBe('success');
    });

    it('updates lastSyncAt on success', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_CREATED));

      await useEntitlementStore.getState().syncEntitlement('optimizer');

      const state = useEntitlementStore.getState();
      const syncTime = new Date(state.lastSyncAt!);
      expect(syncTime.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('clearEntitlement', () => {
    it('clears all entitlement state', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_CREATED));
      await useEntitlementStore.getState().syncEntitlement('optimizer');
      expect(useEntitlementStore.getState().entitlement).not.toBeNull();

      useEntitlementStore.getState().clearEntitlement();

      const state = useEntitlementStore.getState();
      expect(state.entitlement).toBeNull();
      expect(state.created).toBe(false);
      expect(state.syncPhase).toBe('idle');
      expect(state.lastSyncAt).toBeNull();
      expect(state.syncError).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears error state without clearing entitlement', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Server error' }, 500),
      );
      await useEntitlementStore.getState().syncEntitlement('optimizer');
      expect(useEntitlementStore.getState().syncError).not.toBeNull();

      useEntitlementStore.getState().clearError();

      expect(useEntitlementStore.getState().syncError).toBeNull();
      expect(useEntitlementStore.getState().syncErrorCode).toBeNull();
    });
  });

  describe('re-sync after error', () => {
    it('can successfully sync after a previous error', async () => {
      // First attempt fails
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error' }, 500),
      );
      await useEntitlementStore.getState().syncEntitlement('optimizer');
      expect(useEntitlementStore.getState().syncPhase).toBe('error');

      // Second attempt succeeds
      mockFetch.mockResolvedValueOnce(mockResponse(PROVISION_CREATED));
      const result = await useEntitlementStore.getState().syncEntitlement('optimizer');

      expect(result).toBe(true);
      expect(useEntitlementStore.getState().syncPhase).toBe('success');
      expect(useEntitlementStore.getState().entitlement?.uuid).toBe('ent-uuid-123');
    });
  });
});
