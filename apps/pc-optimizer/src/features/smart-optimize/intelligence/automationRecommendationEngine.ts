/**
 * Automation Recommendation Engine — generates explainable recommendations.
 *
 * Every recommendation includes: reason, supporting evidence, confidence,
 * historical success, expected benefit, risk, priority, affected profiles,
 * success prediction, and alternative recommendation.
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  IntelligenceRecommendation,
  RecommendationResult,
  RecommendationPlugin,
  DetectedPattern,
  OutcomeAnalysisResult,
  DecisionAnalysisResult,
  Evidence,
  RiskLevel,
  RecommendationPriority,
} from './types';
import {
  generateRecommendationId,
  scoreToRisk,
  scoreToPriority,
} from './types';
import type { AutomationSuccessPredictor } from './automationSuccessPredictor';
import type { AutomationRankingEngine } from './automationRankingEngine';

export interface RecommendationContext {
  patterns: DetectedPattern[];
  outcomes: OutcomeAnalysisResult;
  decisions: DecisionAnalysisResult;
  predictor: AutomationSuccessPredictor;
  ranker: AutomationRankingEngine;
}

export class AutomationRecommendationEngine {
  private _config: IntelligenceConfiguration;
  private _plugins: RecommendationPlugin[] = [];

  constructor(config: IntelligenceConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: RecommendationPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  generate(input: IntelligenceInput, context: RecommendationContext): RecommendationResult {
    const recommendations: IntelligenceRecommendation[] = [];

    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const rec = plugin.generate(input);
        if (rec) recommendations.push(rec);
      }
    }

    const builtin = this._generateBuiltin(input, context);
    recommendations.push(...builtin);

    const ranked = context.ranker.rank(recommendations, input);

    return {
      recommendations: ranked.ranked,
      rankedAt: ranked.rankedAt,
      totalConsidered: recommendations.length,
      futureMetadata: {},
    };
  }

  private _generateBuiltin(input: IntelligenceInput, context: RecommendationContext): IntelligenceRecommendation[] {
    const recs: IntelligenceRecommendation[] = [];

    for (const pattern of context.patterns) {
      const rec = this._patternToRecommendation(pattern, input, context);
      if (rec) recs.push(rec);
    }

    if (context.outcomes.overallSuccessRate < 0.5 && input.automationHistory.length > 5) {
      recs.push(this._lowSuccessRateRecommendation(input, context));
    }

    if (context.decisions.metrics.ignoreRate > 0.3) {
      recs.push(this._highIgnoreRateRecommendation(input, context));
    }

    if (context.decisions.metrics.rejectionRate > 0.4) {
      recs.push(this._highRejectionRateRecommendation(input, context));
    }

    if (input.healthScore < 40) {
      recs.push(this._lowHealthScoreRecommendation(input, context));
    }

    return recs;
  }

  private _patternToRecommendation(
    pattern: DetectedPattern,
    input: IntelligenceInput,
    context: RecommendationContext,
  ): IntelligenceRecommendation | null {
    const ruleIds = pattern.affectedRules.length > 0 ? pattern.affectedRules : [];
    const historicalSuccess = pattern.confidence;
    const expectedBenefit = pattern.frequency > 0 ? Math.min(pattern.frequency / 10, 1.0) : 0.5;
    const risk: RiskLevel = scoreToRisk(1.0 - pattern.confidence);
    const priority: RecommendationPriority = scoreToPriority(pattern.confidence);

    const prediction = context.predictor.predict(
      { ruleId: ruleIds[0], riskLevel: risk, healthScore: input.healthScore, futureMetadata: {} },
      input,
    );

    const evidence: Evidence[] = [
      ...pattern.supportingEvidence,
      {
        source: 'pattern_analysis',
        metric: 'pattern_confidence',
        value: pattern.confidence,
        timestamp: new Date().toISOString(),
        description: `Pattern "${pattern.name}" detected with ${(pattern.confidence * 100).toFixed(0)}% confidence`,
        futureMetadata: {},
      },
    ];

    const reason = this._patternReason(pattern);

    const alternative = this._generateAlternative(pattern, input, context);

    return {
      id: generateRecommendationId(),
      reason,
      supportingEvidence: evidence,
      confidence: pattern.confidence,
      historicalSuccess,
      expectedBenefit,
      risk,
      priority,
      affectedProfiles: (pattern.metadata['affectedProfiles'] as string[]) ?? [],
      affectedRules: ruleIds,
      successPrediction: prediction,
      alternativeRecommendation: alternative,
      rank: 0,
      rankScore: 0,
      futureMetadata: {},
    };
  }

  private _patternReason(pattern: DetectedPattern): string {
    switch (pattern.type) {
      case 'frequently_accepted':
        return `Rule(s) ${pattern.affectedRules.join(', ')} are frequently accepted — consider enabling auto-approval for low-risk variants`;
      case 'frequently_rejected':
        return `Rule(s) ${pattern.affectedRules.join(', ')} are frequently rejected — consider adjusting conditions or lowering risk`;
      case 'best_maintenance_windows':
        return `Best maintenance windows detected — schedule automation during these hours for higher success`;
      case 'most_effective_profiles':
        return `Device profiles ${((pattern.metadata['affectedProfiles'] as string[]) ?? []).join(', ')} show best outcomes — prioritize automation for these profiles`;
      case 'most_successful_strategies':
        return `Most successful strategies detected — favor these optimization types for better results`;
      case 'most_beneficial_recommendations':
        return `Actions ${pattern.affectedActions.join(', ')} show highest benefit — prioritize these in future plans`;
      case 'recurring_problems':
        return `Recurring problems detected — consider more aggressive or frequent optimization for these issues`;
      case 'recurring_improvements':
        return `Recurring improvements detected — these optimizations consistently deliver results`;
      case 'frequently_deferred':
        return `Rule(s) ${pattern.affectedRules.join(', ')} are frequently deferred — consider adjusting cooldown or safety policies`;
      case 'frequently_cancelled':
        return `Rule(s) ${pattern.affectedRules.join(', ')} are frequently cancelled — review trigger conditions and timing`;
      default:
        return pattern.description;
    }
  }

  private _generateAlternative(
    pattern: DetectedPattern,
    input: IntelligenceInput,
    context: RecommendationContext,
  ): IntelligenceRecommendation | null {
    if (pattern.type === 'frequently_rejected') {
      const altRisk: RiskLevel = 'low';
      const altPrediction = context.predictor.predict(
        { ruleId: pattern.affectedRules[0], riskLevel: altRisk, healthScore: input.healthScore, futureMetadata: {} },
        input,
      );
      return {
        id: generateRecommendationId(),
        reason: `Alternative: Lower risk version of rule(s) ${pattern.affectedRules.join(', ')} may have higher acceptance`,
        supportingEvidence: pattern.supportingEvidence,
        confidence: pattern.confidence * 0.8,
        historicalSuccess: pattern.confidence * 0.6,
        expectedBenefit: 0.3,
        risk: altRisk,
        priority: 'medium',
        affectedProfiles: [],
        affectedRules: pattern.affectedRules,
        successPrediction: altPrediction,
        alternativeRecommendation: null,
        rank: 0,
        rankScore: 0,
        futureMetadata: {},
      };
    }
    return null;
  }

  private _lowSuccessRateRecommendation(
    input: IntelligenceInput,
    context: RecommendationContext,
  ): IntelligenceRecommendation {
    const evidence: Evidence[] = [
      {
        source: 'outcome_analysis',
        metric: 'overall_success_rate',
        value: context.outcomes.overallSuccessRate,
        timestamp: new Date().toISOString(),
        description: `Overall success rate is ${(context.outcomes.overallSuccessRate * 100).toFixed(1)}% — below 50% threshold`,
        futureMetadata: {},
      },
    ];
    const prediction = context.predictor.predict({ riskLevel: 'medium', healthScore: input.healthScore, futureMetadata: {} }, input);
    return {
      id: generateRecommendationId(),
      reason: 'Overall automation success rate is below 50% — review and disable underperforming rules',
      supportingEvidence: evidence,
      confidence: 0.7,
      historicalSuccess: context.outcomes.overallSuccessRate,
      expectedBenefit: 0.4,
      risk: 'medium',
      priority: 'high',
      affectedProfiles: [],
      affectedRules: [],
      successPrediction: prediction,
      alternativeRecommendation: null,
      rank: 0,
      rankScore: 0,
      futureMetadata: {},
    };
  }

  private _highIgnoreRateRecommendation(
    input: IntelligenceInput,
    context: RecommendationContext,
  ): IntelligenceRecommendation {
    const evidence: Evidence[] = [
      {
        source: 'decision_analysis',
        metric: 'ignore_rate',
        value: context.decisions.metrics.ignoreRate,
        timestamp: new Date().toISOString(),
        description: `Ignore rate is ${(context.decisions.metrics.ignoreRate * 100).toFixed(1)}% — above 30% threshold`,
        futureMetadata: {},
      },
    ];
    const prediction = context.predictor.predict({ riskLevel: 'low', healthScore: input.healthScore, futureMetadata: {} }, input);
    return {
      id: generateRecommendationId(),
      reason: 'High ignore rate detected — recommendations may not be relevant enough. Consider tightening trigger conditions.',
      supportingEvidence: evidence,
      confidence: 0.65,
      historicalSuccess: 1.0 - context.decisions.metrics.ignoreRate,
      expectedBenefit: 0.3,
      risk: 'low',
      priority: 'medium',
      affectedProfiles: [],
      affectedRules: [],
      successPrediction: prediction,
      alternativeRecommendation: null,
      rank: 0,
      rankScore: 0,
      futureMetadata: {},
    };
  }

  private _highRejectionRateRecommendation(
    input: IntelligenceInput,
    context: RecommendationContext,
  ): IntelligenceRecommendation {
    const evidence: Evidence[] = [
      {
        source: 'decision_analysis',
        metric: 'rejection_rate',
        value: context.decisions.metrics.rejectionRate,
        timestamp: new Date().toISOString(),
        description: `Rejection rate is ${(context.decisions.metrics.rejectionRate * 100).toFixed(1)}% — above 40% threshold`,
        futureMetadata: {},
      },
    ];
    const prediction = context.predictor.predict({ riskLevel: 'medium', healthScore: input.healthScore, futureMetadata: {} }, input);
    return {
      id: generateRecommendationId(),
      reason: 'High rejection rate — users are rejecting automation. Consider adjusting approval policies or risk thresholds.',
      supportingEvidence: evidence,
      confidence: 0.7,
      historicalSuccess: 1.0 - context.decisions.metrics.rejectionRate,
      expectedBenefit: 0.5,
      risk: 'medium',
      priority: 'high',
      affectedProfiles: [],
      affectedRules: [],
      successPrediction: prediction,
      alternativeRecommendation: null,
      rank: 0,
      rankScore: 0,
      futureMetadata: {},
    };
  }

  private _lowHealthScoreRecommendation(
    input: IntelligenceInput,
    _context: RecommendationContext,
  ): IntelligenceRecommendation {
    const evidence: Evidence[] = [
      {
        source: 'system_state',
        metric: 'health_score',
        value: input.healthScore,
        timestamp: new Date().toISOString(),
        description: `Health score is ${input.healthScore}/100 — below 40 threshold`,
        futureMetadata: {},
      },
    ];
    return {
      id: generateRecommendationId(),
      reason: `Health score is low (${input.healthScore}/100) — recommend immediate optimization plan generation`,
      supportingEvidence: evidence,
      confidence: 0.8,
      historicalSuccess: 0.6,
      expectedBenefit: 0.7,
      risk: 'medium',
      priority: 'high',
      affectedProfiles: [input.deviceProfileType],
      affectedRules: [],
      successPrediction: null,
      alternativeRecommendation: null,
      rank: 0,
      rankScore: 0,
      futureMetadata: {},
    };
  }
}
