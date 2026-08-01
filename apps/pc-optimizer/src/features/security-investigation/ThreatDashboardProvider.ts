/**
 * ThreatDashboardProvider — builds dashboard data for the investigation UI.
 *
 * Provides:
 *   - Summary statistics
 *   - Active and recent investigations
 *   - Severity and category distributions
 *   - Correlation statistics
 */
import type { ThreatInvestigation, InvestigationDashboardData, InvestigationDashboardSummary, InvestigationDashboardEntry, CorrelationStats, ThreatSeverity } from './types';

export class ThreatDashboardProvider {
  build(investigations: ThreatInvestigation[]): InvestigationDashboardData {
    const active = investigations.filter((i) => i.status === 'open' || i.status === 'reviewing');
    const resolved = investigations.filter((i) => i.status === 'resolved');
    const falsePositives = investigations.filter((i) => i.status === 'false_positive');

    const summary: InvestigationDashboardSummary = {
      totalInvestigations: investigations.length,
      openInvestigations: active.length,
      resolvedInvestigations: resolved.length,
      falsePositiveCount: falsePositives.length,
      criticalCount: investigations.filter((i) => i.severity.level === 'critical').length,
      highCount: investigations.filter((i) => i.severity.level === 'high').length,
      averageConfidence: this.average(investigations.map((i) => i.confidence.score)),
      averageRiskScore: this.average(investigations.map((i) => i.severity.score)),
      totalCorrelations: investigations.reduce((sum, i) => sum + i.relationships.length, 0),
      totalEvidenceItems: investigations.reduce((sum, i) => sum + i.evidence.total, 0),
    };

    const activeEntries = active
      .sort((a, b) => b.severity.score - a.severity.score)
      .map((inv) => this.toEntry(inv))
      .slice(0, 20);

    const recentEntries = [...investigations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((inv) => this.toEntry(inv))
      .slice(0, 10);

    return {
      summary,
      activeInvestigations: activeEntries,
      recentInvestigations: recentEntries,
      severityDistribution: this.computeSeverityDistribution(investigations),
      categoryDistribution: this.computeCategoryDistribution(investigations),
      correlationStats: this.computeCorrelationStats(investigations),
      lastUpdated: Date.now(),
    };
  }

  private toEntry(inv: ThreatInvestigation): InvestigationDashboardEntry {
    return {
      id: inv.id,
      title: inv.summary.title,
      category: inv.summary.category,
      severity: inv.severity.level,
      confidence: inv.confidence.score,
      risk: inv.risk,
      status: inv.status,
      threatCount: inv.summary.threatCount,
      evidenceCount: inv.evidence.total,
      detectedAt: inv.summary.detectedAt,
      lastActivity: inv.summary.lastActivity,
      summary: inv.summary.oneLiner,
    };
  }

  private computeSeverityDistribution(investigations: ThreatInvestigation[]): Record<ThreatSeverity, number> {
    const dist: Record<ThreatSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const inv of investigations) {
      dist[inv.severity.level] = (dist[inv.severity.level] ?? 0) + 1;
    }
    return dist;
  }

  private computeCategoryDistribution(investigations: ThreatInvestigation[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const inv of investigations) {
      const cat = inv.summary.category;
      dist[cat] = (dist[cat] ?? 0) + 1;
    }
    return dist;
  }

  private computeCorrelationStats(investigations: ThreatInvestigation[]): CorrelationStats {
    const correlated = investigations.filter((i) => i.summary.threatCount > 1);
    const threatCounts = correlated.map((i) => i.summary.threatCount);
    const typeCounts: Record<string, number> = {};

    for (const inv of investigations) {
      for (const rel of inv.relationships) {
        typeCounts[rel.type] = (typeCounts[rel.type] ?? 0) + 1;
      }
    }

    return {
      totalCorrelatedGroups: correlated.length,
      averageThreatsPerGroup: threatCounts.length > 0 ? this.average(threatCounts) : 0,
      maxThreatsInGroup: threatCounts.length > 0 ? Math.max(...threatCounts) : 0,
      commonCorrelationTypes: typeCounts,
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
