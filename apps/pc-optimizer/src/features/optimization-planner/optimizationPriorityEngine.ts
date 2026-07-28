/**
 * Optimization Priority Engine — ranks optimization items by
 * severity, estimated benefit, risk, execution history, and
 * capability availability.
 *
 * The priority engine produces a sorted execution order that
 * maximizes benefit while respecting dependencies and risk.
 */
import type {
  OptimizationItem,
  PlannerUserPreferences,
} from './types';
import {
  priorityToWeight,
  riskToWeight,
} from './types';
import type { ExecutionRecord } from '../maintenance-history/types';
import type { HealthCategoryId } from '../ai-health-engine/types';

/**
 * Compute a priority score for an optimization item.
 * Higher score = higher priority (should run earlier).
 */
function computePriorityScore(
  item: OptimizationItem,
  history: ExecutionRecord[],
  preferences: PlannerUserPreferences,
): number {
  let score = 0;

  // Base priority from the item's priority level (0–100)
  score += priorityToWeight(item.priority) * 1.0;

  // Benefit contribution (0–100)
  score += item.estimatedBenefit * 0.8;

  // Risk penalty — lower risk is better (unless user prefers risky)
  const riskWeight = riskToWeight(item.risk);
  score -= riskWeight * 0.3;
  if (preferences.avoidHighRisk && item.risk === 'high') {
    score -= 50;
  }

  // User preference boosts
  if (preferences.prioritizePrivacy) {
    if (item.category === 'privacy' || item.category === 'browser') {
      score += 20;
    }
  }
  if (preferences.prioritizeStorage) {
    if (item.category === 'storage' || item.category === 'temp_files' || item.category === 'recycle_bin') {
      score += 20;
    }
  }

  // Execution history factor — categories not recently cleaned get a boost
  const recentlyCleaned = hasRecentExecution(item.category, history);
  if (!recentlyCleaned) {
    score += 15;
  }

  // Locked items go to the end
  if (item.isLocked) {
    score -= 200;
  }

  // Skipped items go to the very end
  if (item.isSkipped) {
    score -= 300;
  }

  return score;
}

/**
 * Check if a category has been recently executed (within 7 days).
 */
function hasRecentExecution(
  category: HealthCategoryId,
  history: ExecutionRecord[],
): boolean {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return history.some((record) => {
    const recordTime = new Date(record.startTime).getTime();
    return recordTime > sevenDaysAgo;
  });
}

/**
 * Topological sort respecting dependencies.
 * Items with no dependencies come first.
 */
function topologicalSort(items: OptimizationItem[]): OptimizationItem[] {
  const sorted: OptimizationItem[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(item: OptimizationItem): void {
    if (visited.has(item.id)) return;
    if (visiting.has(item.id)) return; // Cycle detected — skip
    visiting.add(item.id);

    for (const depId of item.dependencies) {
      const dep = items.find((i) => i.id === depId);
      if (dep) visit(dep);
    }

    visiting.delete(item.id);
    visited.add(item.id);
    sorted.push(item);
  }

  for (const item of items) {
    visit(item);
  }

  return sorted;
}

/**
 * Rank optimization items by priority and produce an execution order.
 *
 * Algorithm:
 *   1. Compute priority score for each active item
 *   2. Sort by priority score (descending)
 *   3. Apply topological sort for dependencies
 *   4. Append locked and skipped items at the end
 *
 * @param items - All optimization items
 * @param history - Execution history records
 * @param preferences - User preferences
 * @returns Ordered array of item IDs (execution order)
 */
export function rankItems(
  items: OptimizationItem[],
  history: ExecutionRecord[],
  preferences: PlannerUserPreferences,
): string[] {
  // Separate active, locked, and skipped items (mutually exclusive)
  const active = items.filter((i) => !i.isLocked && !i.isSkipped);
  const locked = items.filter((i) => i.isLocked && !i.isSkipped);
  const skipped = items.filter((i) => i.isSkipped);

  // Score and sort active items
  const scored = active.map((item) => ({
    item,
    score: computePriorityScore(item, history, preferences),
  }));
  scored.sort((a, b) => b.score - a.score);

  const sortedActive = scored.map((s) => s.item);

  // Apply topological sort within the priority-sorted list
  const topoSorted = topologicalSort(sortedActive);

  // Build final order: active → locked → skipped
  return [
    ...topoSorted.map((i) => i.id),
    ...locked.map((i) => i.id),
    ...skipped.map((i) => i.id),
  ];
}

/**
 * Get a human-readable reasoning for why an item was prioritized.
 */
export function getPrioritizationReasoning(
  item: OptimizationItem,
  history: ExecutionRecord[],
): string {
  const reasons: string[] = [];

  if (item.priority === 'critical') {
    reasons.push('Critical severity issue detected');
  } else if (item.priority === 'high') {
    reasons.push('High priority issue');
  }

  if (item.estimatedBenefit > 20) {
    reasons.push(`High estimated benefit (+${item.estimatedBenefit.toFixed(0)} points)`);
  }

  if (item.estimatedSpaceRecovery > 100 * 1024 * 1024) {
    reasons.push('Significant space recovery expected');
  }

  if (!hasRecentExecution(item.category, history)) {
    reasons.push('Not recently optimized');
  }

  if (item.risk === 'low') {
    reasons.push('Low risk operation');
  }

  if (item.isLocked) {
    reasons.push(`Locked: ${item.lockedReason ?? 'capability unavailable'}`);
  }

  if (item.isSkipped) {
    reasons.push(`Skipped: ${item.skippedReason ?? 'not included in plan type'}`);
  }

  return reasons.join('; ') || 'Standard priority';
}
