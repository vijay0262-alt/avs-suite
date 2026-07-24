/**
 * HealthScoreService — single source of truth for system health.
 *
 * Aggregates HealthContributions from all registered module providers.
 * The overall health score is:
 *
 *   100 - sum(all currentPenalties)
 *
 * Clamped to [0, 100].
 *
 * Modules register their providers at startup. The Dashboard calls
 * `computeHealth()` to get the aggregated score. When any module
 * completes an optimization, the event bus triggers a recompute.
 *
 * Future modules (Driver Updater, Antivirus, VPN, Backup) can register
 * without changing Dashboard logic — just add a provider.
 */

import type { HealthContribution, HealthContributionProvider, ModuleId } from './HealthContribution';
import { clampHealth } from './HealthContribution';
import { optimizationEventBus, type OptimizationEvent } from './OptimizationEventBus';
import type { ModuleWeightEntry } from '../dashboard/dashboard.types';
import { FeatureGate } from '../licensing/FeatureGate';
import type { ManagedFeature } from '@avs/licensing';

/**
 * Mapping from ModuleId to the ManagedFeature that gates it.
 * If a module's feature is not available in the current edition,
 * its penalty is skipped to keep the health score fair.
 */
const MODULE_FEATURE_MAP: Record<string, ManagedFeature> = {
  junk: 'junk.scan',
  registry: 'registry.scan',
  startup: 'startup.view',
  privacy: 'privacy.scan',
  duplicate: 'duplicate.scan',
  performance: 'performance.optimize',
  disk: 'disk.analyzer',
  security: 'system.info',
  system: 'system.info',
};

export interface AggregatedHealthScore {
  overallScore: number;
  contributions: HealthContribution[];
  totalPenalty: number;
  totalResolved: number;
  timestamp: string;
}

export class HealthScoreService {
  private providers = new Map<ModuleId, HealthContributionProvider>();
  private moduleWeights = new Map<string, ModuleWeightEntry>();
  private cachedContributions: HealthContribution[] = [];
  private lastComputeTimestamp = 0;

  registerProvider(moduleId: ModuleId, provider: HealthContributionProvider): void {
    this.providers.set(moduleId, provider);
  }

  unregisterProvider(moduleId: ModuleId): void {
    this.providers.delete(moduleId);
  }

  /**
   * Register a module's weight (max penalty) for the health score.
   * Future modules call this at startup — no Dashboard logic changes.
   */
  registerModuleWeight(moduleId: string, maxPenalty: number, displayName: string): void {
    this.moduleWeights.set(moduleId, { moduleId, maxPenalty, displayName });
  }

  unregisterModuleWeight(moduleId: string): void {
    this.moduleWeights.delete(moduleId);
  }

  getModuleWeights(): ModuleWeightEntry[] {
    return Array.from(this.moduleWeights.values());
  }

  async computeHealth(): Promise<AggregatedHealthScore> {
    const contributions: HealthContribution[] = [];
    for (const [moduleId, provider] of this.providers) {
      const gatingFeature = MODULE_FEATURE_MAP[moduleId as string];
      if (gatingFeature && !FeatureGate.canUse(gatingFeature)) {
        continue;
      }
      try {
        const contribution = await provider.getContribution();
        contributions.push(contribution);
      } catch (err) {
        console.error(`[HealthScoreService] provider error:`, err);
      }
    }

    const totalPenalty = contributions.reduce((sum, c) => sum + c.currentPenalty, 0);
    const totalResolved = contributions.reduce((sum, c) => sum + c.resolvedPenalty, 0);
    const overallScore = clampHealth(100 - totalPenalty);

    this.cachedContributions = contributions;
    this.lastComputeTimestamp = Date.now();

    return {
      overallScore,
      contributions,
      totalPenalty,
      totalResolved,
      timestamp: new Date().toISOString(),
    };
  }

  getCachedContributions(): HealthContribution[] {
    return this.cachedContributions;
  }

  getLastComputeTimestamp(): number {
    return this.lastComputeTimestamp;
  }
}

export const healthScoreService = new HealthScoreService();

/**
 * Convenience: subscribe to optimization events and trigger a callback.
 * Returns an unsubscribe function.
 */
export function subscribeToOptimizations(
  callback: (event: OptimizationEvent) => void,
): () => void {
  return optimizationEventBus.subscribe(callback);
}
