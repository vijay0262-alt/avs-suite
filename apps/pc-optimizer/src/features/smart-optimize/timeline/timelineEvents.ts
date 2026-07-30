/**
 * Unified Timeline & Activity Center — Events
 *
 * Typed event emitter for timeline lifecycle events.
 */
import type { TimelineEventType_Emitter, TimelineEvent, TimelineEventListener } from './types';

export class TimelineEvents {
  private _listeners: Map<TimelineEventType_Emitter, Set<TimelineEventListener>> = new Map();

  on(event: TimelineEventType_Emitter, listener: TimelineEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: TimelineEventType_Emitter, listener: TimelineEventListener): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit(event: TimelineEventType_Emitter, itemId: string | null, data: unknown): void {
    const e: TimelineEvent = {
      type: event,
      itemId,
      timestamp: new Date().toISOString(),
      data,
    };
    const set = this._listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(e);
        } catch {
          // listener error should not crash the emitter
        }
      }
    }
  }

  emitRecorded(itemId: string, data: unknown): void {
    this.emit('timeline_recorded', itemId, data);
  }

  emitUpdated(itemId: string, data: unknown): void {
    this.emit('timeline_updated', itemId, data);
  }

  emitFiltered(itemId: string | null, data: unknown): void {
    this.emit('timeline_filtered', itemId, data);
  }

  emitExported(itemId: string | null, data: unknown): void {
    this.emit('timeline_exported', itemId, data);
  }

  emitPruned(itemId: string | null, data: unknown): void {
    this.emit('timeline_pruned', itemId, data);
  }

  emitAnalyticsUpdated(itemId: string | null, data: unknown): void {
    this.emit('analytics_updated', itemId, data);
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: TimelineEventType_Emitter): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
