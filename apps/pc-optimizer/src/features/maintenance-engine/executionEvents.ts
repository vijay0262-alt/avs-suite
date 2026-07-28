/**
 * Execution Events — event emitter for the maintenance execution lifecycle.
 *
 * Events:
 *   execution_started  — A job has begun executing
 *   task_started       — A single task within the job has started
 *   task_completed     — A single task has finished (success or failure)
 *   execution_completed — The entire job finished successfully
 *   execution_failed   — The job failed (with optional partial result)
 *   schedule_skipped   — A scheduled run was skipped (disabled, paused, etc.)
 */
import type {
  ExecutionEventType,
  ExecutionEventListener,
} from './types';

class ExecutionEventEmitter {
  private _listeners: Map<ExecutionEventType, Set<ExecutionEventListener>> = new Map();

  on(event: ExecutionEventType, listener: ExecutionEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => {
      this._listeners.get(event)?.delete(listener);
    };
  }

  emit(event: ExecutionEventType, payload?: unknown): void {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errors must not break other listeners
      }
    }
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event: ExecutionEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}

export const executionEvents = new ExecutionEventEmitter();
