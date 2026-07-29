/**
 * AI Insight Engine — Barrel Export.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every insight must be
 *    evidence-based, traceable back to knowledge facts and recommendations."
 *
 * The Insight Engine transforms Knowledge and Recommendations into
 * personalized, explainable summaries that users can easily understand.
 *
 * It NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY produces intelligent insights.
 *
 * Pipeline:
 *   Context → Knowledge → Recommendations → Insight Engine →
 *   Dashboard, AI Assistant, Reports, Notifications, Future Mobile App
 *
 * Future consumers: Dashboard, AI Assistant, Reports, Notifications,
 * Mobile App, Email Reports.
 */

// Types
export type {
  InsightType,
  InsightCategory,
  InsightPriority,
  InsightStatus,
  InsightOutputFormat,
  InsightEvidence,
  Insight,
  InsightList,
  InsightListMetadata,
  InsightStatistics,
  InsightValidationIssue,
  InsightValidationResult,
  InsightFilter,
  TimelinePeriod,
  TimelineEntry,
  InsightTimeline,
  Achievement,
  AchievementRule,
  Milestone,
  MilestoneRule,
  FormattedInsight,
  PriorityRules,
  ExpirationRules,
  FormattingRules,
  InsightConfiguration,
  InsightEventType,
  InsightEventListener,
  InsightProviderPlugin,
  InsightHistoryEntry,
  PersonalizationContext,
} from './types';

export {
  generateInsightId,
  generateInsightListId,
  generateTimelineEntryId,
  generateAchievementId,
  generateMilestoneId,
  clampScore,
  createInsightEvidence,
  estimateReadingTime,
} from './types';

// Events
export { InsightEventEmitter, insightEvents } from './insightEvents';

// Configuration
export { DEFAULT_INSIGHT_CONFIG, createInsightConfig } from './insightConfiguration';

// Registry
export { InsightRegistry } from './insightRegistry';

// Formatter
export { InsightFormatter } from './insightFormatter';

// Prioritizer
export { InsightPrioritizer } from './insightPrioritizer';

// Composer
export { InsightComposer } from './insightComposer';

// Validator
export { InsightValidator } from './insightValidator';

// Timeline
export { InsightTimelineManager } from './insightTimeline';

// History
export { InsightHistory } from './insightHistory';

// Generator
export { InsightGenerator } from './insightGenerator';

// Builder
export { InsightBuilder } from './insightBuilder';

// Manager
export { InsightManager, insightManager } from './insightManager';
