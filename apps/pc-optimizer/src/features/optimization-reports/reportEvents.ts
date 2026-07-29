/**
 * Report Events — typed event emitter for report lifecycle.
 *
 * Emits: report_generated, report_updated, report_exported,
 * comparison_generated, report_viewed.
 */
import type { ReportEventType, ReportEventListener, ReportEvent } from './types';

export class ReportEvents {
  private _listeners: Map<ReportEventType, Set<ReportEventListener>> = new Map();

  on(event: ReportEventType, listener: ReportEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: ReportEventType, listener: ReportEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: ReportEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ReportEvents] Listener error:', err);
      }
    }
  }

  emitGenerated(reportId: string, data?: unknown): void {
    this.emit({ type: 'report_generated', reportId, timestamp: new Date().toISOString(), data });
  }

  emitUpdated(reportId: string, data?: unknown): void {
    this.emit({ type: 'report_updated', reportId, timestamp: new Date().toISOString(), data });
  }

  emitExported(reportId: string, data?: unknown): void {
    this.emit({ type: 'report_exported', reportId, timestamp: new Date().toISOString(), data });
  }

  emitComparisonGenerated(reportId: string, data?: unknown): void {
    this.emit({ type: 'comparison_generated', reportId, timestamp: new Date().toISOString(), data });
  }

  emitViewed(reportId: string, data?: unknown): void {
    this.emit({ type: 'report_viewed', reportId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: ReportEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
