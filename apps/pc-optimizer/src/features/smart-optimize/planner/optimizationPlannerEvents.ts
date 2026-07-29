/**
 * Optimization Planner Events — typed event emitter for planner lifecycle.
 *
 * Emits: smart_plan_generated, strategy_selected, plan_validated,
 * plan_rejected, plan_expired, plan_compared.
 */
import type { PlannerEventType, PlannerEventListener, PlannerEvent } from './types';

export class OptimizationPlannerEvents {
  private _listeners: Map<PlannerEventType, Set<PlannerEventListener>> = new Map();

  on(event: PlannerEventType, listener: PlannerEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: PlannerEventType, listener: PlannerEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: PlannerEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[PlannerEvents] Listener error:', err);
      }
    }
  }

  emitGenerated(planId: string, data?: unknown): void {
    this.emit({ type: 'smart_plan_generated', planId, timestamp: new Date().toISOString(), data });
  }

  emitStrategySelected(planId: string, data?: unknown): void {
    this.emit({ type: 'strategy_selected', planId, timestamp: new Date().toISOString(), data });
  }

  emitValidated(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_validated', planId, timestamp: new Date().toISOString(), data });
  }

  emitRejected(planId: string, data?: unknown): void {
    this.emit({ type: 'plan_rejected', planId, timestamp: new Date().toISOString(), data });
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

  listenerCount(event?: PlannerEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
