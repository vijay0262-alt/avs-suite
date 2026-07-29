/**
 * Automation Outcome Analyzer — analyzes success/failure of automation outcomes.
 *
 * Tracks: Acceptance Rate, Completion Rate, Success Rate, Benefit Score,
 * Health Improvement, Storage Recovery, Performance Gain, Privacy Improvement,
 * Time Saved, Rollback Frequency, Failure Rate.
 */
import type {
  IntelligenceInput,
  OutcomeMetrics,
  OutcomeAnalysisResult,
  OutcomeTrend,
  Evidence,
  TrendDirection,
} from './types';
import { generateTrendId } from './types';

export class AutomationOutcomeAnalyzer {
  analyze(input: IntelligenceInput): OutcomeAnalysisResult {
    const automationMetrics = this._analyzeAutomation(input.automationHistory);
    const maintenanceMetrics = this._analyzeMaintenance(input.maintenanceHistory);
    const adaptiveMetrics = this._analyzeAdaptive(input.adaptiveHistory);
    const trends = this._detectTrends(input, automationMetrics);

    const overallSuccessRate = (automationMetrics.successRate + maintenanceMetrics.successRate + adaptiveMetrics.successRate) / 3;

    return {
      automationMetrics,
      maintenanceMetrics,
      adaptiveMetrics,
      overallSuccessRate,
      trends,
      analyzedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _analyzeAutomation(entries: IntelligenceInput['automationHistory']): OutcomeMetrics {
    const total = entries.length;
    if (total === 0) return this._emptyMetrics();

    const accepted = entries.filter((e) => e.outcome === 'approved' || e.outcome === 'executed').length;
    const completed = entries.filter((e) => e.outcome === 'executed').length;
    const successful = entries.filter((e) => e.outcome === 'executed').length;
    const failed = entries.filter((e) => e.outcome === 'rejected' || e.outcome === 'expired').length;
    const rolledBack = entries.filter((e) => e.metadata['rolledBack'] === true).length;

    const byOutcome: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    let totalConfidence = 0;
    let totalBenefit = 0;

    for (const entry of entries) {
      byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
      byTrigger[entry.triggerType] = (byTrigger[entry.triggerType] ?? 0) + 1;
      for (const action of entry.actions) {
        byAction[action] = (byAction[action] ?? 0) + 1;
      }
      totalConfidence += entry.confidence;
      totalBenefit += (entry.metadata['benefit'] as number) ?? 0;
    }

    return {
      acceptanceRate: total > 0 ? accepted / total : 0,
      completionRate: total > 0 ? completed / total : 0,
      successRate: total > 0 ? successful / total : 0,
      failureRate: total > 0 ? failed / total : 0,
      rollbackFrequency: total > 0 ? rolledBack / total : 0,
      averageBenefit: total > 0 ? totalBenefit / total : 0,
      averageConfidence: total > 0 ? totalConfidence / total : 0,
      totalSuccessful: successful,
      totalFailed: failed,
      totalRolledBack: rolledBack,
      byOutcome,
      byTrigger,
      byAction,
      futureMetadata: {},
    };
  }

  private _analyzeMaintenance(entries: IntelligenceInput['maintenanceHistory']): OutcomeMetrics {
    const total = entries.length;
    if (total === 0) return this._emptyMetrics();

    const accepted = entries.filter((e) => e.outcome === 'accepted' || e.outcome === 'completed').length;
    const completed = entries.filter((e) => e.outcome === 'completed').length;
    const successful = entries.filter((e) => e.outcome === 'completed').length;
    const failed = entries.filter((e) => e.outcome === 'cancelled' || e.outcome === 'expired').length;

    const byOutcome: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    let totalConfidence = 0;
    let totalBenefit = 0;

    for (const entry of entries) {
      byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
      byTrigger[entry.type] = (byTrigger[entry.type] ?? 0) + 1;
      totalConfidence += entry.confidence;
      totalBenefit += entry.actualBenefit ?? entry.expectedBenefit;
    }

    return {
      acceptanceRate: total > 0 ? accepted / total : 0,
      completionRate: total > 0 ? completed / total : 0,
      successRate: total > 0 ? successful / total : 0,
      failureRate: total > 0 ? failed / total : 0,
      rollbackFrequency: 0,
      averageBenefit: total > 0 ? totalBenefit / total : 0,
      averageConfidence: total > 0 ? totalConfidence / total : 0,
      totalSuccessful: successful,
      totalFailed: failed,
      totalRolledBack: 0,
      byOutcome,
      byTrigger,
      byAction,
      futureMetadata: {},
    };
  }

  private _analyzeAdaptive(entries: IntelligenceInput['adaptiveHistory']): OutcomeMetrics {
    const total = entries.length;
    if (total === 0) return this._emptyMetrics();

    const successful = entries.filter((e) => e.confidence >= 0.5).length;
    const failed = entries.filter((e) => e.confidence < 0.3).length;

    const byOutcome: Record<string, number> = {};
    const byTrigger: Record<string, number> = {};
    const byAction: Record<string, number> = {};

    let totalConfidence = 0;

    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
      byTrigger[entry.conditionType] = (byTrigger[entry.conditionType] ?? 0) + 1;
      totalConfidence += entry.confidence;
    }

    byOutcome['successful'] = successful;
    byOutcome['failed'] = failed;

    return {
      acceptanceRate: 0,
      completionRate: total > 0 ? successful / total : 0,
      successRate: total > 0 ? successful / total : 0,
      failureRate: total > 0 ? failed / total : 0,
      rollbackFrequency: 0,
      averageBenefit: 0,
      averageConfidence: total > 0 ? totalConfidence / total : 0,
      totalSuccessful: successful,
      totalFailed: failed,
      totalRolledBack: 0,
      byOutcome,
      byTrigger,
      byAction,
      futureMetadata: {},
    };
  }

  private _detectTrends(input: IntelligenceInput, _currentMetrics: OutcomeMetrics): OutcomeTrend[] {
    const trends: OutcomeTrend[] = [];
    const entries = input.automationHistory;

    if (entries.length < 4) return trends;

    const midpoint = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, midpoint);
    const secondHalf = entries.slice(midpoint);

    const firstSuccess = firstHalf.filter((e) => e.outcome === 'executed').length / firstHalf.length;
    const secondSuccess = secondHalf.filter((e) => e.outcome === 'executed').length / secondHalf.length;

    const direction: TrendDirection = secondSuccess > firstSuccess + 0.05
      ? 'improving'
      : secondSuccess < firstSuccess - 0.05
        ? 'declining'
        : 'stable';

    const evidence: Evidence[] = [
      {
        source: 'automation_history',
        metric: 'first_half_success_rate',
        value: firstSuccess,
        timestamp: new Date().toISOString(),
        description: `First half success rate: ${(firstSuccess * 100).toFixed(1)}%`,
        futureMetadata: {},
      },
      {
        source: 'automation_history',
        metric: 'second_half_success_rate',
        value: secondSuccess,
        timestamp: new Date().toISOString(),
        description: `Second half success rate: ${(secondSuccess * 100).toFixed(1)}%`,
        futureMetadata: {},
      },
    ];

    trends.push({
      id: generateTrendId(),
      metric: 'success_rate',
      direction,
      changeRate: secondSuccess - firstSuccess,
      currentValue: secondSuccess,
      previousValue: firstSuccess,
      supportingEvidence: evidence,
      futureMetadata: {},
    });

    const firstConfidence = firstHalf.reduce((sum, e) => sum + e.confidence, 0) / firstHalf.length;
    const secondConfidence = secondHalf.reduce((sum, e) => sum + e.confidence, 0) / secondHalf.length;

    const confDirection: TrendDirection = secondConfidence > firstConfidence + 0.05
      ? 'improving'
      : secondConfidence < firstConfidence - 0.05
        ? 'declining'
        : 'stable';

    trends.push({
      id: generateTrendId(),
      metric: 'average_confidence',
      direction: confDirection,
      changeRate: secondConfidence - firstConfidence,
      currentValue: secondConfidence,
      previousValue: firstConfidence,
      supportingEvidence: [
        {
          source: 'automation_history',
          metric: 'first_half_confidence',
          value: firstConfidence,
          timestamp: new Date().toISOString(),
          description: `First half average confidence: ${firstConfidence.toFixed(2)}`,
          futureMetadata: {},
        },
        {
          source: 'automation_history',
          metric: 'second_half_confidence',
          value: secondConfidence,
          timestamp: new Date().toISOString(),
          description: `Second half average confidence: ${secondConfidence.toFixed(2)}`,
          futureMetadata: {},
        },
      ],
      futureMetadata: {},
    });

    return trends;
  }

  private _emptyMetrics(): OutcomeMetrics {
    return {
      acceptanceRate: 0,
      completionRate: 0,
      successRate: 0,
      failureRate: 0,
      rollbackFrequency: 0,
      averageBenefit: 0,
      averageConfidence: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      totalRolledBack: 0,
      byOutcome: {},
      byTrigger: {},
      byAction: {},
      futureMetadata: {},
    };
  }
}
