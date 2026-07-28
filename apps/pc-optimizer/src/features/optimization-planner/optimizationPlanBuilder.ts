/**
 * Optimization Plan Builder — assembles optimization plans from
 * health report data, category estimates, and plan type filters.
 *
 * The plan builder:
 *   1. Filters categories based on plan type
 *   2. Creates optimization items from category results
 *   3. Checks capability availability (locks items if unavailable)
 *   4. Computes plan-level aggregates
 *   5. Returns a complete OptimizationPlan
 */
import type {
  HealthReport,
  CategoryResult,
  HealthCategoryId,
} from '../ai-health-engine/types';
import type { CapabilityInfo } from '../config-sync/types';
import type { ExecutionRecord } from '../maintenance-history/types';
import type {
  OptimizationPlan,
  OptimizationItem,
  PlanType,
  PlannerUserPreferences,
} from './types';
import {
  PLAN_TYPE_CATEGORIES,
  CATEGORY_TASK_MAP,
  CATEGORY_CAPABILITY_MAP,
  clampScore,
} from './types';
import {
  estimateCategory,
  estimatePredictedScore,
  estimatePerformanceImprovement,
  estimatePrivacyImprovement,
  estimateOverallRisk,
  type CategoryEstimate,
} from './optimizationEstimator';
import { rankItems } from './optimizationPriorityEngine';

let _planCounter = 0;

function generatePlanId(planType: PlanType): string {
  _planCounter += 1;
  return `plan-${planType}-${Date.now().toString(36)}-${_planCounter}`;
}

let _itemCounter = 0;

function generateItemId(category: string): string {
  _itemCounter += 1;
  return `opt-${category}-${_itemCounter}`;
}

/**
 * Check if a capability is available.
 */
function isCapabilityAvailable(
  capabilityId: string | null,
  available: CapabilityInfo[],
  locked: CapabilityInfo[],
): { available: boolean; locked: boolean; reason: string | null } {
  if (!capabilityId) return { available: true, locked: false, reason: null };

  const isAvailable = available.some((c) => c.id === capabilityId);
  if (isAvailable) return { available: true, locked: false, reason: null };

  const isLocked = locked.some((c) => c.id === capabilityId);
  if (isLocked) {
    return { available: false, locked: true, reason: 'Capability not available in current plan' };
  }

  return { available: false, locked: true, reason: 'Capability not found' };
}

/**
 * Create an optimization item from a category result and estimate.
 */
function createOptimizationItem(
  categoryResult: CategoryResult,
  estimate: CategoryEstimate,
  capabilities: { available: CapabilityInfo[]; locked: CapabilityInfo[] },
  isSkipped: boolean,
  skippedReason: string | null,
): OptimizationItem {
  const taskId = CATEGORY_TASK_MAP[categoryResult.categoryId];
  const capabilityId = CATEGORY_CAPABILITY_MAP[categoryResult.categoryId];
  const capCheck = isCapabilityAvailable(capabilityId, capabilities.available, capabilities.locked);

  // Determine priority from severity
  let priority: OptimizationItem['priority'] = 'low';
  if (categoryResult.severity === 'critical') priority = 'critical';
  else if (categoryResult.severity === 'high') priority = 'high';
  else if (categoryResult.severity === 'medium') priority = 'medium';
  else if (categoryResult.severity === 'low') priority = 'low';

  // Build description from issues
  const issueSummary = categoryResult.issues.length > 0
    ? categoryResult.issues.map((i) => i.title).join('; ')
    : 'No specific issues detected';

  return {
    id: generateItemId(categoryResult.categoryId),
    title: getCategoryTitle(categoryResult.categoryId),
    description: issueSummary,
    category: categoryResult.categoryId,
    priority,
    estimatedBenefit: Math.round(estimate.benefit),
    estimatedDurationSeconds: estimate.durationSeconds,
    estimatedSpaceRecovery: estimate.spaceRecoveryBytes,
    risk: estimate.risk,
    requiredCapability: capabilityId,
    requiredTask: taskId,
    canBeSkipped: taskId !== null,
    dependencies: [],
    isLocked: capCheck.locked,
    lockedReason: capCheck.reason,
    isSkipped,
    skippedReason,
  };
}

/**
 * Get a human-readable title for a category.
 */
function getCategoryTitle(category: HealthCategoryId): string {
  const titles: Record<HealthCategoryId, string> = {
    storage: 'Optimize Storage',
    performance: 'Improve Performance',
    memory: 'Optimize Memory Usage',
    startup: 'Review Startup Programs',
    browser: 'Clean Browser Cache',
    privacy: 'Privacy Cleanup',
    temp_files: 'Remove Temporary Files',
    recycle_bin: 'Empty Recycle Bin',
    system_updates: 'Check System Updates',
    drivers: 'Update Drivers',
    security: 'Security Check',
  };
  return titles[category];
}

/**
 * Determine which categories to include based on plan type.
 */
function filterCategories(
  report: HealthReport,
  planType: PlanType,
  customCategories?: HealthCategoryId[],
): { included: Set<HealthCategoryId>; excluded: Set<HealthCategoryId> } {
  const filter = PLAN_TYPE_CATEGORIES[planType];
  const allCategories = new Set(report.categories.map((c) => c.categoryId));

  if (filter === '*') {
    // For custom, use customCategories if provided
    if (planType === 'custom' && customCategories) {
      const included = new Set(customCategories.filter((c) => allCategories.has(c)));
      const excluded = new Set([...allCategories].filter((c) => !included.has(c)));
      return { included, excluded };
    }
    return { included: allCategories, excluded: new Set() };
  }

  const included = new Set(filter.filter((c) => allCategories.has(c)));
  const excluded = new Set([...allCategories].filter((c) => !included.has(c)));
  return { included, excluded };
}

// ── Plan Builder ──────────────────────────────────────────────

export const planBuilder = {
  /**
   * Build a complete optimization plan.
   */
  build(
    report: HealthReport,
    planType: PlanType,
    capabilities: { available: CapabilityInfo[]; locked: CapabilityInfo[] },
    executionHistory: ExecutionRecord[],
    preferences: PlannerUserPreferences,
    customCategories?: HealthCategoryId[],
  ): OptimizationPlan {
    const { included, excluded } = filterCategories(report, planType, customCategories);
    const metrics = null; // Metrics are embedded in the report's category results

    // Create items for included categories
    const items: OptimizationItem[] = [];
    const estimates: CategoryEstimate[] = [];

    for (const categoryResult of report.categories) {
      const isIncluded = included.has(categoryResult.categoryId);
      const isExcluded = excluded.has(categoryResult.categoryId);

      if (isIncluded) {
        const estimate = estimateCategory(categoryResult, metrics, executionHistory);
        estimates.push(estimate);
        items.push(createOptimizationItem(
          categoryResult,
          estimate,
          capabilities,
          false,
          null,
        ));
      } else if (isExcluded) {
        // Add as skipped item
        const estimate = estimateCategory(categoryResult, metrics, executionHistory);
        items.push(createOptimizationItem(
          categoryResult,
          estimate,
          capabilities,
          true,
          'Not included in this plan type',
        ));
      }
    }

    // Apply user preferences filter
    if (preferences.avoidHighRisk) {
      for (const item of items) {
        if (item.risk === 'high' && !item.isLocked) {
          item.isSkipped = true;
          item.skippedReason = 'Skipped due to high risk preference';
        }
      }
    }

    // Apply max duration filter
    if (preferences.maxDurationSeconds > 0) {
      let totalDuration = 0;
      for (const item of items) {
        if (!item.isSkipped && !item.isLocked) {
          if (totalDuration + item.estimatedDurationSeconds > preferences.maxDurationSeconds) {
            item.isSkipped = true;
            item.skippedReason = 'Exceeds maximum duration';
          } else {
            totalDuration += item.estimatedDurationSeconds;
          }
        }
      }
    }

    // Rank items to get execution order
    const executionOrder = rankItems(items, executionHistory, preferences);

    // Compute plan-level aggregates from active items only
    const activeItems = items.filter((i) => !i.isSkipped && !i.isLocked);
    const activeEstimates = estimates.filter((e) =>
      activeItems.some((i) => i.category === e.category),
    );

    const totalDuration = activeItems.reduce((sum, i) => sum + i.estimatedDurationSeconds, 0);
    const totalSpaceRecovery = activeItems.reduce((sum, i) => sum + i.estimatedSpaceRecovery, 0);
    const currentScore = report.overall.score;
    const predictedScore = estimatePredictedScore(currentScore, activeEstimates);
    const perfImprovement = estimatePerformanceImprovement(activeEstimates, report);
    const privacyImprovement = estimatePrivacyImprovement(activeEstimates);
    const overallRisk = estimateOverallRisk(activeItems.map((i) => i.risk));

    return {
      planId: generatePlanId(planType),
      planType,
      generatedAt: new Date().toISOString(),
      currentHealthScore: currentScore,
      predictedHealthScore: clampScore(predictedScore),
      estimatedDurationSeconds: totalDuration,
      estimatedSpaceRecovery: totalSpaceRecovery,
      estimatedPerformanceImprovement: perfImprovement,
      estimatedPrivacyImprovement: privacyImprovement,
      overallRisk,
      executionOrder,
      items,
      sourceReportId: report.id,
    };
  },
};
