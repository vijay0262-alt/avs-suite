/**
 * Plan Events — typed event emitter for Part 5 Plan Engine.
 *
 * Emits: plan_generated, plan_updated, plan_selected,
 * plan_validated, plan_expired, plan_compared.
 */
import type { PlanEventType, PlanEventListener, PlanEvent } from './types';

export class PlanEvents {
  private _listeners: Map<PlanEventType, Set<PlanEventListener>> = new Map();

  on(event: PlanEventType, listener: PlanEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: PlanEventType, listener: PlanEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: PlanEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[PlanEvents] Listener error:', err);
      }
    }
  }

  emitGenerated(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_generated', planId, timestamp: new Date().toISOString(), data });
  }

  emitUpdated(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_updated', planId, timestamp: new Date().toISOString(), data });
  }

  emitSelected(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_selected', planId, timestamp: new Date().toISOString(), data });
  }

  emitValidated(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_validated', planId, timestamp: new Date().toISOString(), data });
  }

  emitExpired(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_expired', planId, timestamp: new Date().toISOString(), data });
  }

  emitCompared(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_compared', planId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: PlanEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
