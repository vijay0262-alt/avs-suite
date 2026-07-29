/**
 * Response Composer — composes structured responses.
 *
 * Each response includes:
 *   Summary, Detailed Explanation, Supporting Facts, Supporting Evidence,
 *   Confidence, Related Recommendations/Predictions/Insights,
 *   Suggested Follow-up Questions, Future Metadata.
 */
import type {
  ConversationIntentType,
  ConversationResponse,
  ConversationContext,
  Explanation,
  TaskPlan,
  SupportingFact,
  ConversationConfiguration,
  IntentDefinition,
} from './types';
import { generateResponseId, clampScore } from './types';

export class ResponseComposer {
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration) {
    this._config = config;
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  compose(
    conversationId: string,
    intent: ConversationIntentType,
    intentDef: IntentDefinition | undefined,
    context: ConversationContext,
    explanation: Explanation,
    taskPlan: TaskPlan | null,
  ): ConversationResponse {
    const summary = this._buildSummary(intent, context);
    const detailedExplanation = this._buildDetailedExplanation(intent, context, explanation);
    const supportingFacts = this._buildSupportingFacts(context);
    const supportingEvidence = explanation.evidence;
    const confidence = this._calculateConfidence(context, explanation);
    const relatedRecs = this._buildRelatedRecommendations(context);
    const relatedPreds = this._buildRelatedPredictions(context);
    const relatedInsights = this._buildRelatedInsights(context);
    const followUps = this._buildFollowUps(intentDef, context);

    return {
      id: generateResponseId(),
      conversationId,
      timestamp: new Date().toISOString(),
      intent,
      summary,
      detailedExplanation,
      supportingFacts,
      supportingEvidence,
      confidence: clampScore(confidence),
      relatedRecommendations: relatedRecs,
      relatedPredictions: relatedPreds,
      relatedInsights,
      suggestedFollowUpQuestions: followUps,
      taskPlan,
      explanation,
      futureMetadata: {
        orchestratorVersion: this._config.orchestratorVersion,
        contextId: context.contextId,
        evidenceCount: context.metadata.evidenceCount,
      },
    };
  }

  // ── Private ────────────────────────────────────────────────

  private _buildSummary(intent: ConversationIntentType, ctx: ConversationContext): string {
    if (ctx.healthSummary) {
      return `System health: ${ctx.healthSummary.overallScore}/100. ${ctx.healthSummary.issueCount} issues detected.`;
    }
    if (ctx.storageSummary) {
      return `Storage: ${ctx.storageSummary.usagePercent}% used.`;
    }
    return 'System analysis complete. See detailed explanation for more information.';
  }

  private _buildDetailedExplanation(
    intent: ConversationIntentType,
    ctx: ConversationContext,
    explanation: Explanation,
  ): string {
    const parts: string[] = [
      explanation.whatHappened,
      '',
      `Why: ${explanation.whyItHappened}`,
      '',
      `Confidence: ${(explanation.confidence * 100).toFixed(0)}%`,
      '',
      `Suggested next step: ${explanation.suggestedNextStep}`,
      '',
      `Future impact: ${explanation.futureImpact}`,
    ];

    if (explanation.assumptions.length > 0) {
      parts.push('', 'Assumptions:');
      for (const a of explanation.assumptions) {
        parts.push(`  - ${a}`);
      }
    }

    return parts.join('\n');
  }

  private _buildSupportingFacts(ctx: ConversationContext): SupportingFact[] {
    const facts: SupportingFact[] = [];

    if (ctx.healthSummary) {
      facts.push({ fact: `Health score: ${ctx.healthSummary.overallScore}`, source: 'health', confidence: 0.9 });
      facts.push({ fact: `CPU score: ${ctx.healthSummary.cpuScore}`, source: 'health', confidence: 0.9 });
      facts.push({ fact: `RAM score: ${ctx.healthSummary.ramScore}`, source: 'health', confidence: 0.9 });
    }
    if (ctx.storageSummary) {
      facts.push({ fact: `Storage usage: ${ctx.storageSummary.usagePercent}%`, source: 'storage', confidence: 0.95 });
    }
    if (ctx.performanceSummary) {
      facts.push({ fact: `CPU usage: ${ctx.performanceSummary.cpuUsage}%`, source: 'performance', confidence: 0.95 });
      facts.push({ fact: `RAM usage: ${ctx.performanceSummary.ramUsage}%`, source: 'performance', confidence: 0.95 });
    }
    if (ctx.knowledgeSummary) {
      facts.push({ fact: `Knowledge facts: ${ctx.knowledgeSummary.totalFacts}`, source: 'knowledge', confidence: ctx.knowledgeSummary.averageConfidence });
    }
    if (ctx.recommendationSummary) {
      facts.push({ fact: `Recommendations: ${ctx.recommendationSummary.totalRecommendations}`, source: 'recommendations', confidence: 0.8 });
    }
    if (ctx.predictionSummary) {
      facts.push({ fact: `Predictions: ${ctx.predictionSummary.totalPredictions}`, source: 'predictions', confidence: 0.7 });
    }

    return facts.slice(0, this._config.contextLimits.maxFacts);
  }

  private _calculateConfidence(ctx: ConversationContext, explanation: Explanation): number {
    const weights: number[] = [explanation.confidence];

    if (ctx.knowledgeSummary) {
      weights.push(ctx.knowledgeSummary.averageConfidence);
    }
    if (ctx.metadata.evidenceCount > 5) {
      weights.push(0.9);
    } else if (ctx.metadata.evidenceCount > 0) {
      weights.push(0.5);
    } else {
      weights.push(0.1);
    }

    return weights.reduce((a: number, b: number) => a + b, 0) / weights.length;
  }

  private _buildRelatedRecommendations(ctx: ConversationContext) {
    if (!ctx.recommendationSummary) return [];
    return ctx.recommendationSummary.topRecommendations.map((r) => ({
      id: r.id,
      title: r.title,
      priority: r.priority,
    }));
  }

  private _buildRelatedPredictions(ctx: ConversationContext) {
    if (!ctx.predictionSummary) return [];
    return ctx.predictionSummary.topPredictions.map((p) => ({
      id: p.id,
      title: p.title,
      riskLevel: p.riskLevel,
    }));
  }

  private _buildRelatedInsights(ctx: ConversationContext) {
    if (!ctx.insightSummary) return [];
    return ctx.insightSummary.topInsights.map((i) => ({
      id: i.id,
      title: i.title,
      priority: i.priority,
    }));
  }

  private _buildFollowUps(intentDef: IntentDefinition | undefined, ctx: ConversationContext): string[] {
    const base = intentDef?.suggestedFollowUps ?? [];
    const dynamic: string[] = [];

    if (ctx.recommendationSummary && ctx.recommendationSummary.totalRecommendations > 0) {
      dynamic.push('What are the top recommendations?');
    }
    if (ctx.predictionSummary && ctx.predictionSummary.totalPredictions > 0) {
      dynamic.push('What predictions do you have?');
    }
    if (ctx.healthSummary && ctx.healthSummary.overallScore < 70) {
      dynamic.push('How can I improve my health score?');
    }

    const max = this._config.contextLimits.summaryModeThreshold;
    return [...base, ...dynamic].slice(0, max);
  }
}
