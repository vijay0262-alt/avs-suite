/**
 * Optimization Summary types (Part 7).
 *
 * After optimization finishes, a success summary is shown with
 * before/after health score, recovered space, items fixed, and duration.
 */

export interface OptimizationSummary {
  /** Health score before optimization (0–100). */
  healthBefore: number;
  /** Health score after optimization (0–100). */
  healthAfter: number;
  /** Bytes recovered from storage. */
  storageRecovered: number;
  /** Number of registry issues fixed. */
  registryFixed: number;
  /** Number of startup applications optimized. */
  startupOptimized: number;
  /** Number of privacy items cleaned. */
  privacyCleaned: number;
  /** Number of duplicate files removed. */
  duplicateFilesRemoved: number;
  /** Optimization duration in milliseconds. */
  durationMs: number;
  /** ISO timestamp of completion. */
  completedAt: string;
  /** Whether all modules succeeded. */
  success: boolean;
}

export interface OptimizationSummaryStat {
  label: string;
  value: string;
  icon: string;
}
