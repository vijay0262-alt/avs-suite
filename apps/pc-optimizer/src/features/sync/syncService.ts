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
import { apiClient, ApiError, NetworkError, AuthError, getBaseUrl } from '../auth/apiClient';

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
  edition: string;
  activated_at: string | null;
  installed_at: string | null;
  uninstalled_at: string | null;
  last_seen: string | null;
  app_version: string | null;
  windows_version: string | null;
  uninstall_token: string | null;
}

export interface SyncNotification {
  id: number;
  title: string;
  body: string;
  kind: string;
  action_url: string | null;
}

export interface SyncResponse {
  customer: SyncCustomerInfo;
  subscription: SyncSubscriptionInfo;
  license: SyncLicenseInfo | null;
  features: string[];
  devices: SyncDeviceInfo[];
  /** Optional — older servers may not send this field. */
  notifications?: SyncNotification[];
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
export async function getDeviceInfo(): Promise<{
  fingerprint: string;
  deviceName: string;
  appVersion: string;
  windowsVersion: string;
} | null> {
  try {
    const avs = (window as unknown as { avs?: { license?: { getInfo?: () => Promise<unknown> }; app?: { getVersion?: () => Promise<string>; getPlatform?: () => Promise<string>; getHostname?: () => Promise<string> } } }).avs;
    if (!avs?.license?.getInfo) return null;

    const info = await avs.license.getInfo() as {
      fingerprint?: string;
      app_version?: string;
    };

    let appVersion = '1.0.0';
    try {
      if (avs.app?.getVersion) appVersion = await avs.app.getVersion();
    } catch { /* ignore */ }

    let deviceName = 'Desktop';
    try {
      if (avs.app?.getHostname) {
        const host = await avs.app.getHostname();
        if (host) deviceName = host;
      }
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
  async sync(options: { allowReactivate?: boolean } = {}): Promise<SyncResponse> {
    try {
      const deviceInfo = await getDeviceInfo();
      let path = '/api/customer/sync';
      const params = new URLSearchParams();
      if (deviceInfo) {
        params.set('device_fingerprint', deviceInfo.fingerprint);
        params.set('device_name', deviceInfo.deviceName);
        params.set('app_version', deviceInfo.appVersion);
        if (deviceInfo.windowsVersion) {
          params.set('windows_version', deviceInfo.windowsVersion);
        }
      }
      if (options.allowReactivate) {
        params.set('allow_reactivate', 'true');
      }
      const query = params.toString();
      if (query) {
        path += `?${query}`;
      }
      const data = await apiClient.get<SyncResponse>(path);
      // Persist the per-device uninstall token so the NSIS uninstaller
      // can mark this device uninstalled without an auth session.
      if (deviceInfo) {
        const current = data.devices?.find(
          (d) => d.device_fingerprint === deviceInfo.fingerprint,
        );
        if (current?.uninstall_token && typeof window !== 'undefined' && window.avs?.device?.writeUninstallInfo) {
          void window.avs.device.writeUninstallInfo({
            device_fingerprint: current.device_fingerprint,
            uninstall_token: current.uninstall_token,
            api_url: getBaseUrl(),
          }).catch(() => {
            // Best-effort — uninstall tracking is non-fatal.
          });
        }
      }
      return data;
    } catch (err) {
      throw classifyError(err);
    }
  },

  /**
   * Acknowledge a delivered notification (shown/clicked/dismissed).
   * Best-effort — failures are swallowed so they never break sync.
   */
  async ackNotification(
    notificationId: number,
    deviceFingerprint: string,
    action: 'shown' | 'clicked' | 'dismissed' = 'shown',
  ): Promise<void> {
    try {
      await apiClient.post('/api/customer/device/notifications/ack', {
        device_fingerprint: deviceFingerprint,
        notification_id: notificationId,
        action,
      });
    } catch {
      // Best-effort analytics — never throw
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
};
