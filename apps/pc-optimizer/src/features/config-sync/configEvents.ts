/**
 * Configuration Event Manager — internal event system for configuration changes.
 *
 * Desktop modules subscribe to events to react to configuration changes.
 * Modules should NEVER call APIs directly — they receive updates through events.
 *
 * Events:
 *   configuration_loaded  — Config loaded from cache at startup
 *   configuration_updated — New config downloaded and applied
 *   sync_started          — Sync cycle begins
 *   sync_successful       — Sync completes successfully
 *   sync_failed           — Sync fails (network, auth, validation)
 *   offline_mode          — Backend unreachable, using cache/defaults
 *   version_changed       — Version number differs
 *   checksum_changed      — Checksum differs (real content change)
 */
import type {
  ConfigurationEvent,
  ConfigurationEventListener,
} from './types';

type ListenerMap = Map<ConfigurationEvent, Set<ConfigurationEventListener>>;

class ConfigurationManagerEvents {
  private _listeners: ListenerMap = new Map();

  on(event: ConfigurationEvent, listener: ConfigurationEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => {
      this._listeners.get(event)?.delete(listener);
    };
  }

  emit(event: ConfigurationEvent, payload?: unknown): void {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch {
        // Listener errors should not break other listeners
      }
    }
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event: ConfigurationEvent): number {
    return this._listeners.get(event)?.size ?? 0;
  }
}

export const configEvents = new ConfigurationManagerEvents();
