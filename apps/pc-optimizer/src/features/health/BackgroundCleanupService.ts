/**
 * BackgroundCleanupService — detection and notification service for
 * deferred cleanup opportunities.
 *
 * SC-8C13 Phase 1 — Background Cleanup Safety Migration
 *
 * This service was previously an automatic destructive execution path
 * that called orchestrator.optimize without user approval at application
 * startup and when monitored processes closed. That behavior violated
 * the established security invariant:
 *
 *   NO AUTOMATIC DESTRUCTIVE EXECUTION.
 *
 * The service has been converted to detection/notification-only:
 *   1. ProcessMonitorService polls for running browser/Explorer processes.
 *   2. When a target process closes, this service is notified.
 *   3. It checks whether deferred cleanup items are associated with that process.
 *   4. If so, it sends a notification: "Cleanup opportunities available".
 *   5. The user must then explicitly open the canonical scan/review/approve/execute flow.
 *
 * This service NEVER:
 *   - Calls orchestrator.optimize
 *   - Calls dashboard.optimize.execute
 *   - Performs any destructive filesystem/registry/cache mutation
 *   - Bypasses SafetyGate or RemediationCoordinator
 *   - Executes remediation without explicit user approval
 *
 * The service MAY:
 *   - Inspect cleanup opportunities (read-only)
 *   - Report estimated savings
 *   - Generate notifications directing the user to the appropriate UI
 */

import { processMonitorService, type ProcessClosedEvent } from './ProcessMonitorService';
import { useDeferredCleanupStore } from './DeferredCleanupStore';
import { healthNotificationService } from './HealthNotificationService';
import { log } from './LogService';

/** Map process names to deferred item keywords for matching. */
const PROCESS_TO_KEYWORDS: Record<string, string[]> = {
  chrome: ['chrome'],
  msedge: ['edge', 'msedge'],
  firefox: ['firefox'],
  brave: ['brave'],
  explorer: ['explorer'],
};

/** Cooldown (ms) between cleanup-opportunity notifications for the same process. */
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export interface BackgroundCleanupOpportunity {
  processName: string;
  itemCount: number;
  estimatedBytes: number;
}

export type BackgroundCleanupListener = (opportunity: BackgroundCleanupOpportunity) => void;

class BackgroundCleanupServiceImpl {
  private listeners = new Set<BackgroundCleanupListener>();
  private unsubProcessMonitor: (() => void) | null = null;
  private started = false;
  private lastNotificationTime = new Map<string, number>();

  /**
   * Start the background cleanup detection service.
   * Subscribes to process monitor events for detection-only behavior.
   * Does NOT perform any destructive operations.
   */
  start(): void {
    if (this.started) return;
    this.started = true;
    processMonitorService.start();
    this.unsubProcessMonitor = processMonitorService.subscribe((event) => {
      void this.handleProcessClosed(event);
    });
  }

  /**
   * Stop the background cleanup detection service.
   */
  stop(): void {
    if (this.unsubProcessMonitor) {
      this.unsubProcessMonitor();
      this.unsubProcessMonitor = null;
    }
    this.started = false;
  }

  /**
   * Subscribe to cleanup-opportunity detection events.
   * Listeners are notified when cleanup opportunities are detected
   * (NOT when cleanup is executed — this service no longer executes cleanup).
   */
  subscribe(listener: BackgroundCleanupListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Check for deferred cleanup opportunities at startup.
   * This is detection-only: it inspects the DeferredCleanupStore and
   * sends a notification if opportunities exist. It does NOT execute
   * any cleanup.
   */
  checkStartupOpportunities(): BackgroundCleanupOpportunity | null {
    const store = useDeferredCleanupStore.getState();
    if (store.items.length === 0) return null;

    // Filter to items whose blocking process is not currently running
    const cleanable = store.items.filter((item) => {
      if (!item.blockingProcess) return true;
      return !processMonitorService.isRunning(item.blockingProcess);
    });

    if (cleanable.length === 0) return null;

    const estimatedBytes = cleanable.reduce((sum, item) => sum + (item.size ?? 0), 0);

    const opportunity: BackgroundCleanupOpportunity = {
      processName: 'startup',
      itemCount: cleanable.length,
      estimatedBytes,
    };

    // Notify listeners (detection event, not execution)
    this.listeners.forEach((l) => l(opportunity));

    // Send user notification directing them to the canonical flow
    this.notifyCleanupAvailable(opportunity);
    return opportunity;
  }

  /**
   * Handle a process-closed event from the monitor.
   * Detection-only: checks for deferred items and sends a notification.
   * Does NOT execute any cleanup.
   */
  private async handleProcessClosed(event: ProcessClosedEvent): Promise<void> {
    const store = useDeferredCleanupStore.getState();
    const keywords = PROCESS_TO_KEYWORDS[event.processName] ?? [event.processName];

    // Find deferred items associated with this process (read-only check)
    const matching = store.items.filter((item) => {
      const reasonLower = item.reason.toLowerCase();
      const blockingLower = (item.blockingProcess ?? '').toLowerCase();
      return keywords.some((kw) =>
        reasonLower.includes(kw) || blockingLower.includes(kw),
      );
    });

    if (matching.length === 0) return;

    const estimatedBytes = matching.reduce((sum, item) => sum + (item.size ?? 0), 0);

    const opportunity: BackgroundCleanupOpportunity = {
      processName: event.processName,
      itemCount: matching.length,
      estimatedBytes,
    };

    // Notify listeners (detection event, not execution)
    this.listeners.forEach((l) => l(opportunity));

    // Send user notification directing them to the canonical flow
    this.notifyCleanupAvailable(opportunity);
  }

  /**
   * Send a notification to the user that cleanup opportunities are available.
   * Uses the existing HealthNotificationService — does NOT create a new
   * notification subsystem.
   */
  private notifyCleanupAvailable(opportunity: BackgroundCleanupOpportunity): void {
    // Cooldown: don't spam notifications for the same process
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(opportunity.processName) ?? 0;
    if (now - lastTime < NOTIFICATION_COOLDOWN_MS) return;
    this.lastNotificationTime.set(opportunity.processName, now);

    const estimatedMB = Math.round(opportunity.estimatedBytes / 1_000_000);

    try {
      healthNotificationService.pushNotification(
        'info',
        'Cleanup Opportunities Available',
        estimatedMB > 0
          ? `${opportunity.itemCount} item${opportunity.itemCount > 1 ? 's' : ''} ready for cleanup (~${estimatedMB} MB). Open the Dashboard to review and approve.`
          : `${opportunity.itemCount} item${opportunity.itemCount > 1 ? 's' : ''} ready for cleanup. Open the Dashboard to review and approve.`,
        'Open Dashboard',
        '/dashboard',
      );
    } catch (err) {
      log.warning(
        `Background cleanup: failed to send notification: ${err instanceof Error ? err.message : String(err)}`,
        'background-cleanup',
        'notifyCleanupAvailable',
      );
    }
  }

  /** Reset state (for testing). */
  reset(): void {
    this.stop();
    this.listeners.clear();
    this.lastNotificationTime.clear();
  }
}

export const backgroundCleanupService = new BackgroundCleanupServiceImpl();
export { BackgroundCleanupServiceImpl };
