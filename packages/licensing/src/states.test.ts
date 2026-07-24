/**
 * License states tests — validates state classification functions.
 */
import { describe, expect, it } from 'vitest';
import {
  isActiveState,
  isGraceState,
  isFunctionalState,
  isErrorState,
  stateToEdition,
  ALL_LICENSE_STATES,
} from './states';

describe('License States', () => {
  describe('isActiveState', () => {
    it('returns true for monthly, annual, lifetime, trial', () => {
      expect(isActiveState('monthly')).toBe(true);
      expect(isActiveState('annual')).toBe(true);
      expect(isActiveState('lifetime')).toBe(true);
      expect(isActiveState('trial')).toBe(true);
    });

    it('returns false for free, expired, invalid, revoked, grace_period', () => {
      expect(isActiveState('free')).toBe(false);
      expect(isActiveState('expired')).toBe(false);
      expect(isActiveState('invalid')).toBe(false);
      expect(isActiveState('revoked')).toBe(false);
      expect(isActiveState('grace_period')).toBe(false);
    });
  });

  describe('isGraceState', () => {
    it('returns true only for grace_period', () => {
      expect(isGraceState('grace_period')).toBe(true);
      expect(isGraceState('free')).toBe(false);
      expect(isGraceState('monthly')).toBe(false);
    });
  });

  describe('isFunctionalState', () => {
    it('returns true for active states and grace_period', () => {
      expect(isFunctionalState('monthly')).toBe(true);
      expect(isFunctionalState('annual')).toBe(true);
      expect(isFunctionalState('lifetime')).toBe(true);
      expect(isFunctionalState('trial')).toBe(true);
      expect(isFunctionalState('grace_period')).toBe(true);
    });

    it('returns false for free, expired, invalid, revoked', () => {
      expect(isFunctionalState('free')).toBe(false);
      expect(isFunctionalState('expired')).toBe(false);
      expect(isFunctionalState('invalid')).toBe(false);
      expect(isFunctionalState('revoked')).toBe(false);
    });
  });

  describe('isErrorState', () => {
    it('returns true for expired, invalid, revoked', () => {
      expect(isErrorState('expired')).toBe(true);
      expect(isErrorState('invalid')).toBe(true);
      expect(isErrorState('revoked')).toBe(true);
    });

    it('returns false for active and free states', () => {
      expect(isErrorState('free')).toBe(false);
      expect(isErrorState('monthly')).toBe(false);
      expect(isErrorState('grace_period')).toBe(false);
    });
  });

  describe('stateToEdition', () => {
    it('maps free to free', () => {
      expect(stateToEdition('free')).toBe('free');
    });

    it('maps trial to trial', () => {
      expect(stateToEdition('trial')).toBe('trial');
    });

    it('maps monthly, annual, lifetime, grace_period to professional', () => {
      expect(stateToEdition('monthly')).toBe('professional');
      expect(stateToEdition('annual')).toBe('professional');
      expect(stateToEdition('lifetime')).toBe('professional');
      expect(stateToEdition('grace_period')).toBe('professional');
    });

    it('maps error states to free', () => {
      expect(stateToEdition('expired')).toBe('free');
      expect(stateToEdition('invalid')).toBe('free');
      expect(stateToEdition('revoked')).toBe('free');
    });
  });

  describe('ALL_LICENSE_STATES', () => {
    it('contains all 9 states', () => {
      expect(ALL_LICENSE_STATES).toHaveLength(9);
    });
  });
});
