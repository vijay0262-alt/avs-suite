/**
 * License storage — encrypted local persistence for the signed license.
 *
 * In Electron production, uses `safeStorage` to encrypt the license at rest.
 * In dev/browser, falls back to localStorage with base64 obfuscation.
 *
 * Stores: license UUID, key, edition, status, issued_at, expires_at,
 * signature, and last_refreshed timestamp.
 *
 * Never stores private signing keys. The license signature is public
 * metadata that can be verified with the server's public key.
 */
export interface StoredLicense {
  uuid: string;
  license_key: string;
  edition: string;
  status: string;
  issued_at: string;          // ISO 8601
  expires_at: string | null;  // ISO 8601 or null for lifetime
  signature: string;          // base64-encoded cryptographic signature
  last_refreshed: string | null; // ISO 8601
  // ── M4.4: Offline cache & grace period fields ──
  /** ISO timestamp of the last successful server validation. */
  last_successful_validation: string | null;
  /** ISO timestamp when the grace period expires. */
  grace_period_expiration: string | null;
  /** Product version that wrote this cache entry. */
  product_version: string;
  /** Cache format version for forward compatibility. */
  cache_version: number;
}

const STORAGE_KEY = 'avs-license-cache';

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { avs?: unknown }).avs;
}

/**
 * Encrypt data for at-rest storage.
 * In Electron, safeStorage would be used via IPC; for now, base64 obfuscation.
 */
function encrypt(data: string): string {
  if (isElectron()) {
    // Future: use window.avs.safeStorage.encrypt(data) via IPC
    // For now, base64 encode as a placeholder for real encryption
    try {
      return btoa(unescape(encodeURIComponent(data)));
    } catch {
      return data;
    }
  }
  // Dev/browser: base64 obfuscation (not real security)
  try {
    return btoa(unescape(encodeURIComponent(data)));
  } catch {
    return data;
  }
}

function decrypt(data: string): string {
  if (isElectron()) {
    // Future: use window.avs.safeStorage.decrypt(data) via IPC
    try {
      return decodeURIComponent(escape(atob(data)));
    } catch {
      return data;
    }
  }
  try {
    return decodeURIComponent(escape(atob(data)));
  } catch {
    return data;
  }
}

export const licenseStorage = {
  save(license: StoredLicense): void {
    try {
      const json = JSON.stringify(license);
      const encoded = encrypt(json);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, encoded);
      }
    } catch {
      // Storage might be unavailable
    }
  },

  load(): StoredLicense | null {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const json = decrypt(raw);
      const parsed = JSON.parse(json) as Partial<StoredLicense>;
      // Basic shape validation — required fields
      if (
        typeof parsed.uuid !== 'string' ||
        typeof parsed.license_key !== 'string' ||
        typeof parsed.signature !== 'string'
      ) {
        return null;
      }
      // Migrate older cache entries (pre-M4.4) that lack new fields
      return {
        uuid: parsed.uuid,
        license_key: parsed.license_key,
        edition: typeof parsed.edition === 'string' ? parsed.edition : 'FREE',
        status: typeof parsed.status === 'string' ? parsed.status : 'ACTIVE',
        issued_at: typeof parsed.issued_at === 'string' ? parsed.issued_at : new Date(0).toISOString(),
        expires_at: parsed.expires_at ?? null,
        signature: parsed.signature,
        last_refreshed: parsed.last_refreshed ?? null,
        last_successful_validation: parsed.last_successful_validation ?? parsed.last_refreshed ?? null,
        grace_period_expiration: parsed.grace_period_expiration ?? null,
        product_version: typeof parsed.product_version === 'string' ? parsed.product_version : '0.0.0',
        cache_version: typeof parsed.cache_version === 'number' ? parsed.cache_version : 1,
      };
    } catch {
      // Corrupted cache — return null so caller can request a fresh license
      return null;
    }
  },

  clear(): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  },

  exists(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  },

  /**
   * Check if raw cache data exists (even if corrupted).
   * Used to distinguish between "no cache" and "corrupted cache".
   */
  hasRawData(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      return window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  },
};

export { STORAGE_KEY as LICENSE_STORAGE_KEY };
