/**
 * AI Report Studio — Configuration
 *
 * EPIC 5 PHASE A PART 5
 */
import type { ReportStudioConfiguration, ReportFeatureFlags, ReportPerformanceTargets, ExportFormat, TimeRangePreset } from './types';
import { createDefaultReportStudioConfiguration } from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P];
};

export const DEFAULT_REPORT_STUDIO_CONFIGURATION: ReportStudioConfiguration = createDefaultReportStudioConfiguration();

export function createReportStudioConfiguration(overrides?: DeepPartial<ReportStudioConfiguration>): ReportStudioConfiguration {
  if (!overrides) return structuredClone(DEFAULT_REPORT_STUDIO_CONFIGURATION);
  const base = DEFAULT_REPORT_STUDIO_CONFIGURATION;
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    defaultTimeRange: overrides.defaultTimeRange as TimeRangePreset ?? base.defaultTimeRange,
    defaultExportFormat: overrides.defaultExportFormat as ExportFormat ?? base.defaultExportFormat,
    featureFlags: overrides.featureFlags
      ? { ...base.featureFlags, ...overrides.featureFlags }
      : base.featureFlags,
    performanceTargets: overrides.performanceTargets
      ? { ...base.performanceTargets, ...overrides.performanceTargets }
      : base.performanceTargets,
    enterpriseTemplates: overrides.enterpriseTemplates ?? base.enterpriseTemplates,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateReportStudioConfiguration(config: ReportStudioConfiguration): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.performanceTargets.reportGenerationTargetMs < 0) errors.push('reportGenerationTargetMs must be >= 0');

  return { valid: errors.length === 0, errors };
}
