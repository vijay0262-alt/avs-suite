/**
 * Tests for authStore — Zustand store state transitions.
 *
 * Tests: login success, login failure, logout, session restore.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAuthStore } from '../authStore';
import { tokenStorage } from '../tokenStorage';

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

describe('authStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockFetch.mockReset();
    useAuthStore.setState({
      phase: 'checking',
      customer: null,
      session: null,
      loading: false,
      error: null,
      errorCode: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login', () => {
    it('sets authenticated state on success', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE)) // login
        .mockResolvedValueOnce(mockResponse(PROFILE_RESPONSE)); // validate/profile

      const result = await useAuthStore.getState().login('vijay@example.com', 'pass');

      expect(result).toBe(true);
      const state = useAuthStore.getState();
      expect(state.phase).toBe('authenticated');
      expect(state.customer?.email).toBe('vijay@example.com');
      expect(state.session?.accessToken).toBe('access-token-123');
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error state on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Invalid email/phone or password.' }, 401),
      );

      const result = await useAuthStore.getState().login('wrong@example.com', 'wrong');

      expect(result).toBe(false);
      const state = useAuthStore.getState();
      expect(state.phase).toBe('checking'); // stays in initial phase
      expect(state.loading).toBe(false);
      expect(state.error).not.toBeNull();
      expect(state.errorCode).toBe('INVALID_CREDENTIALS');
    });

    it('sets error state on network error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await useAuthStore.getState().login('user@example.com', 'pass');

      expect(result).toBe(false);
      const state = useAuthStore.getState();
      expect(state.errorCode).toBe('NETWORK_ERROR');
      expect(state.loading).toBe(false);
    });

    it('clears error on clearError', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Invalid.' }, 401),
      );

      await useAuthStore.getState().login('wrong', 'wrong');
      expect(useAuthStore.getState().error).not.toBeNull();

      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();
      expect(useAuthStore.getState().errorCode).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears all auth state', async () => {
      // First login
      mockFetch
        .mockResolvedValueOnce(mockResponse(LOGIN_RESPONSE))
        .mockResolvedValueOnce(mockResponse(PROFILE_RESPONSE));

      await useAuthStore.getState().login('vijay@example.com', 'pass');
      expect(useAuthStore.getState().phase).toBe('authenticated');

      // Logout
      useAuthStore.getState().logout();
      const state = useAuthStore.getState();
      expect(state.phase).toBe('unauthenticated');
      expect(state.customer).toBeNull();
      expect(state.session).toBeNull();
      expect(state.error).toBeNull();
      expect(tokenStorage.exists()).toBe(false);
    });
  });

  describe('restoreSession', () => {
    it('restores valid session from storage', async () => {
      // Store a valid session
      tokenStorage.save({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        customerId: 'cust-uuid',
        customerName: 'Vijay Mehra',
        customerEmail: 'vijay@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() + 3600 * 1000,
      });

      mockFetch.mockResolvedValueOnce(mockResponse(PROFILE_RESPONSE));

      await useAuthStore.getState().restoreSession();

      const state = useAuthStore.getState();
      expect(state.phase).toBe('authenticated');
      expect(state.customer?.email).toBe('vijay@example.com');
    });

    it('sets unauthenticated when no session exists', async () => {
      window.localStorage.clear();

      await useAuthStore.getState().restoreSession();

      expect(useAuthStore.getState().phase).toBe('unauthenticated');
    });

    it('sets unauthenticated when session is expired and refresh fails', async () => {
      tokenStorage.save({
        accessToken: 'expired-token',
        refreshToken: 'expired-refresh',
        customerId: 'cust-uuid',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() - 1000, // expired
      });

      // Refresh fails
      mockFetch.mockResolvedValueOnce(
        mockResponse({ detail: 'Invalid refresh token.' }, 401),
      );

      await useAuthStore.getState().restoreSession();

      expect(useAuthStore.getState().phase).toBe('unauthenticated');
      expect(tokenStorage.exists()).toBe(false);
    });

    it('refreshes expired session successfully', async () => {
      tokenStorage.save({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh',
        customerId: 'cust-uuid',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() - 1000,
      });

      mockFetch
        .mockResolvedValueOnce(mockResponse({
          access_token: 'new-token',
          refresh_token: 'new-refresh',
          token_type: 'bearer',
          expires_in: 3600,
        })) // refresh
        .mockResolvedValueOnce(mockResponse(PROFILE_RESPONSE)); // validate

      await useAuthStore.getState().restoreSession();

      const state = useAuthStore.getState();
      expect(state.phase).toBe('authenticated');
      expect(state.session?.accessToken).toBe('new-token');
    });

    it('allows offline use when server is unreachable', async () => {
      tokenStorage.save({
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        customerId: 'cust-uuid',
        customerName: 'Offline User',
        customerEmail: 'offline@example.com',
        accountStatus: 'ACTIVE',
        expiresAt: Date.now() + 3600 * 1000,
      });

      // Server unreachable
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await useAuthStore.getState().restoreSession();

      const state = useAuthStore.getState();
      // Should still be authenticated (offline mode with cached session)
      expect(state.phase).toBe('authenticated');
      expect(state.session).not.toBeNull();
      expect(state.customer).toBeNull(); // couldn't fetch profile
    });
  });
});
