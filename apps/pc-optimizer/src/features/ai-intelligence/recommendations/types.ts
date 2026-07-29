/**
 * AI Recommendation Engine — Type Definitions.
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
import type { KnowledgeObject, KnowledgeFact, KnowledgeRelationship, KnowledgeTrend, KnowledgeChange, KnowledgeEvidence } from '../knowledge/types';

// Re-export knowledge types for convenience
export type { KnowledgeObject, KnowledgeFact, KnowledgeRelationship, KnowledgeTrend, KnowledgeChange, KnowledgeEvidence } from '../knowledge/types';

// ── Categories ───────────────────────────────────────────────

export type RecommendationCategory =
  | 'performance'
  | 'storage'
  | 'browser'
  | 'privacy'
  | 'windows'
  | 'startup'
  | 'duplicates'
  | 'security'
  | 'maintenance'
  | 'automation'
  | 'health'
  | 'custom';

// ── Priority ─────────────────────────────────────────────────

export type RecommendationPriority =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

// ── Risk Level ───────────────────────────────────────────────

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

// ── Scoring ──────────────────────────────────────────────────

/**
 * Scores are normalized 0.0–1.0.
 * Higher is better for impact, safety, urgency, confidence, overall.
 * Lower is better for effort (1.0 = minimal effort).
 */
export interface RecommendationScores {
  impactScore: number;
  safetyScore: number;
  urgencyScore: number;
  effortScore: number;
  confidenceScore: number;
  overallScore: number;
}

// ── Evidence ─────────────────────────────────────────────────

/**
 * Every recommendation MUST include evidence.
 * No recommendation without evidence.
 */
export interface RecommendationEvidence {
  supportingFacts: string[];
  supportingRelationships: string[];
  supportingTrends: string[];
  supportingChanges: string[];
  evidence: KnowledgeEvidence;
  evidenceCount: number;
  sourceProviders: string[];
  confidence: number;
}

// ── Benefits ─────────────────────────────────────────────────

/**
 * Estimated improvements. These are estimates only. Never exaggerate.
 */
export interface RecommendationBenefits {
  estimatedTime: number;
  estimatedBenefit: string;
  estimatedSpaceRecovered: number | null;
  estimatedPerformanceGain: number | null;
  estimatedPrivacyImprovement: number | null;
  estimatedHealthIncrease: number | null;
}

// ── Safety ───────────────────────────────────────────────────

/**
 * Every recommendation must specify safety information.
 */
export interface RecommendationSafety {
  riskLevel: RiskLevel;
  rollbackAvailable: boolean;
  requiresConfirmation: boolean;
  automaticExecutionAllowed: boolean;
  automationEligible: boolean;
  warnings: string[];
}

// ── Recommendation ───────────────────────────────────────────

/**
 * A structured, evidence-based recommendation.
 * Never executes. Never modifies the system. Only describes what SHOULD be done.
 */
export interface Recommendation {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  scores: RecommendationScores;
  evidence: RecommendationEvidence;
  benefits: RecommendationBenefits;
  safety: RecommendationSafety;
  requiresPro: boolean;
  createdAt: string;
  expiresAt: string | null;
  status: RecommendationStatus;
  futureMetadata: Record<string, unknown>;
}

export type RecommendationStatus = 'active' | 'expired' | 'dismissed' | 'completed' | 'pending';

// ── Recommendation List ──────────────────────────────────────

export interface RecommendationList {
  recommendations: Recommendation[];
  metadata: RecommendationListMetadata;
  statistics: RecommendationStatistics;
}

export interface RecommendationListMetadata {
  listId: string;
  knowledgeId: string;
  generatedAt: string;
  recommendationVersion: string;
  generationTimeMs: number;
  totalRecommendations: number;
  filteredCount: number;
}

// ── Statistics ───────────────────────────────────────────────

export interface RecommendationStatistics {
  totalRecommendations: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byRiskLevel: Record<string, number>;
  averageImpact: number;
  averageSafety: number;
  averageUrgency: number;
  averageEffort: number;
  averageConfidence: number;
  averageOverall: number;
  quickWinsCount: number;
  safeCount: number;
  proRequiredCount: number;
  automationEligibleCount: number;
  estimatedTotalTime: number;
  estimatedTotalSpaceRecovered: number;
}

// ── Validation ───────────────────────────────────────────────

export interface RecommendationValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  recommendationId?: string;
}

export interface RecommendationValidationResult {
  valid: boolean;
  issues: RecommendationValidationIssue[];
}

// ── Filters ──────────────────────────────────────────────────

export interface RecommendationFilter {
  categories?: RecommendationCategory[];
  priorities?: RecommendationPriority[];
  riskLevels?: RiskLevel[];
  minImpact?: number;
  maxEffort?: number;
  minSafety?: number;
  maxTimeRequired?: number;
  requiresPro?: boolean;
  automationReady?: boolean;
  quickWinsOnly?: boolean;
  custom?: (rec: Recommendation) => boolean;
}

// ── Configuration ────────────────────────────────────────────

export interface ScoringWeights {
  impact: number;
  safety: number;
  urgency: number;
  effort: number;
  confidence: number;
}

export interface PriorityThresholds {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RecommendationConfiguration {
  scoringWeights: ScoringWeights;
  priorityThresholds: PriorityThresholds;
  enabledCategories: RecommendationCategory[];
  minConfidenceThreshold: number;
  minSafetyThreshold: number;
  maxRecommendations: number;
  recommendationVersion: string;
  quickWinMaxTime: number;
  quickWinMinImpact: number;
  quickWinMinSafety: number;
  quickWinMaxEffort: number;
  autoExpirationHours: number;
  enableHistory: boolean;
  maxHistoryEntries: number;
}

// ── Events ───────────────────────────────────────────────────

export type RecommendationEventType =
  | 'recommendations_generated'
  | 'recommendation_added'
  | 'recommendation_updated'
  | 'recommendation_removed'
  | 'recommendation_ranked'
  | 'recommendation_filtered'
  | 'recommendation_selected'
  | 'recommendation_expired';

export type RecommendationEventListener = (payload: unknown) => void;

// ── Recommendation Builder Plugin (Extensibility) ────────────

/**
 * Future modules register recommendation builders without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
export interface RecommendationBuilderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  buildRecommendations(knowledge: KnowledgeObject): Recommendation[];
}

// ── History ──────────────────────────────────────────────────

export interface RecommendationHistoryEntry {
  id: string;
  recommendationId: string;
  action: 'generated' | 'updated' | 'removed' | 'selected' | 'expired' | 'dismissed' | 'completed';
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateRecommendationId(category: string, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `rec_${category}_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateRecommendationListId(): string {
  return `reclist_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createRecommendationEvidence(
  facts: KnowledgeFact[],
  relationships: KnowledgeRelationship[],
  trends: KnowledgeTrend[],
  changes: KnowledgeChange[],
): RecommendationEvidence {
  const factIds = facts.map((f) => f.id);
  const relIds = relationships.map((r) => r.id);
  const trendIds = trends.map((t) => t.id);
  const changeIds = changes.map((c) => c.id);

  const allEvidence: KnowledgeEvidence[] = [
    ...facts.map((f) => f.evidence),
    ...relationships.map((r) => r.evidence),
    ...trends.map((t) => t.evidence),
    ...changes.map((c) => c.evidence),
  ];

  const dataPoints = allEvidence.flatMap((e) => e.dataPoints);
  const sourceProviders = [...new Set(allEvidence.flatMap((e) => e.sourceProviders))];
  const confidence = allEvidence.length > 0
    ? allEvidence.reduce((sum, e) => sum + e.confidence, 0) / allEvidence.length
    : 0;

  const contextTimestamp = allEvidence.length > 0
    ? allEvidence[0]!.contextTimestamp
    : new Date().toISOString();

  return {
    supportingFacts: factIds,
    supportingRelationships: relIds,
    supportingTrends: trendIds,
    supportingChanges: changeIds,
    evidence: {
      statement: `Based on ${facts.length} facts, ${relationships.length} relationships, ${trends.length} trends, ${changes.length} changes`,
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

export function createDefaultSafety(riskLevel: RiskLevel = 'low'): RecommendationSafety {
  return {
    riskLevel,
    rollbackAvailable: true,
    requiresConfirmation: riskLevel !== 'none',
    automaticExecutionAllowed: riskLevel === 'none' || riskLevel === 'low',
    automationEligible: riskLevel === 'none' || riskLevel === 'low',
    warnings: [],
  };
}

export function createDefaultBenefits(estimatedTime: number = 60): RecommendationBenefits {
  return {
    estimatedTime,
    estimatedBenefit: 'Improves system performance',
    estimatedSpaceRecovered: null,
    estimatedPerformanceGain: null,
    estimatedPrivacyImprovement: null,
    estimatedHealthIncrease: null,
  };
}
