/**
 * BackgroundCleanupService — automatically retries deferred cleanup items
 * when blocking applications close.
 *
 * Architecture:
 *   1. ProcessMonitorService polls for running browser/Explorer processes.
 *   2. When a target process closes, this service is notified.
 *   3. It collects deferred items associated with that process.
 *   4. Calls the backend orchestrator to retry cleaning those items.
 *   5. Verifies results, updates scores, saves history, broadcasts.
 *   6. Sends a notification: "Background Cleanup Completed".
 *
 * This service starts at app boot and runs continuously in the background.
 * No user interaction required.
 */

import { processMonitorService, type ProcessClosedEvent } from './ProcessMonitorService';
import { useDeferredCleanupStore, type DeferredCleanupItem } from './DeferredCleanupStore';
import { useLiveSync } from './LiveSyncService';
import { optimizationEventBus, OptimizationEventType } from './OptimizationEventBus';
import { healthNotificationService } from './HealthNotificationService';
import { optimizationHistoryService } from './OptimizationHistoryService';
import { invalidateMetricsCache } from './healthProviders';
import { RPC_METHODS } from '@avs/shared/rpc';

function rpcClient() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

/** Map process names to deferred item keywords for matching. */
const PROCESS_TO_KEYWORDS: Record<string, string[]> = {
  chrome: ['chrome'],
  msedge: ['edge', 'msedge'],
  firefox: ['firefox'],
  brave: ['brave'],
  explorer: ['explorer'],
};

export interface BackgroundCleanupResult {
  success: boolean;
  itemsCleaned: number;
  itemsRemaining: number;
  bytesRecovered: number;
  durationMs: number;
  cleanedItemIds: string[];
}

export type BackgroundCleanupListener = (result: BackgroundCleanupResult) => void;

class BackgroundCleanupServiceImpl {
  private listeners = new Set<BackgroundCleanupListener>();
  private unsubProcessMonitor: (() => void) | null = null;
  private started = false;
  private cleaning = false;

  /**
   * Start the background cleanup service.
   * Subscribes to process monitor events.
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
   * Stop the background cleanup service.
   */
  stop(): void {
    if (this.unsubProcessMonitor) {
      this.unsubProcessMonitor();
      this.unsubProcessMonitor = null;
    }
    this.started = false;
  }

  /**
   * Subscribe to background cleanup completion events.
   */
  subscribe(listener: BackgroundCleanupListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Manually trigger cleanup of all deferred items (e.g. on app startup).
   * Only cleans items whose blocking processes are not currently running.
   */
  async runStartupCleanup(): Promise<BackgroundCleanupResult | null> {
    const store = useDeferredCleanupStore.getState();
    if (store.items.length === 0) return null;

    // Filter to items whose blocking process is not running
    const cleanable = store.items.filter((item) => {
      if (!item.blockingProcess) return true;
      return !processMonitorService.isRunning(item.blockingProcess);
    });

    if (cleanable.length === 0) return null;
    return this.executeCleanup(cleanable);
  }

  /**
   * Handle a process-closed event from the monitor.
   */
  private async handleProcessClosed(event: ProcessClosedEvent): Promise<void> {
    if (this.cleaning) return; // Don't overlap cleanups

    const store = useDeferredCleanupStore.getState();
    const keywords = PROCESS_TO_KEYWORDS[event.processName] ?? [event.processName];

    // Find deferred items associated with this process
    const matching = store.items.filter((item) => {
      const reasonLower = item.reason.toLowerCase();
      const blockingLower = (item.blockingProcess ?? '').toLowerCase();
      return keywords.some((kw) =>
        reasonLower.includes(kw) || blockingLower.includes(kw),
      );
    });

    if (matching.length === 0) return;
    await this.executeCleanup(matching);
  }

  /**
   * Execute cleanup for a set of deferred items.
   * Calls the backend, verifies, updates scores, broadcasts, notifies.
   */
  private async executeCleanup(items: DeferredCleanupItem[]): Promise<BackgroundCleanupResult> {
    this.cleaning = true;
    const startTime = Date.now();
    const cleanedIds: string[] = [];
    let bytesRecovered = 0;
    let itemsCleaned = 0;

    try {
      // Group items by module for batch cleaning
      const byModule = new Map<string, DeferredCleanupItem[]>();
      for (const item of items) {
        const group = byModule.get(item.moduleId) ?? [];
        group.push(item);
        byModule.set(item.moduleId, group);
      }

      // Call the backend to retry cleaning for each module group
      for (const [moduleId, moduleItems] of byModule) {
        try {
          const result = await rpcClient().call(RPC_METHODS.ORCHESTRATOR_OPTIMIZE, {
            sessionId: `deferred-${Date.now()}`,
            moduleIds: [moduleId],
            deferredPaths: moduleItems.map((i) => i.path),
          }) as {
            success: boolean;
            bytesRecovered?: number;
            itemsRemoved?: number;
            errors?: string[];
            optimizeResults?: Record<string, { success: boolean; bytesRecovered?: number; itemsRemoved?: number; errors?: string[] }>;
          };

          // Check results
          const optResults = result.optimizeResults ?? {};
          const moduleResult = optResults[moduleId];
          const success = moduleResult?.success ?? result.success ?? false;
          const recovered = moduleResult?.bytesRecovered ?? result.bytesRecovered ?? 0;
          const removed = moduleResult?.itemsRemoved ?? result.itemsRemoved ?? 0;

          if (success) {
            bytesRecovered += recovered;
            itemsCleaned += removed;
            cleanedIds.push(...moduleItems.map((i) => i.id));
          }
        } catch {
          // Backend call failed — items remain deferred
        }
      }

      // Remove successfully cleaned items from the store
      if (cleanedIds.length > 0) {
        useDeferredCleanupStore.getState().removeItems(cleanedIds);
      }

      const durationMs = Date.now() - startTime;
      const result: BackgroundCleanupResult = {
        success: cleanedIds.length > 0,
        itemsCleaned,
        itemsRemaining: items.length - cleanedIds.length,
        bytesRecovered,
        durationMs,
        cleanedItemIds: cleanedIds,
      };

      // If anything was cleaned, verify and broadcast
      if (bytesRecovered > 0 || itemsCleaned > 0) {
        await this.verifyAndBroadcast(result);
      }

      // Notify listeners
      this.listeners.forEach((l) => l(result));
      return result;
    } finally {
      this.cleaning = false;
    }
  }

  /**
   * Verify cleanup results, update scores, save history, broadcast.
   */
  private async verifyAndBroadcast(result: BackgroundCleanupResult): Promise<void> {
    // Invalidate metrics cache so fresh data is loaded
    invalidateMetricsCache();

    // Re-load dashboard metrics to get updated scores
    let newHealthScore = 0;
    try {
      const metrics = await rpcClient().call(RPC_METHODS.DASHBOARD_METRICS) as {
        healthScore?: number;
        overallScore?: number;
      };
      newHealthScore = metrics.healthScore ?? metrics.overallScore ?? 0;
    } catch {
      // Non-fatal — use current score
    }

    const currentScore = useLiveSync.getState().healthScore;

    // Broadcast updated scores
    useLiveSync.getState().broadcastScores({
      healthScore: newHealthScore,
    });

    // Emit optimization event for each cleaned module
    const cleanedByModule = new Map<string, number>();
    for (const itemId of result.cleanedItemIds) {
      const item = useDeferredCleanupStore.getState().items.find((i) => i.id === itemId);
      if (item) {
        cleanedByModule.set(item.moduleId, (cleanedByModule.get(item.moduleId) ?? 0) + 1);
      }
    }
    for (const [moduleId, count] of cleanedByModule) {
      optimizationEventBus.emit({
        type: OptimizationEventType.CleaningCompleted,
        moduleId: moduleId as never,
        action: 'deferred_cleanup',
        bytesRecovered: result.bytesRecovered,
        itemsProcessed: count,
        timestamp: Date.now(),
      });
    }

    // Record in optimization history
    optimizationHistoryService.recordOptimization({
      timestamp: new Date().toISOString(),
      healthBefore: currentScore,
      healthAfter: newHealthScore,
      storageRecovered: result.bytesRecovered,
      registryFixed: 0,
      startupOptimized: 0,
      privacyCleaned: 0,
      duplicateFilesRemoved: 0,
      durationMs: result.durationMs,
      modulesUsed: [...cleanedByModule.keys()],
      result: result.success ? 'success' : 'partial',
    });

    // Send notification
    const recoveredMB = Math.round(result.bytesRecovered / 1_000_000);
    healthNotificationService.checkForChanges(
      newHealthScore,
      0,
      0,
    );

    // Emit a custom notification for background cleanup
    const notif = {
      id: `bg-cleanup-${Date.now()}`,
      timestamp: new Date().toISOString(),
      severity: 'info' as const,
      title: 'Background Cleanup Completed',
      message: `Recovered ${recoveredMB} MB · Health Score ${currentScore} → ${newHealthScore}`,
    };
    // Use the notification service's listener mechanism
    (healthNotificationService as unknown as {
      listeners: Set<(n: typeof notif) => void>;
      notifications: typeof notif[];
      maxNotifications: number;
    }).listeners.forEach((l) => l(notif));

    // Update system tray
    try {
      const tray = (window as unknown as { avs?: { tray?: { updateStatus?: (s: string, t?: string) => void } } }).avs?.tray;
      if (tray?.updateStatus) {
        const status = newHealthScore >= 90 ? 'protected' : newHealthScore >= 70 ? 'optimized' : 'warning';
        const tooltip = `AVS Shield — Background cleanup recovered ${recoveredMB} MB (Score: ${newHealthScore})`;
        tray.updateStatus(status, tooltip);
      }
    } catch {
      // Tray not available
    }
  }

  /** Reset state (for testing). */
  reset(): void {
    this.stop();
    this.listeners.clear();
    this.cleaning = false;
  }
}

export const backgroundCleanupService = new BackgroundCleanupServiceImpl();
export { BackgroundCleanupServiceImpl };
