/**
 * History Events — event emitter for the maintenance history lifecycle.
 *
 * Events:
 *   execution_logged    — A new execution record was logged
 *   history_updated     — The history store was updated (insert, delete, retention)
 *   statistics_updated  — Statistics were recalculated
 *   report_generated    — A report was generated
 */
import type { HistoryEventType, HistoryEventListener } from './types';

class HistoryEventEmitter {
  private _listeners: Map<HistoryEventType, Set<HistoryEventListener>> = new Map();

  on(event: HistoryEventType, listener: HistoryEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => {
      this._listeners.get(event)?.delete(listener);
    };
  }

  emit(event: HistoryEventType, payload?: unknown): void {
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

  listenerCount(event: HistoryEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}

export const historyEvents = new HistoryEventEmitter();
