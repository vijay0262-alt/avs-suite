/**
 * AI Insight Engine — Type Definitions.
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
import type { KnowledgeObject, KnowledgeFact, KnowledgeEvidence } from '../knowledge/types';
import type { Recommendation } from '../recommendations/types';

// Re-export for convenience
export type { KnowledgeObject, KnowledgeFact, KnowledgeEvidence } from '../knowledge/types';
export type { Recommendation } from '../recommendations/types';

// ── Insight Types ────────────────────────────────────────────

export type InsightType =
  | 'morning_brief'
  | 'evening_summary'
  | 'optimization_summary'
  | 'health_summary'
  | 'weekly_digest'
  | 'monthly_digest'
  | 'achievement'
  | 'milestone'
  | 'system_change'
  | 'recommendation_summary'
  | 'maintenance_summary'
  | 'performance_summary'
  | 'storage_summary'
  | 'privacy_summary'
  | 'windows_summary'
  | 'security_summary'
  | 'automation_summary'
  | 'custom';

// ── Insight Category ─────────────────────────────────────────

export type InsightCategory =
  | 'system'
  | 'health'
  | 'performance'
  | 'storage'
  | 'browser'
  | 'privacy'
  | 'startup'
  | 'windows'
  | 'duplicates'
  | 'security'
  | 'maintenance'
  | 'automation'
  | 'achievement'
  | 'milestone'
  | 'custom';

// ── Insight Priority ─────────────────────────────────────────

export type InsightPriority =
  | 'critical'
  | 'important'
  | 'recommended'
  | 'informational'
  | 'celebration';

// ── Insight Status ───────────────────────────────────────────

export type InsightStatus = 'active' | 'expired' | 'viewed' | 'archived' | 'dismissed';

// ── Output Format ────────────────────────────────────────────

export type InsightOutputFormat =
  | 'dashboard'
  | 'notification'
  | 'conversation'
  | 'report'
  | 'email'
  | 'mobile'
  | 'plain_text'
  | 'rich_text'
  | 'markdown';

// ── Insight Evidence ─────────────────────────────────────────

/**
 * Every insight MUST include evidence.
 * No insight without evidence. The AI must never invent information.
 */
export interface InsightEvidence {
  relatedFacts: string[];
  relatedRecommendations: string[];
  relatedKnowledge: string[];
  evidence: KnowledgeEvidence;
  evidenceCount: number;
  sourceProviders: string[];
  confidence: number;
}

// ── Insight ──────────────────────────────────────────────────

/**
 * A structured, evidence-based insight.
 * Never executes. Never modifies the system. Only communicates what is true.
 */
export interface Insight {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  description: string;
  category: InsightCategory;
  type: InsightType;
  priority: InsightPriority;
  generatedAt: string;
  expiresAt: string | null;
  importanceScore: number;
  confidenceScore: number;
  estimatedReadingTime: number;
  relatedRecommendations: string[];
  relatedKnowledge: string[];
  relatedFacts: string[];
  evidence: InsightEvidence;
  status: InsightStatus;
  futureMetadata: Record<string, unknown>;
}

// ── Insight List ─────────────────────────────────────────────

export interface InsightList {
  insights: Insight[];
  metadata: InsightListMetadata;
  statistics: InsightStatistics;
}

export interface InsightListMetadata {
  listId: string;
  knowledgeId: string;
  recommendationListId: string | null;
  generatedAt: string;
  insightVersion: string;
  generationTimeMs: number;
  totalInsights: number;
}

// ── Statistics ───────────────────────────────────────────────

export interface InsightStatistics {
  totalInsights: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  averageImportance: number;
  averageConfidence: number;
  achievementsCount: number;
  milestonesCount: number;
  criticalCount: number;
  celebrationCount: number;
  estimatedTotalReadingTime: number;
}

// ── Validation ───────────────────────────────────────────────

export interface InsightValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  insightId?: string;
}

export interface InsightValidationResult {
  valid: boolean;
  issues: InsightValidationIssue[];
}

// ── Filters ──────────────────────────────────────────────────

export interface InsightFilter {
  types?: InsightType[];
  categories?: InsightCategory[];
  priorities?: InsightPriority[];
  minImportance?: number;
  minConfidence?: number;
  maxReadingTime?: number;
  includeExpired?: boolean;
  custom?: (insight: Insight) => boolean;
}

// ── Timeline ─────────────────────────────────────────────────

export type TimelinePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface TimelineEntry {
  id: string;
  timestamp: string;
  type: 'optimization' | 'achievement' | 'milestone' | 'system_change' | 'insight' | 'custom';
  title: string;
  description: string;
  category: InsightCategory;
  importance: number;
  metadata: Record<string, unknown>;
}

export interface InsightTimeline {
  entries: TimelineEntry[];
  period: TimelinePeriod;
  startDate: string;
  endDate: string;
  totalEntries: number;
}

// ── Achievements ─────────────────────────────────────────────

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: InsightCategory;
  unlockedAt: string;
  importance: number;
  milestone: boolean;
  metadata: Record<string, unknown>;
}

export interface AchievementRule {
  id: string;
  name: string;
  description: string;
  category: InsightCategory;
  check: (knowledge: KnowledgeObject, recommendations: Recommendation[]) => boolean;
  importance: number;
}

// ── Milestones ───────────────────────────────────────────────

export interface Milestone {
  id: string;
  name: string;
  description: string;
  category: InsightCategory;
  reachedAt: string;
  target: number;
  current: number;
  importance: number;
  metadata: Record<string, unknown>;
}

export interface MilestoneRule {
  id: string;
  name: string;
  description: string;
  category: InsightCategory;
  target: number;
  getCurrent: (knowledge: KnowledgeObject, recommendations: Recommendation[]) => number;
  importance: number;
}

// ── Formatting ───────────────────────────────────────────────

export interface FormattedInsight {
  insightId: string;
  format: InsightOutputFormat;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}

// ── Configuration ────────────────────────────────────────────

export interface PriorityRules {
  criticalThreshold: number;
  importantThreshold: number;
  recommendedThreshold: number;
  informationalThreshold: number;
}

export interface ExpirationRules {
  defaultExpirationHours: number;
  morningBriefExpirationHours: number;
  eveningSummaryExpirationHours: number;
  achievementExpirationHours: number;
  milestoneExpirationHours: number;
}

export interface FormattingRules {
  defaultFormat: InsightOutputFormat;
  maxSummaryLength: number;
  maxDescriptionLength: number;
  includeEvidence: boolean;
  includeRecommendations: boolean;
}

export interface InsightConfiguration {
  insightVersion: string;
  enabledTypes: InsightType[];
  priorityRules: PriorityRules;
  expirationRules: ExpirationRules;
  formattingRules: FormattingRules;
  maxInsights: number;
  enableHistory: boolean;
  maxHistoryEntries: number;
  enableTimeline: boolean;
  maxTimelineEntries: number;
  achievementRules: AchievementRule[];
  milestoneRules: MilestoneRule[];
  minConfidenceThreshold: number;
}

// ── Events ───────────────────────────────────────────────────

export type InsightEventType =
  | 'insight_generated'
  | 'insight_expired'
  | 'insight_viewed'
  | 'insight_archived'
  | 'achievement_unlocked'
  | 'milestone_reached'
  | 'timeline_updated';

export type InsightEventListener = (payload: unknown) => void;

// ── Insight Provider Plugin (Extensibility) ──────────────────

/**
 * Future modules register insight providers without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
export interface InsightProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  generateInsights(
    knowledge: KnowledgeObject,
    recommendations: Recommendation[],
  ): Insight[];
}

// ── History ──────────────────────────────────────────────────

export interface InsightHistoryEntry {
  id: string;
  insightId: string;
  action: 'generated' | 'viewed' | 'archived' | 'expired' | 'dismissed';
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Personalization Placeholders ─────────────────────────────

/**
 * Placeholders for future personalization.
 * Do NOT implement learning yet. Only structure.
 */
export interface PersonalizationContext {
  deviceProfile: Record<string, unknown> | null;
  userBehavior: Record<string, unknown> | null;
  optimizationHabits: Record<string, unknown> | null;
  preferredModules: string[] | null;
  notificationPreferences: Record<string, unknown> | null;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateInsightId(type: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `insight_${type}_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateInsightListId(): string {
  return `insightlist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateTimelineEntryId(): string {
  return `tl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateAchievementId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `achievement_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateMilestoneId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `milestone_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createInsightEvidence(
  facts: KnowledgeFact[],
  recommendationIds: string[],
  knowledgeIds: string[],
): InsightEvidence {
  const allEvidence: KnowledgeEvidence[] = facts.map((f) => f.evidence);
  const dataPoints = allEvidence.flatMap((e) => e.dataPoints);
  const sourceProviders = [...new Set(allEvidence.flatMap((e) => e.sourceProviders))];
  const confidence = allEvidence.length > 0
    ? allEvidence.reduce((sum, e) => sum + e.confidence, 0) / allEvidence.length
    : 0;
  const contextTimestamp = allEvidence.length > 0
    ? allEvidence[0]!.contextTimestamp
    : new Date().toISOString();

  return {
    relatedFacts: facts.map((f) => f.id),
    relatedRecommendations: recommendationIds,
    relatedKnowledge: knowledgeIds,
    evidence: {
      statement: `Based on ${facts.length} facts, ${recommendationIds.length} recommendations, ${knowledgeIds.length} knowledge items`,
      dataPoints,
      sourceProviders,
      contextTimestamp,
      confidence: clampScore(confidence),
    },
    evidenceCount: dataPoints.length,
    sourceProviders,
    confidence: clampScore(confidence),
  };
}

export function estimateReadingTime(text: string): number {
  const wordsPerMinute = 200;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}
