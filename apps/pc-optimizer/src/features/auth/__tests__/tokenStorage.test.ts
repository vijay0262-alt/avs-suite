/**
 * Tests for tokenStorage — save, load, clear, expiry checks.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStorage, type StoredSession } from '../tokenStorage';

const MOCK_SESSION: StoredSession = {
  accessToken: 'access-token-123',
  refreshToken: 'refresh-token-456',
  customerId: 'cust-uuid-789',
  customerName: 'Vijay Mehra',
  customerEmail: 'vijay@example.com',
  accountStatus: 'ACTIVE',
  expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
};

describe('tokenStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads a session', () => {
    tokenStorage.save(MOCK_SESSION);
    const loaded = tokenStorage.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.accessToken).toBe('access-token-123');
    expect(loaded?.refreshToken).toBe('refresh-token-456');
    expect(loaded?.customerId).toBe('cust-uuid-789');
    expect(loaded?.customerName).toBe('Vijay Mehra');
    expect(loaded?.customerEmail).toBe('vijay@example.com');
    expect(loaded?.accountStatus).toBe('ACTIVE');
  });

  it('returns null when no session exists', () => {
    expect(tokenStorage.load()).toBeNull();
  });

  it('clears the session', () => {
    tokenStorage.save(MOCK_SESSION);
    expect(tokenStorage.exists()).toBe(true);
    tokenStorage.clear();
    expect(tokenStorage.exists()).toBe(false);
    expect(tokenStorage.load()).toBeNull();
  });

  it('detects expired sessions', () => {
    const expired: StoredSession = {
      ...MOCK_SESSION,
      expiresAt: Date.now() - 1000, // expired 1 second ago
    };
    expect(tokenStorage.isExpired(expired)).toBe(true);
  });

  it('detects non-expired sessions', () => {
    expect(tokenStorage.isExpired(MOCK_SESSION)).toBe(false);
  });

  it('detects sessions expiring soon', () => {
    const soonExpire: StoredSession = {
      ...MOCK_SESSION,
      expiresAt: Date.now() + 60 * 1000, // 1 minute from now
    };
    expect(tokenStorage.willExpireSoon(soonExpire)).toBe(true);
  });

  it('does not flag far-future sessions as expiring soon', () => {
    const farFuture: StoredSession = {
      ...MOCK_SESSION,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
    };
    expect(tokenStorage.willExpireSoon(farFuture)).toBe(false);
  });

  it('handles corrupted storage gracefully', () => {
    window.localStorage.setItem('avs-auth-session', 'not-valid-json');
    expect(tokenStorage.load()).toBeNull();
  });
});
