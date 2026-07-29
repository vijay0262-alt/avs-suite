/**
 * Automation Pattern Analyzer — detects recurring patterns from history.
 *
 * Detects: Frequently Accepted Plans, Frequently Rejected Plans,
 * Best Maintenance Windows, Most Effective Profiles, Most Successful Strategies,
 * Most Beneficial Recommendations, Recurring Problems, Recurring Improvements,
 * Frequently Deferred Tasks, Frequently Cancelled Tasks.
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  DetectedPattern,
  PatternAnalysisResult,
  PatternType,
  PatternAnalyzerPlugin,
  Evidence,
  AutomationTriggerType,
  AutomationActionType,
} from './types';
import { generatePatternId } from './types';

export class AutomationPatternAnalyzer {
  private _config: IntelligenceConfiguration;
  private _plugins: PatternAnalyzerPlugin[] = [];

  constructor(config: IntelligenceConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: PatternAnalyzerPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  analyze(input: IntelligenceInput): PatternAnalysisResult {
    const patterns: DetectedPattern[] = [];

    for (const rule of this._config.patternRules) {
      if (!rule.enabled) continue;

      const pluginResult = this._checkPlugins(rule.type, input);
      if (pluginResult) {
        patterns.push(pluginResult);
        continue;
      }

      const builtin = this._detectBuiltin(rule.type, rule.minFrequency, rule.minConfidence, input);
      if (builtin) patterns.push(builtin);
    }

    return {
      patterns,
      analyzedAt: new Date().toISOString(),
      totalEntriesAnalyzed: input.automationHistory.length + input.maintenanceHistory.length + input.adaptiveHistory.length,
      futureMetadata: {},
    };
  }

  private _checkPlugins(type: PatternType, input: IntelligenceInput): DetectedPattern | null {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getPatternType() === type) {
        return plugin.analyze(input);
      }
    }
    return null;
  }

  private _detectBuiltin(
    type: PatternType,
    minFreq: number,
    minConf: number,
    input: IntelligenceInput,
  ): DetectedPattern | null {
    switch (type) {
      case 'frequently_accepted': return this._detectFrequentlyAccepted(minFreq, minConf, input);
      case 'frequently_rejected': return this._detectFrequentlyRejected(minFreq, minConf, input);
      case 'best_maintenance_windows': return this._detectBestMaintenanceWindows(minFreq, minConf, input);
      case 'most_effective_profiles': return this._detectMostEffectiveProfiles(minFreq, minConf, input);
      case 'most_successful_strategies': return this._detectMostSuccessfulStrategies(minFreq, minConf, input);
      case 'most_beneficial_recommendations': return this._detectMostBeneficial(minFreq, minConf, input);
      case 'recurring_problems': return this._detectRecurringProblems(minFreq, minConf, input);
      case 'recurring_improvements': return this._detectRecurringImprovements(minFreq, minConf, input);
      case 'frequently_deferred': return this._detectFrequentlyDeferred(minFreq, minConf, input);
      case 'frequently_cancelled': return this._detectFrequentlyCancelled(minFreq, minConf, input);
      default: return null;
    }
  }

  private _detectFrequentlyAccepted(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const ruleCounts: Record<string, { accepted: number; total: number }> = {};
    for (const e of input.automationHistory) {
      if (!ruleCounts[e.ruleId]) ruleCounts[e.ruleId] = { accepted: 0, total: 0 };
      ruleCounts[e.ruleId]!.total++;
      if (e.outcome === 'approved' || e.outcome === 'executed') ruleCounts[e.ruleId]!.accepted++;
    }
    const top = Object.entries(ruleCounts)
      .filter(([, c]) => c.accepted >= minFreq && c.accepted / c.total >= minConf)
      .sort((a, b) => b[1].accepted - a[1].accepted)
      .slice(0, 5);
    if (top.length === 0) return null;

    const affectedRules = top.map(([r]) => r);
    const frequency = top.reduce((sum, [, c]) => sum + c.accepted, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.accepted / c.total, 0) / top.length;

    return this._makePattern(
      'frequently_accepted', 'Frequently Accepted Plans',
      `${top.length} rules frequently accepted by users`,
      avgRate, frequency, affectedRules, [], [],
      this._ruleEvidence(top, 'accepted'),
    );
  }

  private _detectFrequentlyRejected(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const ruleCounts: Record<string, { rejected: number; total: number }> = {};
    for (const e of input.automationHistory) {
      if (!ruleCounts[e.ruleId]) ruleCounts[e.ruleId] = { rejected: 0, total: 0 };
      ruleCounts[e.ruleId]!.total++;
      if (e.outcome === 'rejected') ruleCounts[e.ruleId]!.rejected++;
    }
    const top = Object.entries(ruleCounts)
      .filter(([, c]) => c.rejected >= minFreq && c.rejected / c.total >= minConf)
      .sort((a, b) => b[1].rejected - a[1].rejected)
      .slice(0, 5);
    if (top.length === 0) return null;

    const affectedRules = top.map(([r]) => r);
    const frequency = top.reduce((sum, [, c]) => sum + c.rejected, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.rejected / c.total, 0) / top.length;

    return this._makePattern(
      'frequently_rejected', 'Frequently Rejected Plans',
      `${top.length} rules frequently rejected by users`,
      avgRate, frequency, affectedRules, [], [],
      this._ruleEvidence(top, 'rejected'),
    );
  }

  private _detectBestMaintenanceWindows(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const hourBuckets: Record<number, { success: number; total: number }> = {};
    for (const e of input.maintenanceHistory) {
      const hour = new Date(e.timestamp).getHours();
      if (!hourBuckets[hour]) hourBuckets[hour] = { success: 0, total: 0 };
      hourBuckets[hour]!.total++;
      if (e.outcome === 'completed') hourBuckets[hour]!.success++;
    }
    const top = Object.entries(hourBuckets)
      .filter(([, c]) => c.total >= minFreq && c.success / c.total >= minConf)
      .sort((a, b) => b[1].success / b[1].total - a[1].success / a[1].total)
      .slice(0, 3);
    if (top.length === 0) return null;

    const frequency = top.reduce((sum, [, c]) => sum + c.total, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.success / c.total, 0) / top.length;
    const hours = top.map(([h]) => parseInt(h, 10));

    return this._makePattern(
      'best_maintenance_windows', 'Best Maintenance Windows',
      `Best maintenance hours: ${hours.map((h) => `${h}:00`).join(', ')}`,
      avgRate, frequency, [], [], [],
      top.map(([h, c]) => ({
        source: 'maintenance_history', metric: 'hour_success_rate',
        value: c.success / c.total, timestamp: new Date().toISOString(),
        description: `Hour ${h}:00 — ${c.success}/${c.total} successful`,
        futureMetadata: {},
      })),
    );
  }

  private _detectMostEffectiveProfiles(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const profileBuckets: Record<string, { success: number; total: number }> = {};
    for (const e of input.automationHistory) {
      const profile = (e.metadata['deviceProfile'] as string) ?? 'unknown';
      if (!profileBuckets[profile]) profileBuckets[profile] = { success: 0, total: 0 };
      profileBuckets[profile]!.total++;
      if (e.outcome === 'executed') profileBuckets[profile]!.success++;
    }
    const top = Object.entries(profileBuckets)
      .filter(([, c]) => c.total >= minFreq && c.success / c.total >= minConf)
      .sort((a, b) => b[1].success / b[1].total - a[1].success / a[1].total)
      .slice(0, 3);
    if (top.length === 0) return null;

    const frequency = top.reduce((sum, [, c]) => sum + c.total, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.success / c.total, 0) / top.length;
    const profiles = top.map(([p]) => p);

    return this._makePattern(
      'most_effective_profiles', 'Most Effective Profiles',
      `Profiles with best outcomes: ${profiles.join(', ')}`,
      avgRate, frequency, [], [], [],
      top.map(([p, c]) => ({
        source: 'automation_history', metric: 'profile_success_rate',
        value: c.success / c.total, timestamp: new Date().toISOString(),
        description: `Profile ${p} — ${c.success}/${c.total} successful`,
        futureMetadata: {},
      })),
      { affectedProfiles: profiles },
    );
  }

  private _detectMostSuccessfulStrategies(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const strategyBuckets: Record<string, { success: number; total: number }> = {};
    for (const e of input.maintenanceHistory) {
      const strategy = e.type;
      if (!strategyBuckets[strategy]) strategyBuckets[strategy] = { success: 0, total: 0 };
      strategyBuckets[strategy]!.total++;
      if (e.outcome === 'completed') strategyBuckets[strategy]!.success++;
    }
    const top = Object.entries(strategyBuckets)
      .filter(([, c]) => c.total >= minFreq && c.success / c.total >= minConf)
      .sort((a, b) => b[1].success / b[1].total - a[1].success / a[1].total)
      .slice(0, 3);
    if (top.length === 0) return null;

    const frequency = top.reduce((sum, [, c]) => sum + c.total, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.success / c.total, 0) / top.length;

    return this._makePattern(
      'most_successful_strategies', 'Most Successful Strategies',
      `Best strategies: ${top.map(([s]) => s).join(', ')}`,
      avgRate, frequency, [], [], [],
      top.map(([s, c]) => ({
        source: 'maintenance_history', metric: 'strategy_success_rate',
        value: c.success / c.total, timestamp: new Date().toISOString(),
        description: `Strategy ${s} — ${c.success}/${c.total} successful`,
        futureMetadata: {},
      })),
    );
  }

  private _detectMostBeneficial(minFreq: number, _minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const actionBenefit: Record<string, { totalBenefit: number; count: number }> = {};
    for (const e of input.automationHistory) {
      const benefit = (e.metadata['benefit'] as number) ?? 0;
      for (const action of e.actions) {
        if (!actionBenefit[action]) actionBenefit[action] = { totalBenefit: 0, count: 0 };
        actionBenefit[action]!.totalBenefit += benefit;
        actionBenefit[action]!.count++;
      }
    }
    const top = Object.entries(actionBenefit)
      .filter(([, c]) => c.count >= minFreq)
      .sort((a, b) => b[1].totalBenefit - a[1].totalBenefit)
      .slice(0, 5);
    if (top.length === 0) return null;

    const frequency = top.reduce((sum, [, c]) => sum + c.count, 0);
    const avgBenefit = top.reduce((sum, [, c]) => sum + c.totalBenefit / c.count, 0) / top.length;
    const actions = top.map(([a]) => a) as AutomationActionType[];

    return this._makePattern(
      'most_beneficial_recommendations', 'Most Beneficial Recommendations',
      `Actions with highest benefit: ${actions.join(', ')}`,
      Math.min(avgBenefit, 1.0), frequency, [], [], actions,
      top.map(([a, c]) => ({
        source: 'automation_history', metric: 'action_avg_benefit',
        value: c.totalBenefit / c.count, timestamp: new Date().toISOString(),
        description: `Action ${a} — avg benefit ${(c.totalBenefit / c.count).toFixed(2)}`,
        futureMetadata: {},
      })),
    );
  }

  private _detectRecurringProblems(minFreq: number, _minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const problemCounts: Record<string, number> = {};
    for (const e of input.automationHistory) {
      const problem = (e.metadata['problemType'] as string) ?? null;
      if (problem) problemCounts[problem] = (problemCounts[problem] ?? 0) + 1;
    }
    const top = Object.entries(problemCounts)
      .filter(([, c]) => c >= minFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (top.length === 0) return null;

    const frequency = top.reduce((sum, [, c]) => sum + c, 0);
    const confidence = Math.min(frequency / (input.automationHistory.length || 1), 1.0);

    return this._makePattern(
      'recurring_problems', 'Recurring Problems',
      `Recurring problems: ${top.map(([p]) => p).join(', ')}`,
      confidence, frequency, [], [], [],
      top.map(([p, c]) => ({
        source: 'automation_history', metric: 'problem_frequency',
        value: c, timestamp: new Date().toISOString(),
        description: `Problem "${p}" occurred ${c} times`,
        futureMetadata: {},
      })),
    );
  }

  private _detectRecurringImprovements(minFreq: number, _minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const improvementCounts: Record<string, number> = {};
    for (const e of input.automationHistory) {
      const improvement = (e.metadata['improvementType'] as string) ?? null;
      if (improvement && e.outcome === 'executed') {
        improvementCounts[improvement] = (improvementCounts[improvement] ?? 0) + 1;
      }
    }
    const top = Object.entries(improvementCounts)
      .filter(([, c]) => c >= minFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (top.length === 0) return null;

    const frequency = top.reduce((sum, [, c]) => sum + c, 0);
    const confidence = Math.min(frequency / (input.automationHistory.length || 1), 1.0);

    return this._makePattern(
      'recurring_improvements', 'Recurring Improvements',
      `Recurring improvements: ${top.map(([i]) => i).join(', ')}`,
      confidence, frequency, [], [], [],
      top.map(([i, c]) => ({
        source: 'automation_history', metric: 'improvement_frequency',
        value: c, timestamp: new Date().toISOString(),
        description: `Improvement "${i}" achieved ${c} times`,
        futureMetadata: {},
      })),
    );
  }

  private _detectFrequentlyDeferred(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const ruleCounts: Record<string, { deferred: number; total: number }> = {};
    for (const e of input.automationHistory) {
      if (!ruleCounts[e.ruleId]) ruleCounts[e.ruleId] = { deferred: 0, total: 0 };
      ruleCounts[e.ruleId]!.total++;
      if (e.outcome === 'deferred') ruleCounts[e.ruleId]!.deferred++;
    }
    const top = Object.entries(ruleCounts)
      .filter(([, c]) => c.deferred >= minFreq && c.deferred / c.total >= minConf)
      .sort((a, b) => b[1].deferred - a[1].deferred)
      .slice(0, 5);
    if (top.length === 0) return null;

    const affectedRules = top.map(([r]) => r);
    const frequency = top.reduce((sum, [, c]) => sum + c.deferred, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.deferred / c.total, 0) / top.length;

    return this._makePattern(
      'frequently_deferred', 'Frequently Deferred Tasks',
      `${top.length} rules frequently deferred`,
      avgRate, frequency, affectedRules, [], [],
      this._ruleEvidence(top, 'deferred'),
    );
  }

  private _detectFrequentlyCancelled(minFreq: number, minConf: number, input: IntelligenceInput): DetectedPattern | null {
    const ruleCounts: Record<string, { cancelled: number; total: number }> = {};
    for (const e of input.automationHistory) {
      if (!ruleCounts[e.ruleId]) ruleCounts[e.ruleId] = { cancelled: 0, total: 0 };
      ruleCounts[e.ruleId]!.total++;
      if (e.outcome === 'cancelled') ruleCounts[e.ruleId]!.cancelled++;
    }
    const top = Object.entries(ruleCounts)
      .filter(([, c]) => c.cancelled >= minFreq && c.cancelled / c.total >= minConf)
      .sort((a, b) => b[1].cancelled - a[1].cancelled)
      .slice(0, 5);
    if (top.length === 0) return null;

    const affectedRules = top.map(([r]) => r);
    const frequency = top.reduce((sum, [, c]) => sum + c.cancelled, 0);
    const avgRate = top.reduce((sum, [, c]) => sum + c.cancelled / c.total, 0) / top.length;

    return this._makePattern(
      'frequently_cancelled', 'Frequently Cancelled Tasks',
      `${top.length} rules frequently cancelled`,
      avgRate, frequency, affectedRules, [], [],
      this._ruleEvidence(top, 'cancelled'),
    );
  }

  private _ruleEvidence(top: [string, { accepted?: number; rejected?: number; deferred?: number; cancelled?: number; total: number }][], metric: string): Evidence[] {
    return top.map(([ruleId, c]) => {
      const count = (c as Record<string, number>)[metric] ?? 0;
      return {
        source: 'automation_history',
        metric: `rule_${metric}_count`,
        value: count,
        timestamp: new Date().toISOString(),
        description: `Rule ${ruleId}: ${count}/${c.total} ${metric}`,
        futureMetadata: {},
      };
    });
  }

  private _makePattern(
    type: PatternType,
    name: string,
    description: string,
    confidence: number,
    frequency: number,
    affectedRules: string[],
    affectedTriggers: AutomationTriggerType[],
    affectedActions: AutomationActionType[],
    supportingEvidence: Evidence[],
    metadata: Record<string, unknown> = {},
  ): DetectedPattern {
    return {
      id: generatePatternId(),
      type,
      name,
      description,
      confidence,
      frequency,
      supportingEvidence,
      affectedRules,
      affectedTriggers,
      affectedActions,
      metadata,
      futureMetadata: {},
    };
  }
}
