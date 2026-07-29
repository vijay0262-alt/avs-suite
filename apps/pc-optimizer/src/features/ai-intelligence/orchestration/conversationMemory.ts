/**
 * Conversation Memory — maintains conversation state across turns.
 *
 * Tracks:
 *   Current session, referenced recommendations, referenced predictions,
 *   previous questions, selected categories, conversation preferences.
 *
 * Does NOT store sensitive personal content.
 */
import type {
  ConversationMemoryData,
  ConversationPreferences,
  ConversationConfiguration,
} from './types';
import { generateConversationId, getDefaultPreferences } from './types';

export class ConversationMemory {
  private _data: ConversationMemoryData;
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration, sessionId?: string) {
    this._config = config;
    this._data = this._createSession(sessionId);
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  private _createSession(sessionId?: string): ConversationMemoryData {
    const now = new Date().toISOString();
    return {
      sessionId: sessionId ?? generateConversationId(),
      createdAt: now,
      lastActivityAt: now,
      previousQuestions: [],
      referencedRecommendations: [],
      referencedPredictions: [],
      referencedInsights: [],
      selectedCategories: [],
      conversationPreferences: getDefaultPreferences(),
      turnCount: 0,
    };
  }

  startNewSession(sessionId?: string): void {
    this._data = this._createSession(sessionId);
  }

  recordQuestion(question: string): void {
    const rules = this._config.memoryRules;
    this._data.previousQuestions.push(question);
    if (this._data.previousQuestions.length > rules.maxPreviousQuestions) {
      this._data.previousQuestions = this._data.previousQuestions.slice(-rules.maxPreviousQuestions);
    }
    this._data.turnCount++;
    this._data.lastActivityAt = new Date().toISOString();
  }

  referenceRecommendation(id: string): void {
    const rules = this._config.memoryRules;
    if (!this._data.referencedRecommendations.includes(id)) {
      this._data.referencedRecommendations.push(id);
      if (this._data.referencedRecommendations.length > rules.maxReferencedItems) {
        this._data.referencedRecommendations.shift();
      }
    }
  }

  referencePrediction(id: string): void {
    const rules = this._config.memoryRules;
    if (!this._data.referencedPredictions.includes(id)) {
      this._data.referencedPredictions.push(id);
      if (this._data.referencedPredictions.length > rules.maxReferencedItems) {
        this._data.referencedPredictions.shift();
      }
    }
  }

  referenceInsight(id: string): void {
    const rules = this._config.memoryRules;
    if (!this._data.referencedInsights.includes(id)) {
      this._data.referencedInsights.push(id);
      if (this._data.referencedInsights.length > rules.maxReferencedItems) {
        this._data.referencedInsights.shift();
      }
    }
  }

  selectCategory(category: string): void {
    if (!this._data.selectedCategories.includes(category)) {
      this._data.selectedCategories.push(category);
    }
  }

  updatePreferences(prefs: Partial<ConversationPreferences>): void {
    this._data.conversationPreferences = {
      ...this._data.conversationPreferences,
      ...prefs,
    };
  }

  getData(): ConversationMemoryData {
    return { ...this._data };
  }

  get sessionId(): string {
    return this._data.sessionId;
  }

  get turnCount(): number {
    return this._data.turnCount;
  }

  get preferences(): ConversationPreferences {
    return { ...this._data.conversationPreferences };
  }

  get previousQuestions(): string[] {
    return [...this._data.previousQuestions];
  }

  isExpired(): boolean {
    const elapsed = Date.now() - new Date(this._data.lastActivityAt).getTime();
    return elapsed > this._config.memoryRules.sessionTimeoutMs;
  }

  clear(): void {
    this._data = this._createSession();
  }
}
