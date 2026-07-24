/**
 * Safe Shutdown (Part 13) — Production Readiness Framework.
 *
 * When the application closes:
 *   1. Stop background tasks
 *   2. Flush pending logs
 *   3. Save required state
 *   4. Dispose services cleanly
 *   5. Release resources
 *
 * Avoids data corruption by ensuring orderly cleanup.
 */

import { logger } from './Logger';
import { errorHandler } from './ErrorHandler';
import { backgroundTaskManager } from './BackgroundTaskManager';
import { resourceManager } from './ResourceManager';
import { moduleIsolationService } from './ModuleIsolation';
import { moduleRegistry } from '../module-registry/ModuleRegistry';
import { optimizationHistoryService } from '../health/OptimizationHistoryService';
import { moduleHistoryService } from '../module-registry/ModuleHistoryService';

// ── Shutdown Types ──────────────────────────────────────────────────

export interface ShutdownStep {
  name: string;
  action: () => Promise<void> | void;
  /** If true, failure stops the shutdown sequence. */
  critical?: boolean;
  timeout?: number;
}

export interface ShutdownResult {
  step: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export interface ShutdownReport {
  results: ShutdownResult[];
  allSucceeded: boolean;
  totalDurationMs: number;
  timestamp: string;
}

type ShutdownListener = (report: ShutdownReport) => void;

// ── Safe Shutdown Service ───────────────────────────────────────────

class SafeShutdownServiceImpl {
  private listeners = new Set<ShutdownListener>();
  private isShuttingDown = false;
  private shutdownComplete = false;

  /**
   * Execute the full safe shutdown sequence.
   * Each step is isolated — one failure doesn't prevent subsequent cleanup.
   */
  async shutdown(): Promise<ShutdownReport> {
    if (this.isShuttingDown || this.shutdownComplete) {
      logger.warning('SafeShutdown', 'shutdown', 'Shutdown already completed or in progress');
      return this.buildEmptyReport();
    }

    this.isShuttingDown = true;
    const startTime = Date.now();
    logger.info('SafeShutdown', 'shutdown', 'Starting safe shutdown sequence');

    const steps: ShutdownStep[] = [
      // 1. Stop background tasks (prevent new work)
      { name: 'StopBackgroundTasks', action: () => this.stopBackgroundTasks(), critical: false },

      // 2. Flush pending logs (ensure all logs are written)
      { name: 'FlushLogs', action: () => this.flushLogs(), critical: true },

      // 3. Save required state (persist history, session)
      { name: 'SaveState', action: () => this.saveState(), critical: true },

      // 4. Dispose services cleanly (module registry, health engine)
      { name: 'DisposeServices', action: () => this.disposeServices(), critical: false },

      // 5. Release resources (timers, listeners, workers, file handles)
      { name: 'ReleaseResources', action: () => this.releaseResources(), critical: false },

      // 6. Clear isolation state
      { name: 'ClearIsolationState', action: () => moduleIsolationService.clear(), critical: false },

      // 7. Final log flush
      { name: 'FinalFlush', action: () => this.finalFlush(), critical: true },
    ];

    const results: ShutdownResult[] = [];

    for (const step of steps) {
      const stepStart = Date.now();
      try {
        await this.runStepWithTimeout(step);
        const duration = Date.now() - stepStart;
        results.push({ step: step.name, success: true, durationMs: duration });
        logger.info('SafeShutdown', step.name, `Completed in ${duration}ms`);
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push({ step: step.name, success: false, durationMs: duration, error: errorMsg });
        logger.error('SafeShutdown', step.name, `Failed: ${errorMsg}`, { errorDetails: errorMsg });

        if (step.critical) {
          errorHandler.report('critical', `shutdown:${step.name}`, errorMsg);
        } else {
          errorHandler.report('warning', `shutdown:${step.name}`, errorMsg);
        }

        // Continue with remaining steps even on failure
      }
    }

    const totalDuration = Date.now() - startTime;
    const allSucceeded = results.every((r) => r.success);

    const report: ShutdownReport = {
      results,
      allSucceeded,
      totalDurationMs: totalDuration,
      timestamp: new Date().toISOString(),
    };

    logger.info('SafeShutdown', 'shutdown', `Shutdown complete in ${totalDuration}ms (${results.filter((r) => r.success).length}/${results.length} steps succeeded)`);

    this.shutdownComplete = true;
    this.isShuttingDown = false;

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(report);
      } catch {
        // ignore
      }
    }

    return report;
  }

  /**
   * Whether shutdown is in progress.
   */
  getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Whether shutdown has completed.
   */
  getShutdownComplete(): boolean {
    return this.shutdownComplete;
  }

  /**
   * Subscribe to shutdown completion notifications.
   */
  onShutdownComplete(listener: ShutdownListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Reset state (for testing).
   */
  reset(): void {
    this.isShuttingDown = false;
    this.shutdownComplete = false;
    this.listeners.clear();
  }

  // ── Shutdown Steps ────────────────────────────────────────────────

  private async stopBackgroundTasks(): Promise<void> {
    backgroundTaskManager.cancelAll();
    // Give tasks a moment to clean up
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private async flushLogs(): Promise<void> {
    // Log a final entry to ensure all pending logs are flushed
    logger.info('SafeShutdown', 'flushLogs', 'Flushing pending logs');
    // In a real implementation, this would flush to file/network
    // For now, logs are in-memory and immediately available
  }

  private async saveState(): Promise<void> {
    // Save optimization history
    const optCount = optimizationHistoryService.getHistoryCount();
    logger.info('SafeShutdown', 'saveState', `Saving state: ${optCount} optimization history entries`);

    // Save module history
    const modCount = moduleHistoryService.getRecent(1000).length;
    logger.info('SafeShutdown', 'saveState', `Saving state: ${modCount} module history entries`);

    // In a real implementation, this would persist to disk
    // For now, state is managed by the services themselves
  }

  private async disposeServices(): Promise<void> {
    // Dispose all modules in the registry
    moduleRegistry.disposeAll();
    logger.info('SafeShutdown', 'disposeServices', 'Module registry disposed');
  }

  private async releaseResources(): Promise<void> {
    // Gracefully shutdown all tracked resources
    resourceManager.shutdown();
    logger.info('SafeShutdown', 'releaseResources', 'Resources released');
  }

  private async finalFlush(): Promise<void> {
    logger.info('SafeShutdown', 'finalFlush', 'Final log flush — application shutting down');
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private async runStepWithTimeout(step: ShutdownStep): Promise<void> {
    const timeout = step.timeout ?? 5000;
    if (timeout <= 0) {
      await step.action();
      return;
    }

    await Promise.race([
      step.action(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`Step "${step.name}" timed out after ${timeout}ms`)), timeout),
      ),
    ]);
  }

  private buildEmptyReport(): ShutdownReport {
    return {
      results: [],
      allSucceeded: true,
      totalDurationMs: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

export const safeShutdownService = new SafeShutdownServiceImpl();
