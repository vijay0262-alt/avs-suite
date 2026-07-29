/**
 * Evidence Builder — constructs evidence for knowledge items.
 *
 * Every knowledge item MUST include evidence.
 * Never allow unsupported conclusions.
 *
 * Core architectural principle:
 *   "The AI must never invent information."
 */
import type {
  AIContext,
  ContextProvenance,
  KnowledgeEvidence,
  EvidenceDataPoint,
} from './types';
import { createEvidence, createEvidenceFromContext } from './types';

export class EvidenceBuilder {
  /**
   * Build evidence from a context section's provenance.
   */
  fromProvenance(
    statement: string,
    provenance: ContextProvenance | ContextProvenance[],
    contextTimestamp: string,
  ): KnowledgeEvidence {
    const provs = Array.isArray(provenance) ? provenance : [provenance];
    return createEvidenceFromContext(statement, provs, contextTimestamp);
  }

  /**
   * Build evidence from specific data points.
   */
  fromDataPoints(
    statement: string,
    dataPoints: EvidenceDataPoint[],
    sourceProviders: string[],
    contextTimestamp: string,
    confidence: number = 1.0,
  ): KnowledgeEvidence {
    return createEvidence(statement, dataPoints, sourceProviders, contextTimestamp, confidence);
  }

  /**
   * Build evidence for a numeric comparison (e.g. "Health score improved from 82 to 90").
   */
  fromNumericComparison(
    metric: string,
    previousValue: number,
    currentValue: number,
    source: string,
    contextTimestamp: string,
  ): KnowledgeEvidence {
    const statement = `${metric} changed from ${previousValue} to ${currentValue}`;
    const dataPoints: EvidenceDataPoint[] = [
      { source, metric: `${metric}_previous`, value: previousValue, timestamp: contextTimestamp },
      { source, metric: `${metric}_current`, value: currentValue, timestamp: contextTimestamp },
    ];
    return createEvidence(statement, dataPoints, [source], contextTimestamp, 1.0);
  }

  /**
   * Build evidence for a fact extraction.
   */
  forFact(
    factName: string,
    factValue: string | number | boolean | unknown[],
    source: string,
    contextTimestamp: string,
    confidence: number = 1.0,
  ): KnowledgeEvidence {
    const valueStr = typeof factValue === 'object' ? JSON.stringify(factValue) : String(factValue);
    const statement = `${factName} is ${valueStr}`;
    return createEvidence(
      statement,
      [{ source, metric: factName, value: factValue as never, timestamp: contextTimestamp }],
      [source],
      contextTimestamp,
      confidence,
    );
  }

  /**
   * Build evidence for a relationship.
   */
  forRelationship(
    description: string,
    sourceFactName: string,
    sourceFactValue: string | number | boolean | unknown[],
    targetFactName: string,
    targetFactValue: string | number | boolean | unknown[],
    source: string,
    contextTimestamp: string,
    confidence: number = 0.8,
  ): KnowledgeEvidence {
    const statement = description;
    const dataPoints: EvidenceDataPoint[] = [
      { source, metric: sourceFactName, value: sourceFactValue as never, timestamp: contextTimestamp },
      { source, metric: targetFactName, value: targetFactValue as never, timestamp: contextTimestamp },
    ];
    return createEvidence(statement, dataPoints, [source], contextTimestamp, confidence);
  }

  /**
   * Merge multiple evidence items into one.
   */
  merge(items: KnowledgeEvidence[]): KnowledgeEvidence {
    if (items.length === 0) {
      return createEvidence('No evidence', [], [], new Date().toISOString(), 0);
    }
    const allDataPoints: EvidenceDataPoint[] = [];
    const allProviders = new Set<string>();
    let totalConfidence = 0;

    for (const item of items) {
      allDataPoints.push(...item.dataPoints);
      item.sourceProviders.forEach((p) => allProviders.add(p));
      totalConfidence += item.confidence;
    }

    return {
      statement: items.map((i) => i.statement).join('; '),
      dataPoints: allDataPoints,
      sourceProviders: Array.from(allProviders),
      contextTimestamp: items[0]!.contextTimestamp,
      confidence: Math.max(0, Math.min(1, totalConfidence / items.length)),
    };
  }

  /**
   * Build evidence from an AIContext's provenance array.
   */
  fromContext(statement: string, context: AIContext): KnowledgeEvidence {
    return createEvidenceFromContext(statement, context.provenance, context.metadata.timestamp);
  }
}
