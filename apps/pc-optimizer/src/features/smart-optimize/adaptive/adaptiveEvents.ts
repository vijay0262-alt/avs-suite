/**
 * Adaptive Events — typed event emitter for adaptation lifecycle.
 *
 * Emits: adaptation_started, condition_detected, plan_modified,
 * plan_paused, plan_resumed, plan_cancelled, adaptation_completed.
 */
import type { AdaptiveEventType, AdaptiveEventListener, AdaptiveEvent } from './types';

export class AdaptiveEvents {
  private _listeners: Map<AdaptiveEventType, Set<AdaptiveEventListener>> = new Map();

  on(event: AdaptiveEventType, listener: AdaptiveEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: AdaptiveEventType, listener: AdaptiveEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: AdaptiveEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AdaptiveEvents] Listener error:', err);
      }
    }
  }

  emitStarted(planId: string, data?: unknown): void {
    this.emit({ type: 'adaptation_started', planId, timestamp: new Date().toISOString(), data });
  }

  emitConditionDetected(planId: string, data?: unknown): void {
    this.emit({ type: 'condition_detected', planId, timestamp: new Date().toISOString(), data });
  }

  emitPlanModified(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_modified', planId, timestamp: new Date().toISOString(), data });
  }

  emitPlanPaused(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_paused', planId, timestamp: new Date().toISOString(), data });
  }

  emitPlanResumed(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_resumed', planId, timestamp: new Date().toISOString(), data });
  }

  emitPlanCancelled(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_cancelled', planId, timestamp: new Date().toISOString(), data });
  }

  emitCompleted(planId: string, data?: unknown): void {
    this.emit({ type: 'adaptation_completed', planId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: AdaptiveEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
