/**
 * OptimizationSimulation — projects the system state after applying
 * an optimization plan, without executing anything.
 *
 * Uses benefit estimates from the plan to project CPU, memory, disk,
 * startup, browser, privacy, thermal, battery, and stability metrics.
 */
import type {
  OptimizationPlan,
  OptimizationSimulation,
  SystemStateProjection,
  OptimizationBenefits,
} from './types';

export class OptimizationSimulationEngine {
  simulate(
    plan: OptimizationPlan,
    currentState: SystemStateProjection,
  ): OptimizationSimulation {
    const benefits = plan.totalBenefits;

    const projected: SystemStateProjection = {
      cpuUsagePercent: this.projectCPU(currentState.cpuUsagePercent, benefits),
      memoryUsageMB: this.projectMemory(currentState.memoryUsageMB, benefits),
      diskFreeSpaceMB: currentState.diskFreeSpaceMB + benefits.storageRecoveryMB,
      startupTimeSeconds: this.projectStartup(currentState.startupTimeSeconds, benefits),
      browserResponsiveness: this.projectBrowser(currentState.browserResponsiveness, benefits),
      privacyScore: Math.min(100, currentState.privacyScore + benefits.privacyImprovement),
      thermalScore: Math.min(100, currentState.thermalScore + benefits.thermalImprovement),
      batteryEstimateHours: currentState.batteryEstimateHours + benefits.batteryImprovement,
      stabilityScore: Math.min(100, currentState.stabilityScore + benefits.stabilityImpact),
    };

    const simulatedHealthScore = this.computeProjectedHealthScore(projected);
    const confidence = this.computeSimulationConfidence(plan);

    const assumptions: string[] = [
      'Benefits estimates are based on evidence from source modules.',
      'System state projection assumes no concurrent changes during optimization.',
      'Actual results may vary based on system configuration and usage patterns.',
    ];

    const warnings: string[] = [];
    if (plan.totalRisk === 'high' || plan.totalRisk === 'severe') {
      warnings.push('This plan carries elevated risk — review carefully before proceeding.');
    }
    if (!plan.rollbackAvailable) {
      warnings.push('Some actions in this plan are irreversible.');
    }

    return {
      planId: plan.id,
      simulatedHealthScore,
      simulatedBenefits: benefits,
      simulatedRisk: plan.totalRisk,
      projectedSystemState: projected,
      confidence,
      assumptions,
      warnings,
    };
  }

  private projectCPU(current: number, benefits: OptimizationBenefits): number {
    const reduction = benefits.performanceImprovement * 0.3;
    return Math.max(0, current - reduction);
  }

  private projectMemory(current: number, benefits: OptimizationBenefits): number {
    return Math.max(0, current - benefits.ramRecoveryMB);
  }

  private projectStartup(current: number, benefits: OptimizationBenefits): number {
    const reductionSeconds = benefits.startupImprovementMs / 1000;
    return Math.max(0, current - reductionSeconds);
  }

  private projectBrowser(current: number, benefits: OptimizationBenefits): number {
    return Math.min(100, current + benefits.performanceImprovement * 0.2);
  }

  private computeProjectedHealthScore(state: SystemStateProjection): number {
    let score = 50;
    if (state.cpuUsagePercent < 30) score += 10;
    else if (state.cpuUsagePercent < 50) score += 5;
    else if (state.cpuUsagePercent > 80) score -= 10;

    if (state.memoryUsageMB < 4000) score += 8;
    else if (state.memoryUsageMB > 12000) score -= 8;

    if (state.diskFreeSpaceMB > 50000) score += 5;

    if (state.startupTimeSeconds < 15) score += 8;
    else if (state.startupTimeSeconds > 60) score -= 5;

    score += state.privacyScore * 0.05;
    score += state.thermalScore * 0.05;
    score += state.stabilityScore * 0.1;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private computeSimulationConfidence(plan: OptimizationPlan): number {
    const evidenceCount = plan.actions.reduce((s, a) => s + a.evidence.length, 0);
    const evidenceFactor = Math.min(0.3, evidenceCount * 0.02);
    return Math.min(0.95, plan.overallConfidence * 0.7 + evidenceFactor);
  }
}
