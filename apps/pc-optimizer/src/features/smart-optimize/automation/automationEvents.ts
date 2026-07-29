/**
 * Automation Events — typed event emitter for automation lifecycle.
 *
 * Emits: automation_triggered, automation_rule_matched,
 * automation_deferred, automation_approved, automation_rejected,
 * automation_cancelled, automation_completed.
 */
import type { AutomationEventType, AutomationEventListener, AutomationEvent } from './types';

export class AutomationEvents {
  private _listeners: Map<AutomationEventType, Set<AutomationEventListener>> = new Map();

  on(event: AutomationEventType, listener: AutomationEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: AutomationEventType, listener: AutomationEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: AutomationEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AutomationEvents] Listener error:', err);
      }
    }
  }

  emitTriggered(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_triggered', ruleId, timestamp: new Date().toISOString(), data });
  }

  emitRuleMatched(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_rule_matched', ruleId, timestamp: new Date().toISOString(), data });
  }

  emitDeferred(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_deferred', ruleId, timestamp: new Date().toISOString(), data });
  }

  emitApproved(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_approved', ruleId, timestamp: new Date().toISOString(), data });
  }

  emitRejected(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_rejected', ruleId, timestamp: new Date().toISOString(), data });
  }

  emitCancelled(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_cancelled', ruleId, timestamp: new Date().toISOString(), data });
  }

  emitCompleted(ruleId: string, data?: unknown): void {
    this.emit({ type: 'automation_completed', ruleId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: AutomationEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
