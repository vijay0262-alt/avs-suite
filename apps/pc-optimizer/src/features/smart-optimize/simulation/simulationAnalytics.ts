/**
 * Simulation Analytics — aggregates statistics from simulation history.
 */
import type { SimulationHistoryEntry, SimulationAnalytics, SimulationResult } from './types';

export class SimulationAnalyticsEngine {
  compute(history: SimulationHistoryEntry[], simulations: SimulationResult[] = []): SimulationAnalytics {
    const byType: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalHealthGain = 0;
    let totalStorageRecovered = 0;
    let totalPerformanceGain = 0;
    let totalPrivacyImprovement = 0;
    let totalConfidence = 0;
    let totalDuration = 0;
    let simCount = 0;
    let accepted = 0;
    let rejected = 0;
    let executed = 0;
    let expired = 0;

    for (const sim of simulations) {
      byType[sim.type] = (byType[sim.type] ?? 0) + 1;
      totalHealthGain += sim.estimatedHealthAfter - sim.estimatedHealthBefore;
      totalStorageRecovered += sim.estimatedStorageRecovered;
      totalPerformanceGain += sim.estimatedPerformanceGain;
      totalPrivacyImprovement += sim.estimatedPrivacyImprovement;
      totalConfidence += sim.estimatedConfidence;
      totalDuration += sim.estimatedDuration;
      simCount++;
    }

    for (const entry of history) {
      byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
      if (entry.status === 'accepted') accepted++;
      if (entry.status === 'rejected') rejected++;
      if (entry.status === 'executed') executed++;
      if (entry.status === 'expired') expired++;
    }

    const totalHistory = history.length || 1;

    return {
      totalSimulations: simCount,
      byType,
      byStatus,
      averageHealthGain: simCount > 0 ? totalHealthGain / simCount : 0,
      averageStorageRecovered: simCount > 0 ? totalStorageRecovered / simCount : 0,
      averagePerformanceGain: simCount > 0 ? totalPerformanceGain / simCount : 0,
      averagePrivacyImprovement: simCount > 0 ? totalPrivacyImprovement / simCount : 0,
      averageConfidence: simCount > 0 ? totalConfidence / simCount : 0,
      averageDuration: simCount > 0 ? totalDuration / simCount : 0,
      acceptanceRate: totalHistory > 0 ? accepted / totalHistory : 0,
      rejectionRate: totalHistory > 0 ? rejected / totalHistory : 0,
      executionRate: totalHistory > 0 ? executed / totalHistory : 0,
      expiryRate: totalHistory > 0 ? expired / totalHistory : 0,
      lastSimulationAt: history.length > 0 ? history[history.length - 1]!.timestamp : null,
      futureMetadata: {},
    };
  }

  getEvidence(analytics: SimulationAnalytics) {
    return [
      {
        source: 'simulation_analytics',
        metric: 'total_simulations',
        value: analytics.totalSimulations,
        timestamp: new Date().toISOString(),
        description: `Total simulations: ${analytics.totalSimulations}`,
        futureMetadata: {},
      },
      {
        source: 'simulation_analytics',
        metric: 'average_confidence',
        value: analytics.averageConfidence,
        timestamp: new Date().toISOString(),
        description: `Average confidence: ${(analytics.averageConfidence * 100).toFixed(1)}%`,
        futureMetadata: {},
      },
    ];
  }
}
