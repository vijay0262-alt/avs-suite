/**
 * AI Knowledge Engine — Type Definitions.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every insight, recommendation,
 *    or answer must be traceable back to one or more context providers,
 *    with supporting evidence and a confidence score."
 *
 * The Knowledge Engine transforms raw AIContext into structured, explainable
 * knowledge. It NEVER generates recommendations. It ONLY describes what is true.
 *
 * Pipeline:
 *   AI Context → Knowledge Builder → Evidence Builder →
 *   Relationship Engine → Trend Analyzer → Knowledge Graph → Knowledge Object
 *
 * Future AI components consume Knowledge only. Never consume raw Context directly.
 */
import type { AIContext, ContextProvenance } from '../context/types';

// Re-export context types for convenience
export type { AIContext, ContextProvenance, ContextEvidence } from '../context/types';

// ── Facts ────────────────────────────────────────────────────

export type FactCategory =
  | 'system' | 'health' | 'performance' | 'storage' | 'browser'
  | 'privacy' | 'startup' | 'windows' | 'duplicates' | 'scheduler'
  | 'history' | 'reports' | 'experience' | 'capabilities' | 'quota'
  | 'analytics' | 'custom';

export type FactDataType = 'number' | 'string' | 'boolean' | 'list' | 'object';

/**
 * A fact is an objective statement about the system state.
 * Facts are never inferred — they are directly extracted from context.
 */
export interface KnowledgeFact {
  id: string;
  category: FactCategory;
  name: string;
  value: string | number | boolean | unknown[];
  dataType: FactDataType;
  unit: string | null;
  description: string;
  evidence: KnowledgeEvidence;
  confidence: number;
  sourceProvider: string;
  extractedAt: string;
}

// ── Evidence ─────────────────────────────────────────────────

/**
 * Evidence supporting a knowledge item.
 * Every knowledge item MUST include evidence.
 * Never allow unsupported conclusions.
 */
export interface KnowledgeEvidence {
  statement: string;
  dataPoints: EvidenceDataPoint[];
  sourceProviders: string[];
  contextTimestamp: string;
  confidence: number;
}

export interface EvidenceDataPoint {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
}

// ── Relationships ────────────────────────────────────────────

export type RelationshipType =
  | 'causal'      // A causes B
  | 'correlative' // A correlates with B
  | 'temporal'    // A happened before B
  | 'compositional' // A is part of B
  | 'dependency'  // A depends on B
  | 'custom';

/**
 * A relationship connects two facts.
 * Example: "Startup time increased because startup apps increased."
 */
export interface KnowledgeRelationship {
  id: string;
  type: RelationshipType;
  sourceFactId: string;
  targetFactId: string;
  description: string;
  evidence: KnowledgeEvidence;
  confidence: number;
  createdAt: string;
}

// ── Changes ──────────────────────────────────────────────────

export type ChangeType = 'added' | 'removed' | 'improved' | 'degraded' | 'unchanged' | 'unknown';

/**
 * A change detected by comparing current context against previous snapshots.
 */
export interface KnowledgeChange {
  id: string;
  factId: string;
  factName: string;
  changeType: ChangeType;
  previousValue: string | number | boolean | unknown[] | null;
  currentValue: string | number | boolean | unknown[] | null;
  delta: number | null;
  deltaDescription: string;
  evidence: KnowledgeEvidence;
  detectedAt: string;
}

// ── Trends ───────────────────────────────────────────────────

export type TrendDirection = 'increasing' | 'decreasing' | 'stable' | 'oscillating' | 'unknown';

/**
 * A trend analysis result. Trend calculations only. No predictions.
 */
export interface KnowledgeTrend {
  id: string;
  factId: string;
  factName: string;
  direction: TrendDirection;
  dataPoints: TrendDataPoint[];
  slope: number | null;
  variability: number | null;
  evidence: KnowledgeEvidence;
  analyzedAt: string;
}

export interface TrendDataPoint {
  timestamp: string;
  value: number;
}

// ── Summaries ────────────────────────────────────────────────

export type SummaryType =
  | 'health' | 'storage' | 'privacy' | 'performance' | 'windows'
  | 'startup' | 'browser' | 'duplicates' | 'history' | 'overall'
  | 'custom';

/**
 * A structured summary. Summaries are factual. No recommendations.
 */
export interface KnowledgeSummary {
  type: SummaryType;
  title: string;
  statements: SummaryStatement[];
  evidence: KnowledgeEvidence;
  confidence: number;
  generatedAt: string;
}

export interface SummaryStatement {
  text: string;
  factIds: string[];
  confidence: number;
}

// ── Knowledge Graph ──────────────────────────────────────────

export interface GraphNode {
  id: string;
  label: string;
  category: FactCategory;
  factId: string;
  value: string | number | boolean | unknown[];
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: RelationshipType;
  label: string;
  confidence: number;
}

/**
 * The knowledge graph connects facts across modules.
 * Must support future expansion without modification.
 */
export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeCount: number;
  edgeCount: number;
}

// ── Insights ─────────────────────────────────────────────────

export type InsightType = 'observation' | 'correlation' | 'change' | 'trend' | 'summary';
export type InsightSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * An insight is a classified piece of knowledge.
 * Insights describe what IS, not what SHOULD be done.
 */
export interface KnowledgeInsight {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  factIds: string[];
  relationshipIds: string[];
  evidence: KnowledgeEvidence;
  confidence: number;
  classifiedAt: string;
}

// ── Knowledge Object ─────────────────────────────────────────

export interface KnowledgeMetadata {
  knowledgeId: string;
  contextId: string;
  generatedAt: string;
  knowledgeVersion: string;
  generationTimeMs: number;
  factsCount: number;
  relationshipsCount: number;
  changesCount: number;
  trendsCount: number;
  summariesCount: number;
  insightsCount: number;
}

/**
 * The complete knowledge object — the single output of the Knowledge Engine.
 * Future AI components consume this. Never raw context.
 */
export interface KnowledgeObject {
  metadata: KnowledgeMetadata;
  facts: KnowledgeFact[];
  relationships: KnowledgeRelationship[];
  changes: KnowledgeChange[];
  trends: KnowledgeTrend[];
  summaries: KnowledgeSummary[];
  insights: KnowledgeInsight[];
  graph: KnowledgeGraph;
  provenance: ContextProvenance[];
  statistics: KnowledgeStatistics;
  futureExtensions?: Record<string, unknown>;
}

// ── Statistics ───────────────────────────────────────────────

export interface KnowledgeStatistics {
  totalFacts: number;
  totalRelationships: number;
  totalChanges: number;
  totalTrends: number;
  totalSummaries: number;
  totalInsights: number;
  totalEvidencePieces: number;
  averageConfidence: number;
  factsByCategory: Record<string, number>;
  changesByType: Record<string, number>;
  trendsByDirection: Record<string, number>;
  insightsByType: Record<string, number>;
  insightsBySeverity: Record<string, number>;
  graphDensity: number;
  lastBuildTimeMs: number;
  lastBuildAt: string | null;
}

// ── Validation ───────────────────────────────────────────────

export interface KnowledgeValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  factId?: string;
  relationshipId?: string;
  section?: string;
}

export interface KnowledgeValidationResult {
  valid: boolean;
  issues: KnowledgeValidationIssue[];
}

// ── Configuration ────────────────────────────────────────────

export interface KnowledgeConfiguration {
  enableRelationships: boolean;
  enableTrends: boolean;
  enableChanges: boolean;
  enableSummaries: boolean;
  enableInsights: boolean;
  enableGraph: boolean;
  minConfidenceThreshold: number;
  maxHistorySnapshots: number;
  knowledgeVersion: string;
  graphMaxNodes: number;
  graphMaxEdges: number;
}

// ── Events ───────────────────────────────────────────────────

export type KnowledgeEventType =
  | 'knowledge_build_started'
  | 'knowledge_build_completed'
  | 'knowledge_updated'
  | 'knowledge_validated'
  | 'relationship_created'
  | 'trend_detected'
  | 'change_detected'
  | 'knowledge_failed';

export type KnowledgeEventListener = (payload: unknown) => void;

// ── Knowledge Builder Interface (Extensibility) ──────────────

/**
 * Future modules register knowledge builders without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
export interface KnowledgeBuilderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  buildFacts(context: AIContext): KnowledgeFact[];
  buildRelationships?(facts: KnowledgeFact[], context: AIContext): KnowledgeRelationship[];
  buildSummaries?(facts: KnowledgeFact[], context: AIContext): KnowledgeSummary[];
}

// ── Snapshot (for change detection and trend analysis) ───────

export interface ContextSnapshot {
  snapshotId: string;
  contextId: string;
  timestamp: string;
  facts: SnapshotFact[];
}

export interface SnapshotFact {
  id: string;
  name: string;
  category: FactCategory;
  value: string | number | boolean | unknown[];
  timestamp: string;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateKnowledgeId(): string {
  return `kno_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateFactId(category: string, name: string): string {
  return `fact_${category}_${name}`.replace(/\s+/g, '_').toLowerCase();
}

export function generateRelationshipId(sourceId: string, targetId: string, type: RelationshipType): string {
  return `rel_${type}_${sourceId}_${targetId}`.replace(/\s+/g, '_').toLowerCase();
}

export function generateChangeId(factId: string): string {
  return `chg_${factId}_${Date.now()}`.replace(/\s+/g, '_').toLowerCase();
}

export function generateTrendId(factId: string): string {
  return `trd_${factId}`.replace(/\s+/g, '_').toLowerCase();
}

export function generateInsightId(type: InsightType, index: number): string {
  return `ins_${type}_${index}_${Date.now()}`.slice(0, 60);
}

export function createEvidence(
  statement: string,
  dataPoints: EvidenceDataPoint[],
  sourceProviders: string[],
  contextTimestamp: string,
  confidence: number = 1.0,
): KnowledgeEvidence {
  return {
    statement,
    dataPoints,
    sourceProviders,
    contextTimestamp,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function createEvidenceFromContext(
  statement: string,
  provenance: ContextProvenance[],
  contextTimestamp: string,
  confidence?: number,
): KnowledgeEvidence {
  const dataPoints: EvidenceDataPoint[] = [];
  const providers: string[] = [];

  for (const prov of provenance) {
    providers.push(prov.providerName);
    for (const ev of prov.evidence) {
      dataPoints.push({
        source: ev.source,
        metric: ev.metric,
        value: ev.value,
        timestamp: ev.timestamp,
      });
    }
  }

  const avgConfidence = confidence ?? (provenance.length > 0
    ? provenance.reduce((sum, p) => sum + p.confidence, 0) / provenance.length
    : 1.0);

  return {
    statement,
    dataPoints,
    sourceProviders: providers,
    contextTimestamp,
    confidence: Math.max(0, Math.min(1, avgConfidence)),
  };
}

export function factsToSnapshot(facts: KnowledgeFact[], contextId: string): ContextSnapshot {
  return {
    snapshotId: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contextId,
    timestamp: new Date().toISOString(),
    facts: facts.map((f) => ({
      id: f.id,
      name: f.name,
      category: f.category,
      value: f.value,
      timestamp: f.extractedAt,
    })),
  };
}
