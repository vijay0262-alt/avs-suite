/**
 * Optimization Events — event emitter for the optimization planner.
 *
 * Lifecycle events:
 *   optimization_plan_started   — plan generation began
 *   optimization_plan_generated — plan generation completed successfully
 *   optimization_plan_failed    — plan generation failed
 *
 * This emitter is independent from the health events and execution events.
 * It only emits planning lifecycle events — never execution events.
 */
import type {
  OptimizationEventType,
  OptimizationEventListener,
} from './types';

export class OptimizationEventEmitter {
  private _listeners: Map<OptimizationEventType, Set<OptimizationEventListener>> = new Map();

  on(event: OptimizationEventType, listener: OptimizationEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  emit(event: OptimizationEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[OptimizationEvents] Listener for "${event}" threw:`, err);
      }
    }
  }

  listenerCount(event: OptimizationEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const optimizationEvents = new OptimizationEventEmitter();
