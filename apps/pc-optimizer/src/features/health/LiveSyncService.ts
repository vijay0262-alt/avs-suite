/**
 * LiveSyncService — Phase 9 Verification & Synchronization.
 *
 * A global Zustand store that holds the current state of all scores
 * and protection status. After every scan and fix, the
 * DashboardViewModel calls `liveSync.broadcastScores()` to update
 * this store. All modules (Dashboard, Protection Center, Security
 * Center, Sidebar, Status widgets, Reports, History) subscribe via
 * the `useLiveSync()` hook and immediately re-render with fresh data.
 *
 * This ensures no stale information anywhere in the application.
 *
 * Event pipeline:
 *   Optimization Started
 *   → Module Actions Executed
 *   → Verification Complete
 *   → Scores Updated (this store)
 *   → History Updated
 *   → Notification Sent
 *   → System Tray Updated
 */

import { create } from 'zustand';
import { optimizationEventBus, OptimizationEventType } from './OptimizationEventBus';
import { healthNotificationService } from './HealthNotificationService';

// ── Types ────────────────────────────────────────────────────────

export interface LiveScoreState {
  // Core scores (0-100)
  healthScore: number;
  securityScore: number;
  performanceScore: number;
  storageScore: number;
  privacyScore: number;
  hardwareHealth: number;
  predictiveHealth: number;

  // Protection status
  protectionStatus: 'fully_protected' | 'partially_protected' | 'at_risk' | 'unknown';

  // Metadata
  lastUpdated: string | null;
  lastOptimizationAt: string | null;

  // Actions
  broadcastScores: (scores: Partial<Omit<LiveScoreState, 'broadcastScores' | 'broadcastOptimizationComplete'>>) => void;
  broadcastOptimizationComplete: (result: OptimizationCompletePayload) => void;
}

export interface OptimizationCompletePayload {
  healthScoreBefore: number;
  healthScoreAfter: number;
  storageRecovered: number;
  registryFixed: number;
  startupOptimized: number;
  privacyCleaned: number;
  durationMs: number;
  success: boolean;
  moduleIds: string[];
}

// ── Store ────────────────────────────────────────────────────────

export const useLiveSync = create<LiveScoreState>((set) => ({
  healthScore: 0,
  securityScore: 0,
  performanceScore: 0,
  storageScore: 0,
  privacyScore: 0,
  hardwareHealth: 0,
  predictiveHealth: 0,
  protectionStatus: 'unknown',
  lastUpdated: null,
  lastOptimizationAt: null,

  broadcastScores: (scores) => {
    set({
      ...scores,
      lastUpdated: new Date().toISOString(),
    });
  },

  broadcastOptimizationComplete: (result) => {
    // Update scores
    set({
      healthScore: result.healthScoreAfter,
      lastOptimizationAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    });

    // Emit optimization events for each module that ran
    for (const moduleId of result.moduleIds) {
      optimizationEventBus.emit({
        type: OptimizationEventType.CleaningCompleted,
        moduleId: moduleId as never,
        action: 'fix_all',
        bytesRecovered: result.storageRecovered,
        itemsProcessed: result.registryFixed + result.startupOptimized + result.privacyCleaned,
        timestamp: Date.now(),
      });
    }

    // Emit scan completed event
    optimizationEventBus.emit({
      type: OptimizationEventType.ScanCompleted,
      moduleId: 'dashboard' as never,
      action: 'optimization_complete',
      bytesRecovered: result.storageRecovered,
      timestamp: Date.now(),
    });

    // Send notification only after verification succeeds
    if (result.success) {
      healthNotificationService.checkForChanges(
        result.healthScoreAfter,
        0, // junkBytes — not tracked here
        0, // startupApps — not tracked here
      );
    }

    // Update system tray status
    updateTrayStatus(result);
  },
}));

// ── System Tray Integration ──────────────────────────────────────

function updateTrayStatus(result: OptimizationCompletePayload): void {
  try {
    const tray = (window as unknown as { avs?: { tray?: { updateStatus?: (status: string, tooltip?: string) => void } } }).avs?.tray;
    if (!tray?.updateStatus) return;

    let status: string;
    let tooltip: string;

    if (result.success && result.healthScoreAfter >= 90) {
      status = 'protected';
      tooltip = `AVS Shield — Protected & Optimized (Score: ${result.healthScoreAfter})`;
    } else if (result.success && result.healthScoreAfter >= 70) {
      status = 'optimized';
      tooltip = `AVS Shield — Optimized (Score: ${result.healthScoreAfter})`;
    } else if (!result.success) {
      status = 'warning';
      tooltip = `AVS Shield — Attention Required (Score: ${result.healthScoreAfter})`;
    } else {
      status = 'warning';
      tooltip = `AVS Shield — Score: ${result.healthScoreAfter}`;
    }

    tray.updateStatus(status, tooltip);
  } catch {
    // Tray API not available (e.g. in tests, dev browser)
  }
}

// ── Convenience hook for components ───────────────────────────────

/**
 * Hook for any component to subscribe to live score updates.
 * Returns the current scores and protection status.
 */
export function useLiveScores() {
  return useLiveSync((s) => ({
    healthScore: s.healthScore,
    securityScore: s.securityScore,
    performanceScore: s.performanceScore,
    storageScore: s.storageScore,
    privacyScore: s.privacyScore,
    hardwareHealth: s.hardwareHealth,
    predictiveHealth: s.predictiveHealth,
    protectionStatus: s.protectionStatus,
    lastUpdated: s.lastUpdated,
    lastOptimizationAt: s.lastOptimizationAt,
  }));
}
