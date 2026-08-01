/**
 * OptimizationPreview — builds a human-readable preview of an optimization
 * plan for display before user approval.
 *
 * Shows: estimated storage/RAM/startup/browser/privacy improvement,
 * completion time, health score improvement, and per-action summary.
 */
import type {
  OptimizationPlan,
  OptimizationPreview,
  OptimizationPreviewAction,
} from './types';

export class OptimizationPreviewBuilder {
  build(plan: OptimizationPlan): OptimizationPreview {
    const actionsPreview: OptimizationPreviewAction[] = plan.actions.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      impactTier: a.impactTier,
      estimatedBenefit: this.formatBenefit(a.benefits),
      estimatedDurationSeconds: a.risk.estimatedDurationSeconds,
      riskLevel: a.risk.level,
      rollbackAvailable: a.rollbackAvailable,
    }));

    const scoreImprovement = plan.predictedHealthScore - plan.currentHealthScore;

    const warnings: string[] = [];
    if (plan.totalRisk === 'high' || plan.totalRisk === 'severe') {
      warnings.push('This plan includes higher-risk actions. Review carefully.');
    }
    const irreversibleActions = plan.actions.filter((a) => !a.rollbackAvailable);
    if (irreversibleActions.length > 0) {
      warnings.push(`${irreversibleActions.length} action(s) are irreversible.`);
    }
    const restartActions = plan.actions.filter((a) => a.risk.requiresRestart);
    if (restartActions.length > 0) {
      warnings.push(`${restartActions.length} action(s) require a system restart.`);
    }

    return {
      planId: plan.id,
      headline: this.buildHeadline(plan, scoreImprovement),
      currentHealthScore: plan.currentHealthScore,
      expectedHealthScore: plan.predictedHealthScore,
      scoreImprovement,
      estimatedStorageRecoveryMB: plan.totalBenefits.storageRecoveryMB,
      estimatedRamRecoveryMB: plan.totalBenefits.ramRecoveryMB,
      estimatedStartupImprovementMs: plan.totalBenefits.startupImprovementMs,
      estimatedBrowserImprovement: plan.totalBenefits.performanceImprovement,
      estimatedPrivacyImprovement: plan.totalBenefits.privacyImprovement,
      estimatedCompletionTimeSeconds: plan.estimatedTotalDurationSeconds,
      estimatedThermalImprovement: plan.totalBenefits.thermalImprovement,
      estimatedBatteryImprovement: plan.totalBenefits.batteryImprovement,
      actionsPreview,
      reasoning: plan.reasoning,
      rollbackAvailable: plan.rollbackAvailable,
      warnings,
    };
  }

  private buildHeadline(plan: OptimizationPlan, improvement: number): string {
    const parts: string[] = [];
    parts.push(`${plan.actions.length} optimization actions ready.`);
    if (plan.totalBenefits.storageRecoveryMB > 0) {
      parts.push(`Recover ${(plan.totalBenefits.storageRecoveryMB / 1024).toFixed(1)} GB storage.`);
    }
    if (plan.totalBenefits.ramRecoveryMB > 0) {
      parts.push(`Free ${plan.totalBenefits.ramRecoveryMB.toFixed(0)} MB RAM.`);
    }
    if (improvement > 0) {
      parts.push(`Health score: ${plan.currentHealthScore} → ${plan.predictedHealthScore} (+${improvement}).`);
    }
    return parts.join(' ');
  }

  private formatBenefit(benefits: { storageRecoveryMB: number; ramRecoveryMB: number; startupImprovementMs: number; privacyImprovement: number; performanceImprovement: number }): string {
    const parts: string[] = [];
    if (benefits.storageRecoveryMB > 0) parts.push(`${benefits.storageRecoveryMB.toFixed(0)} MB storage`);
    if (benefits.ramRecoveryMB > 0) parts.push(`${benefits.ramRecoveryMB.toFixed(0)} MB RAM`);
    if (benefits.startupImprovementMs > 0) parts.push(`${(benefits.startupImprovementMs / 1000).toFixed(1)}s startup`);
    if (benefits.privacyImprovement > 0) parts.push(`${benefits.privacyImprovement.toFixed(0)}% privacy`);
    if (benefits.performanceImprovement > 0) parts.push(`${benefits.performanceImprovement.toFixed(0)}% performance`);
    return parts.length > 0 ? parts.join(', ') : 'Minimal benefit';
  }
}
