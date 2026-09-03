/**
 * Sync Service — thin client for the backend Desktop Sync API.
 *
 * Calls GET /api/customer/sync and returns a typed SyncResponse containing:
 *   - Customer profile
 *   - Subscription (plan, status, expiry)
 *   - License (key, edition, status, signature, issuance_type)
 *   - Feature flags (from backend, single source of truth)
 *   - Registered devices
 *   - Server time + version
 *
 * The desktop app must NOT infer plan, edition, features, or device limits
 * locally. Everything comes from this single API call.
 */
import { apiClient, ApiError, NetworkError, AuthError } from '../auth/apiClient';

// ── Types matching the backend SyncResponse schema ──────────────

export interface SyncCustomerInfo {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  account_status: string;
}

export interface SyncSubscriptionInfo {
  plan: string;
  status: string;
  started_at: string | null;
  expires_at: string | null;
}

export interface SyncLicenseInfo {
  uuid: string;
  license_key: string;
  edition: string;
  status: string;
  activation_type: string;
  issuance_type: string | null;
  issued_at: string;
  expires_at: string | null;
  last_refreshed_at: string | null;
  signature: string;
  product_code: string | null;
  product_name: string | null;
}

export interface SyncDeviceInfo {
  id: string;
  device_fingerprint: string;
  device_name: string | null;
  status: string;
  activated_at: string | null;
  last_seen: string | null;
  app_version: string | null;
  windows_version: string | null;
}

export interface SyncResponse {
  customer: SyncCustomerInfo;
  subscription: SyncSubscriptionInfo;
  license: SyncLicenseInfo | null;
  features: string[];
  devices: SyncDeviceInfo[];
  server_time: string;
  server_version: string | null;
}

// ── Error handling ──────────────────────────────────────────────

export type SyncErrorCode =
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class SyncServiceError extends Error {
  constructor(
    message: string,
    public readonly code: SyncErrorCode,
  ) {
    super(message);
    this.name = 'SyncServiceError';
  }
}

function classifyError(err: unknown): SyncServiceError {
  if (err instanceof NetworkError) {
    return new SyncServiceError(
      'Unable to connect to the AVS AI Shield server. Sync will retry later.',
      'OFFLINE',
    );
  }

  if (err instanceof AuthError) {
    return new SyncServiceError(
      'Your session has expired. Please log in again.',
      'TOKEN_EXPIRED',
    );
  }

  if (err instanceof ApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new SyncServiceError(
        'Authentication required to sync.',
        'UNAUTHORIZED',
      );
    }
    if (err.statusCode >= 500) {
      return new SyncServiceError(
        'The AVS AI Shield server is experiencing issues. Please try again later.',
        'SERVER_ERROR',
      );
    }
    return new SyncServiceError(err.detail ?? err.message, 'UNKNOWN');
  }

  return new SyncServiceError(
    err instanceof Error ? err.message : 'An unexpected error occurred.',
    'UNKNOWN',
  );
}

// ── Service ─────────────────────────────────────────────────────

/**
 * Get device info from the Electron backend for sync registration.
 * Returns null if not available (e.g. running in browser/test).
 */
async function getDeviceInfo(): Promise<{
  fingerprint: string;
  deviceName: string;
  appVersion: string;
  windowsVersion: string;
} | null> {
  try {
    const avs = (window as unknown as { avs?: { license?: { getInfo?: () => Promise<unknown> }; app?: { getVersion?: () => Promise<string>; getPlatform?: () => Promise<string> } } }).avs;
    if (!avs?.license?.getInfo) return null;

    const info = await avs.license.getInfo() as {
      fingerprint?: string;
      app_version?: string;
    };

    let appVersion = '1.0.0';
    try {
      if (avs.app?.getVersion) appVersion = await avs.app.getVersion();
    } catch { /* ignore */ }

    let deviceName = 'Unknown';
    try {
      deviceName = typeof navigator !== 'undefined' ? navigator.userAgent : 'Desktop';
    } catch { /* ignore */ }

    let windowsVersion = '';
    try {
      const platform = avs.app?.getPlatform ? await avs.app.getPlatform() : '';
      windowsVersion = platform || '';
    } catch { /* ignore */ }

    if (!info?.fingerprint) return null;

    return {
      fingerprint: info.fingerprint,
      deviceName,
      appVersion: info.app_version || appVersion,
      windowsVersion,
    };
  } catch {
    return null;
  }
}

export const syncService = {
  /**
   * Fetch the full sync payload from the backend.
   * This is the single API call that gives the desktop everything it needs.
   *
   * If device info is available (from the SDK), it is passed as query params
   * so the backend can auto-register the device for this customer.
   */
  async sync(): Promise<SyncResponse> {
    try {
      const deviceInfo = await getDeviceInfo();
      let path = '/api/customer/sync';
      if (deviceInfo) {
        const params = new URLSearchParams({
          device_fingerprint: deviceInfo.fingerprint,
          device_name: deviceInfo.deviceName,
          app_version: deviceInfo.appVersion,
        });
        if (deviceInfo.windowsVersion) {
          params.set('windows_version', deviceInfo.windowsVersion);
        }
        path += `?${params.toString()}`;
      }
      return await apiClient.get<SyncResponse>(path);
    } catch (err) {
      throw classifyError(err);
    }
  },

  /**
   * Fetch only the subscription (lightweight, for periodic checks).
   */
  async fetchSubscription(): Promise<SyncSubscriptionInfo> {
    try {
      return await apiClient.get<SyncSubscriptionInfo>('/api/customer/subscription');
    } catch (err) {
      throw classifyError(err);
    }
  },

  /**
   * Fetch only the features list (for feature-gate refresh).
   */
  async fetchFeatures(): Promise<string[]> {
    try {
      const resp = await apiClient.get<{ plan: string; features: string[] }>('/api/customer/features');
      return resp.features;
    } catch (err) {
      throw classifyError(err);
    }
  },
};
