/**
 * Entitlement service — synchronizes the desktop with the customer's
 * AVS Shield Optimizer entitlement via the License Server provisioning API.
 *
 * Endpoint:
 *   POST /api/customer/products/{code}/provision
 *
 * The server is idempotent: repeated calls never create duplicates.
 * If an entitlement already exists, it is returned.
 * If none exists, a FREE entitlement is created automatically.
 *
 * This service is reusable for future products (Antivirus, VPN, Driver Updater).
 * Entitlement logic is deliberately kept separate from authService.
 */
import { apiClient, ApiError, NetworkError, AuthError } from '../auth/apiClient';

/** Shape returned by the provisioning endpoint. */
export interface ProvisionResponse {
  entitlement: EntitlementData;
  created: boolean;
}

/** Entitlement data from the server. */
export interface EntitlementData {
  uuid: string;
  product_code: string;
  product_name: string;
  edition: string;
  status: string;
  activation_type: string;
  valid_from: string | null;
  valid_until: string | null;
  auto_renew: boolean;
}

export type EntitlementErrorCode =
  | 'OFFLINE'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_INACTIVE'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class EntitlementSyncError extends Error {
  constructor(
    message: string,
    public readonly code: EntitlementErrorCode,
  ) {
    super(message);
    this.name = 'EntitlementSyncError';
  }
}

function classifyError(err: unknown): EntitlementSyncError {
  if (err instanceof NetworkError) {
    return new EntitlementSyncError(
      'Unable to connect to the AVS Shield server. Entitlement sync will retry later.',
      'OFFLINE',
    );
  }

  if (err instanceof AuthError) {
    return new EntitlementSyncError(
      'Your session has expired. Please log in again.',
      'TOKEN_EXPIRED',
    );
  }

  if (err instanceof ApiError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return new EntitlementSyncError(
        'Authentication required to sync entitlement.',
        'UNAUTHORIZED',
      );
    }

    if (err.statusCode === 404) {
      return new EntitlementSyncError(
        'Product not found on the server. Please contact support.',
        'PRODUCT_NOT_FOUND',
      );
    }

    if (err.statusCode >= 500) {
      return new EntitlementSyncError(
        'The AVS Shield server is experiencing issues. Entitlement sync will retry later.',
        'SERVER_ERROR',
      );
    }

    const detail = (err.detail ?? '').toLowerCase();
    if (detail.includes('not active') || detail.includes('inactive')) {
      return new EntitlementSyncError(
        'This product is currently inactive. Please contact support.',
        'PRODUCT_INACTIVE',
      );
    }

    return new EntitlementSyncError(
      err.detail ?? 'An unexpected error occurred during entitlement sync.',
      'UNKNOWN',
    );
  }

  return new EntitlementSyncError(
    err instanceof Error ? err.message : 'An unexpected error occurred.',
    'UNKNOWN',
  );
}

export const entitlementService = {
  /**
   * Provision (or fetch existing) entitlement for a product.
   *
   * @param productCode - e.g. "optimizer", "antivirus", "vpn"
   * @returns The provisioning response with entitlement data and created flag.
   * @throws EntitlementSyncError on failure.
   */
  async provision(productCode: string = 'optimizer'): Promise<ProvisionResponse> {
    try {
      const resp = await apiClient.post<ProvisionResponse>(
        `/api/customer/products/${encodeURIComponent(productCode)}/provision`,
      );
      return resp;
    } catch (err) {
      throw classifyError(err);
    }
  },

  /**
   * Synchronize entitlement — convenience wrapper that calls provision.
   * Returns the entitlement data or throws EntitlementSyncError.
   */
  async sync(productCode: string = 'optimizer'): Promise<ProvisionResponse> {
    return this.provision(productCode);
  },
};
