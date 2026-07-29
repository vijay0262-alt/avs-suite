/**
 * Report Configuration — defaults and factory.
 */
import type { ReportConfiguration } from './types';
import { createDefaultReportConfiguration } from './types';

export const DEFAULT_REPORT_CONFIGURATION: ReportConfiguration = createDefaultReportConfiguration();

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createReportConfiguration(
  overrides?: DeepPartial<ReportConfiguration>,
): ReportConfiguration {
  if (!overrides) return { ...DEFAULT_REPORT_CONFIGURATION };
  const base = { ...DEFAULT_REPORT_CONFIGURATION };
  return {
    ...base,
    ...overrides,
    formattingRules: { ...base.formattingRules, ...overrides.formattingRules },
    storyRules: { ...base.storyRules, ...overrides.storyRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}
