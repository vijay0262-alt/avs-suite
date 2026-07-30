/**
 * AI Copilot Platform — Memory
 *
 * EPIC 5 PHASE A PART 1
 *
 * Session-scoped memory only. No personal data storage.
 * Memory is cleared when the session ends.
 * Stores conversation context, recent topics, pending suggestions,
 * and recent entities.
 */
import type {
  CopilotMemory as CopilotMemoryData,
  CopilotContext,
  CopilotSuggestion,
  CopilotEntity,
} from './types';

export class CopilotMemory {
  private _memory: CopilotMemoryData;

  constructor() {
    this._memory = {
      conversationContext: null,
      activeSessionId: null,
      recentTopics: [],
      pendingSuggestions: [],
      recentEntities: [],
      futureContextProviders: [],
      futureMetadata: {},
    };
  }

  setSessionId(sessionId: string): void {
    this._memory.activeSessionId = sessionId;
  }

  getSessionId(): string | null {
    return this._memory.activeSessionId;
  }

  setContext(context: CopilotContext): void {
    this._memory.conversationContext = context;
  }

  getContext(): CopilotContext | null {
    return this._memory.conversationContext;
  }

  addTopic(topic: string): void {
    if (!this._memory.recentTopics.includes(topic)) {
      this._memory.recentTopics.unshift(topic);
      if (this._memory.recentTopics.length > 10) {
        this._memory.recentTopics = this._memory.recentTopics.slice(0, 10);
      }
    }
  }

  getRecentTopics(): string[] {
    return [...this._memory.recentTopics];
  }

  setPendingSuggestions(suggestions: CopilotSuggestion[]): void {
    this._memory.pendingSuggestions = suggestions;
  }

  getPendingSuggestions(): CopilotSuggestion[] {
    return [...this._memory.pendingSuggestions];
  }

  addEntity(entity: CopilotEntity): void {
    const existingIdx = this._memory.recentEntities.findIndex(
      (e) => e.type === entity.type && e.id === entity.id,
    );
    if (existingIdx >= 0) {
      this._memory.recentEntities[existingIdx] = entity;
    } else {
      this._memory.recentEntities.unshift(entity);
      if (this._memory.recentEntities.length > 20) {
        this._memory.recentEntities = this._memory.recentEntities.slice(0, 20);
      }
    }
  }

  getRecentEntities(): CopilotEntity[] {
    return [...this._memory.recentEntities];
  }

  clear(): void {
    this._memory = {
      conversationContext: null,
      activeSessionId: null,
      recentTopics: [],
      pendingSuggestions: [],
      recentEntities: [],
      futureContextProviders: [],
      futureMetadata: {},
    };
  }

  getSnapshot(): CopilotMemoryData {
    return structuredClone(this._memory);
  }

  hasContext(): boolean {
    return this._memory.conversationContext !== null;
  }
}
