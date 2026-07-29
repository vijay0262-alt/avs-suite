/**
 * Knowledge Configuration — default configuration and factory.
 */
import type { KnowledgeConfiguration } from './types';

export const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfiguration = {
  enableRelationships: true,
  enableTrends: true,
  enableChanges: true,
  enableSummaries: true,
  enableInsights: true,
  enableGraph: true,
  minConfidenceThreshold: 0.5,
  maxHistorySnapshots: 10,
  knowledgeVersion: '1.0.0',
  graphMaxNodes: 500,
  graphMaxEdges: 1000,
};

export function createKnowledgeConfig(
  overrides?: Partial<KnowledgeConfiguration>,
): KnowledgeConfiguration {
  return { ...DEFAULT_KNOWLEDGE_CONFIG, ...overrides };
}
