/**
 * SecurityScanner — orchestrates the scanning pipeline.
 *
 * Detection pipeline:
 *   1. Discovery — identify targets
 *   2. Classification — run providers to classify threats
 *   3. Evidence Collection — gather evidence per threat
 *   4. Confidence Calculation — compute confidence scores
 *   5. Threat Scoring — compute severity and risk
 *   6. Recommendation Generation — generate recommendations
 *   7. Snapshot Update — update the security snapshot
 *   8. Event Publication — emit scan events
 */
import type {
  ScanResult,
  ScanType,
  ProviderScanResult,
  ProviderScanContext,
  Threat,
} from './types';
import type { SecurityProvider } from './SecurityProvider';
import type { SecurityRegistry } from './SecurityRegistry';
import type { SecurityConfiguration } from './types';
import { securityEventBus } from './SecurityEvents';

export class SecurityScanner {
  constructor(
    private registry: SecurityRegistry,
    private config: SecurityConfiguration,
  ) {}

  async scan(
    scanType: ScanType,
    targets: string[] = [],
    options: Record<string, unknown> = {},
  ): Promise<ScanResult> {
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();

    securityEventBus.emitScanStarted(scanId, scanType);

    const providers = this.registry.getEnabledProviders();
    const context: ProviderScanContext = {
      scanType,
      scanId,
      targets,
      options,
    };

    const providerResults: ProviderScanResult[] = [];
    let allThreats: Threat[] = [];
    let totalItemsScanned = 0;

    // Run providers concurrently (limited by config)
    const batchSize = this.config.maxConcurrentProviders;
    for (let i = 0; i < providers.length; i += batchSize) {
      const batch = providers.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((p) => this.runProvider(p, context)),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j]!;
        if (result.status === 'fulfilled') {
          providerResults.push(result.value);
          allThreats = allThreats.concat(result.value.threats);
          totalItemsScanned += result.value.itemsScanned;
        } else {
          const provider = batch[j]!;
          const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
          securityEventBus.emitProviderFailed(provider.getId(), error);
          providerResults.push({
            providerId: provider.getId(),
            providerType: provider.getType(),
            threats: [],
            duration: 0,
            success: false,
            error,
            itemsScanned: 0,
            metadata: {},
          });
        }
      }
    }

    // Filter threats by confidence threshold
    const filteredThreats = allThreats.filter(
      (t) => t.confidence >= this.config.minConfidenceThreshold,
    );

    // Emit threat detected events
    for (const threat of filteredThreats) {
      securityEventBus.emitThreatDetected(threat.id, threat.name);
    }

    const duration = Date.now() - startedAt;
    const securityScore = this.computeSecurityScore(filteredThreats);

    const result: ScanResult = {
      scanId,
      scanType,
      status: 'completed',
      startedAt,
      completedAt: Date.now(),
      duration,
      threats: filteredThreats,
      providerResults,
      itemsScanned: totalItemsScanned,
      securityScore,
      snapshot: null,
      error: null,
    };

    securityEventBus.emitScanCompleted(scanId, filteredThreats.length);

    return result;
  }

  private async runProvider(
    provider: SecurityProvider,
    context: ProviderScanContext,
  ): Promise<ProviderScanResult> {
    try {
      return await provider.scan(context);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      provider.setLastError(error);
      return {
        providerId: provider.getId(),
        providerType: provider.getType(),
        threats: [],
        duration: 0,
        success: false,
        error,
        itemsScanned: 0,
        metadata: {},
      };
    }
  }

  private computeSecurityScore(threats: Threat[]): number {
    if (threats.length === 0) return 100;
    const severityWeights: Record<string, number> = { info: 1, low: 2, medium: 5, high: 10, critical: 20 };
    const totalWeight = threats.reduce((sum, t) => sum + (severityWeights[t.severity] ?? 0) * t.confidence, 0);
    const maxPossible = threats.length * 20;
    const normalized = Math.min(100, (totalWeight / Math.max(1, maxPossible)) * 100);
    return Math.max(0, Math.round(100 - normalized));
  }
}
