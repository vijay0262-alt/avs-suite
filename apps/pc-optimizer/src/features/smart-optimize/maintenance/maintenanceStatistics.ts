/**
 * Maintenance Statistics — computes aggregate maintenance statistics.
 */
import type { MaintenanceStatistics, MaintenanceHistoryEntry } from './types';

export class MaintenanceStatisticsCalculator {
  compute(entries: MaintenanceHistoryEntry[]): MaintenanceStatistics {
    const byType: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    let totalDuration = 0;
    let totalBenefit = 0;
    let totalConfidence = 0;
    let deferredCount = 0;
    let cancelledCount = 0;
    let expiredCount = 0;
    let completedCount = 0;
    let acceptedCount = 0;
    let totalActualBenefit = 0;
    let actualBenefitCount = 0;

    for (const entry of entries) {
      byType[entry.type] = (byType[entry.type] ?? 0) + 1;
      byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
      totalDuration += entry.duration;
      totalBenefit += entry.expectedBenefit;
      totalConfidence += entry.confidence;

      if (entry.outcome === 'deferred') deferredCount++;
      if (entry.outcome === 'cancelled') cancelledCount++;
      if (entry.outcome === 'expired') expiredCount++;
      if (entry.outcome === 'completed') completedCount++;
      if (entry.outcome === 'accepted') acceptedCount++;

      if (entry.actualBenefit !== null) {
        totalActualBenefit += entry.actualBenefit;
        actualBenefitCount++;
      }
    }

    const count = entries.length || 1;
    const totalCompleted = completedCount + acceptedCount;
    const totalFinal = totalCompleted + cancelledCount + expiredCount;

    const lastEntry = entries.length > 0 ? entries[entries.length - 1]! : null;

    return {
      totalOpportunities: entries.length,
      byType,
      byOutcome,
      successRate: totalFinal > 0 ? totalCompleted / totalFinal : 0,
      averageDuration: totalDuration / count,
      averageBenefit: actualBenefitCount > 0 ? totalActualBenefit / actualBenefitCount : totalBenefit / count,
      averageConfidence: entries.length > 0 ? totalConfidence / entries.length : 0,
      deferredCount,
      cancelledCount,
      expiredCount,
      lastMaintenanceAt: lastEntry?.timestamp ?? null,
    };
  }
}
