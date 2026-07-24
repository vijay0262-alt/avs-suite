/**
 * Module Optimization Summary (Part 9) — each module contributes its own
 * summary after Smart Optimization. The final optimization report combines
 * these results automatically.
 *
 * Modules implement `getOptimizationSummary()` to provide:
 *   - Files removed, storage recovered, registry entries fixed,
 *     startup items disabled, privacy files removed, duplicate files deleted
 *
 * The aggregator combines all module summaries into a unified report.
 */

import type { ModuleId } from '../health/HealthContribution';

export interface ModuleOptimizationSummary {
  moduleId: ModuleId;
  moduleName: string;
  /** Items removed (files, entries, apps, etc.). */
  itemsRemoved: number;
  /** Bytes recovered. */
  bytesRecovered: number;
  /** Registry entries fixed. */
  registryFixed: number;
  /** Startup items disabled. */
  startupOptimized: number;
  /** Privacy items cleaned. */
  privacyCleaned: number;
  /** Duplicate files removed. */
  duplicateFilesRemoved: number;
  /** Duration of this module's optimization in ms. */
  durationMs: number;
  /** Whether this module's optimization succeeded. */
  success: boolean;
}

export interface AggregatedOptimizationSummary {
  modules: ModuleOptimizationSummary[];
  totalItemsRemoved: number;
  totalBytesRecovered: number;
  totalRegistryFixed: number;
  totalStartupOptimized: number;
  totalPrivacyCleaned: number;
  totalDuplicateFilesRemoved: number;
  totalDurationMs: number;
  allSucceeded: boolean;
  completedAt: string;
}

/**
 * Aggregate module optimization summaries into a unified report.
 * Each module provides its own results — no Dashboard code changes needed.
 */
export function aggregateModuleSummaries(
  summaries: ModuleOptimizationSummary[],
): AggregatedOptimizationSummary {
  const totalItemsRemoved = summaries.reduce((s, m) => s + m.itemsRemoved, 0);
  const totalBytesRecovered = summaries.reduce((s, m) => s + m.bytesRecovered, 0);
  const totalRegistryFixed = summaries.reduce((s, m) => s + m.registryFixed, 0);
  const totalStartupOptimized = summaries.reduce((s, m) => s + m.startupOptimized, 0);
  const totalPrivacyCleaned = summaries.reduce((s, m) => s + m.privacyCleaned, 0);
  const totalDuplicateFilesRemoved = summaries.reduce((s, m) => s + m.duplicateFilesRemoved, 0);
  const totalDurationMs = summaries.reduce((s, m) => s + m.durationMs, 0);
  const allSucceeded = summaries.every((m) => m.success);

  return {
    modules: summaries,
    totalItemsRemoved,
    totalBytesRecovered,
    totalRegistryFixed,
    totalStartupOptimized,
    totalPrivacyCleaned,
    totalDuplicateFilesRemoved,
    totalDurationMs,
    allSucceeded,
    completedAt: new Date().toISOString(),
  };
}
