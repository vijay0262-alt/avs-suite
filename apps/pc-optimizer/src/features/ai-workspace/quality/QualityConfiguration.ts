/**
 * Product Completion Program — Quality Configuration
 *
 * PCP PHASE 1 PART 1
 *
 * Configuration-driven quality audit with severity thresholds,
 * performance thresholds, quality thresholds, feature flags, and
 * audit exclusions.
 */
import type {
  QualityConfiguration,
  SeverityThresholds,
  PerformanceThresholds,
  QualityThresholds,
  QualityFeatureFlags,
} from './types';
import {
  createDefaultQualityConfiguration,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<unknown>
    ? T[P]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

export const DEFAULT_QUALITY_CONFIGURATION: QualityConfiguration = createDefaultQualityConfiguration();

export function createQualityConfiguration(
  overrides?: DeepPartial<QualityConfiguration>,
): QualityConfiguration {
  if (!overrides) return structuredClone(DEFAULT_QUALITY_CONFIGURATION);
  return mergeConfiguration(DEFAULT_QUALITY_CONFIGURATION, overrides);
}

function mergeConfiguration(
  base: QualityConfiguration,
  overrides: DeepPartial<QualityConfiguration>,
): QualityConfiguration {
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    severityThresholds: overrides.severityThresholds
      ? mergeSeverityThresholds(base.severityThresholds, overrides.severityThresholds)
      : base.severityThresholds,
    performanceThresholds: overrides.performanceThresholds
      ? mergePerformanceThresholds(base.performanceThresholds, overrides.performanceThresholds)
      : base.performanceThresholds,
    qualityThresholds: overrides.qualityThresholds
      ? mergeQualityThresholds(base.qualityThresholds, overrides.qualityThresholds)
      : base.qualityThresholds,
    featureFlags: overrides.featureFlags
      ? mergeFeatureFlags(base.featureFlags, overrides.featureFlags)
      : base.featureFlags,
    auditExclusions: overrides.auditExclusions ?? base.auditExclusions,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeSeverityThresholds(
  base: SeverityThresholds,
  overrides: DeepPartial<SeverityThresholds>,
): SeverityThresholds {
  return {
    failOnCritical: overrides.failOnCritical ?? base.failOnCritical,
    failOnHigh: overrides.failOnHigh ?? base.failOnHigh,
    maxCriticalIssues: overrides.maxCriticalIssues ?? base.maxCriticalIssues,
    maxHighIssues: overrides.maxHighIssues ?? base.maxHighIssues,
    maxMediumIssues: overrides.maxMediumIssues ?? base.maxMediumIssues,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergePerformanceThresholds(
  base: PerformanceThresholds,
  overrides: DeepPartial<PerformanceThresholds>,
): PerformanceThresholds {
  return {
    applicationStartupMs: overrides.applicationStartupMs ?? base.applicationStartupMs,
    dashboardLoadMs: overrides.dashboardLoadMs ?? base.dashboardLoadMs,
    navigationMs: overrides.navigationMs ?? base.navigationMs,
    memoryUsageMB: overrides.memoryUsageMB ?? base.memoryUsageMB,
    cpuUsagePercent: overrides.cpuUsagePercent ?? base.cpuUsagePercent,
    scanInitializationMs: overrides.scanInitializationMs ?? base.scanInitializationMs,
    ipcLatencyMs: overrides.ipcLatencyMs ?? base.ipcLatencyMs,
    pythonCommunicationMs: overrides.pythonCommunicationMs ?? base.pythonCommunicationMs,
    databaseAccessMs: overrides.databaseAccessMs ?? base.databaseAccessMs,
    renderingPerformanceMs: overrides.renderingPerformanceMs ?? base.renderingPerformanceMs,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeQualityThresholds(
  base: QualityThresholds,
  overrides: DeepPartial<QualityThresholds>,
): QualityThresholds {
  return {
    minStabilityScore: overrides.minStabilityScore ?? base.minStabilityScore,
    minPerformanceScore: overrides.minPerformanceScore ?? base.minPerformanceScore,
    minReliabilityScore: overrides.minReliabilityScore ?? base.minReliabilityScore,
    minMaintainabilityScore: overrides.minMaintainabilityScore ?? base.minMaintainabilityScore,
    minUXScore: overrides.minUXScore ?? base.minUXScore,
    minAccessibilityScore: overrides.minAccessibilityScore ?? base.minAccessibilityScore,
    minSecurityScore: overrides.minSecurityScore ?? base.minSecurityScore,
    minOverallReadinessScore: overrides.minOverallReadinessScore ?? base.minOverallReadinessScore,
    minTestCoveragePercent: overrides.minTestCoveragePercent ?? base.minTestCoveragePercent,
    maxCyclomaticComplexity: overrides.maxCyclomaticComplexity ?? base.maxCyclomaticComplexity,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeFeatureFlags(
  base: QualityFeatureFlags,
  overrides: DeepPartial<QualityFeatureFlags>,
): QualityFeatureFlags {
  return {
    enableAudit: overrides.enableAudit ?? base.enableAudit,
    enablePerformanceBaseline: overrides.enablePerformanceBaseline ?? base.enablePerformanceBaseline,
    enableDependencyAnalysis: overrides.enableDependencyAnalysis ?? base.enableDependencyAnalysis,
    enableRegressionTracking: overrides.enableRegressionTracking ?? base.enableRegressionTracking,
    enableEvents: overrides.enableEvents ?? base.enableEvents,
    enableModuleHealthAnalysis: overrides.enableModuleHealthAnalysis ?? base.enableModuleHealthAnalysis,
    enableQualityMetrics: overrides.enableQualityMetrics ?? base.enableQualityMetrics,
    futureFlags: {
      ...base.futureFlags,
      ...Object.fromEntries(
        Object.entries(overrides.futureFlags ?? {}).filter(([, v]) => v !== undefined),
      ) as Record<string, boolean>,
    },
  };
}

export function validateQualityConfiguration(
  config: QualityConfiguration,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.severityThresholds.maxCriticalIssues < 0)
    errors.push('maxCriticalIssues must be >= 0');
  if (config.severityThresholds.maxHighIssues < 0)
    errors.push('maxHighIssues must be >= 0');
  if (config.severityThresholds.maxMediumIssues < 0)
    errors.push('maxMediumIssues must be >= 0');
  if (config.performanceThresholds.applicationStartupMs <= 0)
    errors.push('applicationStartupMs must be > 0');
  if (config.performanceThresholds.dashboardLoadMs <= 0)
    errors.push('dashboardLoadMs must be > 0');
  if (config.performanceThresholds.navigationMs <= 0)
    errors.push('navigationMs must be > 0');
  if (config.performanceThresholds.memoryUsageMB <= 0)
    errors.push('memoryUsageMB must be > 0');
  if (config.performanceThresholds.cpuUsagePercent <= 0 || config.performanceThresholds.cpuUsagePercent > 100)
    errors.push('cpuUsagePercent must be between 1 and 100');
  if (config.qualityThresholds.minOverallReadinessScore < 0 || config.qualityThresholds.minOverallReadinessScore > 100)
    errors.push('minOverallReadinessScore must be between 0 and 100');
  if (config.qualityThresholds.minTestCoveragePercent < 0 || config.qualityThresholds.minTestCoveragePercent > 100)
    errors.push('minTestCoveragePercent must be between 0 and 100');
  if (config.qualityThresholds.maxCyclomaticComplexity <= 0)
    errors.push('maxCyclomaticComplexity must be > 0');

  return { valid: errors.length === 0, errors };
}
