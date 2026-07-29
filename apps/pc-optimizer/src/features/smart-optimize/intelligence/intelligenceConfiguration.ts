/**
 * Intelligence Configuration — defaults and factory.
 */
import type {
  IntelligenceConfiguration,
  RankingWeight,
  PatternRule,
  PredictionRule,
} from './types';
import { createDefaultIntelligenceConfiguration } from './types';

export const DEFAULT_INTELLIGENCE_CONFIGURATION: IntelligenceConfiguration = createDefaultIntelligenceConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createIntelligenceConfiguration(
  overrides?: DeepPartial<IntelligenceConfiguration>,
): IntelligenceConfiguration {
  if (!overrides) return { ...DEFAULT_INTELLIGENCE_CONFIGURATION };
  const base = { ...DEFAULT_INTELLIGENCE_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    rankingWeights: (overrides.rankingWeights as RankingWeight[] | undefined) ?? base.rankingWeights,
    patternRules: (overrides.patternRules as PatternRule[] | undefined) ?? base.patternRules,
    predictionRules: (overrides.predictionRules as PredictionRule[] | undefined) ?? base.predictionRules,
    historyRetention: {
      ...base.historyRetention,
      ...overrides.historyRetention,
      futureMetadata: overrides.historyRetention?.futureMetadata
        ? (overrides.historyRetention.futureMetadata as Record<string, unknown>)
        : base.historyRetention.futureMetadata,
    },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}
