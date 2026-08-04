// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tokenStorage } from '@/lib/token-storage';
import { generateCsrfToken, validateCsrfToken } from '@/lib/csrf';
import { COOKIE_NAMES } from '@/lib/cookie-config';

describe('token-storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('saveMirror / loadMirror', () => {
    it('saves and loads a session mirror to localStorage', () => {
      const session = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        customerId: 'cust-1',
        customerName: 'John Doe',
        customerEmail: 'john@avsshield.com',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        expiresAt: Date.now() + 3600000,
        rememberMe: true,
      };

      tokenStorage.saveMirror(session);

      const mirror = tokenStorage.loadMirror();
      expect(mirror).not.toBeNull();
      expect(mirror?.customerId).toBe('cust-1');
      expect(mirror?.customerName).toBe('John Doe');
      expect(mirror?.customerEmail).toBe('john@avsshield.com');
      expect(mirror?.emailVerified).toBe(true);
      expect(mirror?.rememberMe).toBe(true);
      // Sensitive tokens should NOT be in the mirror
      expect(mirror).not.toHaveProperty('accessToken');
      expect(mirror).not.toHaveProperty('refreshToken');
    });

    it('returns null when no session exists', () => {
      const mirror = tokenStorage.loadMirror();
      expect(mirror).toBeNull();
    });

    it('clears the session mirror', () => {
      const session = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        customerId: 'cust-1',
        customerName: 'Jane',
        customerEmail: 'jane@avsshield.com',
        accountStatus: 'ACTIVE',
        emailVerified: false,
        expiresAt: Date.now() + 3600000,
        rememberMe: false,
      };

      tokenStorage.saveMirror(session);
      tokenStorage.clearMirror();
      expect(tokenStorage.loadMirror()).toBeNull();
    });
  });

  describe('isExpired', () => {
    it('returns true for expired sessions', () => {
      const mirror = {
        customerId: 'cust-1',
        customerName: 'John',
        customerEmail: 'john@avsshield.com',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        expiresAt: Date.now() - 1000,
        rememberMe: false,
      };
      expect(tokenStorage.isExpired(mirror)).toBe(true);
    });

    it('returns false for valid sessions', () => {
      const mirror = {
        customerId: 'cust-1',
        customerName: 'John',
        customerEmail: 'john@avsshield.com',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        expiresAt: Date.now() + 3600000,
        rememberMe: false,
      };
      expect(tokenStorage.isExpired(mirror)).toBe(false);
    });
  });

  describe('willExpireSoon', () => {
    it('returns true when session expires within threshold', () => {
      const mirror = {
        customerId: 'cust-1',
        customerName: 'John',
        customerEmail: 'john@avsshield.com',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        expiresAt: Date.now() + 60000,
        rememberMe: false,
      };
      expect(tokenStorage.willExpireSoon(mirror, 5 * 60 * 1000)).toBe(true);
    });

    it('returns false when session is well within validity', () => {
      const mirror = {
        customerId: 'cust-1',
        customerName: 'John',
        customerEmail: 'john@avsshield.com',
        accountStatus: 'ACTIVE',
        emailVerified: true,
        expiresAt: Date.now() + 3600000,
        rememberMe: false,
      };
      expect(tokenStorage.willExpireSoon(mirror, 5 * 60 * 1000)).toBe(false);
    });
  });
});

describe('csrf', () => {
  describe('generateCsrfToken', () => {
    it('generates a 64-character hex string', () => {
      const token = generateCsrfToken();
      expect(token).toHaveLength(64);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateCsrfToken', () => {
    it('returns true when header matches cookie', () => {
      const token = 'abc123';
      expect(validateCsrfToken(token, token)).toBe(true);
    });

    it('returns false when header does not match cookie', () => {
      expect(validateCsrfToken('abc', 'def')).toBe(false);
    });

    it('returns false when either is null', () => {
      expect(validateCsrfToken(null, 'abc')).toBe(false);
      expect(validateCsrfToken('abc', null)).toBe(false);
      expect(validateCsrfToken(null, null)).toBe(false);
    });
  });
});

describe('cookie-config', () => {
  it('exports all required cookie names', () => {
    expect(COOKIE_NAMES.ACCESS_TOKEN).toBe('avs_access');
    expect(COOKIE_NAMES.REFRESH_TOKEN).toBe('avs_refresh');
    expect(COOKIE_NAMES.REMEMBER_ME).toBe('avs_remember');
    expect(COOKIE_NAMES.SESSION_ID).toBe('avs_session');
    expect(COOKIE_NAMES.CSRF_TOKEN).toBe('avs_csrf');
  });
});
