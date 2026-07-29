/**
 * Automation History Analyzer — analyzes raw history entries.
 *
 * Aggregates automation, maintenance, and adaptive history into
 * a unified view for downstream analysis.
 */
import type {
  IntelligenceInput,
  Evidence,
  AutomationHistoryEntry,
  MaintenanceHistoryEntry,
  AdaptiveHistoryEntry,
} from './types';

export interface HistoryAnalysisSummary {
  totalEntries: number;
  automationEntries: number;
  maintenanceEntries: number;
  adaptiveEntries: number;
  dateRange: { earliest: string | null; latest: string | null };
  uniqueRules: string[];
  uniqueTriggers: string[];
  uniqueActions: string[];
  uniqueMaintenanceTypes: string[];
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

export class AutomationHistoryAnalyzer {
  analyze(input: IntelligenceInput): HistoryAnalysisSummary {
    const { automationHistory, maintenanceHistory, adaptiveHistory } = input;

    const allTimestamps: string[] = [
      ...automationHistory.map((e) => e.timestamp),
      ...maintenanceHistory.map((e) => e.timestamp),
      ...adaptiveHistory.map((e) => e.timestamp),
    ].sort();

    const uniqueRules = [...new Set(automationHistory.map((e) => e.ruleId))];
    const uniqueTriggers = [...new Set(automationHistory.map((e) => e.triggerType))];
    const uniqueActions = [...new Set(automationHistory.flatMap((e) => e.actions))];
    const uniqueMaintenanceTypes = [...new Set(maintenanceHistory.map((e) => e.type))];

    const evidence: Evidence[] = [
      {
        source: 'automation_history',
        metric: 'total_entries',
        value: automationHistory.length,
        timestamp: new Date().toISOString(),
        description: `${automationHistory.length} automation history entries analyzed`,
        futureMetadata: {},
      },
      {
        source: 'maintenance_history',
        metric: 'total_entries',
        value: maintenanceHistory.length,
        timestamp: new Date().toISOString(),
        description: `${maintenanceHistory.length} maintenance history entries analyzed`,
        futureMetadata: {},
      },
      {
        source: 'adaptive_history',
        metric: 'total_entries',
        value: adaptiveHistory.length,
        timestamp: new Date().toISOString(),
        description: `${adaptiveHistory.length} adaptive history entries analyzed`,
        futureMetadata: {},
      },
    ];

    return {
      totalEntries: automationHistory.length + maintenanceHistory.length + adaptiveHistory.length,
      automationEntries: automationHistory.length,
      maintenanceEntries: maintenanceHistory.length,
      adaptiveEntries: adaptiveHistory.length,
      dateRange: {
        earliest: allTimestamps[0] ?? null,
        latest: allTimestamps[allTimestamps.length - 1] ?? null,
      },
      uniqueRules,
      uniqueTriggers,
      uniqueActions,
      uniqueMaintenanceTypes,
      evidence,
      futureMetadata: {},
    };
  }

  filterByDateRange<T extends { timestamp: string }>(entries: T[], from: string, to: string): T[] {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    return entries.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= fromTime && t <= toTime;
    });
  }

  filterByRule(entries: AutomationHistoryEntry[], ruleId: string): AutomationHistoryEntry[] {
    return entries.filter((e) => e.ruleId === ruleId);
  }

  filterByOutcome(entries: AutomationHistoryEntry[], outcome: string): AutomationHistoryEntry[] {
    return entries.filter((e) => e.outcome === outcome);
  }

  filterByTrigger(entries: AutomationHistoryEntry[], triggerType: string): AutomationHistoryEntry[] {
    return entries.filter((e) => e.triggerType === triggerType);
  }

  filterByMaintenanceType(entries: MaintenanceHistoryEntry[], type: string): MaintenanceHistoryEntry[] {
    return entries.filter((e) => e.type === type);
  }

  filterByMaintenanceOutcome(entries: MaintenanceHistoryEntry[], outcome: string): MaintenanceHistoryEntry[] {
    return entries.filter((e) => e.outcome === outcome);
  }

  getRecentAutomation(entries: AutomationHistoryEntry[], count: number): AutomationHistoryEntry[] {
    return entries.slice(-count);
  }

  getRecentMaintenance(entries: MaintenanceHistoryEntry[], count: number): MaintenanceHistoryEntry[] {
    return entries.slice(-count);
  }

  getRecentAdaptive(entries: AdaptiveHistoryEntry[], count: number): AdaptiveHistoryEntry[] {
    return entries.slice(-count);
  }
}
