/**
 * Dashboard Summary Provider — aggregates all widget data into a single summary.
 *
 * Consumes the AI Intelligence Platform outputs and produces a DashboardSummary.
 */
import type {
  CoreWidgetDataBundle,
  DashboardSummary,
} from './types';
import { getHealthStatus, getHealthTrend } from './types';

export class DashboardSummaryProvider {
  getSummary(bundle: CoreWidgetDataBundle): DashboardSummary {
    const health = bundle.aiContext?.health;
    const recommendations = bundle.recommendations;
    const predictions = bundle.predictions;
    const history = bundle.aiContext?.history;
    const deviceProfile = bundle.deviceProfile;

    const overallScore = health?.overallScore ?? 0;
    const healthStatus = getHealthStatus(overallScore);

    // Determine health trend from knowledge trends
    const trends = bundle.knowledge?.trends ?? [];
    const healthTrend = trends.length > 0 ? getHealthTrend(trends[0]?.direction) : 'unknown';

    // Recommendations
    const totalRecommendations = recommendations?.recommendations?.length ?? 0;
    const criticalRecommendations = recommendations?.recommendations?.filter(
      (r) => r.priority === 'critical' || r.priority === 'high',
    ).length ?? 0;

    // Quick wins — safe, low effort, high impact
    const quickWinsAvailable = recommendations?.recommendations?.filter(
      (r) => r.safety.riskLevel === 'none' || r.safety.riskLevel === 'low',
    ).length ?? 0;

    // Predictions
    const predictionCount = predictions?.predictions?.length ?? 0;
    const upcomingConcerns = predictions?.predictions
      ?.filter((p) => p.riskLevel === 'high' || p.riskLevel === 'critical')
      .map((p) => p.title) ?? [];

    // History
    const totalOptimizations = history?.totalOptimizations ?? 0;
    const totalStorageRecovered = history?.totalCleanedMB ?? 0;

    // Device profile
    const deviceProfileName = deviceProfile?.primaryProfile ?? 'unknown';

    return {
      healthScore: overallScore,
      healthStatus,
      healthTrend,
      totalRecommendations,
      criticalRecommendations,
      quickWinsAvailable,
      predictionCount,
      upcomingConcerns,
      totalOptimizations,
      totalStorageRecovered,
      deviceProfile: deviceProfileName,
      lastUpdated: new Date().toISOString(),
    };
  }
}
