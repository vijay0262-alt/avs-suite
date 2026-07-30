/**
 * Goal Orchestration Engine — Events
 */
import type { OrchestrationEventType, OrchestrationEvent, OrchestrationEventListener } from './types';

export class OrchestrationEvents {
  private _listeners: Map<OrchestrationEventType, Set<OrchestrationEventListener>> = new Map();

  on(event: OrchestrationEventType, listener: OrchestrationEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: OrchestrationEventType, listener: OrchestrationEventListener): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit(event: OrchestrationEventType, orchestrationId: string, goalId: string | null, data: unknown): void {
    const e: OrchestrationEvent = {
      type: event,
      orchestrationId,
      goalId,
      timestamp: new Date().toISOString(),
      data,
    };
    const set = this._listeners.get(event);
    if (set) {
      for (const listener of set) {
        try { listener(e); } catch { /* swallow */ }
      }
    }
  }

  emitOrchestrationStarted(orchestrationId: string, data: unknown): void {
    this.emit('goal_orchestration_started', orchestrationId, null, data);
  }

  emitGoalsPrioritized(orchestrationId: string, data: unknown): void {
    this.emit('goals_prioritized', orchestrationId, null, data);
  }

  emitConflictDetected(orchestrationId: string, goalId: string | null, data: unknown): void {
    this.emit('conflict_detected', orchestrationId, goalId, data);
  }

  emitConflictResolved(orchestrationId: string, goalId: string | null, data: unknown): void {
    this.emit('conflict_resolved', orchestrationId, goalId, data);
  }

  emitResourcesAllocated(orchestrationId: string, data: unknown): void {
    this.emit('resources_allocated', orchestrationId, null, data);
  }

  emitStrategyGenerated(orchestrationId: string, goalId: string, data: unknown): void {
    this.emit('strategy_generated', orchestrationId, goalId, data);
  }

  emitGoalDeferred(orchestrationId: string, goalId: string, data: unknown): void {
    this.emit('goal_deferred', orchestrationId, goalId, data);
  }

  emitGoalCompleted(orchestrationId: string, goalId: string, data: unknown): void {
    this.emit('goal_completed', orchestrationId, goalId, data);
  }

  clear(): void { this._listeners.clear(); }

  listenerCount(event?: OrchestrationEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
