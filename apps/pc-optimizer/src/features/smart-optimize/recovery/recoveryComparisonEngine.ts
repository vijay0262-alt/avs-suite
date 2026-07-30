/**
 * Optimization Recovery & Rollback Center — Comparison Engine
 *
 * Compares snapshots: before vs after, snapshot vs current, health,
 * performance, storage, and configuration differences.
 */
import type {
  RecoveryComparison,
  SnapshotCatalogEntry,
  HealthComparison,
  PerformanceComparison,
  StorageComparison,
  ConfigurationDifference,
  RecoveryConfiguration,
  RecoveryComparisonPlugin,
} from './types';
import { generateComparisonId } from './types';

export class RecoveryComparisonEngine {
  private _config: RecoveryConfiguration;
  private _plugins: RecoveryComparisonPlugin[] = [];

  constructor(config: RecoveryConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
  }

  registerPlugin(plugin: RecoveryComparisonPlugin): boolean {
    if (this._plugins.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  unregisterPlugin(name: string): boolean {
    const idx = this._plugins.findIndex((p) => p.getPluginName() === name);
    if (idx === -1) return false;
    this._plugins.splice(idx, 1);
    return true;
  }

  compare(
    snapshotA: SnapshotCatalogEntry,
    snapshotB: SnapshotCatalogEntry,
  ): RecoveryComparison {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const result = plugin.compare(snapshotA, snapshotB);
        if (result) return result;
      }
    }

    return this._builtinCompare(snapshotA, snapshotB);
  }

  private _builtinCompare(
    snapshotA: SnapshotCatalogEntry,
    snapshotB: SnapshotCatalogEntry,
  ): RecoveryComparison {
    const healthA = (snapshotA.metadata['health'] as number) ?? 0;
    const healthB = (snapshotB.metadata['health'] as number) ?? 0;
    const perfA = (snapshotA.metadata['performance'] as number) ?? 0;
    const perfB = (snapshotB.metadata['performance'] as number) ?? 0;
    const storageA = (snapshotA.metadata['storage'] as number) ?? 0;
    const storageB = (snapshotB.metadata['storage'] as number) ?? 0;

    const healthComparison: HealthComparison = this._config.comparisonRules.compareHealth
      ? { before: healthA, after: healthB, delta: healthB - healthA, unit: 'score' }
      : { before: 0, after: 0, delta: 0, unit: 'score' };

    const performanceComparison: PerformanceComparison = this._config.comparisonRules.comparePerformance
      ? { before: perfA, after: perfB, delta: perfB - perfA, unit: 'score' }
      : { before: 0, after: 0, delta: 0, unit: 'score' };

    const storageComparison: StorageComparison = this._config.comparisonRules.compareStorage
      ? { before: storageA, after: storageB, delta: storageB - storageA, unit: 'MB' }
      : { before: 0, after: 0, delta: 0, unit: 'MB' };

    const configurationDifferences: ConfigurationDifference[] = [];
    if (this._config.comparisonRules.compareConfiguration) {
      const configA = (snapshotA.metadata['config'] as Record<string, unknown>) ?? {};
      const configB = (snapshotB.metadata['config'] as Record<string, unknown>) ?? {};
      const allKeys = new Set([...Object.keys(configA), ...Object.keys(configB)]);
      for (const key of allKeys) {
        if (configA[key] !== configB[key]) {
          configurationDifferences.push({
            module: key,
            setting: key,
            beforeValue: String(configA[key] ?? 'unset'),
            afterValue: String(configB[key] ?? 'unset'),
            impact: 'modified',
            futureMetadata: {},
          });
        }
      }
    }

    const summary = this._generateSummary(healthComparison, performanceComparison, storageComparison, configurationDifferences);
    const recommendation = this._generateRecommendation(healthComparison, storageComparison);

    return {
      id: generateComparisonId(),
      snapshotIdA: snapshotA.snapshotId,
      snapshotIdB: snapshotB.snapshotId,
      generatedAt: new Date().toISOString(),
      healthComparison,
      performanceComparison,
      storageComparison,
      configurationDifferences: configurationDifferences.slice(0, this._config.comparisonRules.maxDifferences),
      summary,
      recommendation,
      futureMetadata: {},
    };
  }

  private _generateSummary(
    health: HealthComparison,
    performance: PerformanceComparison,
    storage: StorageComparison,
    configDiffs: ConfigurationDifference[],
  ): string {
    const parts: string[] = [];
    if (health.delta !== 0) parts.push(`Health ${health.delta > 0 ? 'improved' : 'decreased'} by ${Math.abs(health.delta)} points.`);
    if (performance.delta !== 0) parts.push(`Performance ${performance.delta > 0 ? 'improved' : 'decreased'} by ${Math.abs(performance.delta)}.`);
    if (storage.delta !== 0) parts.push(`Storage ${storage.delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(storage.delta)} MB.`);
    if (configDiffs.length > 0) parts.push(`${configDiffs.length} configuration difference(s) detected.`);
    return parts.length > 0 ? parts.join(' ') : 'No significant differences detected.';
  }

  private _generateRecommendation(health: HealthComparison, storage: StorageComparison): string {
    if (health.delta > 0 && storage.delta >= 0) return 'Recovery to snapshot B is recommended — health improved with no storage loss.';
    if (health.delta < 0) return 'Recovery to snapshot A is recommended — health was higher before optimization.';
    if (storage.delta < 0) return 'Recovery to snapshot A is recommended — storage was higher before optimization.';
    return 'No clear recommendation — both snapshots are comparable.';
  }
}
