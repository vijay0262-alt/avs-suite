/**
 * Automation Decision Analyzer — analyzes user decisions (approve/reject/ignore/cancel).
 *
 * Tracks: User Approvals, User Rejections, Ignored Recommendations,
 * Cancelled Plans. Breaks down by rule, trigger, and risk level.
 */
import type {
  IntelligenceInput,
  DecisionMetrics,
  DecisionAnalysisResult,
  DecisionBreakdown,
  Evidence,
} from './types';

export class AutomationDecisionAnalyzer {
  analyze(input: IntelligenceInput): DecisionAnalysisResult {
    const metrics = this._computeMetrics(input);
    const insights = this._generateInsights(metrics);
    return {
      metrics,
      insights,
      analyzedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _computeMetrics(input: IntelligenceInput): DecisionMetrics {
    const entries = input.automationHistory;
    const total = entries.length;

    const totalApprovals = entries.filter((e) => e.outcome === 'approved' || e.outcome === 'executed').length;
    const totalRejections = entries.filter((e) => e.outcome === 'rejected').length;
    const totalIgnored = entries.filter((e) => e.outcome === 'ignored').length;
    const totalCancelled = entries.filter((e) => e.outcome === 'cancelled').length;

    const byRule: Record<string, DecisionBreakdown> = {};
    const byTrigger: Record<string, DecisionBreakdown> = {};
    const byRiskLevel: Record<string, DecisionBreakdown> = {};

    for (const entry of entries) {
      this._updateBreakdown(byRule, entry.ruleId, entry.outcome);
      this._updateBreakdown(byTrigger, entry.triggerType, entry.outcome);
      this._updateBreakdown(byRiskLevel, entry.riskLevel, entry.outcome);
    }

    return {
      totalApprovals,
      totalRejections,
      totalIgnored,
      totalCancelled,
      approvalRate: total > 0 ? totalApprovals / total : 0,
      rejectionRate: total > 0 ? totalRejections / total : 0,
      ignoreRate: total > 0 ? totalIgnored / total : 0,
      cancelRate: total > 0 ? totalCancelled / total : 0,
      byRule,
      byTrigger,
      byRiskLevel,
      futureMetadata: {},
    };
  }

  private _updateBreakdown(
    map: Record<string, DecisionBreakdown>,
    key: string,
    outcome: string,
  ): void {
    if (!map[key]) {
      map[key] = { approved: 0, rejected: 0, ignored: 0, cancelled: 0, total: 0, approvalRate: 0 };
    }
    const bd = map[key]!;
    bd.total++;
    if (outcome === 'approved' || outcome === 'executed') bd.approved++;
    else if (outcome === 'rejected') bd.rejected++;
    else if (outcome === 'ignored') bd.ignored++;
    else if (outcome === 'cancelled') bd.cancelled++;
    bd.approvalRate = bd.total > 0 ? bd.approved / bd.total : 0;
  }

  private _generateInsights(metrics: DecisionMetrics): string[] {
    const insights: string[] = [];

    if (metrics.totalApprovals > metrics.totalRejections) {
      insights.push(`Users approve automation more often than reject (${(metrics.approvalRate * 100).toFixed(0)}% vs ${(metrics.rejectionRate * 100).toFixed(0)}%)`);
    } else if (metrics.totalRejections > metrics.totalApprovals) {
      insights.push(`Users reject automation more often than approve (${(metrics.rejectionRate * 100).toFixed(0)}% vs ${(metrics.approvalRate * 100).toFixed(0)}%) — consider adjusting approval policies`);
    }

    if (metrics.ignoreRate > 0.3) {
      insights.push(`High ignore rate (${(metrics.ignoreRate * 100).toFixed(0)}%) — recommendations may not be relevant enough`);
    }

    if (metrics.cancelRate > 0.2) {
      insights.push(`High cancel rate (${(metrics.cancelRate * 100).toFixed(0)}%) — automation may be triggering at wrong times`);
    }

    const lowApprovalRules = Object.entries(metrics.byRule)
      .filter(([, bd]) => bd.total >= 3 && bd.approvalRate < 0.3)
      .map(([ruleId]) => ruleId);
    if (lowApprovalRules.length > 0) {
      insights.push(`Rules with low approval: ${lowApprovalRules.join(', ')} — consider revising conditions or actions`);
    }

    const highApprovalTriggers = Object.entries(metrics.byTrigger)
      .filter(([, bd]) => bd.total >= 3 && bd.approvalRate > 0.7)
      .map(([trigger]) => trigger);
    if (highApprovalTriggers.length > 0) {
      insights.push(`Triggers with high approval: ${highApprovalTriggers.join(', ')} — good candidates for auto-approval`);
    }

    return insights;
  }

  getEvidence(metrics: DecisionMetrics): Evidence[] {
    const evidence: Evidence[] = [];
    const ts = new Date().toISOString();
    evidence.push({ source: 'decision_analysis', metric: 'approval_rate', value: metrics.approvalRate, timestamp: ts, description: `Approval rate: ${(metrics.approvalRate * 100).toFixed(1)}%`, futureMetadata: {} });
    evidence.push({ source: 'decision_analysis', metric: 'rejection_rate', value: metrics.rejectionRate, timestamp: ts, description: `Rejection rate: ${(metrics.rejectionRate * 100).toFixed(1)}%`, futureMetadata: {} });
    evidence.push({ source: 'decision_analysis', metric: 'ignore_rate', value: metrics.ignoreRate, timestamp: ts, description: `Ignore rate: ${(metrics.ignoreRate * 100).toFixed(1)}%`, futureMetadata: {} });
    evidence.push({ source: 'decision_analysis', metric: 'cancel_rate', value: metrics.cancelRate, timestamp: ts, description: `Cancel rate: ${(metrics.cancelRate * 100).toFixed(1)}%`, futureMetadata: {} });
    return evidence;
  }
}
