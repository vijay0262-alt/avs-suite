/**
 * Automation History — tracks automation lifecycle events.
 *
 * Tracks: Triggered, Ignored, Deferred, Approved, Rejected,
 * Executed, Cancelled, Expired.
 */
import type {
  AutomationHistoryEntry,
  AutomationOutcome,
  AutomationTriggerType,
  AutomationActionType,
  RiskLevel,
} from './types';
import { generateHistoryId } from './types';

export class AutomationHistory {
  private _entries: AutomationHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    ruleId: string,
    triggerType: AutomationTriggerType,
    outcome: AutomationOutcome,
    confidence: number,
    riskLevel: RiskLevel,
    actions: AutomationActionType[] = [],
    approvalRequired: boolean = false,
    cooldownApplied: boolean = false,
    metadata: Record<string, unknown> = {},
  ): void {
    this._entries.push({
      id: generateHistoryId(),
      ruleId,
      triggerType,
      outcome,
      timestamp: new Date().toISOString(),
      actions,
      confidence,
      riskLevel,
      approvalRequired,
      cooldownApplied,
      metadata,
    });
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }

  getAll(): AutomationHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): AutomationHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByRule(ruleId: string): AutomationHistoryEntry[] {
    return this._entries.filter((e) => e.ruleId === ruleId);
  }

  getByOutcome(outcome: AutomationOutcome): AutomationHistoryEntry[] {
    return this._entries.filter((e) => e.outcome === outcome);
  }

  getByTrigger(triggerType: AutomationTriggerType): AutomationHistoryEntry[] {
    return this._entries.filter((e) => e.triggerType === triggerType);
  }

  get count(): number {
    return this._entries.length;
  }

  clear(): void {
    this._entries = [];
  }

  setMaxEntries(max: number): void {
    this._maxEntries = max;
    if (this._entries.length > max) {
      this._entries = this._entries.slice(-max);
    }
  }
}
