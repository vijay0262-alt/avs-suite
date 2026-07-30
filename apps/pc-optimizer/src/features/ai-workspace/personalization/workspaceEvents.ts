/**
 * AI Workspace Personalization Platform — Events
 *
 * EPIC 5 PHASE A PART 7
 *
 * Typed event emitter for workspace personalization lifecycle events.
 */
import type { WorkspaceEvent, WorkspaceEventListener, WorkspaceEventType } from './types';

export class WorkspaceEvents {
  private _listeners: Map<WorkspaceEventType, Set<WorkspaceEventListener>> = new Map();

  on(type: WorkspaceEventType, listener: WorkspaceEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: WorkspaceEventType, listener: WorkspaceEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: WorkspaceEvent): void {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // listener errors should not propagate
        }
      }
    }
  }

  removeAllListeners(): void {
    this._listeners.clear();
  }

  removeListenersForType(type: WorkspaceEventType): void {
    this._listeners.delete(type);
  }

  listenerCount(type?: WorkspaceEventType): number {
    if (type) return this._listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}

export const workspaceEvents = new WorkspaceEvents();
