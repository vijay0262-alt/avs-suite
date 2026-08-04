/**
 * AVS AI Assistant Platform — Session Manager
 *
 * EPIC 5 PHASE A PART 1
 *
 * Manages AIAssistant sessions and conversations.
 * Tracks session lifecycle, conversation counts, and active conversation.
 */
import type {
  AIAssistantSession,
  AIAssistantConversation,
  AIAssistantMessage,
  SessionStatus,
  ConversationStatus,
} from './types';
import { generateSessionId, generateConversationId } from './types';

export class AIAssistantSessionManager {
  private _sessions: Map<string, AIAssistantSession> = new Map();
  private _conversations: Map<string, AIAssistantConversation> = new Map();
  private _maxConversations: number;

  constructor(maxConversations: number = 50) {
    this._maxConversations = maxConversations;
  }

  setMaxConversations(max: number): void {
    this._maxConversations = max;
  }

  createSession(): AIAssistantSession {
    const session: AIAssistantSession = {
      id: generateSessionId(),
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      conversationCount: 0,
      activeConversationId: null,
      status: 'active',
      futureMetadata: {},
    };
    this._sessions.set(session.id, session);
    return session;
  }

  getSession(sessionId: string): AIAssistantSession | null {
    return this._sessions.get(sessionId) ?? null;
  }

  updateActivity(sessionId: string): void {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date().toISOString();
    }
  }

  setSessionStatus(sessionId: string, status: SessionStatus): void {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.status = status;
    }
  }

  createConversation(sessionId: string): AIAssistantConversation {
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (this._conversations.size >= this._maxConversations) {
      this._evictOldestConversation();
    }

    const conversation: AIAssistantConversation = {
      id: generateConversationId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      intent: 'conversation',
      confidence: 0,
      context: {
        sources: [],
        healthScore: null,
        deviceProfile: null,
        activeGoals: [],
        recentTimelineEvents: [],
        activeRecommendations: [],
        activePredictions: [],
        maintenanceHistory: [],
        optimizationHistory: [],
        recoveryHistory: [],
        userPreferences: {},
        futureMetadata: {},
      },
      entities: [],
      selectedModules: [],
      generatedActions: [],
      suggestions: [],
      references: [],
      messages: [],
      status: 'active',
      futureMetadata: {},
    };

    this._conversations.set(conversation.id, conversation);
    session.activeConversationId = conversation.id;
    session.conversationCount += 1;
    this.updateActivity(sessionId);

    return conversation;
  }

  getConversation(conversationId: string): AIAssistantConversation | null {
    return this._conversations.get(conversationId) ?? null;
  }

  updateConversation(conversationId: string, updates: Partial<AIAssistantConversation>): boolean {
    const conv = this._conversations.get(conversationId);
    if (!conv) return false;

    Object.assign(conv, updates, { updatedAt: new Date().toISOString() });
    return true;
  }

  setConversationStatus(conversationId: string, status: ConversationStatus): boolean {
    const conv = this._conversations.get(conversationId);
    if (!conv) return false;
    conv.status = status;
    conv.updatedAt = new Date().toISOString();
    return true;
  }

  addMessage(conversationId: string, message: Omit<AIAssistantMessage, 'timestamp' | 'futureMetadata'>): boolean {
    const conv = this._conversations.get(conversationId);
    if (!conv) return false;
    conv.messages.push({
      ...message,
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    conv.updatedAt = new Date().toISOString();
    return true;
  }

  getConversationHistory(conversationId: string): AIAssistantConversation[] {
    const conv = this._conversations.get(conversationId);
    if (!conv) return [];
    return [structuredClone(conv)];
  }

  clearConversation(conversationId: string): boolean {
    const conv = this._conversations.get(conversationId);
    if (!conv) return false;
    conv.messages = [];
    conv.status = 'active';
    conv.updatedAt = new Date().toISOString();
    return true;
  }

  clearAll(): void {
    this._conversations.clear();
    this._sessions.clear();
  }

  getActiveSessions(): AIAssistantSession[] {
    return Array.from(this._sessions.values()).filter((s) => s.status === 'active');
  }

  getConversationCount(): number {
    return this._conversations.size;
  }

  private _evictOldestConversation(): void {
    let oldest: AIAssistantConversation | null = null;
    for (const conv of this._conversations.values()) {
      if (!oldest || conv.createdAt < oldest.createdAt) {
        oldest = conv;
      }
    }
    if (oldest) {
      this._conversations.delete(oldest.id);
    }
  }
}
