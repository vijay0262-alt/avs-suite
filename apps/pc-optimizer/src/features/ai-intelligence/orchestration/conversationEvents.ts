/**
 * Conversation Events — typed event emitter for the AI Orchestration Engine.
 *
 * Emits:
 *   conversation_started    — when a conversation begins
 *   intent_resolved         — when intent is resolved from user query
 *   task_planned            — when a task plan is created
 *   response_generated      — when a response is composed
 *   tool_invoked            — when a tool is invoked
 *   conversation_completed  — when a conversation turn completes
 *   conversation_failed     — when a conversation fails
 */
import type { ConversationEventType, ConversationEventListener } from './types';

export class ConversationEventEmitter {
  private _listeners: Map<ConversationEventType, Set<ConversationEventListener>> = new Map();

  on(event: ConversationEventType, listener: ConversationEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  emit(event: ConversationEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[ConversationEvents] Listener error:', err);
      }
    }
  }

  listenerCount(event: ConversationEventType): number {
    return this._listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this._listeners.clear();
  }
}

export const conversationEvents = new ConversationEventEmitter();
