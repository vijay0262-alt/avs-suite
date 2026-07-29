/**
 * Report Configuration — defaults and factory.
 */
import type { ReportConfiguration, SectionType, ReportTemplate } from './types';
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
    templates: overrides.templates
      ? { ...base.templates, ...overrides.templates } as Record<string, ReportTemplate>
      : base.templates,
    sections: overrides.sections
      ? { ...base.sections, ...overrides.sections } as Record<SectionType, { enabled: boolean; visible: boolean }>
      : base.sections,
    exportOptions: { ...base.exportOptions, ...overrides.exportOptions },
    comparisonRules: { ...base.comparisonRules, ...overrides.comparisonRules },
    featureFlags: {
      ...base.featureFlags,
      ...overrides.featureFlags,
      futureFlags: overrides.featureFlags?.futureFlags
        ? (overrides.featureFlags.futureFlags as Record<string, boolean>)
        : base.featureFlags.futureFlags,
    },
  };
}

export function isSectionEnabled(config: ReportConfiguration, section: SectionType): boolean {
  return config.sections[section]?.enabled ?? false;
}

export function isSectionVisible(config: ReportConfiguration, section: SectionType): boolean {
  return config.sections[section]?.visible ?? false;
}

export function getTemplate(config: ReportConfiguration, name: string) {
  return config.templates[name] ?? null;
}
