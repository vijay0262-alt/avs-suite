/**
 * Auth service — login, register, refresh, validate against the
 * AVS License Server customer API.
 *
 * All auth calls go through Next.js API routes (/api/auth/*) which:
 *   - Proxy to the license server
 *   - Set HTTPOnly cookies for SSO across avsshield.com subdomains
 *   - Handle CSRF protection
 *
 * Client-side auth state is mirrored in localStorage (non-sensitive
 * metadata only). Tokens are never accessible to JavaScript.
 */
import { apiClient, AuthError, ApiError, NetworkError, configureApiClient } from './api-client';
import { tokenStorage, type StoredSession, type ClientMirror } from './token-storage';
import type { Customer, LoginResponse, RefreshResponse } from './types';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
  | 'EMAIL_EXISTS'
  | 'EMAIL_NOT_VERIFIED'
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
      'Unable to connect to AVS AI Shield server. Please check your internet connection.',
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
      if (detail.includes('not verified') || detail.includes('unverified')) return new AuthResultError('Please verify your email address to continue.', 'EMAIL_NOT_VERIFIED');
      return new AuthResultError('Invalid email/phone or password.', 'INVALID_CREDENTIALS');
    }
    if (err.statusCode === 409) return new AuthResultError('An account with this email already exists.', 'EMAIL_EXISTS');
    if (err.statusCode >= 500) return new AuthResultError('The AVS AI Shield server is experiencing issues. Please try again later.', 'SERVER_ERROR');
    return new AuthResultError(err.detail ?? err.message, 'UNKNOWN');
  }
  return new AuthResultError(err instanceof Error ? err.message : 'An unexpected error occurred.', 'UNKNOWN');
}

function buildDisplayName(c: Customer): string {
  if (c.display_name) return c.display_name;
  return `${c.first_name} ${c.last_name}`.trim();
}

function sessionFromLogin(resp: LoginResponse, rememberMe: boolean): StoredSession {
  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? null,
    customerId: resp.customer.id,
    customerName: buildDisplayName(resp.customer),
    customerEmail: resp.customer.email,
    accountStatus: resp.customer.account_status,
    emailVerified: resp.customer.email_verified,
    expiresAt: Date.now() + resp.expires_in * 1000,
    rememberMe,
  };
}

let onExpiredCallback: (() => void) | null = null;

configureApiClient({
  getToken: () => {
    // Tokens are now in HTTPOnly cookies — the API client doesn't need
    // to inject them manually for same-origin requests. Cookies are
    // sent automatically by the browser.
    return null;
  },
  setToken: () => {
    // No-op — cookies are managed by the API routes
  },
  refresh: async () => {
    try {
      const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!resp.ok) return null;
      const data = await resp.json() as RefreshResponse;
      return data.access_token;
    } catch {
      return null;
    }
  },
  onExpired: () => {
    tokenStorage.clearMirror();
    onExpiredCallback?.();
  },
});

export const authService = {
  async login(identifier: string, password: string, rememberMe = false): Promise<StoredSession> {
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, remember_me: rememberMe }),
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Login failed' }));
        throw new ApiError(errData.detail ?? 'Login failed', resp.status, errData.detail);
      }
      const data = await resp.json() as LoginResponse;
      const session = sessionFromLogin(data, rememberMe);
      tokenStorage.saveMirror(session);
      return session;
    } catch (err) {
      if (err instanceof ApiError) throw classifyError(err);
      if (err instanceof NetworkError) throw classifyError(err);
      throw classifyError(err);
    }
  },

  async register(data: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    password: string;
  }): Promise<{ verificationRequired: boolean; customer: Customer }> {
    try {
      const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Registration failed' }));
        throw new ApiError(errData.detail ?? 'Registration failed', resp.status, errData.detail);
      }
      const result = await resp.json() as { customer: Customer; verification_required: boolean };
      return {
        verificationRequired: result.verification_required,
        customer: result.customer,
      };
    } catch (err) {
      if (err instanceof ApiError) throw classifyError(err);
      if (err instanceof NetworkError) throw classifyError(err);
      throw classifyError(err);
    }
  },

  async verifyEmail(token: string): Promise<StoredSession | null> {
    try {
      const resp = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Verification failed' }));
        throw new ApiError(errData.detail ?? 'Verification failed', resp.status, errData.detail);
      }
      const data = await resp.json() as LoginResponse;
      if (data.access_token) {
        const session = sessionFromLogin(data, true);
        tokenStorage.saveMirror(session);
        return session;
      }
      return null;
    } catch (err) {
      if (err instanceof ApiError) throw classifyError(err);
      if (err instanceof NetworkError) throw classifyError(err);
      throw classifyError(err);
    }
  },

  async resendVerification(email: string): Promise<void> {
    try {
      const resp = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ detail: 'Failed to resend verification email' }));
        throw new ApiError(errData.detail ?? 'Failed to resend', resp.status, errData.detail);
      }
    } catch (err) {
      if (err instanceof ApiError) throw classifyError(err);
      if (err instanceof NetworkError) throw classifyError(err);
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
    try {
      const resp = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        tokenStorage.clearMirror();
        throw new AuthResultError('Session expired. Please log in again.', 'TOKEN_EXPIRED');
      }
      const data = await resp.json() as RefreshResponse;
      const mirror = tokenStorage.loadMirror();
      if (!mirror) {
        throw new AuthResultError('No session found.', 'TOKEN_EXPIRED');
      }
      const session: StoredSession = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        customerId: mirror.customerId,
        customerName: mirror.customerName,
        customerEmail: mirror.customerEmail,
        accountStatus: mirror.accountStatus,
        emailVerified: mirror.emailVerified,
        expiresAt: Date.now() + data.expires_in * 1000,
        rememberMe: mirror.rememberMe,
      };
      tokenStorage.saveMirror(session);
      return session;
    } catch (err) {
      tokenStorage.clearMirror();
      if (err instanceof AuthResultError) throw err;
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
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // Ignore errors — we're clearing locally regardless
    }
    tokenStorage.clearMirror();
    onExpiredCallback?.();
  },

  isAuthenticated(): boolean {
    const mirror = tokenStorage.loadMirror();
    return mirror !== null && !tokenStorage.isExpired(mirror);
  },

  getSession(): ClientMirror | null {
    return tokenStorage.loadMirror();
  },

  onExpired(cb: () => void): void {
    onExpiredCallback = cb;
  },
};
