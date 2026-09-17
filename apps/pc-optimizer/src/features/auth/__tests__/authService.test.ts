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

      const result = await authService.login('vijay@example.com', 'SecurePass123');

      expect(result.kind).toBe('session');
      if (result.kind !== 'session') return;
      const session = result.session;
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

    it('returns a 2FA challenge when the account has TOTP enabled', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          access_token: '',
          refresh_token: '',
          token_type: 'bearer',
          expires_in: 0,
          customer: null,
          requires_2fa: true,
          pre_2fa_token: 'pre-2fa-token-abc',
        }),
      );

      const result = await authService.login('vijay@example.com', 'SecurePass123');

      expect(result.kind).toBe('2fa');
      if (result.kind !== '2fa') return;
      expect(result.pre2faToken).toBe('pre-2fa-token-abc');
      // No session stored yet
      expect(tokenStorage.load()).toBeNull();
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

  describe('complete2fa', () => {
    it('exchanges pre-2FA token + code for a session', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE));

      const session = await authService.complete2fa('pre-2fa-token-abc', '123456');

      expect(session.accessToken).toBe('access-token-123');
      expect(session.customerId).toBe('cust-uuid-789');
      expect(tokenStorage.load()?.accessToken).toBe('access-token-123');

      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/customer/auth/login/2fa');
      expect(JSON.parse(init.body as string)).toEqual({
        pre_2fa_token: 'pre-2fa-token-abc',
        code: '123456',
      });
    });

    it('fails on a bad code', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Invalid or expired 2FA code.' }, 401),
      );

      try {
        await authService.complete2fa('pre-2fa-token-abc', '000000');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as AuthResultError).code).toBe('INVALID_CREDENTIALS');
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
