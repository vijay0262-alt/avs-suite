/**
 * Prediction Configuration — default configuration and factory.
 *
 * No hardcoded values in prediction logic. All rules and thresholds
 * are configurable here for future AI tuning.
 */
import type { PredictionConfiguration, TimeHorizonConfig } from './types';

export const DEFAULT_TIME_HORIZONS: TimeHorizonConfig[] = [
  { horizon: '24h', hours: 24, label: '24 Hours' },
  { horizon: '7d', hours: 168, label: '7 Days' },
  { horizon: '30d', hours: 720, label: '30 Days' },
  { horizon: '90d', hours: 2160, label: '90 Days' },
  { horizon: '180d', hours: 4320, label: '180 Days' },
  { horizon: '365d', hours: 8760, label: '365 Days' },
];

export const DEFAULT_PREDICTION_CONFIG: PredictionConfiguration = {
  predictionVersion: '1.0.0',
  enabledTypes: [
    'storage_capacity',
    'health_score_trend',
    'startup_growth',
    'browser_cache_growth',
    'temp_file_growth',
    'duplicate_file_growth',
    'disk_consumption',
    'optimization_frequency',
    'maintenance_requirement',
    'privacy_degradation',
    'windows_maintenance',
  ],
  timeHorizons: [...DEFAULT_TIME_HORIZONS],
  confidenceRules: {
    minSamples: 3,
    minDataFreshnessHours: 48,
    highConfidenceThreshold: 0.75,
    mediumConfidenceThreshold: 0.55,
    lowConfidenceThreshold: 0.35,
    insufficientDataThreshold: 0.20,
  },
  riskRules: {
    noneThreshold: 0.1,
    lowThreshold: 0.3,
    mediumThreshold: 0.5,
    highThreshold: 0.7,
    criticalThreshold: 0.85,
  },
  expirationConfig: {
    defaultExpirationHours: 48,
    shortTermExpirationHours: 24,
    longTermExpirationHours: 168,
  },
  modelSettings: {
    modelVersion: '1.0.0',
    minHistoricalSnapshots: 3,
    maxExtrapolationDays: 365,
    seasonalDetectionEnabled: true,
    outlierRemovalEnabled: true,
  },
  maxPredictions: 50,
  enableHistory: true,
  maxHistoryEntries: 200,
  enableTimeline: true,
  maxTimelineEntries: 300,
  enableAccuracyTracking: true,
  maxAccuracyRecords: 100,
  minConfidenceThreshold: 0.2,
};

export function createPredictionConfig(
  overrides?: Partial<PredictionConfiguration>,
): PredictionConfiguration {
  if (!overrides) return { ...DEFAULT_PREDICTION_CONFIG };
  const merged: PredictionConfiguration = {
    ...DEFAULT_PREDICTION_CONFIG,
    ...overrides,
    confidenceRules: {
      ...DEFAULT_PREDICTION_CONFIG.confidenceRules,
      ...overrides.confidenceRules,
    },
    riskRules: {
      ...DEFAULT_PREDICTION_CONFIG.riskRules,
      ...overrides.riskRules,
    },
    expirationConfig: {
      ...DEFAULT_PREDICTION_CONFIG.expirationConfig,
      ...overrides.expirationConfig,
    },
    modelSettings: {
      ...DEFAULT_PREDICTION_CONFIG.modelSettings,
      ...overrides.modelSettings,
    },
    enabledTypes: overrides.enabledTypes ?? DEFAULT_PREDICTION_CONFIG.enabledTypes,
    timeHorizons: overrides.timeHorizons ?? DEFAULT_PREDICTION_CONFIG.timeHorizons,
  };
  return merged;
}
