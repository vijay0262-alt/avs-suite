/**
 * Configuration Sync Service — downloads customer configuration from the backend.
 *
 * Responsibilities:
 *   • Download customer configuration (GET /api/customer/configuration)
 *   • Compare versions (local vs remote)
 *   • Compare checksums (local vs remote)
 *   • Detect changes
 *   • Return typed SyncResult
 *
 * The sync service does NOT cache or apply configuration — that is the
 * responsibility of the ConfigurationManager and ConfigurationCache.
 */
import { apiClient, ApiError, NetworkError, AuthError } from '../auth/apiClient';
import type { CustomerConfiguration, SyncResult } from './types';
import { configCache } from './configCache';

// ── Error handling ────────────────────────────────────────────

export type ConfigSyncErrorCode =
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'SERVER_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN';

export class ConfigSyncError extends Error {
  constructor(
    message: string,
    public readonly code: ConfigSyncErrorCode,
  ) {
    super(message);
    this.name = 'ConfigSyncError';
  }
}

function classifyError(err: unknown): ConfigSyncError {
  if (err instanceof NetworkError) {
    return new ConfigSyncError(
      'Unable to connect to the AVS AI Shield server. Configuration sync will use cached data.',
      'OFFLINE',
    );
  }

  if (err instanceof AuthError) {
    return new ConfigSyncError(
      'Your session has expired. Please log in again.',
      'TOKEN_EXPIRED',
    );
  }

  if (err instanceof ApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new ConfigSyncError(
        'Authentication required to fetch configuration.',
        'UNAUTHORIZED',
      );
    }
    if (err.statusCode >= 500) {
      return new ConfigSyncError(
        'The AVS AI Shield server is experiencing issues. Configuration sync will retry later.',
        'SERVER_ERROR',
      );
    }
    return new ConfigSyncError(
      err.detail ?? err.message,
      'UNKNOWN',
    );
  }

  return new ConfigSyncError(
    err instanceof Error ? err.message : 'An unexpected error occurred.',
    'UNKNOWN',
  );
}

// ── Service ───────────────────────────────────────────────────

export const configSyncService = {
  /**
   * Fetch the full configuration from the backend.
   * Returns the raw CustomerConfiguration object.
   */
  async fetch(): Promise<CustomerConfiguration> {
    try {
      return await apiClient.get<CustomerConfiguration>(
        '/api/customer/configuration',
      );
    } catch (err) {
      throw classifyError(err);
    }
  },

  /**
   * Compare local cached version with a remote version.
   * Returns true if the version has changed.
   */
  hasVersionChanged(remoteVersion: number): boolean {
    const localVersion = configCache.getVersion();
    if (localVersion === null) return true;
    return remoteVersion !== localVersion;
  },

  /**
   * Compare local cached checksum with a remote checksum.
   * Returns true if the checksum has changed.
   */
  hasChecksumChanged(remoteChecksum: string | null): boolean {
    const localChecksum = configCache.getChecksum();
    if (remoteChecksum === null) return true;
    if (localChecksum === null) return true;
    return remoteChecksum !== localChecksum;
  },

  /**
   * Full sync cycle:
   *   1. Fetch configuration from backend
   *   2. Compare version and checksum with cache
   *   3. Return SyncResult with change details
   *
   * Does NOT cache or apply — caller handles that.
   */
  async sync(): Promise<SyncResult> {
    const config = await this.fetch();
    const previousVersion = configCache.getVersion();
    const versionChanged = this.hasVersionChanged(config.version);
    const checksumChanged = this.hasChecksumChanged(config.checksum);
    const hasChanges = versionChanged || checksumChanged;

    return {
      status: hasChanges ? 'success' : 'no_change',
      version: config.version,
      checksum: config.checksum,
      previous_version: previousVersion,
      timestamp: new Date().toISOString(),
    };
  },
};
