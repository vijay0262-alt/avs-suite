/**
 * Conversation Engine — orchestrates the full conversation
 * pipeline.
 *
 * Pipeline:
 *   User Question → Safety Check → Question Classification →
 *   Context Building → Explanation Generation → Response Building →
 *   History Recording → Event Emission
 *
 * Supports:
 *   Follow-up questions, conversation history, context awareness,
 *   session persistence, topic switching
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  AssistantContext,
  ConversationMessage,
  AssistantExplanation,
  AssistantInsight,
  AssistantDashboardData,
} from './types';
import { sanitizeContent, isSafeContent } from './types';
import { AssistantContextBuilder } from './assistantContextBuilder';
import { QuestionRouter } from './questionRouter';
import { ExplanationEngine } from './explanationEngine';
import { InsightGenerator } from './insightGenerator';
import { RecommendationExplainer } from './recommendationExplainer';
import { ConversationHistory } from './conversationHistory';
import { assistantEvents } from './assistantEvents';

export interface ConversationResponse {
  message: ConversationMessage;
  explanation: AssistantExplanation;
  sessionId: string;
  followUpSuggestions: string[];
}

export class ConversationEngine {
  private _contextBuilder: AssistantContextBuilder;
  private _questionRouter: QuestionRouter;
  private _explanationEngine: ExplanationEngine;
  private _insightGenerator: InsightGenerator;
  private _recommendationExplainer: RecommendationExplainer;
  private _history: ConversationHistory;
  private _currentContext: AssistantContext | null;

  constructor(
    contextBuilder?: AssistantContextBuilder,
    questionRouter?: QuestionRouter,
    explanationEngine?: ExplanationEngine,
    insightGenerator?: InsightGenerator,
    recommendationExplainer?: RecommendationExplainer,
    history?: ConversationHistory,
  ) {
    this._contextBuilder = contextBuilder ?? new AssistantContextBuilder();
    this._questionRouter = questionRouter ?? new QuestionRouter();
    this._explanationEngine = explanationEngine ?? new ExplanationEngine();
    this._insightGenerator = insightGenerator ?? new InsightGenerator();
    this._recommendationExplainer = recommendationExplainer ?? new RecommendationExplainer();
    this._history = history ?? new ConversationHistory();
    this._currentContext = null;
  }

  setContext(context: AssistantContext): void {
    this._currentContext = context;
    const sessionId = this._history.getActiveSessionId();
    if (sessionId) {
      this._history.setContext(sessionId, context);
    }
  }

  startSession(context: AssistantContext | null = null): string {
    if (context) this._currentContext = context;
    const sessionId = this._history.startSession(this._currentContext);
    assistantEvents.emit('assistant_started', { sessionId, timestamp: new Date().toISOString() });
    return sessionId;
  }

  ask(question: string, sessionId?: string): ConversationResponse {
    if (!isSafeContent(question)) {
      return this._safetyRejection(sessionId);
    }

    const sanitized = sanitizeContent(question);
    const activeSession = sessionId ?? this._history.getActiveSessionId() ?? this.startSession();

    if (!this._currentContext) {
      this._currentContext = this._history.getContext(activeSession);
    }

    const context = this._currentContext ?? this._contextBuilder.build({});

    const classification = this._questionRouter.classify(sanitized);
    const isFollowUp = this._questionRouter.isFollowUp(
      sanitized,
      this._history.getTopic(activeSession),
    );

    this._history.addMessage(activeSession, 'user', sanitized, classification.type);

    const explanation = this._explanationEngine.explainByType(classification.type, context);

    const responseContent = this._buildResponseContent(explanation);

    const assistantMessage = this._history.addMessage(
      activeSession,
      'assistant',
      responseContent,
      classification.type,
      explanation,
      { isFollowUp, keywords: classification.keywords },
    );

    if (!assistantMessage) {
      assistantEvents.emit('assistant_failed', {
        error: 'Failed to add assistant message',
        sessionId: activeSession,
        timestamp: new Date().toISOString(),
      });
      return this._errorResponse(activeSession);
    }

    assistantEvents.emit('assistant_response_generated', {
      message: assistantMessage,
      sessionId: activeSession,
    });

    assistantEvents.emit('assistant_history_updated', {
      sessionId: activeSession,
      messageCount: this._history.getMessageCount(activeSession),
    });

    return {
      message: assistantMessage,
      explanation,
      sessionId: activeSession,
      followUpSuggestions: explanation.followUpSuggestions,
    };
  }

  getInsights(): AssistantInsight[] {
    if (!this._currentContext) return [];
    return this._insightGenerator.generate(this._currentContext);
  }

  getTopInsights(limit: number): AssistantInsight[] {
    if (!this._currentContext) return [];
    return this._insightGenerator.generateTop(this._currentContext, limit);
  }

  getDashboardData(): AssistantDashboardData {
    const ctx = this._currentContext ?? this._contextBuilder.build({});
    const insights = this._insightGenerator.generateTop(ctx, 3);
    const recommendations = this._contextBuilder.getRecommendations(ctx).slice(0, 3);

    return {
      quickQuestions: this._questionRouter.getQuickQuestions(),
      suggestedInsights: insights,
      recommendedActions: recommendations.map((r) => ({
        label: r.title,
        description: `Priority: ${r.priority}`,
        benefit: `+${r.estimatedBenefit} points`,
      })),
      healthScore: this._contextBuilder.getOverallScore(ctx),
      healthLevel: ctx.healthReport?.overall.level ?? null,
      isAvailable: this._contextBuilder.hasHealthData(ctx),
    };
  }

  getHistory(): ConversationHistory {
    return this._history;
  }

  explainRecommendation(recommendationId: string): { title: string; why: string; risk: string; benefit: string; estimatedTime: string; estimatedRecovery: string; requiredCapability: string | null; alternatives: string[] } | null {
    if (!this._currentContext) return null;
    const report = this._currentContext.healthReport;
    if (!report) return null;
    const rec = report.recommendations.find((r) => r.id === recommendationId);
    if (!rec) return null;
    const explanation = this._recommendationExplainer.explainRecommendation(rec, this._currentContext);
    return {
      title: explanation.title,
      why: explanation.whyRecommended,
      risk: explanation.risk,
      benefit: explanation.benefit,
      estimatedTime: explanation.estimatedTime,
      estimatedRecovery: explanation.estimatedRecovery,
      requiredCapability: explanation.requiredCapability,
      alternatives: explanation.alternativeActions,
    };
  }

  private _buildResponseContent(explanation: AssistantExplanation): string {
    const parts: string[] = [explanation.summary];

    if (explanation.currentData) {
      parts.push(`\n**Current Data:** ${explanation.currentData}`);
    }
    if (explanation.reasoning) {
      parts.push(`\n**Reasoning:** ${explanation.reasoning}`);
    }
    if (explanation.evidence.length > 0) {
      parts.push('\n**Evidence:**');
      for (const e of explanation.evidence) {
        parts.push(`  • ${e.source}: ${e.data}`);
      }
    }
    if (explanation.recommendedAction) {
      parts.push(`\n**Recommended Action:** ${explanation.recommendedAction.title} — ${explanation.recommendedAction.description}`);
    }
    if (explanation.expectedBenefit) {
      parts.push(`\n**Expected Benefit:** ${explanation.expectedBenefit}`);
    }
    parts.push(`\n**Confidence:** ${Math.round(explanation.confidence * 100)}%`);

    if (explanation.followUpSuggestions.length > 0) {
      parts.push('\n**You can also ask:**');
      for (const s of explanation.followUpSuggestions) {
        parts.push(`  • ${s}`);
      }
    }

    return parts.join('\n');
  }

  private _safetyRejection(sessionId?: string): ConversationResponse {
    const activeSession = sessionId ?? this._history.getActiveSessionId() ?? this.startSession();
    this._history.addMessage(activeSession, 'user', '[content blocked by safety filter]');
    const msg = this._history.addMessage(
      activeSession,
      'assistant',
      'I cannot process that request for security reasons. I never expose passwords, private file contents, or file hashes.',
    )!;
    return {
      message: msg,
      explanation: {
        questionType: 'unknown',
        summary: 'Request blocked by safety filter.',
        currentData: 'N/A',
        reasoning: 'The question contained sensitive content that was blocked.',
        evidence: [],
        recommendedAction: null,
        expectedBenefit: 'N/A',
        confidence: 1,
        followUpSuggestions: [],
      },
      sessionId: activeSession,
      followUpSuggestions: [],
    };
  }

  private _errorResponse(sessionId: string): ConversationResponse {
    const msg: ConversationMessage = {
      id: 'error',
      role: 'assistant',
      content: 'An error occurred while processing your question.',
      timestamp: new Date().toISOString(),
      questionType: null,
      explanation: null,
      metadata: null,
    };
    return {
      message: msg,
      explanation: {
        questionType: 'unknown',
        summary: 'Error',
        currentData: 'N/A',
        reasoning: 'An internal error occurred.',
        evidence: [],
        recommendedAction: null,
        expectedBenefit: 'N/A',
        confidence: 0,
        followUpSuggestions: [],
      },
      sessionId,
      followUpSuggestions: [],
    };
  }
}

export const conversationEngine = new ConversationEngine();
