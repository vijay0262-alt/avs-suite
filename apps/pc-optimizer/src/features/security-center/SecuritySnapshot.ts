/**
 * SecuritySnapshot — builds and manages the unified SecuritySnapshot.
 *
 * The SecuritySnapshot is the single source of truth for the UI.
 * The UI never scans directly — it consumes only SecuritySnapshot.
 */
import type {
  SecuritySnapshot,
  Threat,
  SecurityProviderInfo,
  ProtectionStatus,
  SecurityCapabilityInfo,
  SecurityHistorySummary,
  SecurityScores,
} from './types';
import { scoreToRisk } from './types';

export class SecuritySnapshotBuilder {
  build(
    threats: Threat[],
    providerInfos: SecurityProviderInfo[],
    capabilities: SecurityCapabilityInfo[],
    historySummary: SecurityHistorySummary | null,
    definitionsVersion: string,
    lastScan: number | null,
    lastUpdate: number | null,
  ): SecuritySnapshot {
    const scores = this.computeScores(threats, providerInfos);
    const protectionStatus = this.computeProtectionStatus(providerInfos, lastScan);

    return {
      id: `snapshot-${Date.now()}`,
      timestamp: Date.now(),
      threats,
      securityScore: scores.securityScore,
      threatScore: scores.threatScore,
      riskScore: scores.riskScore,
      exposureScore: scores.exposureScore,
      confidenceScore: scores.confidenceScore,
      providerStatuses: providerInfos,
      protectionStatus,
      definitionsVersion,
      lastScan,
      lastUpdate,
      capabilities,
      historySummary,
    };
  }

  private computeScores(threats: Threat[], providers: SecurityProviderInfo[]): SecurityScores {
    if (threats.length === 0) {
      return {
        securityScore: 100,
        threatScore: 0,
        riskScore: 0,
        exposureScore: 0,
        confidenceScore: providers.length > 0 ? 1 : 0,
      };
    }

    const severityWeights: Record<string, number> = { info: 1, low: 2, medium: 5, high: 10, critical: 20 };
    const threatScore = threats.reduce((sum, t) => sum + (severityWeights[t.severity] ?? 0) * t.confidence, 0);
    const maxPossibleScore = threats.length * 20;
    const normalizedThreatScore = Math.min(100, (threatScore / Math.max(1, maxPossibleScore)) * 100);

    const riskScores = threats.map((t) => {
      const riskMap = { none: 0, low: 20, moderate: 40, high: 70, severe: 90 };
      return riskMap[t.risk];
    });
    const riskScore = Math.min(100, riskScores.reduce((a, b) => a + b, 0) / threats.length);

    const exposureScore = Math.min(100, threats.filter((t) => t.status === 'active').length * 10);
    const confidenceScore = threats.reduce((sum, t) => sum + t.confidence, 0) / threats.length;

    const securityScore = Math.max(0, Math.round(100 - normalizedThreatScore - riskScore * 0.3 - exposureScore * 0.2));

    return {
      securityScore,
      threatScore: Math.round(normalizedThreatScore),
      riskScore: Math.round(riskScore),
      exposureScore: Math.round(exposureScore),
      confidenceScore: Math.round(confidenceScore * 100) / 100,
    };
  }

  private computeProtectionStatus(providers: SecurityProviderInfo[], _lastScan: number | null): ProtectionStatus {
    const activeProviders = providers.filter((p) => p.status === 'active' || (p.status === 'inactive' && p.enabled));
    const providersActive = activeProviders.length;
    const providersTotal = providers.length;

    return {
      realTimeProtection: false, // Foundation only — no real-time protection yet
      definitionsActive: true,
      providersActive,
      providersTotal,
      lastScanStatus: null,
      overallProtected: providersActive > 0,
    };
  }
}

export { scoreToRisk };
