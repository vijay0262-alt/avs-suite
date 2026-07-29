/**
 * Recommendation Configuration — default configuration and factory.
 *
 * No hardcoded values in scoring logic. All weights and thresholds
 * are configurable here for future AI tuning.
 */
import type { RecommendationConfiguration } from './types';

export const DEFAULT_RECOMMENDATION_CONFIG: RecommendationConfiguration = {
  scoringWeights: {
    impact: 0.35,
    safety: 0.25,
    urgency: 0.20,
    effort: 0.10,
    confidence: 0.10,
  },
  priorityThresholds: {
    critical: 0.85,
    high: 0.70,
    medium: 0.50,
    low: 0.30,
  },
  enabledCategories: [
    'performance', 'storage', 'browser', 'privacy', 'windows',
    'startup', 'duplicates', 'security', 'maintenance', 'automation', 'health',
  ],
  minConfidenceThreshold: 0.3,
  minSafetyThreshold: 0.5,
  maxRecommendations: 50,
  recommendationVersion: '1.0.0',
  quickWinMaxTime: 120,
  quickWinMinImpact: 0.5,
  quickWinMinSafety: 0.8,
  quickWinMaxEffort: 0.3,
  autoExpirationHours: 24,
  enableHistory: true,
  maxHistoryEntries: 100,
};

export function createRecommendationConfig(
  overrides?: Partial<RecommendationConfiguration>,
): RecommendationConfiguration {
  if (!overrides) return { ...DEFAULT_RECOMMENDATION_CONFIG };
  const merged: RecommendationConfiguration = {
    ...DEFAULT_RECOMMENDATION_CONFIG,
    ...overrides,
    scoringWeights: {
      ...DEFAULT_RECOMMENDATION_CONFIG.scoringWeights,
      ...overrides.scoringWeights,
    },
    priorityThresholds: {
      ...DEFAULT_RECOMMENDATION_CONFIG.priorityThresholds,
      ...overrides.priorityThresholds,
    },
    enabledCategories: overrides.enabledCategories ?? DEFAULT_RECOMMENDATION_CONFIG.enabledCategories,
  };
  return merged;
}
