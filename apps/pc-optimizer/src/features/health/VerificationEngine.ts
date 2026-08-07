/**
 * VerificationEngine — Phase 9 Verification & Synchronization.
 *
 * Takes the real backend results from each module action and produces
 * a structured VerificationReport. Every action is classified as:
 *   - completed  (backend confirmed success)
 *   - skipped    (no issues to fix, or feature gated)
 *   - failed     (backend returned errors)
 *   - manual_review (partial success with remaining issues)
 *
 * The report includes per-module details (items processed, items changed,
 * items skipped, items failed, bytes recovered, rollback available,
 * execution time, reason) and an overall verification status.
 *
 * This engine does NOT re-scan. It reuses the actual results returned
 * by the backend during the Fix All execution.
 */

import type { HealthScanModuleResult, HealthScanModuleActual } from '../dashboard/dashboard.types';

// ── Types ────────────────────────────────────────────────────────

export type VerificationStatus =
  | 'verified'
  | 'partially_verified'
  | 'failed';

export type ActionStatus =
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'manual_review';

export interface ModuleVerificationResult {
  moduleId: string;
  moduleName: string;
  status: ActionStatus;
  itemsProcessed: number;
  itemsChanged: number;
  itemsSkipped: number;
  itemsFailed: number;
  bytesRecovered: number;
  rollbackAvailable: boolean;
  executionTimeMs: number;
  reason: string;
  errors: string[];
}

export interface VerificationReport {
  overallStatus: VerificationStatus;
  totalActions: number;
  completed: number;
  skipped: number;
  failed: number;
  manualReview: number;
  totalBytesRecovered: number;
  totalItemsProcessed: number;
  totalItemsChanged: number;
  totalItemsFailed: number;
  modules: ModuleVerificationResult[];
  verifiedAt: string;
  durationMs: number;
  /** Human-readable headline for the UI */
  headline: string;
  /** Human-readable subheadline */
  subheadline: string;
}

// ── Engine ───────────────────────────────────────────────────────

/**
 * Build a VerificationReport from the actual results of a Fix All execution.
 *
 * @param modules - The modules from the before-scan report
 * @param actualMap - Map of moduleId → actual backend results
 * @param startTimeMs - When execution started (Date.now())
 * @returns Structured verification report
 */
export function buildVerificationReport(
  modules: HealthScanModuleResult[],
  actualMap: Map<string, HealthScanModuleActual>,
  startTimeMs: number,
): VerificationReport {
  const now = Date.now();
  const durationMs = now - startTimeMs;
  const moduleResults: ModuleVerificationResult[] = [];

  for (const mod of modules) {
    const actual = actualMap.get(mod.moduleId);

    if (!actual) {
      // Module was not executed (skipped — no issues, or feature gated)
      moduleResults.push({
        moduleId: mod.moduleId,
        moduleName: mod.moduleName,
        status: 'skipped',
        itemsProcessed: 0,
        itemsChanged: 0,
        itemsSkipped: mod.issuesFound,
        itemsFailed: 0,
        bytesRecovered: 0,
        rollbackAvailable: false,
        executionTimeMs: 0,
        reason: mod.canAutoFix
          ? 'No issues requiring action'
          : 'No auto-fix available — manual review required',
        errors: [],
      });
      continue;
    }

    const itemsProcessed =
      (actual.itemsRemoved || 0) +
      (actual.entriesDisabled || 0) +
      (actual.issuesFixed || 0) +
      (actual.filesDeleted || 0);

    const itemsChanged = itemsProcessed;
    const itemsFailed = actual.errors.length;
    const bytesRecovered = actual.bytesRecovered || 0;

    // Determine action status
    let status: ActionStatus;
    let reason: string;

    if (!actual.success && itemsProcessed === 0) {
      status = 'failed';
      reason = actual.reason || actual.errors[0] || 'Action failed';
    } else if (!actual.success && itemsProcessed > 0) {
      status = 'manual_review';
      reason = `${itemsProcessed} items processed, ${itemsFailed} error(s) remaining`;
    } else if (actual.success && itemsProcessed === 0 && bytesRecovered === 0) {
      status = 'completed';
      reason = 'No items needed processing';
    } else {
      status = 'completed';
      reason = actual.reason || `${itemsProcessed} items successfully processed`;
    }

    // Rollback is available for registry and startup modules
    const rollbackAvailable =
      mod.moduleId === 'registry' || mod.moduleId === 'startup';

    moduleResults.push({
      moduleId: mod.moduleId,
      moduleName: mod.moduleName,
      status,
      itemsProcessed,
      itemsChanged,
      itemsSkipped: 0,
      itemsFailed,
      bytesRecovered,
      rollbackAvailable,
      executionTimeMs: durationMs, // Approximate — per-module timing not tracked
      reason,
      errors: actual.errors,
    });
  }

  // Aggregate
  const completed = moduleResults.filter((m) => m.status === 'completed').length;
  const skipped = moduleResults.filter((m) => m.status === 'skipped').length;
  const failed = moduleResults.filter((m) => m.status === 'failed').length;
  const manualReview = moduleResults.filter((m) => m.status === 'manual_review').length;

  const totalBytesRecovered = moduleResults.reduce((s, m) => s + m.bytesRecovered, 0);
  const totalItemsProcessed = moduleResults.reduce((s, m) => s + m.itemsProcessed, 0);
  const totalItemsChanged = moduleResults.reduce((s, m) => s + m.itemsChanged, 0);
  const totalItemsFailed = moduleResults.reduce((s, m) => s + m.itemsFailed, 0);

  // Overall status
  let overallStatus: VerificationStatus;
  if (failed === 0 && manualReview === 0) {
    overallStatus = 'verified';
  } else if (failed === moduleResults.length) {
    overallStatus = 'failed';
  } else {
    overallStatus = 'partially_verified';
  }

  // Headlines
  const totalActions = moduleResults.length;
  let headline: string;
  let subheadline: string;

  if (overallStatus === 'verified') {
    headline = 'Optimization Verified';
    subheadline = `All ${completed} action${completed !== 1 ? 's' : ''} completed successfully.`;
  } else if (overallStatus === 'partially_verified') {
    const attentionCount = failed + manualReview;
    headline = 'Optimization Partially Completed';
    subheadline = `${attentionCount} action${attentionCount !== 1 ? 's' : ''} require attention.`;
  } else {
    headline = 'Optimization Failed';
    subheadline = `${failed} action${failed !== 1 ? 's' : ''} failed. Please try again.`;
  }

  return {
    overallStatus,
    totalActions,
    completed,
    skipped,
    failed,
    manualReview,
    totalBytesRecovered,
    totalItemsProcessed,
    totalItemsChanged,
    totalItemsFailed,
    modules: moduleResults,
    verifiedAt: new Date().toISOString(),
    durationMs,
    headline,
    subheadline,
  };
}

// ── Detailed Summary Builders ────────────────────────────────────

export interface CleaningBreakdownItem {
  label: string;
  bytes: number;
}

export interface CleaningSummary {
  totalRecovered: number;
  breakdown: CleaningBreakdownItem[];
}

/**
 * Build a detailed cleaning breakdown from module verification results.
 * Maps each module's recovered bytes to user-friendly category names.
 */
export function buildCleaningSummary(
  report: VerificationReport,
): CleaningSummary {
  const breakdown: CleaningBreakdownItem[] = [];

  for (const mod of report.modules) {
    if (mod.bytesRecovered <= 0) continue;

    const labelMap: Record<string, string> = {
      junk: 'Junk Files',
      privacy: 'Browser Cache & Privacy',
      registry: 'Registry',
      startup: 'Startup',
      performance: 'Memory Optimization',
    };

    breakdown.push({
      label: labelMap[mod.moduleId] || mod.moduleName,
      bytes: mod.bytesRecovered,
    });
  }

  // Sort by bytes descending
  breakdown.sort((a, b) => b.bytes - a.bytes);

  return {
    totalRecovered: report.totalBytesRecovered,
    breakdown,
  };
}

export interface RegistrySummary {
  brokenEntriesRemoved: number;
  startupEntriesFixed: number;
  sharedDllReferencesRemoved: number;
  unusedFileAssociationsRemoved: number;
  rollbackCreated: boolean;
}

/**
 * Build a registry-specific summary from verification results.
 */
export function buildRegistrySummary(
  report: VerificationReport,
): RegistrySummary {
  const registryMod = report.modules.find((m) => m.moduleId === 'registry');
  const startupMod = report.modules.find((m) => m.moduleId === 'startup');

  return {
    brokenEntriesRemoved: registryMod?.itemsChanged ?? 0,
    startupEntriesFixed: startupMod?.itemsChanged ?? 0,
    sharedDllReferencesRemoved: 0, // Backend doesn't currently break down by subcategory
    unusedFileAssociationsRemoved: 0,
    rollbackCreated: registryMod?.rollbackAvailable ?? false,
  };
}

export interface OptimizationSummaryData {
  startupTimeImprovement: string;
  estimatedMemoryAvailable: string;
  storageRecovered: string;
  performanceScore: number;
  healthScore: number;
}

/**
 * Build an optimization summary from verification results and current scores.
 */
export function buildOptimizationSummary(
  report: VerificationReport,
  healthScoreBefore: number,
  healthScoreAfter: number,
  memoryFreed: number,
): OptimizationSummaryData {
  const startupMod = report.modules.find((m) => m.moduleId === 'startup');
  const startupItems = startupMod?.itemsChanged ?? 0;

  return {
    startupTimeImprovement: startupItems > 0
      ? `~${(startupItems * 0.3).toFixed(1)}s faster boot`
      : 'No change',
    estimatedMemoryAvailable: formatBytes(memoryFreed),
    storageRecovered: formatBytes(report.totalBytesRecovered),
    performanceScore: healthScoreAfter,
    healthScore: healthScoreAfter,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${bytes} B`;
}
