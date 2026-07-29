/**
 * Insight Configuration — default configuration and factory.
 *
 * No hardcoded values in insight logic. All rules and thresholds
 * are configurable here for future AI tuning.
 */
import type { InsightConfiguration } from './types';

export const DEFAULT_INSIGHT_CONFIG: InsightConfiguration = {
  insightVersion: '1.0.0',
  enabledTypes: [
    'morning_brief', 'evening_summary', 'optimization_summary', 'health_summary',
    'weekly_digest', 'monthly_digest', 'achievement', 'milestone', 'system_change',
    'recommendation_summary', 'maintenance_summary', 'performance_summary',
    'storage_summary', 'privacy_summary', 'windows_summary', 'security_summary',
    'automation_summary',
  ],
  priorityRules: {
    criticalThreshold: 0.85,
    importantThreshold: 0.65,
    recommendedThreshold: 0.45,
    informationalThreshold: 0.20,
  },
  expirationRules: {
    defaultExpirationHours: 24,
    morningBriefExpirationHours: 12,
    eveningSummaryExpirationHours: 12,
    achievementExpirationHours: 720,
    milestoneExpirationHours: 1440,
  },
  formattingRules: {
    defaultFormat: 'dashboard',
    maxSummaryLength: 200,
    maxDescriptionLength: 1000,
    includeEvidence: true,
    includeRecommendations: true,
  },
  maxInsights: 50,
  enableHistory: true,
  maxHistoryEntries: 100,
  enableTimeline: true,
  maxTimelineEntries: 200,
  achievementRules: [],
  milestoneRules: [],
  minConfidenceThreshold: 0.3,
};

export function createInsightConfig(
  overrides?: Partial<InsightConfiguration>,
): InsightConfiguration {
  if (!overrides) return { ...DEFAULT_INSIGHT_CONFIG };
  const merged: InsightConfiguration = {
    ...DEFAULT_INSIGHT_CONFIG,
    ...overrides,
    priorityRules: {
      ...DEFAULT_INSIGHT_CONFIG.priorityRules,
      ...overrides.priorityRules,
    },
    expirationRules: {
      ...DEFAULT_INSIGHT_CONFIG.expirationRules,
      ...overrides.expirationRules,
    },
    formattingRules: {
      ...DEFAULT_INSIGHT_CONFIG.formattingRules,
      ...overrides.formattingRules,
    },
    enabledTypes: overrides.enabledTypes ?? DEFAULT_INSIGHT_CONFIG.enabledTypes,
    achievementRules: overrides.achievementRules ?? DEFAULT_INSIGHT_CONFIG.achievementRules,
    milestoneRules: overrides.milestoneRules ?? DEFAULT_INSIGHT_CONFIG.milestoneRules,
  };
  return merged;
}
