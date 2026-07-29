/**
 * Quota Reset Service — handles quota resets based on reset policies.
 *
 * Supports:
 *   never, session, daily, weekly, monthly, yearly, custom
 *
 * The design allows additional reset strategies to be added later
 * without modifying the engine.
 */
import type { ResetPolicy, QuotaState } from './types';
import { shouldReset, calculateNextReset } from './types';

export class QuotaResetService {
  /**
   * Check if a quota should be reset based on its reset policy
   * and last reset time.
   */
  needsReset(state: QuotaState): boolean {
    if (!state.isEnabled) return false;
    if (state.isUnlimited) return false;
    return shouldReset(state.resetPolicy, state.lastResetAt);
  }

  /**
   * Reset a quota state to zero usage.
   * Returns the updated state.
   */
  resetState(state: QuotaState): QuotaState {
    const now = new Date();
    const nextResetAt = calculateNextReset(state.resetPolicy, now);

    return {
      ...state,
      currentUsage: 0,
      remainingUsage: state.isUnlimited ? Infinity : state.limitValue,
      isAvailable: state.isEnabled,
      lastResetAt: now.toISOString(),
      nextResetAt,
    };
  }

  /**
   * Create initial state for a quota definition.
   */
  createInitialState(
    quotaId: string,
    limitValue: number,
    limitType: QuotaState['limitType'],
    resetPolicy: ResetPolicy,
    usageUnit: QuotaState['usageUnit'],
    isUnlimited: boolean,
    isEnabled: boolean,
  ): QuotaState {
    const now = new Date();
    const nextResetAt = calculateNextReset(resetPolicy, now);

    return {
      quotaId,
      currentUsage: 0,
      remainingUsage: isUnlimited ? Infinity : limitValue,
      isAvailable: isEnabled,
      isUnlimited,
      isEnabled,
      lastResetAt: now.toISOString(),
      nextResetAt,
      limitValue,
      limitType,
      usageUnit,
      resetPolicy,
    };
  }

  /**
   * Reset all quota states that need resetting.
   * Returns the updated states map.
   */
  resetIfNeeded(states: Map<string, QuotaState>): Map<string, QuotaState> {
    const result = new Map<string, QuotaState>();

    for (const [id, state] of states) {
      if (this.needsReset(state)) {
        result.set(id, this.resetState(state));
      } else {
        result.set(id, state);
      }
    }

    return result;
  }

  /**
   * Reset all quota states regardless of policy.
   */
  resetAll(states: Map<string, QuotaState>): Map<string, QuotaState> {
    const result = new Map<string, QuotaState>();

    for (const [id, state] of states) {
      result.set(id, this.resetState(state));
    }

    return result;
  }

  /**
   * Reset a single quota state.
   */
  resetSingle(states: Map<string, QuotaState>, quotaId: string): Map<string, QuotaState> {
    const state = states.get(quotaId);
    if (!state) return states;

    const result = new Map(states);
    result.set(quotaId, this.resetState(state));
    return result;
  }
}

export const quotaResetService = new QuotaResetService();
