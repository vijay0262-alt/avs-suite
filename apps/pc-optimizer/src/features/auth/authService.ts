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
  | 'ACCOUNT_INACTIVE'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_DELETED'
  | 'TOKEN_EXPIRED'
  | 'NETWORK_ERROR'
  | 'DNS_FAILURE'
  | 'SSL_FAILURE'
  | 'TIMEOUT'
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
    switch (err.kind) {
      case 'TIMEOUT':
        return new AuthResultError(
          'The server took too long to respond. Please check your internet connection and try again.',
          'TIMEOUT',
        );
      case 'DNS_FAILURE':
        return new AuthResultError(
          'Could not resolve the AVS Shield server address. Please check your internet connection.',
          'DNS_FAILURE',
        );
      case 'SSL_FAILURE':
        return new AuthResultError(
          'Secure connection failed. The server certificate could not be verified.',
          'SSL_FAILURE',
        );
      case 'CONNECTION_REFUSED':
        return new AuthResultError(
          'The AVS Shield server refused the connection. Please try again later.',
          'NETWORK_ERROR',
        );
      case 'NETWORK_UNREACHABLE':
        return new AuthResultError(
          'Unable to reach the AVS Shield server. Please check your internet connection.',
          'NETWORK_ERROR',
        );
      default:
        return new AuthResultError(
          err.message || 'Unable to connect to the AVS Shield server.',
          'NETWORK_ERROR',
        );
    }
  }

  if (err instanceof AuthError) {
    return new AuthResultError('Your session has expired. Please log in again.', 'TOKEN_EXPIRED');
  }

  if (err instanceof ApiError) {
    const detail = err.detail ?? '';
    const lowerDetail = detail.toLowerCase();

    // 401/403 — show the actual backend message
    if (err.statusCode === 401 || err.statusCode === 403) {
      if (lowerDetail.includes('locked')) {
        return new AuthResultError(
          detail || 'Your account is locked. Please contact support.',
          'ACCOUNT_LOCKED',
        );
      }
      if (lowerDetail.includes('suspend')) {
        return new AuthResultError(
          detail || 'Your account is suspended. Please contact support.',
          'ACCOUNT_SUSPENDED',
        );
      }
      if (lowerDetail.includes('deleted') || lowerDetail.includes('delet')) {
        return new AuthResultError(
          detail || 'This account has been deleted.',
          'ACCOUNT_DELETED',
        );
      }
      if (lowerDetail.includes('inactive') || lowerDetail.includes('disabled') || lowerDetail.includes('verify')) {
        return new AuthResultError(
          detail || 'Your account is not active. Please contact support.',
          'ACCOUNT_INACTIVE',
        );
      }
      // Use the backend's actual message if available, otherwise generic
      return new AuthResultError(
        detail || 'Invalid email/phone or password.',
        'INVALID_CREDENTIALS',
      );
    }

    if (err.statusCode >= 500) {
      return new AuthResultError(
        detail || 'The AVS Shield server is experiencing issues. Please try again later.',
        'SERVER_ERROR',
      );
    }

    // Other HTTP errors — show the actual backend message
    return new AuthResultError(detail || err.message, 'UNKNOWN');
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
    const endpoint = '/api/customer/auth/login';
    try {
      const resp = await apiClient.post<LoginResponse>(
        endpoint,
        { identifier, password },
        { noAuth: true, timeoutMs: 30000 },
      );
      const session = sessionFromLogin(resp);
      tokenStorage.save(session);
      return session;
    } catch (err) {
      if (err instanceof ApiError) {
        console.error(
          `[AVS] Login failed: HTTP ${err.statusCode} for ${endpoint}`,
        );
      } else if (err instanceof NetworkError) {
        console.error(
          `[AVS] Login failed [${err.kind}]: ${err.message}`,
        );
      } else {
        console.error(
          `[AVS] Login failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
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
        { noAuth: true, timeoutMs: 30000 },
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
