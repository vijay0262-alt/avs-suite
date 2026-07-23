/**
 * License Events — typed event definitions for the licensing subsystem.
 *
 * Events are emitted by the LicenseManager and can be observed
 * via the EventEmitter pattern. This enables decoupled reactions:
 * the UI can show notifications, the telemetry layer can log,
 * and the feature manager can re-evaluate without direct coupling.
 */

export type LicenseEventType =
  | 'application_started'
  | 'license_activated'
  | 'license_deactivated'
  | 'license_expired'
  | 'license_refreshed'
  | 'license_validated'
  | 'edition_changed'
  | 'grace_started'
  | 'grace_ended'
  | 'license_invalid'
  | 'license_revoked'
  | 'storage_error'
  | 'device_id_changed';

export interface LicenseEvent {
  /** Event type. */
  type: LicenseEventType;
  /** ISO-8601 UTC timestamp. */
  timestamp: string;
  /** Previous state (for transition events). */
  previousState?: string;
  /** New state (for transition events). */
  newState?: string;
  /** Previous edition (for edition_changed events). */
  previousEdition?: string;
  /** New edition (for edition_changed events). */
  newEdition?: string;
  /** Additional context (error message, etc.). */
  detail?: string;
  /** License ID if applicable. */
  licenseId?: string;
}

/**
 * Event constructor helper.
 */
export function createLicenseEvent(
  type: LicenseEventType,
  extra?: Partial<Omit<LicenseEvent, 'type' | 'timestamp'>>,
): LicenseEvent {
  return {
    type,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Type-safe event listener.
 */
export type LicenseEventListener = (event: LicenseEvent) => void;

/**
 * Minimal typed event emitter for license events.
 * No external dependencies — just a simple publish/subscribe.
 */
export class LicenseEventEmitter {
  private listeners = new Map<LicenseEventType, Set<LicenseEventListener>>();
  private allListeners = new Set<LicenseEventListener>();

  /** Subscribe to a specific event type. Returns an unsubscribe function. */
  on(type: LicenseEventType, listener: LicenseEventListener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  /** Subscribe to all events. Returns an unsubscribe function. */
  onAll(listener: LicenseEventListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  /** Emit an event to all matching listeners. */
  emit(event: LicenseEvent): void {
    const specific = this.listeners.get(event.type);
    if (specific) {
      for (const listener of specific) {
        try {
          listener(event);
        } catch {
          // Listener errors should not propagate to the emitter.
        }
      }
    }
    for (const listener of this.allListeners) {
      try {
        listener(event);
      } catch {
        // Same — swallow listener errors.
      }
    }
  }

  /** Remove all listeners. */
  clear(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }
}
