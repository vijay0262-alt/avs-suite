/**
 * Goals & Objectives Engine — Events
 */
import type { GoalEventType, GoalEvent, GoalEventListener } from './types';

export class GoalEvents {
  private _listeners: Map<GoalEventType, Set<GoalEventListener>> = new Map();

  on(event: GoalEventType, listener: GoalEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: GoalEventType, listener: GoalEventListener): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit(event: GoalEventType, goalId: string, data: unknown): void {
    const e: GoalEvent = { type: event, goalId, timestamp: new Date().toISOString(), data };
    const set = this._listeners.get(event);
    if (set) {
      for (const listener of set) {
        try { listener(e); } catch { /* swallow */ }
      }
    }
  }

  emitCreated(goalId: string, data: unknown): void { this.emit('goal_created', goalId, data); }
  emitUpdated(goalId: string, data: unknown): void { this.emit('goal_updated', goalId, data); }
  emitStarted(goalId: string, data: unknown): void { this.emit('goal_started', goalId, data); }
  emitPaused(goalId: string, data: unknown): void { this.emit('goal_paused', goalId, data); }
  emitCompleted(goalId: string, data: unknown): void { this.emit('goal_completed', goalId, data); }
  emitBlocked(goalId: string, data: unknown): void { this.emit('goal_blocked', goalId, data); }
  emitMeasured(goalId: string, data: unknown): void { this.emit('goal_measured', goalId, data); }
  emitStrategyGenerated(goalId: string, data: unknown): void { this.emit('strategy_generated', goalId, data); }

  clear(): void { this._listeners.clear(); }

  listenerCount(event?: GoalEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
