/**
 * AVS AI Assistant Platform — Events
 *
 * EPIC 5 PHASE A PART 1
 *
 * Typed event emitter for AIAssistant lifecycle events.
 */
import type { AIAssistantEvent, AIAssistantEventListener, AIAssistantEventType } from './types';

export class AIAssistantEvents {
  private _listeners: Map<AIAssistantEventType, Set<AIAssistantEventListener>> = new Map();

  on(type: AIAssistantEventType, listener: AIAssistantEventListener): void {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type)!.add(listener);
  }

  off(type: AIAssistantEventType, listener: AIAssistantEventListener): void {
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: AIAssistantEvent): void {
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

  removeListenersForType(type: AIAssistantEventType): void {
    this._listeners.delete(type);
  }

  listenerCount(type?: AIAssistantEventType): number {
    if (type) {
      return this._listeners.get(type)?.size ?? 0;
    }
    let total = 0;
    for (const set of this._listeners.values()) {
      total += set.size;
    }
    return total;
  }
}

export const aiAssistantEvents = new AIAssistantEvents();
