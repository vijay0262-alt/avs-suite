/**
 * AI Knowledge Engine — Barrel Export.
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

// Types
export type {
  FactCategory,
  FactDataType,
  KnowledgeFact,
  KnowledgeEvidence,
  EvidenceDataPoint,
  RelationshipType,
  KnowledgeRelationship,
  ChangeType,
  KnowledgeChange,
  TrendDirection,
  KnowledgeTrend,
  TrendDataPoint,
  SummaryType,
  KnowledgeSummary,
  SummaryStatement,
  GraphNode,
  GraphEdge,
  KnowledgeGraph,
  InsightType,
  InsightSeverity,
  KnowledgeInsight,
  KnowledgeMetadata,
  KnowledgeObject,
  KnowledgeStatistics,
  KnowledgeValidationIssue,
  KnowledgeValidationResult,
  KnowledgeConfiguration,
  KnowledgeEventType,
  KnowledgeEventListener,
  KnowledgeBuilderPlugin,
  ContextSnapshot,
  SnapshotFact,
} from './types';

export {
  generateKnowledgeId,
  generateFactId,
  generateRelationshipId,
  generateChangeId,
  generateTrendId,
  generateInsightId,
  createEvidence,
  createEvidenceFromContext,
  factsToSnapshot,
} from './types';

// Events
export { KnowledgeEventEmitter, knowledgeEvents } from './knowledgeEvents';

// Configuration
export { DEFAULT_KNOWLEDGE_CONFIG, createKnowledgeConfig } from './knowledgeConfiguration';

// Registry
export { KnowledgeRegistry } from './knowledgeRegistry';

// Evidence Builder
export { EvidenceBuilder } from './evidenceBuilder';

// Knowledge Analyzer
export { KnowledgeAnalyzer } from './knowledgeAnalyzer';

// Relationship Engine
export { RelationshipEngine } from './relationshipEngine';

// Trend Analyzer
export { TrendAnalyzer } from './trendAnalyzer';

// Change Detector
export { ChangeDetector } from './changeDetector';

// Insight Classifier
export { InsightClassifier } from './insightClassifier';

// Knowledge Graph
export { KnowledgeGraphBuilder } from './knowledgeGraph';

// Validator
export { KnowledgeValidator } from './knowledgeValidator';

// Builder
export { KnowledgeBuilder } from './knowledgeBuilder';

// Manager
export { KnowledgeManager, knowledgeManager } from './knowledgeManager';
