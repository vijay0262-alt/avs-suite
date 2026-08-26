/**
 * Tests for syncService — thin client for the backend Desktop Sync API.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncService, SyncServiceError } from '../syncService';
import { apiClient, ApiError, NetworkError } from '../../auth/apiClient';

vi.mock('../../auth/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number, public detail?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string, public kind: string = 'UNKNOWN') {
      super(message);
      this.name = 'NetworkError';
    }
  },
  AuthError: class AuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AuthError';
    }
  },
}));

describe('syncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sync()', () => {
    it('should return SyncResponse on success', async () => {
      const mockResponse = {
        customer: {
          id: 'cust-1',
          email: 'test@example.com',
          first_name: 'Test',
          last_name: 'User',
          display_name: 'Test User',
          account_status: 'ACTIVE',
        },
        subscription: {
          plan: 'PROFESSIONAL',
          status: 'ACTIVE',
          started_at: '2025-01-01T00:00:00Z',
          expires_at: '2026-01-01T00:00:00Z',
        },
        license: {
          uuid: 'lic-1',
          license_key: 'XXXX-XXXX-XXXX-XXXX',
          edition: 'PROFESSIONAL',
          status: 'ACTIVE',
          activation_type: 'ONLINE',
          issuance_type: 'AUTOMATIC_PURCHASE',
          issued_at: '2025-01-01T00:00:00Z',
          expires_at: '2026-01-01T00:00:00Z',
          last_refreshed_at: '2025-07-27T00:00:00Z',
          signature: 'sig',
          product_code: 'optimizer',
          product_name: 'AVS AI Shield',
        },
        features: ['JUNK_CLEANER', 'REGISTRY_CLEANER', 'STARTUP_MANAGER'],
        devices: [],
        server_time: '2025-07-27T12:00:00Z',
        server_version: '1.2.0',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockResponse);

      const result = await syncService.sync();

      expect(apiClient.get).toHaveBeenCalledWith('/api/customer/sync');
      expect(result).toEqual(mockResponse);
      expect(result.subscription.plan).toBe('PROFESSIONAL');
      expect(result.license?.issuance_type).toBe('AUTOMATIC_PURCHASE');
    });

    it('should throw SyncServiceError with OFFLINE on network error', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new NetworkError('Connection refused', 'CONNECTION_REFUSED'),
      );

      try {
        await syncService.sync();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SyncServiceError);
        expect((err as SyncServiceError).code).toBe('OFFLINE');
      }
    });

    it('should throw SyncServiceError with SERVER_ERROR on 500', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new ApiError('Internal Server Error', 500, 'Server error'),
      );

      try {
        await syncService.sync();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SyncServiceError);
        expect((err as SyncServiceError).code).toBe('SERVER_ERROR');
      }
    });

    it('should throw SyncServiceError with UNAUTHORIZED on 403', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(
        new ApiError('Forbidden', 403, 'Forbidden'),
      );

      try {
        await syncService.sync();
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SyncServiceError);
        expect((err as SyncServiceError).code).toBe('UNAUTHORIZED');
      }
    });
  });

  describe('fetchSubscription()', () => {
    it('should return subscription info on success', async () => {
      const mockSub = {
        plan: 'FREE',
        status: 'ACTIVE',
        started_at: null,
        expires_at: null,
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce(mockSub);

      const result = await syncService.fetchSubscription();

      expect(apiClient.get).toHaveBeenCalledWith('/api/customer/subscription');
      expect(result.plan).toBe('FREE');
    });
  });

  describe('fetchFeatures()', () => {
    it('should return features list on success', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        plan: 'PROFESSIONAL',
        features: ['JUNK_CLEANER', 'REGISTRY_CLEANER'],
      });

      const result = await syncService.fetchFeatures();

      expect(apiClient.get).toHaveBeenCalledWith('/api/customer/features');
      expect(result).toEqual(['JUNK_CLEANER', 'REGISTRY_CLEANER']);
    });
  });
});
