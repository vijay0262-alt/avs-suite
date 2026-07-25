/**
 * Tests for GracePeriodManager — grace period calculation, expiration,
 * limited mode detection, and configuration.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  GracePeriodManager,
  DEFAULT_GRACE_PERIOD_DAYS,
  MIN_GRACE_PERIOD_DAYS,
  MAX_GRACE_PERIOD_DAYS,
} from '../gracePeriodManager';

describe('GracePeriodManager', () => {
  let manager: GracePeriodManager;

  beforeEach(() => {
    manager = new GracePeriodManager();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('defaults to 30 days', () => {
      expect(manager.getGracePeriodDays()).toBe(DEFAULT_GRACE_PERIOD_DAYS);
    });

    it('clamps to minimum 1 day', () => {
      const m = new GracePeriodManager(0);
      expect(m.getGracePeriodDays()).toBe(MIN_GRACE_PERIOD_DAYS);
    });

    it('clamps to maximum 90 days', () => {
      const m = new GracePeriodManager(365);
      expect(m.getGracePeriodDays()).toBe(MAX_GRACE_PERIOD_DAYS);
    });

    it('accepts custom grace period within range', () => {
      const m = new GracePeriodManager(15);
      expect(m.getGracePeriodDays()).toBe(15);
    });
  });

  describe('setGracePeriodDays', () => {
    it('updates the grace period', () => {
      manager.setGracePeriodDays(7);
      expect(manager.getGracePeriodDays()).toBe(7);
    });

    it('clamps to min', () => {
      manager.setGracePeriodDays(-5);
      expect(manager.getGracePeriodDays()).toBe(MIN_GRACE_PERIOD_DAYS);
    });

    it('clamps to max', () => {
      manager.setGracePeriodDays(200);
      expect(manager.getGracePeriodDays()).toBe(MAX_GRACE_PERIOD_DAYS);
    });
  });

  describe('computeGraceExpiration', () => {
    it('computes expiration 30 days from validation', () => {
      const validation = '2026-07-25T12:00:00Z';
      const expiry = manager.computeGraceExpiration(validation);
      expect(expiry).toBe('2026-08-24T12:00:00.000Z');
    });

    it('returns null for null input', () => {
      expect(manager.computeGraceExpiration(null)).toBeNull();
    });

    it('returns null for invalid date', () => {
      expect(manager.computeGraceExpiration('invalid-date')).toBeNull();
    });
  });

  describe('evaluate', () => {
    it('returns not_started when no validation timestamp', () => {
      const info = manager.evaluate(null, null);
      expect(info.status).toBe('not_started');
      expect(info.limitedMode).toBe(false);
      expect(info.daysRemaining).toBe(0);
    });

    it('returns active when within grace period', () => {
      const validation = '2026-07-20T12:00:00Z'; // 5 days ago
      const expiry = '2026-08-19T12:00:00Z'; // 25 days from now
      const info = manager.evaluate(validation, expiry);
      expect(info.status).toBe('active');
      expect(info.limitedMode).toBe(false);
      expect(info.daysRemaining).toBeGreaterThan(0);
    });

    it('returns expired when past grace period', () => {
      const validation = '2026-06-01T12:00:00Z'; // 54 days ago
      const expiry = '2026-07-01T12:00:00Z'; // 24 days ago
      const info = manager.evaluate(validation, expiry);
      expect(info.status).toBe('expired');
      expect(info.limitedMode).toBe(true);
      expect(info.daysRemaining).toBe(0);
    });

    it('computes grace expiration if not provided', () => {
      const validation = '2026-07-20T12:00:00Z'; // 5 days ago
      const info = manager.evaluate(validation, null);
      expect(info.status).toBe('active');
      expect(info.graceExpiration).not.toBeNull();
      expect(info.daysRemaining).toBeGreaterThan(0);
    });

    it('returns active with 1 day remaining at boundary', () => {
      const validation = '2026-07-25T12:00:00Z'; // now
      const expiry = '2026-07-26T12:00:00Z'; // 1 day from now
      const info = manager.evaluate(validation, expiry);
      expect(info.status).toBe('active');
      expect(info.daysRemaining).toBe(1);
    });

    it('returns expired at exact expiration time', () => {
      const validation = '2026-06-25T12:00:00Z'; // 30 days ago
      const expiry = '2026-07-25T12:00:00Z'; // now
      const info = manager.evaluate(validation, expiry);
      expect(info.status).toBe('expired');
      expect(info.limitedMode).toBe(true);
    });

    it('provides human-readable message for active grace', () => {
      const validation = '2026-07-20T12:00:00Z';
      const expiry = '2026-08-19T12:00:00Z';
      const info = manager.evaluate(validation, expiry);
      expect(info.message).toContain('Offline mode active');
      expect(info.message).toContain('days remaining');
    });

    it('provides human-readable message for expired grace', () => {
      const validation = '2026-06-01T12:00:00Z';
      const expiry = '2026-07-01T12:00:00Z';
      const info = manager.evaluate(validation, expiry);
      expect(info.message).toContain('Grace period expired');
      expect(info.message).toContain('Premium features are limited');
    });
  });

  describe('isGracePeriodValid', () => {
    it('returns true for future expiration', () => {
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(manager.isGracePeriodValid(future)).toBe(true);
    });

    it('returns false for past expiration', () => {
      const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      expect(manager.isGracePeriodValid(past)).toBe(false);
    });

    it('returns false for null', () => {
      expect(manager.isGracePeriodValid(null)).toBe(false);
    });

    it('returns false for invalid date', () => {
      expect(manager.isGracePeriodValid('invalid')).toBe(false);
    });
  });

  describe('getDaysRemaining', () => {
    it('returns days until expiration', () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(manager.getDaysRemaining(future)).toBe(5);
    });

    it('returns 0 for past expiration', () => {
      const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(manager.getDaysRemaining(past)).toBe(0);
    });

    it('returns 0 for null', () => {
      expect(manager.getDaysRemaining(null)).toBe(0);
    });
  });
});
