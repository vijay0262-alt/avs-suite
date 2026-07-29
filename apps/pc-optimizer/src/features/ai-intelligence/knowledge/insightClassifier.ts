/**
 * Insight Classifier — classifies knowledge items into insights.
 *
 * Insights describe what IS, not what SHOULD be done.
 * No recommendations. No suggestions. Only observations.
 */
import type {
  KnowledgeFact,
  KnowledgeRelationship,
  KnowledgeChange,
  KnowledgeTrend,
  KnowledgeInsight,
  InsightType,
  InsightSeverity,
} from './types';
import { generateInsightId } from './types';
import type { EvidenceBuilder } from './evidenceBuilder';

export class InsightClassifier {
  private _evidenceBuilder: EvidenceBuilder;

  constructor(evidenceBuilder: EvidenceBuilder) {
    this._evidenceBuilder = evidenceBuilder;
  }

  /**
   * Classify all knowledge items into insights.
   */
  classify(
    facts: KnowledgeFact[],
    relationships: KnowledgeRelationship[],
    changes: KnowledgeChange[],
    trends: KnowledgeTrend[],
  ): KnowledgeInsight[] {
    const insights: KnowledgeInsight[] = [];
    let idx = 0;

    // Observations from facts
    for (const fact of facts) {
      const insight = this._classifyFact(fact, idx++);
      if (insight) insights.push(insight);
    }

    // Correlations from relationships
    for (const rel of relationships) {
      insights.push({
        id: generateInsightId('correlation', idx++),
        type: 'correlation' as InsightType,
        severity: this._severityFromConfidence(rel.confidence),
        title: rel.description,
        description: rel.evidence.statement,
        factIds: [rel.sourceFactId, rel.targetFactId],
        relationshipIds: [rel.id],
        evidence: rel.evidence,
        confidence: rel.confidence,
        classifiedAt: new Date().toISOString(),
      });
    }

    // Changes
    for (const change of changes) {
      if (change.changeType === 'unchanged' || change.changeType === 'unknown') continue;
      insights.push({
        id: generateInsightId('change', idx++),
        type: 'change' as InsightType,
        severity: this._severityFromChange(change.changeType),
        title: change.deltaDescription,
        description: change.evidence.statement,
        factIds: [change.factId],
        relationshipIds: [],
        evidence: change.evidence,
        confidence: change.evidence.confidence,
        classifiedAt: new Date().toISOString(),
      });
    }

    // Trends
    for (const trend of trends) {
      if (trend.direction === 'unknown' || trend.direction === 'stable') continue;
      insights.push({
        id: generateInsightId('trend', idx++),
        type: 'trend' as InsightType,
        severity: 'info' as InsightSeverity,
        title: `${trend.factName} is ${trend.direction}`,
        description: trend.evidence.statement,
        factIds: [trend.factId],
        relationshipIds: [],
        evidence: trend.evidence,
        confidence: trend.evidence.confidence,
        classifiedAt: new Date().toISOString(),
      });
    }

    return insights;
  }

  // ── Private ────────────────────────────────────────────────

  private _classifyFact(fact: KnowledgeFact, idx: number): KnowledgeInsight | null {
    // Only classify notable facts (not every single one)
    if (fact.dataType !== 'number') return null;

    const value = typeof fact.value === 'number' ? fact.value : null;
    if (value === null) return null;

    let severity: InsightSeverity = 'info';
    const title = `${fact.name}: ${fact.value}${fact.unit ? ' ' + fact.unit : ''}`;

    // High health scores are notable
    if (fact.name.includes('score') || fact.name.includes('health')) {
      if (value < 50) severity = 'high';
      else if (value < 70) severity = 'medium';
      else if (value >= 90) severity = 'info';
      else return null; // Don't create insight for moderate scores
    }
    // High usage is notable
    else if (fact.name.includes('usage') || fact.name.includes('used')) {
      if (value > 90) severity = 'high';
      else if (value > 75) severity = 'medium';
      else return null;
    }
    // Large counts are notable
    else if (fact.name.includes('count') || fact.name.includes('duplicate') || fact.name.includes('wasted')) {
      if (value > 1000) severity = 'medium';
      else if (value > 100) severity = 'low';
      else return null;
    }
    // Boot time
    else if (fact.name.includes('boot_time')) {
      if (value > 60) severity = 'high';
      else if (value > 30) severity = 'medium';
      else return null;
    }
    else {
      return null;
    }

    return {
      id: generateInsightId('observation', idx),
      type: 'observation' as InsightType,
      severity,
      title,
      description: fact.description,
      factIds: [fact.id],
      relationshipIds: [],
      evidence: fact.evidence,
      confidence: fact.confidence,
      classifiedAt: new Date().toISOString(),
    };
  }

  private _severityFromConfidence(confidence: number): InsightSeverity {
    if (confidence >= 0.9) return 'info';
    if (confidence >= 0.7) return 'low';
    if (confidence >= 0.5) return 'medium';
    return 'high';
  }

  private _severityFromChange(changeType: string): InsightSeverity {
    switch (changeType) {
      case 'degraded': return 'medium';
      case 'improved': return 'info';
      case 'added': return 'low';
      case 'removed': return 'low';
      default: return 'info';
    }
  }
}
