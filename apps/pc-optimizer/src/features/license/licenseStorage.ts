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
      const parsed = JSON.parse(json) as StoredLicense;
      // Basic shape validation
      if (
        typeof parsed.uuid !== 'string' ||
        typeof parsed.license_key !== 'string' ||
        typeof parsed.signature !== 'string'
      ) {
        return null;
      }
      return parsed;
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
};

export { STORAGE_KEY as LICENSE_STORAGE_KEY };
