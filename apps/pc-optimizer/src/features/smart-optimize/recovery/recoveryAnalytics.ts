/**
 * Optimization Recovery & Rollback Center — Analytics
 *
 * Aggregates statistics from recovery history and snapshot catalog.
 */
import type {
  RecoveryAnalytics,
  RecoveryHistoryEntry,
  SnapshotCatalogEntry,
  RecoveryRecord,
} from './types';

export class RecoveryAnalyticsEngine {
  compute(
    history: RecoveryHistoryEntry[],
    snapshots: SnapshotCatalogEntry[],
    recoveries: RecoveryRecord[] = [],
  ): RecoveryAnalytics {
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};

    for (const entry of history) {
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
    }

    for (const rec of recoveries) {
      byType[rec.recoveryType] = (byType[rec.recoveryType] ?? 0) + 1;
    }

    const completed = byStatus['completed'] ?? 0;
    const total = history.length || 1;
    const successRate = completed / total;

    const durations = recoveries.map((r) => r.estimatedDuration);
    const averageDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    const confidences = recoveries.map((r) => r.confidence);
    const averageConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    const totalSnapshots = snapshots.length;
    const availableSnapshots = snapshots.filter((s) => s.recoveryAvailable).length;
    const corruptedSnapshots = snapshots.filter((s) => s.integrityStatus === 'corrupted').length;
    const expiredSnapshots = snapshots.filter((s) => {
      const ageMs = Date.now() - new Date(s.createdAt).getTime();
      return ageMs > s.retentionPolicy.maxAgeDays * 86400000;
    }).length;

    const retentionCompliance = totalSnapshots > 0
      ? (totalSnapshots - expiredSnapshots - corruptedSnapshots) / totalSnapshots
      : 1;

    return {
      totalRecoveries: recoveries.length,
      byStatus,
      byType,
      successRate,
      averageDuration,
      averageConfidence,
      totalSnapshots,
      availableSnapshots,
      corruptedSnapshots,
      expiredSnapshots,
      retentionCompliance,
      futureMetadata: {},
    };
  }
}
