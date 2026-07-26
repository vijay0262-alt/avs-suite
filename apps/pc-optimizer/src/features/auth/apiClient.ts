/**
 * Reusable authenticated API client for the AVS License Server.
 *
 * Automatically:
 * - Includes Bearer token in Authorization header
 * - Refreshes expired access tokens (once per expiry)
 * - Handles 401 by clearing session and throwing AuthError
 * - Handles network errors with typed ApiError
 *
 * All future API requests (provisioning, dashboard, entitlements, etc.)
 * should use `apiClient` instead of raw fetch.
 */
import { tokenStorage, type StoredSession } from './tokenStorage';

// Production API URL — used when Vite builds for production (import.meta.env.PROD = true).
// In development, falls back to localhost.
const PRODUCTION_API_URL = 'https://api.avsshield.com';
const DEVELOPMENT_API_URL = 'http://localhost:8000';

/** Base URL for the AVS License Server customer API. */
function getDefaultBaseUrl(): string {
  // Vite sets import.meta.env.PROD at build time — always correct in bundled code.
  // Also check process.env.AVS_ENV for Node/Electron main process compatibility.
  const avsEnv = typeof process !== 'undefined' ? process.env?.AVS_ENV : undefined;
  if (avsEnv === 'production' || import.meta.env?.PROD) {
    return PRODUCTION_API_URL;
  }
  if (avsEnv === 'staging') {
    return 'https://api-staging.avsshield.com';
  }
  return DEVELOPMENT_API_URL;
}

export function getBaseUrl(): string {
  // Allow explicit override via env var (e.g. for testing)
  if (typeof process !== 'undefined' && process.env?.LICENSE_SERVER_URL) {
    return process.env.LICENSE_SERVER_URL;
  }
  return getDefaultBaseUrl();
}

// Log the API base URL on module load for debugging connectivity issues
const _baseUrl = getBaseUrl();
console.log(`[AVS] API base URL: ${_baseUrl}`);

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip auth header (e.g. for login endpoint). */
  noAuth?: boolean;
  /** Timeout in ms (default 15s). */
  timeoutMs?: number;
}

/** Callbacks the API client uses to interact with the auth layer. */
export interface ApiClientCallbacks {
  getSession: () => StoredSession | null;
  refreshSession: () => Promise<StoredSession | null>;
  onSessionExpired: () => void;
}

let callbacks: ApiClientCallbacks | null = null;

export function configureApiClient(cb: ApiClientCallbacks): void {
  callbacks = cb;
}

function buildHeaders(opts: RequestOptions, session: StoredSession | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  if (!opts.noAuth && session?.accessToken) {
    headers['Authorization'] = `Bearer ${session.accessToken}`;
  }
  return headers;
}

async function doFetch(
  path: string,
  opts: RequestOptions,
  session: StoredSession | null,
): Promise<Response> {
  const url = `${getBaseUrl()}${path}`;
  const headers = buildHeaders(opts, session);
  const timeoutMs = opts.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Merge external signal with our timeout signal
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[AVS] API error: ${opts.method ?? 'GET'} ${url} → ${response.status} ${response.statusText}`);
    }
    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error(`[AVS] Request timed out: ${opts.method ?? 'GET'} ${url} (timeout: ${timeoutMs}ms)`);
      throw new NetworkError('Request timed out');
    }
    console.error(`[AVS] Network error: ${opts.method ?? 'GET'} ${url} →`, err instanceof Error ? err.message : err);
    throw new NetworkError(
      err instanceof Error ? err.message : 'Unable to connect to the server',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    let session = opts.noAuth ? null : callbacks?.getSession() ?? null;

    // If token will expire soon, try to refresh proactively
    if (session && tokenStorage.willExpireSoon(session) && !opts.noAuth) {
      const refreshed = await callbacks?.refreshSession().catch(() => null);
      if (refreshed) session = refreshed;
    }

    let response = await doFetch(path, opts, session);

    // If 401 on an authenticated request, try one refresh then retry
    if (response.status === 401 && !opts.noAuth && callbacks) {
      const refreshed = await callbacks.refreshSession().catch(() => null);
      if (refreshed) {
        session = refreshed;
        response = await doFetch(path, opts, session);
      } else {
        callbacks.onSessionExpired();
        throw new AuthError('Session expired. Please log in again.');
      }
    }

    // 401 on noAuth requests (e.g. login) = invalid credentials, not session expiry
    if (response.status === 401 && opts.noAuth) {
      let detail: string | undefined;
      try {
        const body = await response.json();
        detail = body?.detail ?? body?.message;
      } catch {
        // Non-JSON error body
      }
      throw new ApiError('Authentication failed', response.status, detail);
    }

    if (!response.ok) {
      let detail: string | undefined;
      try {
        const body = await response.json();
        detail = body?.detail ?? body?.message;
      } catch {
        // Non-JSON error body
      }
      throw new ApiError(
        `Request failed: ${response.status} ${response.statusText}`,
        response.status,
        detail,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  },

  get<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'GET' });
  },

  post<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'POST', body });
  },

  put<T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'PUT', body });
  },

  delete<T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'DELETE' });
  },
};
