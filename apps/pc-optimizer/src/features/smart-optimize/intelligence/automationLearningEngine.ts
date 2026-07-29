/**
 * Automation Learning Engine — orchestrates all analyzers to produce a complete
 * learning result from historical data.
 *
 * Pipeline: History Analysis → Pattern Detection → Outcome Analysis →
 * Decision Analysis → Success Prediction → Recommendation Ranking →
 * Updated Automation Plan
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  LearningResult,
  DetectedPattern,
  OutcomeAnalysisResult,
  DecisionAnalysisResult,
  SuccessPrediction,
  RecommendationResult,
  InsightResult,
  IntelligenceStatistics,
  PredictionContext,
} from './types';
import { AutomationHistoryAnalyzer } from './automationHistoryAnalyzer';
import { AutomationOutcomeAnalyzer } from './automationOutcomeAnalyzer';
import { AutomationDecisionAnalyzer } from './automationDecisionAnalyzer';
import { AutomationPatternAnalyzer } from './automationPatternAnalyzer';
import { AutomationSuccessPredictor } from './automationSuccessPredictor';
import { AutomationRankingEngine } from './automationRankingEngine';
import { AutomationRecommendationEngine } from './automationRecommendationEngine';
import { AutomationStatistics } from './automationStatistics';
import { AutomationInsights } from './automationInsights';
import { IntelligenceValidator } from './intelligenceValidator';

export class AutomationLearningEngine {
  private _config: IntelligenceConfiguration;
  private _historyAnalyzer: AutomationHistoryAnalyzer;
  private _outcomeAnalyzer: AutomationOutcomeAnalyzer;
  private _decisionAnalyzer: AutomationDecisionAnalyzer;
  private _patternAnalyzer: AutomationPatternAnalyzer;
  private _successPredictor: AutomationSuccessPredictor;
  private _rankingEngine: AutomationRankingEngine;
  private _recommendationEngine: AutomationRecommendationEngine;
  private _statistics: AutomationStatistics;
  private _insights: AutomationInsights;
  private _validator: IntelligenceValidator;

  constructor(config: IntelligenceConfiguration) {
    this._config = config;
    this._historyAnalyzer = new AutomationHistoryAnalyzer();
    this._outcomeAnalyzer = new AutomationOutcomeAnalyzer();
    this._decisionAnalyzer = new AutomationDecisionAnalyzer();
    this._patternAnalyzer = new AutomationPatternAnalyzer(config);
    this._successPredictor = new AutomationSuccessPredictor(config);
    this._rankingEngine = new AutomationRankingEngine(config);
    this._recommendationEngine = new AutomationRecommendationEngine(config);
    this._statistics = new AutomationStatistics(this._historyAnalyzer);
    this._insights = new AutomationInsights(config);
    this._validator = new IntelligenceValidator();
  }

  learn(input: IntelligenceInput): LearningResult {
    const startTime = performance.now();

    this._historyAnalyzer.analyze(input);

    const patterns = this._config.featureFlags.enablePatternDetection
      ? this._patternAnalyzer.analyze(input).patterns
      : [];

    const outcomes = this._config.featureFlags.enableOutcomeAnalysis
      ? this._outcomeAnalyzer.analyze(input)
      : this._emptyOutcomes();

    const decisions = this._config.featureFlags.enableDecisionAnalysis
      ? this._decisionAnalyzer.analyze(input)
      : this._emptyDecisions();

    const recommendations = this._config.featureFlags.enableRecommendations
      ? this._recommendationEngine.generate(input, {
          patterns,
          outcomes,
          decisions,
          predictor: this._successPredictor,
          ranker: this._rankingEngine,
        })
      : { recommendations: [], rankedAt: new Date().toISOString(), totalConsidered: 0, futureMetadata: {} };

    const predictions = this._config.featureFlags.enableSuccessPrediction
      ? this._generatePredictions(input, patterns)
      : [];

    const statistics = this._config.featureFlags.enableStatistics
      ? this._statistics.compute(input, new Date().toISOString())
      : this._emptyStatistics(input);

    statistics.patternsDetected = patterns.length;
    statistics.recommendationsGenerated = recommendations.recommendations.length;
    statistics.predictionsMade = predictions.length;

    const insightResult = this._config.featureFlags.enableInsights
      ? this._insights.generate(input, { patterns, outcomes, decisions, statistics })
      : { insights: [], generatedAt: new Date().toISOString(), totalInsights: 0, futureMetadata: {} };

    statistics.insightsGenerated = insightResult.insights.length;

    const analysisDurationMs = performance.now() - startTime;

    return {
      patterns,
      outcomes,
      decisions,
      predictions,
      recommendations,
      insights: insightResult,
      statistics,
      analyzedAt: new Date().toISOString(),
      analysisDurationMs,
      futureMetadata: {},
    };
  }

  predictSuccess(context: PredictionContext, input: IntelligenceInput): SuccessPrediction {
    return this._successPredictor.predict(context, input);
  }

  detectPatterns(input: IntelligenceInput): DetectedPattern[] {
    return this._patternAnalyzer.analyze(input).patterns;
  }

  generateInsights(
    input: IntelligenceInput,
    patterns: DetectedPattern[],
    outcomes: OutcomeAnalysisResult,
    decisions: DecisionAnalysisResult,
    statistics: IntelligenceStatistics,
  ): InsightResult {
    return this._insights.generate(input, { patterns, outcomes, decisions, statistics });
  }

  rankRecommendations(
    recommendations: RecommendationResult['recommendations'],
    input: IntelligenceInput,
  ): RecommendationResult {
    const ranked = this._rankingEngine.rank(recommendations, input);
    return {
      recommendations: ranked.ranked,
      rankedAt: ranked.rankedAt,
      totalConsidered: recommendations.length,
      futureMetadata: {},
    };
  }

  getStatistics(input: IntelligenceInput, lastAnalysisAt: string | null = null): IntelligenceStatistics {
    return this._statistics.compute(input, lastAnalysisAt);
  }

  validate(result: LearningResult) {
    return this._validator.validateLearningResult(result);
  }

  get config(): IntelligenceConfiguration { return this._config; }

  get patternAnalyzer(): AutomationPatternAnalyzer { return this._patternAnalyzer; }
  get successPredictor(): AutomationSuccessPredictor { return this._successPredictor; }
  get rankingEngine(): AutomationRankingEngine { return this._rankingEngine; }
  get recommendationEngine(): AutomationRecommendationEngine { return this._recommendationEngine; }
  get insights(): AutomationInsights { return this._insights; }

  private _generatePredictions(input: IntelligenceInput, patterns: DetectedPattern[]): SuccessPrediction[] {
    const predictions: SuccessPrediction[] = [];
    const seen = new Set<string>();

    for (const pattern of patterns) {
      const ruleId = pattern.affectedRules[0];
      if (!ruleId || seen.has(ruleId)) continue;
      seen.add(ruleId);
      predictions.push(
        this._successPredictor.predict(
          { ruleId, riskLevel: 'low', healthScore: input.healthScore, futureMetadata: {} },
          input,
        ),
      );
    }

    if (predictions.length === 0 && input.automationHistory.length > 0) {
      predictions.push(
        this._successPredictor.predict({ healthScore: input.healthScore, futureMetadata: {} }, input),
      );
    }

    return predictions;
  }

  private _emptyOutcomes(): OutcomeAnalysisResult {
    return {
      automationMetrics: {
        acceptanceRate: 0, completionRate: 0, successRate: 0, failureRate: 0,
        rollbackFrequency: 0, averageBenefit: 0, averageConfidence: 0,
        totalSuccessful: 0, totalFailed: 0, totalRolledBack: 0,
        byOutcome: {}, byTrigger: {}, byAction: {}, futureMetadata: {},
      },
      maintenanceMetrics: {
        acceptanceRate: 0, completionRate: 0, successRate: 0, failureRate: 0,
        rollbackFrequency: 0, averageBenefit: 0, averageConfidence: 0,
        totalSuccessful: 0, totalFailed: 0, totalRolledBack: 0,
        byOutcome: {}, byTrigger: {}, byAction: {}, futureMetadata: {},
      },
      adaptiveMetrics: {
        acceptanceRate: 0, completionRate: 0, successRate: 0, failureRate: 0,
        rollbackFrequency: 0, averageBenefit: 0, averageConfidence: 0,
        totalSuccessful: 0, totalFailed: 0, totalRolledBack: 0,
        byOutcome: {}, byTrigger: {}, byAction: {}, futureMetadata: {},
      },
      overallSuccessRate: 0,
      trends: [],
      analyzedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _emptyDecisions(): DecisionAnalysisResult {
    return {
      metrics: {
        totalApprovals: 0, totalRejections: 0, totalIgnored: 0, totalCancelled: 0,
        approvalRate: 0, rejectionRate: 0, ignoreRate: 0, cancelRate: 0,
        byRule: {}, byTrigger: {}, byRiskLevel: {}, futureMetadata: {},
      },
      insights: [],
      analyzedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _emptyStatistics(input: IntelligenceInput): IntelligenceStatistics {
    return {
      totalHistoryEntries: 0,
      totalAutomationEntries: input.automationHistory.length,
      totalMaintenanceEntries: input.maintenanceHistory.length,
      totalAdaptiveEntries: input.adaptiveHistory.length,
      overallSuccessRate: 0,
      overallAcceptanceRate: 0,
      averageConfidence: 0,
      averageBenefit: 0,
      patternsDetected: 0,
      insightsGenerated: 0,
      recommendationsGenerated: 0,
      predictionsMade: 0,
      byTriggerType: {},
      byOutcome: {},
      byActionType: {},
      byMaintenanceType: {},
      topRules: [],
      lastAnalysisAt: null,
      futureMetadata: {},
    };
  }
}
