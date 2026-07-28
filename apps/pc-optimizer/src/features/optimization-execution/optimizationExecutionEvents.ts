/**
 * Optimization Execution Events — event emitter for the
 * one-click smart optimize lifecycle.
 *
 * Events:
 *   optimization_started   — execution has begun
 *   optimization_progress   — a task started/completed, progress updated
 *   optimization_completed  — execution finished successfully
 *   optimization_cancelled  — user cancelled the session
 *   optimization_failed     — execution failed
 *
 * This emitter is independent from the execution engine events.
 * It wraps execution events into optimization-specific events.
 */
import type {
  OptimizationExecutionEventType,
  OptimizationExecutionEventListener,
} from './types';

export class OptimizationExecutionEventEmitter {
  private _listeners: Map<OptimizationExecutionEventType, Set<OptimizationExecutionEventListener>> = new Map();

  on(event: OptimizationExecutionEventType, listener: OptimizationExecutionEventListener): () => void {
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

  emit(event: OptimizationExecutionEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[OptimizationExecution] Listener for "${event}" threw:`, err);
      }
    }
  }

  listenerCount(event: OptimizationExecutionEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const optimizationExecutionEvents = new OptimizationExecutionEventEmitter();
