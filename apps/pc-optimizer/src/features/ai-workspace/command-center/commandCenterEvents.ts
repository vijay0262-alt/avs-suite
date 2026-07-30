/**
 * AI Command Center — Events
 *
 * EPIC 5 PHASE A PART 3
 */
import type { CommandCenterEvent, CommandCenterEventListener, CommandCenterEventType } from './types';

export class CommandCenterEvents {
  private _listeners: Map<CommandCenterEventType, Set<CommandCenterEventListener>> = new Map();

  on(type: CommandCenterEventType, listener: CommandCenterEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: CommandCenterEventType, listener: CommandCenterEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: CommandCenterEvent): void {
    const listeners = this._listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(event); } catch { /* swallow */ }
      }
    }
  }

  removeAllListeners(): void {
    this._listeners.clear();
  }

  listenerCount(type?: CommandCenterEventType): number {
    if (type) return this._listeners.get(type)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}

export const commandCenterEvents = new CommandCenterEvents();
