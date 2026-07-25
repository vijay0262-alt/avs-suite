/**
 * Auth service — login, refresh, validate, and logout against the
 * AVS License Server customer API.
 *
 * Endpoints used:
 *   POST /api/customer/auth/login   — login with email/phone + password
 *   POST /api/customer/auth/refresh — refresh access token
 *   GET  /api/customer/profile      — validate token + get customer info
 */
import { apiClient, ApiError, NetworkError, AuthError, configureApiClient } from './apiClient';
import { tokenStorage, type StoredSession } from './tokenStorage';

export interface LoginResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number; // seconds
  customer: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string | null;
    email: string;
    phone_number: string;
    account_status: string;
    email_verified: boolean;
    phone_verified: boolean;
  };
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string | null;
  token_type: string;
  expires_in: number;
}

export interface CustomerProfile {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  email: string;
  phone_number: string;
  account_status: string;
  email_verified: boolean;
  phone_verified: boolean;
}

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
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

/** Map HTTP error details to user-friendly error codes. */
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
      if (detail.includes('locked')) {
        return new AuthResultError('Your account is locked. Please contact support.', 'ACCOUNT_LOCKED');
      }
      if (detail.includes('suspend')) {
        return new AuthResultError('Your account is suspended. Please contact support.', 'ACCOUNT_SUSPENDED');
      }
      if (detail.includes('deleted') || detail.includes('delet')) {
        return new AuthResultError('This account has been deleted.', 'ACCOUNT_DELETED');
      }
      return new AuthResultError('Invalid email/phone or password.', 'INVALID_CREDENTIALS');
    }

    if (err.statusCode >= 500) {
      return new AuthResultError(
        'The AVS Shield server is experiencing issues. Please try again later.',
        'SERVER_ERROR',
      );
    }

    return new AuthResultError(err.detail ?? err.message, 'UNKNOWN');
  }

  return new AuthResultError(
    err instanceof Error ? err.message : 'An unexpected error occurred.',
    'UNKNOWN',
  );
}

/** Build a display name from the customer response. */
function buildDisplayName(customer: LoginResponse['customer']): string {
  if (customer.display_name) return customer.display_name;
  return `${customer.first_name} ${customer.last_name}`.trim();
}

/** Convert a login response into a StoredSession. */
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

/** Convert a refresh response into an updated StoredSession. */
function sessionFromRefresh(
  resp: RefreshResponse,
  existing: StoredSession,
): StoredSession {
  return {
    ...existing,
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token ?? existing.refreshToken,
    expiresAt: Date.now() + resp.expires_in * 1000,
  };
}

// ── Callbacks for apiClient ──────────────────────────────────

let onExpiredCallback: (() => void) | null = null;

configureApiClient({
  getSession: () => tokenStorage.load(),
  refreshSession: async () => {
    try {
      return await authService.refresh();
    } catch {
      return null;
    }
  },
  onSessionExpired: () => {
    tokenStorage.clear();
    onExpiredCallback?.();
  },
});

// ── Public API ───────────────────────────────────────────────

export const authService = {
  /**
   * Login with email/phone and password.
   * On success, stores the session and returns it.
   * On failure, throws AuthResultError with a classified code.
   */
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

  /**
   * Refresh the access token using the stored refresh token.
   * Returns the updated session, or throws if refresh fails.
   */
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
      const session = sessionFromRefresh(resp, existing);
      tokenStorage.save(session);
      return session;
    } catch (err) {
      tokenStorage.clear();
      throw classifyError(err);
    }
  },

  /**
   * Validate the current session by calling the profile endpoint.
   * If the token is expired, attempts a refresh first.
   * Returns the customer profile, or null if not authenticated.
   */
  async validate(): Promise<CustomerProfile | null> {
    const session = tokenStorage.load();
    if (!session) return null;

    if (tokenStorage.isExpired(session)) {
      try {
        await this.refresh();
      } catch {
        return null;
      }
    }

    try {
      return await apiClient.get<CustomerProfile>('/api/customer/profile');
    } catch (err) {
      if (err instanceof AuthError) return null;
      throw err;
    }
  },

  /**
   * Check if there's a valid (non-expired) session in storage.
   */
  isAuthenticated(): boolean {
    const session = tokenStorage.load();
    return session !== null && !tokenStorage.isExpired(session);
  },

  /**
   * Get the current session from storage (without validation).
   */
  getSession(): StoredSession | null {
    return tokenStorage.load();
  },

  /**
   * Logout: clear all stored tokens.
   */
  logout(): void {
    tokenStorage.clear();
    onExpiredCallback?.();
  },

  /**
   * Register a callback for session expiry (e.g. to redirect to login).
   */
  onExpired(cb: () => void): void {
    onExpiredCallback = cb;
  },
};
