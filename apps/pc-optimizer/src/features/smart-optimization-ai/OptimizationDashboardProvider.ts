/**
 * OptimizationDashboardProvider — builds dashboard summary data for the
 * Smart Optimization UI.
 */
import type {
  OptimizationPlan,
  OptimizationDashboardData,
  OptimizationDashboardSummary,
  OptimizationDashboardEntry,
  HealthTrendPoint,
} from './types';
import type { OptimizationHistory } from './OptimizationHistory';
import { OptimizationInsights } from './OptimizationInsights';

export class OptimizationDashboardProvider {
  private insightsEngine: OptimizationInsights;

  constructor() {
    this.insightsEngine = new OptimizationInsights();
  }

  build(
    plan: OptimizationPlan | null,
    history: OptimizationHistory,
  ): OptimizationDashboardData {
    const summary = this.buildSummary(plan);
    const topRecommendations = this.buildTopRecommendations(plan);
    const recentOptimizations = this.buildRecentOptimizations(history);
    const healthTrend = this.buildHealthTrend(history);
    const insights = plan ? this.insightsEngine.generateInsights(plan).slice(0, 10) : [];
    const lastReport = history.getLatestReport();

    return {
      summary,
      topRecommendations,
      recentOptimizations,
      healthTrend,
      insights,
      lastOptimizationAt: lastReport?.executedAt ?? null,
    };
  }

  private buildSummary(plan: OptimizationPlan | null): OptimizationDashboardSummary {
    if (!plan) {
      return {
        currentHealthScore: 0,
        potentialHealthScore: 0,
        totalAvailableActions: 0,
        highImpactActions: 0,
        estimatedTotalRecoveryMB: 0,
        estimatedStartupImprovementMs: 0,
        estimatedDurationSeconds: 0,
        rollbackAvailable: true,
      };
    }

    return {
      currentHealthScore: plan.currentHealthScore,
      potentialHealthScore: plan.predictedHealthScore,
      totalAvailableActions: plan.actions.length,
      highImpactActions: plan.actions.filter((a) => a.impactTier === 'high').length,
      estimatedTotalRecoveryMB: plan.totalBenefits.storageRecoveryMB + plan.totalBenefits.ramRecoveryMB,
      estimatedStartupImprovementMs: plan.totalBenefits.startupImprovementMs,
      estimatedDurationSeconds: plan.estimatedTotalDurationSeconds,
      rollbackAvailable: plan.rollbackAvailable,
    };
  }

  private buildTopRecommendations(plan: OptimizationPlan | null): OptimizationDashboardEntry[] {
    if (!plan) return [];
    return plan.actions
      .slice()
      .sort((a, b) => b.impact.score - a.impact.score)
      .slice(0, 10)
      .map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        impactTier: a.impactTier,
        estimatedBenefit: a.impact.description,
        riskLevel: a.risk.level,
        rollbackAvailable: a.rollbackAvailable,
        status: a.status,
      }));
  }

  private buildRecentOptimizations(history: OptimizationHistory): OptimizationDashboardEntry[] {
    const reports = history.getReports().slice(0, 5);
    const entries: OptimizationDashboardEntry[] = [];
    for (const report of reports) {
      for (const result of report.results.slice(0, 3)) {
        entries.push({
          id: result.actionId,
          title: result.actionTitle,
          category: 'general',
          impactTier: 'informational',
          estimatedBenefit: '',
          riskLevel: 'none',
          rollbackAvailable: result.rollbackAvailable,
          status: result.status,
        });
      }
    }
    return entries.slice(0, 10);
  }

  private buildHealthTrend(history: OptimizationHistory): HealthTrendPoint[] {
    return history.getHealthTrend().slice(0, 20).map((p) => ({
      timestamp: p.timestamp,
      healthScore: p.healthScore,
      label: p.label,
    }));
  }
}
