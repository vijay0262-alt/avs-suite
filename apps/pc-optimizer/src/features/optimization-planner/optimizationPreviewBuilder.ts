/**
 * Optimization Preview Builder — generates human-readable previews
 * of optimization plans for UI display.
 *
 * The preview explains:
 *   • Current health and expected health after optimization
 *   • Estimated improvements (space, performance, privacy)
 *   • Tasks that will run, are locked, or were skipped
 *   • Reasoning behind the prioritization
 */
import type { OptimizationPlan, PlanPreview } from './types';
import { formatBytes, formatDuration } from './types';
import { getPrioritizationReasoning } from './optimizationPriorityEngine';
import type { ExecutionRecord } from '../maintenance-history/types';

/**
 * Build a human-readable headline from the plan.
 */
function buildHeadline(plan: OptimizationPlan): string {
  const improvement = plan.predictedHealthScore - plan.currentHealthScore;
  if (improvement <= 0) {
    return 'Your PC is already in great shape — no optimizations needed.';
  }
  if (improvement >= 20) {
    return `Your PC health can improve from ${plan.currentHealthScore} to ${plan.predictedHealthScore} — a significant boost!`;
  }
  if (improvement >= 10) {
    return `Your PC health can improve from ${plan.currentHealthScore} to ${plan.predictedHealthScore}.`;
  }
  return `Your PC health can improve from ${plan.currentHealthScore} to ${plan.predictedHealthScore} with minor optimizations.`;
}

/**
 * Build the improvements summary list.
 */
function buildImprovements(plan: OptimizationPlan): string[] {
  const improvements: string[] = [];
  const improvement = plan.predictedHealthScore - plan.currentHealthScore;

  if (improvement > 0) {
    improvements.push(`Health Score: +${improvement.toFixed(0)} points (${plan.currentHealthScore} → ${plan.predictedHealthScore})`);
  }

  if (plan.estimatedSpaceRecovery > 0) {
    improvements.push(`Storage Recovery: ${formatBytes(plan.estimatedSpaceRecovery)}`);
  }

  if (plan.estimatedPerformanceImprovement > 0) {
    improvements.push(`Performance Improvement: +${plan.estimatedPerformanceImprovement.toFixed(0)}%`);
  }

  if (plan.estimatedPrivacyImprovement > 0) {
    improvements.push(`Privacy Improvement: +${plan.estimatedPrivacyImprovement.toFixed(0)}%`);
  }

  if (plan.estimatedDurationSeconds > 0) {
    improvements.push(`Estimated Time: ${formatDuration(plan.estimatedDurationSeconds)}`);
  }

  return improvements;
}

// ── Preview Builder ───────────────────────────────────────────

export const previewBuilder = {
  /**
   * Build a complete plan preview.
   */
  build(plan: OptimizationPlan, executionHistory: ExecutionRecord[]): PlanPreview {
    const activeItems = plan.items.filter((i) => !i.isSkipped && !i.isLocked);
    const lockedItems = plan.items.filter((i) => i.isLocked);
    const skippedItems = plan.items.filter((i) => i.isSkipped && !i.isLocked);

    const tasksWillRun = activeItems.map((item) => ({
      title: item.title,
      benefit: `+${item.estimatedBenefit} points${item.estimatedSpaceRecovery > 0 ? `, ${formatBytes(item.estimatedSpaceRecovery)}` : ''}`,
      duration: formatDuration(item.estimatedDurationSeconds),
    }));

    const tasksLocked = lockedItems.map((item) => ({
      title: item.title,
      reason: item.lockedReason ?? 'Capability unavailable',
    }));

    const tasksSkipped = skippedItems.map((item) => ({
      title: item.title,
      reason: item.skippedReason ?? 'Filtered by plan type',
    }));

    // Build reasoning from prioritization
    const reasoning: string[] = [];
    for (const item of activeItems) {
      const reason = getPrioritizationReasoning(item, executionHistory);
      if (reason) {
        reasoning.push(`${item.title}: ${reason}`);
      }
    }

    // Limit reasoning to top 5 to avoid overwhelming the user
    if (reasoning.length > 5) {
      reasoning.splice(5);
      reasoning.push('... and more');
    }

    const scoreImprovement = plan.predictedHealthScore - plan.currentHealthScore;

    return {
      planId: plan.planId,
      headline: buildHeadline(plan),
      currentHealthScore: plan.currentHealthScore,
      expectedHealthScore: plan.predictedHealthScore,
      scoreImprovement,
      estimatedDuration: formatDuration(plan.estimatedDurationSeconds),
      estimatedSpaceRecovery: plan.estimatedSpaceRecovery > 0
        ? formatBytes(plan.estimatedSpaceRecovery)
        : 'No space recovery',
      tasksWillRun,
      tasksLocked,
      tasksSkipped,
      reasoning,
      improvements: buildImprovements(plan),
    };
  },
};
