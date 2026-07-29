/**
 * Experience Events — typed event emitter for the Experience Layer.
 *
 * Emits:
 *   experience_loaded     — when experience is first loaded
 *   experience_updated    — when experience state changes
 *   quota_limit_reached   — when a quota limit is hit
 *   trial_started         — when a trial begins
 *   trial_expired         — when a trial expires
 *   upgrade_recommended   — when an upgrade is recommended
 *   feature_accessed      — when a feature is successfully accessed
 *   feature_denied        — when feature access is denied
 */
import type { ExperienceEventType, ExperienceEventListener } from './types';

export class ExperienceEventEmitter {
  private _listeners: Map<ExperienceEventType, Set<ExperienceEventListener>> = new Map();

  on(event: ExperienceEventType, listener: ExperienceEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: ExperienceEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[ExperienceEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: ExperienceEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const experienceEvents = new ExperienceEventEmitter();
