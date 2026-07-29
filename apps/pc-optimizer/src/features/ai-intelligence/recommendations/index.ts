/**
 * AI Recommendation Engine — Barrel Export.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every recommendation must be
 *    evidence-based, scored, and traceable back to knowledge facts."
 *
 * The Recommendation Engine transforms KnowledgeObjects into prioritized,
 * explainable, evidence-based recommendations.
 *
 * It NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY produces structured recommendations.
 *
 * Pipeline:
 *   Knowledge Object → Recommendation Engine → Scorer →
 *   Ranker → Filter → Recommendation List → Future Consumers
 *
 * Future consumers: Dashboard, AI Assistant, Smart Optimize, Automation, Reports.
 */

// Types
export type {
  RecommendationCategory,
  RecommendationPriority,
  RiskLevel,
  RecommendationScores,
  RecommendationEvidence,
  RecommendationBenefits,
  RecommendationSafety,
  Recommendation,
  RecommendationStatus,
  RecommendationList,
  RecommendationListMetadata,
  RecommendationStatistics,
  RecommendationValidationIssue,
  RecommendationValidationResult,
  RecommendationFilter,
  ScoringWeights,
  PriorityThresholds,
  RecommendationConfiguration,
  RecommendationEventType,
  RecommendationEventListener,
  RecommendationBuilderPlugin,
  RecommendationHistoryEntry,
} from './types';

export {
  generateRecommendationId,
  generateRecommendationListId,
  clampScore,
  createRecommendationEvidence,
  createDefaultSafety,
  createDefaultBenefits,
} from './types';

// Events
export { RecommendationEventEmitter, recommendationEvents } from './recommendationEvents';

// Configuration
export { DEFAULT_RECOMMENDATION_CONFIG, createRecommendationConfig } from './recommendationConfiguration';

// Registry
export { RecommendationRegistry } from './recommendationRegistry';

// Scorer
export { RecommendationScorer } from './recommendationScorer';

// Ranker
export { RecommendationRanker } from './recommendationRanker';

// Filter
export { RecommendationFilterer } from './recommendationFilter';

// Validator
export { RecommendationValidator } from './recommendationValidator';

// History
export { RecommendationHistory } from './recommendationHistory';

// Engine
export { RecommendationEngine } from './recommendationEngine';

// Builder
export { RecommendationBuilder } from './recommendationBuilder';

// Manager
export { RecommendationManager, recommendationManager } from './recommendationManager';
