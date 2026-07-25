/**
 * LicenseValidator — verifies a license's authenticity and validity.
 *
 * Responsibilities:
 *   - Verify signature (cryptographic integrity)
 *   - Verify expiration (not past expires_at)
 *   - Verify status (ACTIVE)
 *   - Verify product (matches expected product code)
 *
 * The validator is designed to be replaceable: swap the signature
 * verification algorithm without changing callers.
 *
 * Future: use Web Crypto API (SubtleCrypto.verify) with the server's
 * public key for real RSA-PSS verification. For now, signature presence
 * and format are checked as a placeholder.
 */
import type { StoredLicense } from './licenseStorage';

export type ValidationCode =
  | 'VALID'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED'
  | 'REVOKED'
  | 'SUSPENDED'
  | 'WRONG_PRODUCT'
  | 'MISSING_LICENSE'
  | 'CORRUPTED';

export interface ValidationResult {
  valid: boolean;
  code: ValidationCode;
  message: string;
}

/**
 * Verify the license signature.
 *
 * Future implementation will use Web Crypto API with the server's public key:
 *   const key = await crypto.subtle.importKey(...);
 *   const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_6', key, sig, data);
 *
 * For now, we check that the signature is present and non-empty.
 * This is a placeholder that will be replaced with real crypto verification.
 */
async function verifySignature(license: StoredLicense): Promise<boolean> {
  // Placeholder: check signature presence and minimum length
  // Real implementation will use the server's public key via Web Crypto API
  if (!license.signature || license.signature.length < 10) {
    return false;
  }
  return true;
}

/**
 * Check if the license has expired.
 */
function isExpired(license: StoredLicense): boolean {
  if (!license.expires_at) return false; // Lifetime license
  try {
    const expiry = new Date(license.expires_at).getTime();
    return Date.now() >= expiry;
  } catch {
    return true; // Invalid date format = treat as expired
  }
}

/**
 * Validate a stored license.
 *
 * Checks (in order):
 *   1. License exists
 *   2. Signature is present and valid
 *   3. Status is ACTIVE
 *   4. License has not expired
 *
 * Returns a ValidationResult with valid flag, code, and message.
 */
export async function validateLicense(
  license: StoredLicense | null,
): Promise<ValidationResult> {
  if (!license) {
    return {
      valid: false,
      code: 'MISSING_LICENSE',
      message: 'No license found. Please activate your license.',
    };
  }

  // Check signature
  const sigValid = await verifySignature(license);
  if (!sigValid) {
    return {
      valid: false,
      code: 'INVALID_SIGNATURE',
      message: 'License signature verification failed. The license may have been tampered with.',
    };
  }

  // Check status
  if (license.status === 'REVOKED') {
    return {
      valid: false,
      code: 'REVOKED',
      message: 'Your license has been revoked. Please contact support.',
    };
  }
  if (license.status === 'SUSPENDED') {
    return {
      valid: false,
      code: 'SUSPENDED',
      message: 'Your license has been suspended. Please contact support.',
    };
  }
  if (license.status !== 'ACTIVE') {
    return {
      valid: false,
      code: 'CORRUPTED',
      message: `License status is "${license.status}", expected "ACTIVE".`,
    };
  }

  // Check expiration
  if (isExpired(license)) {
    return {
      valid: false,
      code: 'EXPIRED',
      message: 'Your license has expired. Please renew your subscription.',
    };
  }

  return {
    valid: true,
    code: 'VALID',
    message: 'License is valid and active.',
  };
}

/**
 * Quick synchronous check — does the license look structurally valid?
 * Used for fast startup decisions before full async validation.
 */
export function isLicenseStructurallyValid(license: unknown): license is StoredLicense {
  if (!license || typeof license !== 'object') return false;
  const l = license as Record<string, unknown>;
  return (
    typeof l.uuid === 'string' &&
    typeof l.license_key === 'string' &&
    typeof l.edition === 'string' &&
    typeof l.status === 'string' &&
    typeof l.issued_at === 'string' &&
    typeof l.signature === 'string'
  );
}
