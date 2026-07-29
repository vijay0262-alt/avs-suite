/**
 * Smart Optimize 2.0 — Automation Intelligence Engine
 *
 * EPIC 4 PHASE A PART 6 — Barrel Export
 *
 * Analyzes historical automation outcomes, user decisions, and optimization
 * results to continuously improve future automation recommendations.
 * Every recommendation is deterministic and fully explainable.
 * Does NOT use machine learning. Does NOT execute optimizations.
 */

// Types
export type {
  IntelligenceInput,
  PatternType,
  DetectedPattern,
  PatternAnalysisResult,
  OutcomeMetrics,
  OutcomeAnalysisResult,
  OutcomeTrend,
  TrendDirection,
  DecisionMetrics,
  DecisionBreakdown,
  DecisionAnalysisResult,
  SuccessPrediction,
  PredictionFactor,
  PredictionContext,
  IntelligenceRecommendation,
  RecommendationResult,
  RankingFactor,
  RankingWeight,
  RankingResult,
  InsightType,
  IntelligenceInsight,
  InsightResult,
  Evidence,
  IntelligenceStatistics,
  RuleStatistic,
  LearningResult,
  IntelligenceValidationResult,
  IntelligenceValidationError,
  IntelligenceValidationWarning,
  IntelligenceEventType,
  IntelligenceEvent,
  IntelligenceEventListener,
  IntelligenceConfiguration,
  PatternRule,
  PredictionRule,
  HistoryRetentionConfig,
  IntelligenceFeatureFlags,
  PatternAnalyzerPlugin,
  OutcomeAnalyzerPlugin,
  SuccessPredictorPlugin,
  RankingPlugin,
  RecommendationPlugin,
  InsightPlugin,
} from './types';

// Re-export shared types for convenience
export type {
  RiskLevel,
  RecommendationPriority,
  SystemState,
  AutomationHistoryEntry,
  AutomationTriggerType,
  AutomationActionType,
  MaintenanceHistoryEntry,
  MaintenanceType,
  AdaptiveHistoryEntry,
} from './types';

// Helpers
export {
  createDefaultIntelligenceConfiguration,
  generateIntelligenceId,
  generatePatternId,
  generatePredictionId,
  generateRecommendationId,
  generateInsightId,
  generateTrendId,
  generateRuleStatId,
  riskToScore,
  priorityToScore,
  scoreToRisk,
  scoreToPriority,
  createDefaultIntelligenceInput,
} from './types';

// Configuration
export {
  DEFAULT_INTELLIGENCE_CONFIGURATION,
  createIntelligenceConfiguration,
} from './intelligenceConfiguration';
export type { DeepPartial as IntelligenceDeepPartial } from './intelligenceConfiguration';

// Events
export { IntelligenceEvents } from './intelligenceEvents';

// History Analyzer
export { AutomationHistoryAnalyzer } from './automationHistoryAnalyzer';
export type { HistoryAnalysisSummary } from './automationHistoryAnalyzer';

// Outcome Analyzer
export { AutomationOutcomeAnalyzer } from './automationOutcomeAnalyzer';

// Decision Analyzer
export { AutomationDecisionAnalyzer } from './automationDecisionAnalyzer';

// Pattern Analyzer
export { AutomationPatternAnalyzer } from './automationPatternAnalyzer';

// Success Predictor
export { AutomationSuccessPredictor } from './automationSuccessPredictor';

// Ranking Engine
export { AutomationRankingEngine } from './automationRankingEngine';

// Recommendation Engine
export { AutomationRecommendationEngine } from './automationRecommendationEngine';
export type { RecommendationContext } from './automationRecommendationEngine';

// Statistics
export { AutomationStatistics } from './automationStatistics';

// Insights
export { AutomationInsights } from './automationInsights';
export type { InsightContext } from './automationInsights';

// Validator
export { IntelligenceValidator } from './intelligenceValidator';

// Learning Engine
export { AutomationLearningEngine } from './automationLearningEngine';

// Manager
export { AutomationIntelligenceManager } from './automationIntelligenceManager';
