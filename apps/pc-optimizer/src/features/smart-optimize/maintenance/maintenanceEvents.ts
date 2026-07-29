/**
 * Maintenance Events — typed event emitter for maintenance lifecycle.
 *
 * Emits: maintenance_generated, maintenance_window_found,
 * maintenance_deferred, maintenance_accepted, maintenance_expired,
 * maintenance_completed, maintenance_cancelled.
 */
import type { MaintenanceEventType, MaintenanceEventListener, MaintenanceEvent } from './types';

export class MaintenanceEvents {
  private _listeners: Map<MaintenanceEventType, Set<MaintenanceEventListener>> = new Map();

  on(event: MaintenanceEventType, listener: MaintenanceEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: MaintenanceEventType, listener: MaintenanceEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: MaintenanceEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[MaintenanceEvents] Listener error:', err);
      }
    }
  }

  emitGenerated(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_generated', opportunityId, timestamp: new Date().toISOString(), data });
  }

  emitWindowFound(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_window_found', opportunityId, timestamp: new Date().toISOString(), data });
  }

  emitDeferred(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_deferred', opportunityId, timestamp: new Date().toISOString(), data });
  }

  emitAccepted(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_accepted', opportunityId, timestamp: new Date().toISOString(), data });
  }

  emitExpired(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_expired', opportunityId, timestamp: new Date().toISOString(), data });
  }

  emitCompleted(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_completed', opportunityId, timestamp: new Date().toISOString(), data });
  }

  emitCancelled(opportunityId: string, data?: unknown): void {
    this.emit({ type: 'maintenance_cancelled', opportunityId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: MaintenanceEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
