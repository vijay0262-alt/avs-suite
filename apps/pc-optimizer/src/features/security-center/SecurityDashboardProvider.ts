/**
 * SecurityDashboardProvider — builds dashboard data for the Security Center UI.
 *
 * Shows active threats, recent scans, provider status, capabilities,
 * and security score trend. Consumes only SecuritySnapshot and history.
 */
import type {
  SecuritySnapshot,
  SecurityDashboardData,
  SecurityDashboardSummary,
  SecurityDashboardEntry,
  SecurityDashboardScanEntry,
  SecurityProviderInfo,
  SecurityCapabilityInfo,
  ThreatRisk,
} from './types';
import { scoreToRisk } from './types';
import type { SecurityHistory } from './SecurityHistory';

export class SecurityDashboardProvider {
  build(
    snapshot: SecuritySnapshot | null,
    history: SecurityHistory,
    providers: SecurityProviderInfo[],
    capabilities: SecurityCapabilityInfo[],
  ): SecurityDashboardData {
    const summary = this.buildSummary(snapshot, providers);
    const activeThreats = this.buildActiveThreats(snapshot);
    const recentScans = this.buildRecentScans(history);
    const scoreTrend = history.getScoreTrend();

    return {
      summary,
      activeThreats,
      recentScans,
      providerStatus: providers,
      capabilities,
      securityScoreTrend: scoreTrend,
      lastSnapshot: snapshot,
    };
  }

  private buildSummary(
    snapshot: SecuritySnapshot | null,
    providers: SecurityProviderInfo[],
  ): SecurityDashboardSummary {
    if (!snapshot) {
      return {
        securityScore: 0,
        threatLevel: 'none',
        activeThreatCount: 0,
        totalThreatsDetected: 0,
        providersActive: providers.filter((p) => p.status === 'active' || (p.status === 'inactive' && p.enabled)).length,
        providersTotal: providers.length,
        lastScanDate: null,
        definitionsVersion: 'unknown',
        overallProtected: false,
        nextRecommendedAction: 'Run a security scan to get started.',
      };
    }

    const activeThreats = snapshot.threats.filter((t) => t.status === 'active');
    const threatLevel: ThreatRisk = scoreToRisk(snapshot.riskScore);
    const providersActive = snapshot.providerStatuses.filter(
      (p) => p.status === 'active' || (p.status === 'inactive' && p.enabled),
    ).length;

    let nextAction: string | null = null;
    if (activeThreats.length > 0) {
      const highest = activeThreats.sort((a, b) => {
        const scores = { info: 1, low: 2, medium: 5, high: 10, critical: 20 };
        return scores[b.severity] - scores[a.severity];
      })[0];
      nextAction = highest?.recommendation ?? 'Review detected threats.';
    }

    return {
      securityScore: snapshot.securityScore,
      threatLevel,
      activeThreatCount: activeThreats.length,
      totalThreatsDetected: snapshot.threats.length,
      providersActive,
      providersTotal: snapshot.providerStatuses.length,
      lastScanDate: snapshot.lastScan,
      definitionsVersion: snapshot.definitionsVersion,
      overallProtected: snapshot.protectionStatus.overallProtected,
      nextRecommendedAction: nextAction,
    };
  }

  private buildActiveThreats(snapshot: SecuritySnapshot | null): SecurityDashboardEntry[] {
    if (!snapshot) return [];
    return snapshot.threats
      .filter((t) => t.status === 'active')
      .sort((a, b) => {
        const scores = { info: 1, low: 2, medium: 5, high: 10, critical: 20 };
        return scores[b.severity] - scores[a.severity];
      })
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        severity: t.severity,
        risk: t.risk,
        confidence: t.confidence,
        detectionSource: t.detectionSource,
        detectionTime: t.detectionTime,
        affectedAssetSummary: t.affectedAssets.map((a) => a.name).join(', ') || 'Unknown',
        recommendation: t.recommendation,
      }));
  }

  private buildRecentScans(history: SecurityHistory): SecurityDashboardScanEntry[] {
    return history.getRecentEntries(10).map((e) => ({
      scanId: e.scanId,
      scanType: e.scanType,
      status: e.status,
      startedAt: e.timestamp,
      duration: e.duration,
      threatsFound: e.threatsDetected,
      itemsScanned: e.itemsScanned,
    }));
  }
}
