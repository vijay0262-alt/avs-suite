/**
 * Startup Optimizer Events — event emitter for the startup
 * optimization lifecycle.
 *
 * Events:
 *   startup_scan_started      — scanning has begun
 *   startup_scan_completed     — scanning finished, entries available
 *   startup_analysis_completed — analysis finished, results available
 *   startup_item_changed       — an entry was enabled/disabled/restored
 *   startup_execution_completed — a batch execution finished
 */
import type {
  StartupEventType,
  StartupEventListener,
} from './types';

export class StartupEventEmitter {
  private _listeners: Map<StartupEventType, Set<StartupEventListener>> = new Map();

  on(event: StartupEventType, listener: StartupEventListener): () => void {
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

  emit(event: StartupEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[StartupOptimizer] Listener for "${event}" threw:`, err);
      }
    }
  }

  listenerCount(event: StartupEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const startupEvents = new StartupEventEmitter();
