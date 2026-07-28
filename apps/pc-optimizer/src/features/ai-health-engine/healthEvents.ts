/**
 * Health Events — event emitter for the AI Health Engine lifecycle.
 *
 * Events:
 *   health_analysis_started  — Analysis has begun
 *   category_completed       — A single category analysis finished
 *   health_score_updated     — Overall score was recalculated
 *   recommendations_generated — Recommendations were produced
 *   analysis_completed       — Full analysis report is ready
 *   analysis_failed          — Analysis encountered an error
 */
import type { HealthEventType, HealthEventListener } from './types';

class HealthEventEmitter {
  private _listeners: Map<HealthEventType, Set<HealthEventListener>> = new Map();

  on(event: HealthEventType, listener: HealthEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => {
      this._listeners.get(event)?.delete(listener);
    };
  }

  emit(event: HealthEventType, payload?: unknown): void {
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

  listenerCount(event: HealthEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}

export const healthEvents = new HealthEventEmitter();
