/**
 * Token storage — persists auth session in localStorage.
 * Stores access token, refresh token, and customer metadata.
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  customerId: string;
  customerName: string;
  customerEmail: string;
  accountStatus: string;
  expiresAt: number; // epoch ms
}

const STORAGE_KEY = 'avs-portal-session';

export const tokenStorage = {
  save(session: StoredSession): void {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
    } catch {
      // Storage unavailable
    }
  },

  load(): StoredSession | null {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch {
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

  isExpired(session: StoredSession): boolean {
    return Date.now() >= session.expiresAt;
  },

  willExpireSoon(session: StoredSession, thresholdMs = 5 * 60 * 1000): boolean {
    return Date.now() >= session.expiresAt - thresholdMs;
  },
};
