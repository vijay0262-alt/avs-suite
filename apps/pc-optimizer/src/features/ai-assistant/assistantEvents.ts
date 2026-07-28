/**
 * Assistant Events — typed event emitter for AI Assistant lifecycle.
 */
import type { AssistantEventType, AssistantEventListener } from './types';

export class AssistantEventEmitter {
  private _listeners: Map<AssistantEventType, Set<AssistantEventListener>> = new Map();

  on(event: AssistantEventType, listener: AssistantEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: AssistantEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[AssistantEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: AssistantEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const assistantEvents = new AssistantEventEmitter();
