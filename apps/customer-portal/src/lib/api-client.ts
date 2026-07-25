/**
 * API Client — Axios-based HTTP client for the AVS License Server.
 *
 * Features:
 * - Automatic Bearer token injection
 * - Token refresh on 401 (single retry)
 * - Typed error handling
 * - Configurable base URL via NEXT_PUBLIC_API_BASE_URL
 */
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

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

type TokenGetter = () => string | null;
type TokenSetter = (token: string | null) => void;
type RefreshFn = () => Promise<string | null>;
type ExpiredHandler = () => void;

let getToken: TokenGetter = () => null;
let setToken: TokenSetter = () => {};
let refreshTokenFn: RefreshFn = async () => null;
let onExpired: ExpiredHandler = () => {};

export function configureApiClient(opts: {
  getToken: TokenGetter;
  setToken: TokenSetter;
  refresh: RefreshFn;
  onExpired: ExpiredHandler;
}) {
  getToken = opts.getToken;
  setToken = opts.setToken;
  refreshTokenFn = opts.refresh;
  onExpired = opts.onExpired;
}

function classifyAxiosError(err: AxiosError): never {
  if (err.code === 'ECONNABORTED' || !err.response) {
    throw new NetworkError(
      err.message || 'Unable to connect to the AVS Shield server.',
    );
  }

  const { status, data } = err.response;
  const detail =
    (data as { detail?: string; message?: string })?.detail ??
    (data as { message?: string })?.message;

  if (status === 401) {
    throw new AuthError(detail ?? 'Session expired. Please log in again.');
  }

  throw new ApiError(
    `Request failed: ${status} ${err.response.statusText}`,
    status,
    detail,
  );
}

const instance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — inject Bearer token
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 with refresh + retry
instance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retried?: boolean };

    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;
      const newToken = await refreshTokenFn();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        try {
          return await instance(originalRequest);
        } catch (retryErr) {
          setToken(null);
          onExpired();
          classifyAxiosError(retryErr as AxiosError);
        }
      } else {
        setToken(null);
        onExpired();
        throw new AuthError('Session expired. Please log in again.');
      }
    }

    classifyAxiosError(error);
  },
);

export const apiClient = {
  async get<T>(path: string, opts?: { noAuth?: boolean; params?: Record<string, unknown> }): Promise<T> {
    const config: Record<string, unknown> = {};
    if (opts?.params) config.params = opts.params;
    if (opts?.noAuth) {
      config.headers = { Authorization: '' };
    }
    const res = await instance.get<T>(path, config);
    return res.data;
  },

  async post<T>(path: string, body?: unknown, opts?: { noAuth?: boolean }): Promise<T> {
    const config: Record<string, unknown> = {};
    if (opts?.noAuth) {
      config.headers = { Authorization: '' };
    }
    const res = await instance.post<T>(path, body, config);
    return res.data;
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await instance.put<T>(path, body);
    return res.data;
  },

  async delete<T>(path: string): Promise<T> {
    const res = await instance.delete<T>(path);
    return res.data;
  },
};
