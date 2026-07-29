/**
 * Simulation Configuration — default configuration and factory function.
 */
import type { SimulationConfiguration } from './types';

export const DEFAULT_SIMULATION_CONFIGURATION: SimulationConfiguration = {
  configVersion: '1.0.0',
  estimationRules: [
    { factor: 'historical_success', weight: 0.25, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'plan_confidence', weight: 0.15, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'action_confidence', weight: 0.10, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'risk_level', weight: 0.15, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'health_score', weight: 0.10, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'device_profile', weight: 0.05, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'optimization_history', weight: 0.10, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'plan_benefits', weight: 0.05, enabled: true, minConfidence: 0.3, futureMetadata: {} },
    { factor: 'safety_assessment', weight: 0.05, enabled: true, minConfidence: 0.3, futureMetadata: {} },
  ],
  confidenceRules: [
    { factor: 'historical_samples', weight: 0.3, enabled: true, minSamples: 3, futureMetadata: {} },
    { factor: 'plan_confidence', weight: 0.2, enabled: true, minSamples: 1, futureMetadata: {} },
    { factor: 'action_confidence', weight: 0.2, enabled: true, minSamples: 1, futureMetadata: {} },
    { factor: 'risk_alignment', weight: 0.15, enabled: true, minSamples: 1, futureMetadata: {} },
    { factor: 'benefit_consistency', weight: 0.15, enabled: true, minSamples: 1, futureMetadata: {} },
  ],
  formattingRules: [
    { format: 'json', enabled: true, template: 'default', options: { pretty: true }, futureMetadata: {} },
    { format: 'markdown', enabled: true, template: 'default', options: { sections: ['summary', 'details', 'evidence'] }, futureMetadata: {} },
    { format: 'pdf_ready', enabled: true, template: 'default', options: { pageSize: 'A4' }, futureMetadata: {} },
  ],
  comparisonRules: [
    { metric: 'estimatedHealthAfter', weight: 0.25, enabled: true, higherIsBetter: true, futureMetadata: {} },
    { metric: 'estimatedStorageRecovered', weight: 0.20, enabled: true, higherIsBetter: true, futureMetadata: {} },
    { metric: 'estimatedPerformanceGain', weight: 0.20, enabled: true, higherIsBetter: true, futureMetadata: {} },
    { metric: 'estimatedPrivacyImprovement', weight: 0.10, enabled: true, higherIsBetter: true, futureMetadata: {} },
    { metric: 'estimatedDuration', weight: 0.10, enabled: true, higherIsBetter: false, futureMetadata: {} },
    { metric: 'estimatedRisk', weight: 0.15, enabled: true, higherIsBetter: false, futureMetadata: {} },
  ],
  featureFlags: {
    enableEstimation: true,
    enableComparison: true,
    enableValidation: true,
    enableHistory: true,
    enableAnalytics: true,
    enableExport: true,
    enableExplainability: true,
    enableIncrementalUpdates: true,
    enableCaching: true,
    futureFlags: {},
  },
  enableEvents: true,
  maxHistoryEntries: 500,
  simulationExpiryMs: 3600000,
  maxSimulationsPerComparison: 10,
  performanceTargetMs: 200,
  futureMetadata: {},
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createSimulationConfiguration(
  overrides?: DeepPartial<SimulationConfiguration>,
): SimulationConfiguration {
  if (!overrides) return structuredClone(DEFAULT_SIMULATION_CONFIGURATION);

  const base = structuredClone(DEFAULT_SIMULATION_CONFIGURATION);
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    estimationRules: (overrides.estimationRules ?? base.estimationRules) as typeof base.estimationRules,
    confidenceRules: (overrides.confidenceRules ?? base.confidenceRules) as typeof base.confidenceRules,
    formattingRules: (overrides.formattingRules ?? base.formattingRules) as typeof base.formattingRules,
    comparisonRules: (overrides.comparisonRules ?? base.comparisonRules) as typeof base.comparisonRules,
    featureFlags: {
      enableEstimation: overrides.featureFlags?.enableEstimation ?? base.featureFlags.enableEstimation,
      enableComparison: overrides.featureFlags?.enableComparison ?? base.featureFlags.enableComparison,
      enableValidation: overrides.featureFlags?.enableValidation ?? base.featureFlags.enableValidation,
      enableHistory: overrides.featureFlags?.enableHistory ?? base.featureFlags.enableHistory,
      enableAnalytics: overrides.featureFlags?.enableAnalytics ?? base.featureFlags.enableAnalytics,
      enableExport: overrides.featureFlags?.enableExport ?? base.featureFlags.enableExport,
      enableExplainability: overrides.featureFlags?.enableExplainability ?? base.featureFlags.enableExplainability,
      enableIncrementalUpdates: overrides.featureFlags?.enableIncrementalUpdates ?? base.featureFlags.enableIncrementalUpdates,
      enableCaching: overrides.featureFlags?.enableCaching ?? base.featureFlags.enableCaching,
      futureFlags: (overrides.featureFlags?.futureFlags ?? base.featureFlags.futureFlags) as Record<string, boolean>,
    },
    enableEvents: overrides.enableEvents ?? base.enableEvents,
    maxHistoryEntries: overrides.maxHistoryEntries ?? base.maxHistoryEntries,
    simulationExpiryMs: overrides.simulationExpiryMs ?? base.simulationExpiryMs,
    maxSimulationsPerComparison: overrides.maxSimulationsPerComparison ?? base.maxSimulationsPerComparison,
    performanceTargetMs: overrides.performanceTargetMs ?? base.performanceTargetMs,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}
