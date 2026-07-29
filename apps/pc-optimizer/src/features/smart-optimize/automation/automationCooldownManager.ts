/**
 * Automation Cooldown Manager — manages cooldown state for rules and actions.
 *
 * Supports: Minutes, Hours, Days, Custom, Per Rule, Per Action, Global.
 */
import type { CooldownConfig, CooldownState, CooldownScope } from './types';
import { cooldownToMs } from './types';

export class AutomationCooldownManager {
  private _states: CooldownState[] = [];
  private _globalLastTriggered: string | null = null;

  isInCooldown(ruleId: string, actionId: string | null, scope: CooldownScope): boolean {
    const now = Date.now();
    if (scope === 'global' && this._globalLastTriggered) {
      return new Date(this._globalLastTriggered).getTime() > now;
    }
    return this._states.some((s) => {
      if (s.scope !== scope) return false;
      if (scope === 'per_rule' && s.ruleId !== ruleId) return false;
      if (scope === 'per_action' && (s.ruleId !== ruleId || s.actionId !== actionId)) return false;
      return new Date(s.expiresAt).getTime() > now;
    });
  }

  applyCooldown(ruleId: string, actionId: string | null, config: CooldownConfig): void {
    if (!config.enabled) return;
    const now = new Date();
    const durationMs = cooldownToMs(config.duration, config.unit);
    const expiresAt = new Date(now.getTime() + durationMs);

    if (config.scope === 'global') {
      this._globalLastTriggered = expiresAt.toISOString();
      return;
    }

    this._states.push({
      ruleId,
      actionId: config.scope === 'per_action' ? actionId : null,
      lastTriggeredAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      scope: config.scope,
    });
  }

  getRemainingCooldown(ruleId: string, actionId: string | null, scope: CooldownScope): number {
    const now = Date.now();
    if (scope === 'global' && this._globalLastTriggered) {
      const remaining = new Date(this._globalLastTriggered).getTime() - now;
      return Math.max(0, remaining);
    }
    const state = this._states.find((s) => {
      if (s.scope !== scope) return false;
      if (scope === 'per_rule' && s.ruleId !== ruleId) return false;
      if (scope === 'per_action' && (s.ruleId !== ruleId || s.actionId !== actionId)) return false;
      return new Date(s.expiresAt).getTime() > now;
    });
    if (!state) return 0;
    return Math.max(0, new Date(state.expiresAt).getTime() - now);
  }

  clearExpired(): number {
    const now = Date.now();
    const before = this._states.length;
    this._states = this._states.filter((s) => new Date(s.expiresAt).getTime() > now);
    if (this._globalLastTriggered && new Date(this._globalLastTriggered).getTime() <= now) {
      this._globalLastTriggered = null;
    }
    return before - this._states.length;
  }

  clear(): void {
    this._states = [];
    this._globalLastTriggered = null;
  }

  getStates(): CooldownState[] {
    return [...this._states];
  }
}
