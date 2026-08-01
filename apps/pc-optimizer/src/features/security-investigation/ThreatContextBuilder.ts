/**
 * ThreatContextBuilder — gathers contextual information for investigations.
 *
 * Builds context from:
 *   - System state (OS, uptime, security score)
 *   - Related threats
 *   - Historical context (first seen, occurrence count, trend)
 *   - Process context (CPU, memory, parent process)
 *   - Hardware context (CPU model, memory, GPU)
 *   - Network context (remote address, port, protocol)
 */
import type { Threat, ThreatContext, SystemStateContext, RelatedThreatContext, HistoricalContext, ProcessContext, HardwareContext, NetworkContext, SecuritySnapshot, SecurityHistorySummary } from './types';

export class ThreatContextBuilder {
  build(
    threats: Threat[],
    allThreats: Threat[],
    snapshot: SecuritySnapshot | null,
    historySummary: SecurityHistorySummary | null,
    processContext?: ProcessContext | null,
    hardwareContext?: HardwareContext | null,
    networkContext?: NetworkContext | null,
  ): ThreatContext {
    return {
      systemState: this.buildSystemState(snapshot),
      relatedThreats: this.buildRelatedThreats(threats, allThreats),
      historicalContext: this.buildHistoricalContext(threats, historySummary),
      processContext: processContext ?? this.extractProcessContext(threats),
      hardwareContext: hardwareContext ?? null,
      networkContext: networkContext ?? this.extractNetworkContext(threats),
    };
  }

  private buildSystemState(snapshot: SecuritySnapshot | null): SystemStateContext {
    if (!snapshot) {
      return {
        osVersion: 'Unknown',
        lastBootTime: 0,
        uptime: 0,
        securityScore: 0,
        providersActive: 0,
        providersTotal: 0,
      };
    }

    return {
      osVersion: 'Windows',
      lastBootTime: Date.now() - 3600000,
      uptime: 3600000,
      securityScore: snapshot.securityScore,
      providersActive: snapshot.protectionStatus.providersActive,
      providersTotal: snapshot.protectionStatus.providersTotal,
    };
  }

  private buildRelatedThreats(threats: Threat[], allThreats: Threat[]): RelatedThreatContext[] {
    const threatIds = new Set(threats.map((t) => t.id));
    const related: RelatedThreatContext[] = [];

    for (const t of allThreats) {
      if (threatIds.has(t.id)) continue;

      // Check for shared assets
      const hasSharedAsset = threats.some((my) =>
        my.affectedAssets.some((a) => t.affectedAssets.some((b) => a.path === b.path && a.type === b.type)),
      );

      if (hasSharedAsset) {
        related.push({
          threatId: t.id,
          name: t.name,
          category: t.category,
          relationship: 'Shares affected assets',
        });
      }
    }

    return related.slice(0, 10);
  }

  private buildHistoricalContext(threats: Threat[], historySummary: SecurityHistorySummary | null): HistoricalContext | null {
    if (!historySummary || threats.length === 0) return null;

    const detectedAt = Math.min(...threats.map((t) => t.detectionTime));
    const lastSeen = Math.max(...threats.map((t) => t.detectionTime));

    return {
      firstSeen: detectedAt,
      lastSeen,
      occurrenceCount: historySummary.totalThreatsDetected,
      previousStatus: 'active',
      trend: historySummary.totalThreatsDetected > historySummary.totalThreatsResolved ? 'increasing' : 'stable',
    };
  }

  private extractProcessContext(threats: Threat[]): ProcessContext | null {
    for (const t of threats) {
      const processAsset = t.affectedAssets.find((a) => a.type === 'process');
      if (processAsset) {
        return {
          processName: processAsset.name,
          pid: processAsset.pid ?? null,
          cpuUsage: null,
          memoryUsage: null,
          parentProcess: null,
          commandLine: null,
        };
      }
    }
    return null;
  }

  private extractNetworkContext(threats: Threat[]): NetworkContext | null {
    for (const t of threats) {
      const networkAsset = t.affectedAssets.find((a) => a.type === 'network');
      if (networkAsset) {
        const parts = networkAsset.path.split(':');
        return {
          remoteAddress: parts[0] ?? null,
          remotePort: parts[1] ? parseInt(parts[1], 10) : null,
          protocol: null,
          connectionState: null,
          dnsDomain: null,
        };
      }
    }
    return null;
  }
}
