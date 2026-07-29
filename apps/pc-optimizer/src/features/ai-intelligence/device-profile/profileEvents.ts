/**
 * Profile Events — typed event emitter for the AI Device Profile Engine.
 *
 * Emits:
 *   profile_created     — when a new profile is created
 *   profile_updated     — when a profile is updated
 *   profile_changed     — when the primary profile changes
 *   profile_strengthened — when a profile's confidence increases
 *   profile_weakened    — when a profile's confidence decreases
 *   profile_validated   — when a profile is validated
 */
import type { ProfileEventType, ProfileEventListener } from './types';

export class ProfileEventEmitter {
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

  emit(event: ProfileEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[ProfileEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: ProfileEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const profileEvents = new ProfileEventEmitter();
