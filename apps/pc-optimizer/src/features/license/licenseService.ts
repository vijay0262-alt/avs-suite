/**
 * LicenseService — business logic for desktop license activation.
 *
 * Responsibilities:
 *   - Request license from the License Server
 *   - Validate signature
 *   - Load cached license
 *   - Save cached license
 *   - Refresh license
 *   - Clear license
 *   - Expose license state
 *
 * Architecture:
 *   Route handlers → LicenseService → LicenseValidator
 *                                    → LicenseStorage
 *                                    → apiClient (network)
 *
 * The service is the single entry point for all license operations.
 * UI components interact only with the license store, which wraps this service.
 */
import { apiClient, ApiError, NetworkError, AuthError } from '../auth/apiClient';
import { licenseStorage, type StoredLicense } from './licenseStorage';
import { validateLicense, type ValidationResult } from './licenseValidator';

/** Shape returned by the license issuance endpoint. */
export interface LicenseIssueResponse {
  license: {
    uuid: string;
    license_key: string;
    edition: string;
    status: string;
    issued_at: string;
    expires_at: string | null;
    signature: string;
  };
  issued: boolean; // true if newly created, false if returning existing
}

export type LicenseErrorCode =
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'NO_ENTITLEMENT'
  | 'PRODUCT_NOT_FOUND'
  | 'SERVER_ERROR'
  | 'VALIDATION_FAILED'
  | 'CORRUPTED_CACHE'
  | 'UNKNOWN';

export class LicenseServiceError extends Error {
  constructor(
    message: string,
    public readonly code: LicenseErrorCode,
  ) {
    super(message);
    this.name = 'LicenseServiceError';
  }
}

function classifyError(err: unknown): LicenseServiceError {
  if (err instanceof NetworkError) {
    return new LicenseServiceError(
      'Unable to connect to the AVS Shield server. License activation will retry later.',
      'OFFLINE',
    );
  }

  if (err instanceof AuthError) {
    return new LicenseServiceError(
      'Your session has expired. Please log in again.',
      'TOKEN_EXPIRED',
    );
  }

  if (err instanceof ApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new LicenseServiceError(
        'Authentication required to activate license.',
        'UNAUTHORIZED',
      );
    }
    if (err.statusCode === 404) {
      return new LicenseServiceError(
        'Product not found on the server. Please contact support.',
        'PRODUCT_NOT_FOUND',
      );
    }
    if (err.statusCode === 400) {
      const detail = (err.detail ?? '').toLowerCase();
      if (detail.includes('entitlement')) {
        return new LicenseServiceError(
          'No active entitlement found. Please sync your entitlement first.',
          'NO_ENTITLEMENT',
        );
      }
      return new LicenseServiceError(err.detail ?? 'Bad request.', 'UNKNOWN');
    }
    if (err.statusCode >= 500) {
      return new LicenseServiceError(
        'The AVS Shield server is experiencing issues. Please try again later.',
        'SERVER_ERROR',
      );
    }
    return new LicenseServiceError(err.detail ?? err.message, 'UNKNOWN');
  }

  return new LicenseServiceError(
    err instanceof Error ? err.message : 'An unexpected error occurred.',
    'UNKNOWN',
  );
}

/** Default grace period in days. */
const DEFAULT_GRACE_PERIOD_DAYS = 30;

/** Current cache format version. */
const CACHE_VERSION = 2;

/** Current product version — in production this would come from the app version. */
const PRODUCT_VERSION = '1.0.0';

/** Convert API response to StoredLicense with M4.4 cache fields. */
function toStoredLicense(resp: LicenseIssueResponse): StoredLicense {
  const now = new Date();
  const graceExpiry = new Date(now.getTime() + DEFAULT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return {
    uuid: resp.license.uuid,
    license_key: resp.license.license_key,
    edition: resp.license.edition,
    status: resp.license.status,
    issued_at: resp.license.issued_at,
    expires_at: resp.license.expires_at,
    signature: resp.license.signature,
    last_refreshed: now.toISOString(),
    last_successful_validation: now.toISOString(),
    grace_period_expiration: graceExpiry.toISOString(),
    product_version: PRODUCT_VERSION,
    cache_version: CACHE_VERSION,
  };
}

export const licenseService = {
  /**
   * Request a license from the server for the given product.
   *
   * If an ACTIVE license already exists on the server, it is returned.
   * Otherwise, a new signed license is issued.
   *
   * @param productCode - e.g. "optimizer"
   * @returns The stored license and whether it was newly issued.
   * @throws LicenseServiceError on failure.
   */
  async requestLicense(productCode: string = 'optimizer'): Promise<{
    license: StoredLicense;
    issued: boolean;
  }> {
    try {
      const resp = await apiClient.post<LicenseIssueResponse>(
        `/api/customer/products/${encodeURIComponent(productCode)}/license`,
      );
      const stored = toStoredLicense(resp);
      licenseStorage.save(stored);
      return { license: stored, issued: resp.issued };
    } catch (err) {
      throw classifyError(err);
    }
  },

  /**
   * Load the cached license from local storage.
   * Returns null if no cached license exists or cache is corrupted.
   */
  loadCachedLicense(): StoredLicense | null {
    return licenseStorage.load();
  },

  /**
   * Validate a cached license (signature, expiration, status).
   * Returns the validation result.
   */
  async validateCachedLicense(license: StoredLicense | null): Promise<ValidationResult> {
    return validateLicense(license);
  },

  /**
   * Save a license to local storage.
   */
  saveLicense(license: StoredLicense): void {
    licenseStorage.save(license);
  },

  /**
   * Refresh the license from the server.
   *
   * This requests a new license from the server. If the server is
   * unreachable and a valid cached license exists, the cached license
   * is returned instead.
   *
   * @param productCode - e.g. "optimizer"
   * @returns The refreshed license and whether it was newly issued.
   * @throws LicenseServiceError on failure.
   */
  async refreshLicense(productCode: string = 'optimizer'): Promise<{
    license: StoredLicense;
    issued: boolean;
  }> {
    try {
      return await this.requestLicense(productCode);
    } catch (err) {
      // If offline and we have a valid cached license, return it
      if (err instanceof LicenseServiceError && err.code === 'OFFLINE') {
        const cached = licenseStorage.load();
        if (cached) {
          const validation = await validateLicense(cached);
          if (validation.valid) {
            return { license: cached, issued: false };
          }
        }
      }
      throw err;
    }
  },

  /**
   * Clear the cached license from local storage.
   */
  clearLicense(): void {
    licenseStorage.clear();
  },

  /**
   * Check if a cached license exists in local storage.
   */
  hasCachedLicense(): boolean {
    return licenseStorage.exists();
  },

  /**
   * Full activation flow:
   *   1. Load cached license
   *   2. Validate cached license (signature, expiration, status)
   *   3. If valid → return cached, refresh in background
   *   4. If invalid or missing → request new license from server
   *   5. Validate new license
   *   6. Save and return
   *
   * @param productCode - e.g. "optimizer"
   * @returns The active license and activation details.
   * @throws LicenseServiceError on failure.
   */
  async activate(productCode: string = 'optimizer'): Promise<{
    license: StoredLicense;
    issued: boolean;
    fromCache: boolean;
    validation: ValidationResult;
  }> {
    // 1. Try cached license first
    const cached = licenseStorage.load();
    if (cached) {
      const validation = await validateLicense(cached);
      if (validation.valid) {
        // Return cached license, refresh in background
        return {
          license: cached,
          issued: false,
          fromCache: true,
          validation,
        };
      }
      // Cached license is invalid — clear it and request fresh
      licenseStorage.clear();
    }

    // 2. Request new license from server
    const { license, issued } = await this.requestLicense(productCode);
    const validation = await validateLicense(license);

    if (!validation.valid) {
      // Server returned an invalid license — this shouldn't happen
      throw new LicenseServiceError(
        `Server returned an invalid license: ${validation.message}`,
        'VALIDATION_FAILED',
      );
    }

    return {
      license,
      issued,
      fromCache: false,
      validation,
    };
  },
};
