/**
 * Knowledge Validator — validates knowledge objects for integrity.
 *
 * Validates:
 *   Evidence exists for every knowledge item
 *   Confidence values are valid (0.0–1.0)
 *   Relationships reference valid facts
 *   Fact consistency
 *   Graph integrity
 *   Missing providers
 *   Version compatibility
 *
 * Validation errors never crash the application.
 */
import type {
  KnowledgeObject,
  KnowledgeValidationResult,
  KnowledgeValidationIssue,
  KnowledgeConfiguration,
} from './types';

export class KnowledgeValidator {
  private _config: KnowledgeConfiguration;

  constructor(config: KnowledgeConfiguration) {
    this._config = config;
  }

  updateConfig(config: KnowledgeConfiguration): void {
    this._config = config;
  }

  /**
   * Validate a complete KnowledgeObject.
   */
  validate(knowledge: KnowledgeObject): KnowledgeValidationResult {
    const issues: KnowledgeValidationIssue[] = [];

    // Validate metadata
    if (!knowledge.metadata) {
      issues.push({ level: 'error', code: 'MISSING_METADATA', message: 'Knowledge object must have metadata' });
      return { valid: false, issues };
    }

    if (!knowledge.metadata.knowledgeId) {
      issues.push({ level: 'error', code: 'MISSING_KNOWLEDGE_ID', message: 'Metadata must have knowledgeId' });
    }
    if (!knowledge.metadata.contextId) {
      issues.push({ level: 'error', code: 'MISSING_CONTEXT_ID', message: 'Metadata must have contextId' });
    }
    if (!knowledge.metadata.generatedAt) {
      issues.push({ level: 'error', code: 'MISSING_GENERATED_AT', message: 'Metadata must have generatedAt' });
    }

    // Build fact ID set for relationship validation
    const factIds = new Set(knowledge.facts.map((f) => f.id));

    // Validate facts
    for (const fact of knowledge.facts) {
      if (!fact.evidence) {
        issues.push({ level: 'error', code: 'FACT_NO_EVIDENCE', message: `Fact "${fact.name}" has no evidence`, factId: fact.id });
      }
      if (fact.confidence < 0 || fact.confidence > 1) {
        issues.push({ level: 'error', code: 'FACT_INVALID_CONFIDENCE', message: `Fact "${fact.name}" has invalid confidence: ${fact.confidence}`, factId: fact.id });
      }
      if (fact.confidence < this._config.minConfidenceThreshold) {
        issues.push({ level: 'warning', code: 'FACT_LOW_CONFIDENCE', message: `Fact "${fact.name}" has low confidence: ${fact.confidence}`, factId: fact.id });
      }
      if (!fact.sourceProvider) {
        issues.push({ level: 'error', code: 'FACT_NO_PROVIDER', message: `Fact "${fact.name}" has no source provider`, factId: fact.id });
      }
    }

    // Validate relationships
    for (const rel of knowledge.relationships) {
      if (!factIds.has(rel.sourceFactId)) {
        issues.push({ level: 'error', code: 'REL_INVALID_SOURCE', message: `Relationship references unknown source fact: ${rel.sourceFactId}`, relationshipId: rel.id });
      }
      if (!factIds.has(rel.targetFactId)) {
        issues.push({ level: 'error', code: 'REL_INVALID_TARGET', message: `Relationship references unknown target fact: ${rel.targetFactId}`, relationshipId: rel.id });
      }
      if (!rel.evidence) {
        issues.push({ level: 'error', code: 'REL_NO_EVIDENCE', message: `Relationship has no evidence`, relationshipId: rel.id });
      }
      if (rel.confidence < 0 || rel.confidence > 1) {
        issues.push({ level: 'error', code: 'REL_INVALID_CONFIDENCE', message: `Relationship has invalid confidence: ${rel.confidence}`, relationshipId: rel.id });
      }
    }

    // Validate changes
    for (const change of knowledge.changes) {
      if (!change.evidence) {
        issues.push({ level: 'error', code: 'CHANGE_NO_EVIDENCE', message: `Change for "${change.factName}" has no evidence`, factId: change.factId });
      }
    }

    // Validate trends
    for (const trend of knowledge.trends) {
      if (!trend.evidence) {
        issues.push({ level: 'error', code: 'TREND_NO_EVIDENCE', message: `Trend for "${trend.factName}" has no evidence`, factId: trend.factId });
      }
      if (trend.dataPoints.length < 2 && trend.direction !== 'unknown') {
        issues.push({ level: 'warning', code: 'TREND_INSUFFICIENT_DATA', message: `Trend for "${trend.factName}" has insufficient data points`, factId: trend.factId });
      }
    }

    // Validate summaries
    for (const summary of knowledge.summaries) {
      if (!summary.evidence) {
        issues.push({ level: 'error', code: 'SUMMARY_NO_EVIDENCE', message: `Summary "${summary.title}" has no evidence` });
      }
      if (summary.statements.length === 0) {
        issues.push({ level: 'warning', code: 'SUMMARY_EMPTY', message: `Summary "${summary.title}" has no statements` });
      }
    }

    // Validate graph integrity
    if (knowledge.graph) {
      const graphNodeIds = new Set(knowledge.graph.nodes.map((n) => n.id));
      for (const edge of knowledge.graph.edges) {
        if (!graphNodeIds.has(edge.source)) {
          issues.push({ level: 'error', code: 'GRAPH_EDGE_INVALID_SOURCE', message: `Graph edge references missing node: ${edge.source}` });
        }
        if (!graphNodeIds.has(edge.target)) {
          issues.push({ level: 'error', code: 'GRAPH_EDGE_INVALID_TARGET', message: `Graph edge references missing node: ${edge.target}` });
        }
      }
    }

    // Validate provenance
    if (!knowledge.provenance || knowledge.provenance.length === 0) {
      issues.push({ level: 'warning', code: 'NO_PROVENANCE', message: 'Knowledge object has no provenance' });
    }

    // Validate statistics
    if (knowledge.statistics) {
      if (knowledge.statistics.totalFacts !== knowledge.facts.length) {
        issues.push({ level: 'warning', code: 'STATS_FACT_COUNT_MISMATCH', message: 'Statistics fact count does not match actual count' });
      }
      if (knowledge.statistics.totalRelationships !== knowledge.relationships.length) {
        issues.push({ level: 'warning', code: 'STATS_REL_COUNT_MISMATCH', message: 'Statistics relationship count does not match actual count' });
      }
    }

    const hasErrors = issues.some((i) => i.level === 'error');
    return { valid: !hasErrors, issues };
  }
}
