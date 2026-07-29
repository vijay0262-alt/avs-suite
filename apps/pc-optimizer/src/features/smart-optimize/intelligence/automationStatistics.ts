/**
 * Automation Statistics — computes aggregate statistics from all history sources.
 */
import type {
  IntelligenceInput,
  IntelligenceStatistics,
  RuleStatistic,
  Evidence,
} from './types';
import type { AutomationHistoryAnalyzer } from './automationHistoryAnalyzer';

export class AutomationStatistics {
  private _historyAnalyzer: AutomationHistoryAnalyzer;

  constructor(historyAnalyzer: AutomationHistoryAnalyzer) {
    this._historyAnalyzer = historyAnalyzer;
  }

  compute(input: IntelligenceInput, lastAnalysisAt: string | null = null): IntelligenceStatistics {
    this._historyAnalyzer.analyze(input);

    const automationEntries = input.automationHistory;
    const maintenanceEntries = input.maintenanceHistory;
    const adaptiveEntries = input.adaptiveHistory;

    const totalEntries = automationEntries.length + maintenanceEntries.length + adaptiveEntries.length;

    const automationSuccess = automationEntries.filter((e) => e.outcome === 'executed').length;
    const maintenanceSuccess = maintenanceEntries.filter((e) => e.outcome === 'completed').length;
    const adaptiveSuccess = adaptiveEntries.filter((e) => e.confidence >= 0.5).length;
    const overallSuccessRate = totalEntries > 0
      ? (automationSuccess + maintenanceSuccess + adaptiveSuccess) / totalEntries
      : 0;

    const automationAccepted = automationEntries.filter((e) => e.outcome === 'approved' || e.outcome === 'executed').length;
    const maintenanceAccepted = maintenanceEntries.filter((e) => e.outcome === 'accepted' || e.outcome === 'completed').length;
    const overallAcceptanceRate = (automationEntries.length + maintenanceEntries.length) > 0
      ? (automationAccepted + maintenanceAccepted) / (automationEntries.length + maintenanceEntries.length)
      : 0;

    const allConfidences = [
      ...automationEntries.map((e) => e.confidence),
      ...maintenanceEntries.map((e) => e.confidence),
      ...adaptiveEntries.map((e) => e.confidence),
    ];
    const averageConfidence = allConfidences.length > 0
      ? allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length
      : 0;

    const allBenefits = [
      ...automationEntries.map((e) => (e.metadata['benefit'] as number) ?? 0),
      ...maintenanceEntries.map((e) => e.actualBenefit ?? e.expectedBenefit),
    ];
    const averageBenefit = allBenefits.length > 0
      ? allBenefits.reduce((sum, b) => sum + b, 0) / allBenefits.length
      : 0;

    const byTriggerType: Record<string, number> = {};
    for (const e of automationEntries) {
      byTriggerType[e.triggerType] = (byTriggerType[e.triggerType] ?? 0) + 1;
    }

    const byOutcome: Record<string, number> = {};
    for (const e of automationEntries) byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
    for (const e of maintenanceEntries) byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;

    const byActionType: Record<string, number> = {};
    for (const e of automationEntries) {
      for (const action of e.actions) {
        byActionType[action] = (byActionType[action] ?? 0) + 1;
      }
    }

    const byMaintenanceType: Record<string, number> = {};
    for (const e of maintenanceEntries) {
      byMaintenanceType[e.type] = (byMaintenanceType[e.type] ?? 0) + 1;
    }

    const topRules = this._computeTopRules(automationEntries);

    return {
      totalHistoryEntries: totalEntries,
      totalAutomationEntries: automationEntries.length,
      totalMaintenanceEntries: maintenanceEntries.length,
      totalAdaptiveEntries: adaptiveEntries.length,
      overallSuccessRate,
      overallAcceptanceRate,
      averageConfidence,
      averageBenefit,
      patternsDetected: 0,
      insightsGenerated: 0,
      recommendationsGenerated: 0,
      predictionsMade: 0,
      byTriggerType,
      byOutcome,
      byActionType,
      byMaintenanceType,
      topRules,
      lastAnalysisAt,
      futureMetadata: {},
    };
  }

  private _computeTopRules(entries: IntelligenceInput['automationHistory']): RuleStatistic[] {
    const ruleMap: Record<string, { triggers: number; successes: number; approvals: number; confidences: number[]; benefits: number[] }> = {};

    for (const e of entries) {
      if (!ruleMap[e.ruleId]) ruleMap[e.ruleId] = { triggers: 0, successes: 0, approvals: 0, confidences: [], benefits: [] };
      const r = ruleMap[e.ruleId]!;
      r.triggers++;
      if (e.outcome === 'executed') r.successes++;
      if (e.outcome === 'approved' || e.outcome === 'executed') r.approvals++;
      r.confidences.push(e.confidence);
      r.benefits.push((e.metadata['benefit'] as number) ?? 0);
    }

    return Object.entries(ruleMap)
      .map(([ruleId, r]) => ({
        ruleId,
        totalTriggers: r.triggers,
        successRate: r.triggers > 0 ? r.successes / r.triggers : 0,
        approvalRate: r.triggers > 0 ? r.approvals / r.triggers : 0,
        averageConfidence: r.confidences.length > 0 ? r.confidences.reduce((s, c) => s + c, 0) / r.confidences.length : 0,
        averageBenefit: r.benefits.length > 0 ? r.benefits.reduce((s, b) => s + b, 0) / r.benefits.length : 0,
        futureMetadata: {},
      }))
      .sort((a, b) => b.totalTriggers - a.totalTriggers)
      .slice(0, 10);
  }

  getEvidence(stats: IntelligenceStatistics): Evidence[] {
    const ts = new Date().toISOString();
    return [
      { source: 'statistics', metric: 'total_entries', value: stats.totalHistoryEntries, timestamp: ts, description: `${stats.totalHistoryEntries} total history entries`, futureMetadata: {} },
      { source: 'statistics', metric: 'success_rate', value: stats.overallSuccessRate, timestamp: ts, description: `Overall success rate: ${(stats.overallSuccessRate * 100).toFixed(1)}%`, futureMetadata: {} },
      { source: 'statistics', metric: 'acceptance_rate', value: stats.overallAcceptanceRate, timestamp: ts, description: `Overall acceptance rate: ${(stats.overallAcceptanceRate * 100).toFixed(1)}%`, futureMetadata: {} },
      { source: 'statistics', metric: 'average_confidence', value: stats.averageConfidence, timestamp: ts, description: `Average confidence: ${stats.averageConfidence.toFixed(2)}`, futureMetadata: {} },
    ];
  }
}
