/**
 * Intelligence Events — typed event emitter for intelligence lifecycle.
 *
 * Emits: history_analyzed, patterns_detected, insights_generated,
 * recommendations_ranked, prediction_updated, automation_intelligence_updated.
 */
import type { IntelligenceEventType, IntelligenceEventListener, IntelligenceEvent } from './types';

export class IntelligenceEvents {
  private _listeners: Map<IntelligenceEventType, Set<IntelligenceEventListener>> = new Map();

  on(event: IntelligenceEventType, listener: IntelligenceEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: IntelligenceEventType, listener: IntelligenceEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: IntelligenceEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[IntelligenceEvents] Listener error:', err);
      }
    }
  }

  emitHistoryAnalyzed(data?: unknown): void {
    this.emit({ type: 'history_analyzed', timestamp: new Date().toISOString(), data });
  }

  emitPatternsDetected(data?: unknown): void {
    this.emit({ type: 'patterns_detected', timestamp: new Date().toISOString(), data });
  }

  emitInsightsGenerated(data?: unknown): void {
    this.emit({ type: 'insights_generated', timestamp: new Date().toISOString(), data });
  }

  emitRecommendationsRanked(data?: unknown): void {
    this.emit({ type: 'recommendations_ranked', timestamp: new Date().toISOString(), data });
  }

  emitPredictionUpdated(data?: unknown): void {
    this.emit({ type: 'prediction_updated', timestamp: new Date().toISOString(), data });
  }

  emitIntelligenceUpdated(data?: unknown): void {
    this.emit({ type: 'automation_intelligence_updated', timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: IntelligenceEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
