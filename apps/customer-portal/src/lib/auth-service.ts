/**
 * Auth service — login, register, refresh, validate against the
 * AVS License Server customer API.
 *
 * Endpoints:
 *   POST /api/customer/auth/login     — login
 *   POST /api/customer/auth/register  — create account
 *   POST /api/customer/auth/refresh   — refresh token
 *   POST /api/customer/auth/forgot    — forgot password
 *   GET  /api/customer/profile        — get profile
 *   PUT  /api/customer/profile        — update profile
 *   POST /api/customer/auth/logout    — logout
 */
import { apiClient, AuthError, ApiError, NetworkError, configureApiClient } from './api-client';
import { tokenStorage, type StoredSession } from './token-storage';
import type { Customer, LoginResponse, RefreshResponse } from './types';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
  | 'EMAIL_EXISTS'
  | 'TOKEN_EXPIRED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class AuthResultError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
  ) {
    super(message);
    this.name = 'AuthResultError';
  }
}

function classifyError(err: unknown): AuthResultError {
  if (err instanceof NetworkError) {
    return new AuthResultError(
      'Unable to connect to AVS Shield server. Please check your internet connection.',
      'NETWORK_ERROR',
    );
  }
  if (err instanceof AuthError) {
    return new AuthResultError('Your session has expired. Please log in again.', 'TOKEN_EXPIRED');
  }
  if (err instanceof ApiError) {
    const detail = (err.detail ?? '').toLowerCase();
    if (err.statusCode === 401 || err.statusCode === 403) {
      if (detail.includes('locked')) return new AuthResultError('Your account is locked. Please contact support.', 'ACCOUNT_LOCKED');
      if (detail.includes('suspend')) return new AuthResultError('Your account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
      if (detail.includes('deleted') || detail.includes('delet')) return new AuthResultError('This account has been deleted.', 'ACCOUNT_DELETED');
      return new AuthResultError('Invalid email/phone or password.', 'INVALID_CREDENTIALS');
    }
    if (err.statusCode === 409) return new AuthResultError('An account with this email already exists.', 'EMAIL_EXISTS');
    if (err.statusCode >= 500) return new AuthResultError('The AVS Shield server is experiencing issues. Please try again later.', 'SERVER_ERROR');
    return new AuthResultError(err.detail ?? err.message, 'UNKNOWN');
  }
  return new AuthResultError(err instanceof Error ? err.message : 'An unexpected error occurred.', 'UNKNOWN');
}

function buildDisplayName(c: Customer): string {
  if (c.display_name) return c.display_name;
  return `${c.first_name} ${c.last_name}`.trim();
}

function sessionFromLogin(resp: LoginResponse): StoredSession {
  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? null,
    customerId: resp.customer.id,
    customerName: buildDisplayName(resp.customer),
    customerEmail: resp.customer.email,
    accountStatus: resp.customer.account_status,
    expiresAt: Date.now() + resp.expires_in * 1000,
  };
}

let onExpiredCallback: (() => void) | null = null;

configureApiClient({
  getToken: () => tokenStorage.load()?.accessToken ?? null,
  setToken: (token) => {
    if (token === null) {
      tokenStorage.clear();
    }
  },
  refresh: async () => {
    try {
      const session = await authService.refresh();
      return session.accessToken;
    } catch {
      return null;
    }
  },
  onExpired: () => {
    tokenStorage.clear();
    onExpiredCallback?.();
  },
});

export const authService = {
  async login(identifier: string, password: string): Promise<StoredSession> {
    try {
      const resp = await apiClient.post<LoginResponse>(
        '/api/customer/auth/login',
        { identifier, password },
        { noAuth: true },
      );
      const session = sessionFromLogin(resp);
      tokenStorage.save(session);
      return session;
    } catch (err) {
      throw classifyError(err);
    }
  },

  async register(data: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    password: string;
  }): Promise<StoredSession> {
    try {
      const resp = await apiClient.post<LoginResponse>(
        '/api/customer/auth/register',
        data,
        { noAuth: true },
      );
      const session = sessionFromLogin(resp);
      tokenStorage.save(session);
      return session;
    } catch (err) {
      throw classifyError(err);
    }
  },

  async forgotPassword(email: string): Promise<void> {
    try {
      await apiClient.post('/api/customer/auth/forgot', { email }, { noAuth: true });
    } catch (err) {
      throw classifyError(err);
    }
  },

  async refresh(): Promise<StoredSession> {
    const existing = tokenStorage.load();
    if (!existing?.refreshToken) {
      throw new AuthResultError('No refresh token available.', 'TOKEN_EXPIRED');
    }
    try {
      const resp = await apiClient.post<RefreshResponse>(
        '/api/customer/auth/refresh',
        { refresh_token: existing.refreshToken },
        { noAuth: true },
      );
      const session: StoredSession = {
        ...existing,
        accessToken: resp.access_token,
        refreshToken: resp.refresh_token ?? existing.refreshToken,
        expiresAt: Date.now() + resp.expires_in * 1000,
      };
      tokenStorage.save(session);
      return session;
    } catch (err) {
      tokenStorage.clear();
      throw classifyError(err);
    }
  },

  async getProfile(): Promise<Customer | null> {
    try {
      return await apiClient.get<Customer>('/api/customer/profile');
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  },

  async updateProfile(data: Partial<Customer>): Promise<Customer> {
    return apiClient.put<Customer>('/api/customer/profile', data);
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/customer/auth/logout');
    } catch {
      // Ignore errors — we're clearing locally regardless
    }
    tokenStorage.clear();
    onExpiredCallback?.();
  },

  isAuthenticated(): boolean {
    const session = tokenStorage.load();
    return session !== null && !tokenStorage.isExpired(session);
  },

  getSession(): StoredSession | null {
    return tokenStorage.load();
  },

  onExpired(cb: () => void): void {
    onExpiredCallback = cb;
  },
};
