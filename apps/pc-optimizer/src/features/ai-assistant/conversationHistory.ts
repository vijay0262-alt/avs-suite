/**
 * Conversation History — manages conversation sessions with
 * persistence, topic tracking, and context awareness.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  Conversation,
  ConversationMessage,
  ConversationTopic,
  AssistantContext,
} from './types';
import { generateMessageId, generateConversationId } from './types';

export class ConversationHistory {
  private _conversations: Map<string, Conversation> = new Map();
  private _activeSessionId: string | null = null;
  private _maxMessages: number;
  private _maxConversations: number;
  private _creationOrder: Map<string, number> = new Map();
  private _creationCounter: number = 0;

  constructor(maxMessages: number = 100, maxConversations: number = 20) {
    this._maxMessages = maxMessages;
    this._maxConversations = maxConversations;
  }

  startSession(context: AssistantContext | null = null): string {
    const id = generateConversationId();
    const now = new Date().toISOString();
    const conversation: Conversation = {
      id,
      messages: [],
      startedAt: now,
      lastActivityAt: now,
      topic: null,
      contextSnapshot: context,
    };
    this._conversations.set(id, conversation);
    this._creationOrder.set(id, this._creationCounter++);
    this._activeSessionId = id;
    this._evictOldConversations();
    return id;
  }

  getActiveSessionId(): string | null {
    return this._activeSessionId;
  }

  setActiveSession(id: string): boolean {
    if (!this._conversations.has(id)) return false;
    this._activeSessionId = id;
    return true;
  }

  addMessage(
    sessionId: string,
    role: ConversationMessage['role'],
    content: string,
    questionType: ConversationMessage['questionType'] = null,
    explanation: ConversationMessage['explanation'] = null,
    metadata: Record<string, unknown> | null = null,
  ): ConversationMessage | null {
    const conversation = this._conversations.get(sessionId);
    if (!conversation) return null;

    const message: ConversationMessage = {
      id: generateMessageId(),
      role,
      content,
      timestamp: new Date().toISOString(),
      questionType,
      explanation,
      metadata,
    };

    conversation.messages.push(message);
    conversation.lastActivityAt = message.timestamp;
    if (conversation.messages.length > this._maxMessages) {
      conversation.messages = conversation.messages.slice(-this._maxMessages);
    }

    if (questionType !== null) {
      conversation.topic = this._inferTopic(questionType);
    }

    return message;
  }

  getConversation(id: string): Conversation | null {
    return this._conversations.get(id) ?? null;
  }

  getActiveConversation(): Conversation | null {
    if (!this._activeSessionId) return null;
    return this._conversations.get(this._activeSessionId) ?? null;
  }

  getMessages(sessionId: string): ConversationMessage[] {
    return this._conversations.get(sessionId)?.messages ?? [];
  }

  getRecentMessages(sessionId: string, limit: number): ConversationMessage[] {
    const messages = this.getMessages(sessionId);
    return messages.slice(-limit);
  }

  getTopic(sessionId: string): ConversationTopic | null {
    return this._conversations.get(sessionId)?.topic ?? null;
  }

  setTopic(sessionId: string, topic: ConversationTopic): void {
    const conversation = this._conversations.get(sessionId);
    if (conversation) {
      conversation.topic = topic;
    }
  }

  getContext(sessionId: string): AssistantContext | null {
    return this._conversations.get(sessionId)?.contextSnapshot ?? null;
  }

  setContext(sessionId: string, context: AssistantContext): void {
    const conversation = this._conversations.get(sessionId);
    if (conversation) {
      conversation.contextSnapshot = context;
    }
  }

  getMessageCount(sessionId: string): number {
    return this._conversations.get(sessionId)?.messages.length ?? 0;
  }

  getAllConversations(): Conversation[] {
    return Array.from(this._conversations.values()).sort((a, b) => {
      const timeDiff = new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (this._creationOrder.get(b.id) ?? 0) - (this._creationOrder.get(a.id) ?? 0);
    });
  }

  clearSession(id: string): boolean {
    if (this._activeSessionId === id) {
      this._activeSessionId = null;
    }
    this._creationOrder.delete(id);
    return this._conversations.delete(id);
  }

  clearAll(): void {
    this._conversations.clear();
    this._creationOrder.clear();
    this._activeSessionId = null;
  }

  exportSession(id: string): string | null {
    const conversation = this._conversations.get(id);
    if (!conversation) return null;
    return JSON.stringify(conversation, null, 2);
  }

  importSession(json: string): string | null {
    try {
      const conversation = JSON.parse(json) as Conversation;
      this._conversations.set(conversation.id, conversation);
      return conversation.id;
    } catch {
      return null;
    }
  }

  size(): number {
    return this._conversations.size;
  }

  private _inferTopic(questionType: ConversationMessage['questionType']): ConversationTopic {
    const topicMap: Record<string, ConversationTopic> = {
      why_score_low: 'health_score',
      why_score_improved: 'health_score',
      what_changed: 'general',
      what_optimize_first: 'optimization',
      why_startup_poor: 'startup',
      why_duplicates: 'duplicates',
      how_much_recover: 'storage',
      what_smart_optimize: 'optimization',
      why_browser_privacy_low: 'browser',
      why_windows_fair: 'windows',
      which_safest: 'recommendations',
      what_happened_after: 'history',
    };
    return topicMap[questionType ?? ''] ?? 'general';
  }

  private _evictOldConversations(): void {
    if (this._conversations.size <= this._maxConversations) return;
    const sorted = this.getAllConversations();
    const toRemove = sorted.slice(this._maxConversations);
    for (const conv of toRemove) {
      if (conv.id !== this._activeSessionId) {
        this._conversations.delete(conv.id);
      }
    }
  }
}

export const conversationHistory = new ConversationHistory();
