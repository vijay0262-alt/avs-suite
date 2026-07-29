/**
 * Optimization Profile Events — typed event emitter for profile lifecycle.
 *
 * Emits: profile_registered, profile_selected, profile_resolved,
 * profile_updated, profile_deleted, profile_validated.
 */
import type { ProfileEventType, ProfileEventListener, ProfileEvent } from './types';

export class OptimizationProfileEvents {
  private _listeners: Map<ProfileEventType, Set<ProfileEventListener>> = new Map();

  on(event: ProfileEventType, listener: ProfileEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: ProfileEventType, listener: ProfileEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: ProfileEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ProfileEvents] Listener error:', err);
      }
    }
  }

  emitRegistered(profileId: string, data?: unknown): void {
    this.emit({ type: 'profile_registered', profileId, timestamp: new Date().toISOString(), data });
  }

  emitSelected(profileId: string, data?: unknown): void {
    this.emit({ type: 'profile_selected', profileId, timestamp: new Date().toISOString(), data });
  }

  emitResolved(profileId: string, data?: unknown): void {
    this.emit({ type: 'profile_resolved', profileId, timestamp: new Date().toISOString(), data });
  }

  emitUpdated(profileId: string, data?: unknown): void {
    this.emit({ type: 'profile_updated', profileId, timestamp: new Date().toISOString(), data });
  }

  emitDeleted(profileId: string, data?: unknown): void {
    this.emit({ type: 'profile_deleted', profileId, timestamp: new Date().toISOString(), data });
  }

  emitValidated(profileId: string, data?: unknown): void {
    this.emit({ type: 'profile_validated', profileId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: ProfileEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
