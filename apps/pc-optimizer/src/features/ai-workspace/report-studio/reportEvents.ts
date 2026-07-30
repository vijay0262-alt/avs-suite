/**
 * AI Report Studio — Events
 *
 * EPIC 5 PHASE A PART 5
 */
import type { ReportEvent, ReportEventListener, ReportEventType } from './types';

export class ReportEvents {
  private _listeners: Map<ReportEventType, Set<ReportEventListener>> = new Map();

  on(type: ReportEventType, listener: ReportEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: ReportEventType, listener: ReportEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: ReportEvent): void {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event); } catch { /* swallow */ }
      }
    }
  }

  removeAllListeners(): void {
    this._listeners.clear();
  }

  listenerCount(type?: ReportEventType): number {
    if (type) return this._listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}

export const reportEvents = new ReportEvents();
