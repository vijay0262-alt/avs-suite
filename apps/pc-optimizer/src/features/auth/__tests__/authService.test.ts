/**
 * Tests for authService — login, refresh, validate, logout.
 *
 * Mocks global fetch to simulate API responses.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { authService, type AuthResultError } from '../authService';
import { tokenStorage } from '../tokenStorage';

// Mock fetch
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

const LOGIN_RESPONSE = {
  access_token: 'access-token-123',
  refresh_token: 'refresh-token-456',
  token_type: 'bearer',
  expires_in: 3600,
  customer: {
    id: 'cust-uuid-789',
    first_name: 'Vijay',
    last_name: 'Mehra',
    display_name: 'Vijay Mehra',
    email: 'vijay@example.com',
    phone_number: '+1234567890',
    account_status: 'ACTIVE',
    email_verified: true,
    phone_verified: false,
  },
};

const REFRESH_RESPONSE = {
  access_token: 'new-access-token-999',
  refresh_token: 'new-refresh-token-888',
  token_type: 'bearer',
  expires_in: 3600,
};

const PROFILE_RESPONSE = {
  id: 'cust-uuid-789',
  first_name: 'Vijay',
  last_name: 'Mehra',
  display_name: 'Vijay Mehra',
  email: 'vijay@example.com',
  phone_number: '+1234567890',
  account_status: 'ACTIVE',
  email_verified: true,
  phone_verified: false,
};

describe('authService', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('succeeds with valid credentials', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE));

      const session = await authService.login('vijay@example.com', 'SecurePass123');

      expect(session.accessToken).toBe('access-token-123');
      expect(session.refreshToken).toBe('refresh-token-456');
      expect(session.customerId).toBe('cust-uuid-789');
      expect(session.customerName).toBe('Vijay Mehra');
      expect(session.customerEmail).toBe('vijay@example.com');
      expect(session.accountStatus).toBe('ACTIVE');
      expect(session.expiresAt).toBeGreaterThan(Date.now());

      // Session is stored
      const stored = tokenStorage.load();
      expect(stored?.accessToken).toBe('access-token-123');
    });

    it('fails with invalid credentials (401)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Invalid email/phone or password.' }, 401),
      );

      try {
        await authService.login('wrong@example.com', 'wrongpass');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('INVALID_CREDENTIALS');
        expect(authErr.message).toContain('Invalid');
      }
    });

    it('fails with locked account', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Account is locked.' }, 403),
      );

      try {
        await authService.login('locked@example.com', 'pass');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('ACCOUNT_LOCKED');
      }
    });

    it('fails with suspended account', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Account is suspended.' }, 403),
      );

      try {
        await authService.login('suspended@example.com', 'pass');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('ACCOUNT_SUSPENDED');
      }
    });

    it('fails with deleted account', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Account has been deleted.' }, 403),
      );

      try {
        await authService.login('deleted@example.com', 'pass');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('ACCOUNT_DELETED');
      }
    });

    it('handles server error (500)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Internal server error.' }, 500),
      );

      try {
        await authService.login('user@example.com', 'pass');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('SERVER_ERROR');
      }
    });

    it('handles network error (offline)', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await authService.login('user@example.com', 'pass');
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('NETWORK_ERROR');
        expect(authErr.message).toContain('Failed to fetch');
      }
    });
  });

  describe('refresh', () => {
    it('refreshes an expired token', async () => {
      const session = {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        customerId: 'cust-uuid',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() - 1000,
      };
      tokenStorage.save(session);

      mockFetch.mockResolvedValueOnce(mockResponse(REFRESH_RESPONSE));

      const refreshed = await authService.refresh();
      expect(refreshed.accessToken).toBe('new-access-token-999');
      expect(refreshed.refreshToken).toBe('new-refresh-token-888');
      expect(refreshed.expiresAt).toBeGreaterThan(Date.now());
    });

    it('fails when no refresh token stored', async () => {
      window.localStorage.clear();
      try {
        await authService.refresh();
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('TOKEN_EXPIRED');
      }
    });

    it('fails when refresh endpoint returns 401', async () => {
      const session = {
        accessToken: 'old-access',
        refreshToken: 'old-refresh',
        customerId: 'cust-uuid',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() - 1000,
      };
      tokenStorage.save(session);

      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'Invalid refresh token.' }, 401));

      try {
        await authService.refresh();
        expect.fail('Should have thrown');
      } catch (err) {
        const authErr = err as AuthResultError;
        expect(authErr.code).toBe('INVALID_CREDENTIALS');
      }

      // Session should be cleared
      expect(tokenStorage.load()).toBeNull();
    });
  });

  describe('validate', () => {
    it('returns profile for valid session', async () => {
      const session = {
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        customerId: 'cust-uuid',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() + 3600 * 1000,
      };
      tokenStorage.save(session);

      mockFetch.mockResolvedValueOnce(mockResponse(PROFILE_RESPONSE));

      const profile = await authService.validate();
      expect(profile).not.toBeNull();
      expect(profile?.email).toBe('vijay@example.com');
    });

    it('returns null when no session exists', async () => {
      expect(await authService.validate()).toBeNull();
    });

    it('returns null when token is invalid (401)', async () => {
      const session = {
        accessToken: 'invalid-token',
        refreshToken: null,
        customerId: 'cust-uuid',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() + 3600 * 1000,
      };
      tokenStorage.save(session);

      // Profile endpoint returns 401, apiClient tries refresh,
      // refresh fails (no refresh token), session is cleared.
      // validate() catches AuthError and returns null.
      mockFetch.mockResolvedValueOnce(mockResponse({ detail: 'Not authorized' }, 401));

      expect(await authService.validate()).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears stored session', () => {
      const session = {
        accessToken: 'token',
        refreshToken: 'refresh',
        customerId: 'id',
        customerName: 'Name',
        customerEmail: 'email@test.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() + 3600 * 1000,
      };
      tokenStorage.save(session);
      expect(tokenStorage.exists()).toBe(true);

      authService.logout();
      expect(tokenStorage.exists()).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('returns true for valid session', () => {
      tokenStorage.save({
        accessToken: 'token',
        refreshToken: 'refresh',
        customerId: 'id',
        customerName: 'Name',
        customerEmail: 'email@test.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() + 3600 * 1000,
      });
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('returns false for expired session', () => {
      tokenStorage.save({
        accessToken: 'token',
        refreshToken: 'refresh',
        customerId: 'id',
        customerName: 'Name',
        customerEmail: 'email@test.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() - 1000,
      });
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('returns false when no session', () => {
      window.localStorage.clear();
      expect(authService.isAuthenticated()).toBe(false);
    });
  });
});
