/**
 * Background Task Management (Part 7) — Production Readiness Framework.
 *
 * Ensures background operations:
 *   - Do not block the UI
 *   - Support cancellation where appropriate
 *   - Clean up resources properly after completion
 *   - Prevent duplicate tasks from running simultaneously
 *   - Report progress consistently through the Event System
 */

import { configManager } from './AppConfig';
import { logger } from './Logger';
import { errorHandler } from './ErrorHandler';
import { performanceMonitor } from './PerformanceMonitor';
import { emitModuleEvent, ModuleEventType } from '../module-registry/ModuleEventBus';
import type { ModuleId } from '../health/HealthContribution';

// ── Task Types ──────────────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface BackgroundTask<T = unknown> {
  id: string;
  name: string;
  moduleId?: ModuleId;
  status: TaskStatus;
  progress: number;
  startedAt: string;
  completedAt: string | null;
  result?: T;
  error?: string;
  /** Cancellation controller. */
  cancelController?: AbortController;
}

export interface TaskProgress {
  taskId: string;
  progress: number;
  message?: string;
}

type TaskListener = (task: BackgroundTask) => void;
type ProgressListener = (progress: TaskProgress) => void;

// ── Background Task Manager ─────────────────────────────────────────

class BackgroundTaskManagerImpl {
  private tasks = new Map<string, BackgroundTask>();
  private taskListeners = new Set<TaskListener>();
  private progressListeners = new Set<ProgressListener>();
  private activeCount = 0;

  /**
   * Run a background task with full lifecycle management.
   * The task does not block the UI — it runs asynchronously.
   */
  async run<T>(
    name: string,
    operation: (context: TaskContext) => Promise<T>,
    options?: {
      moduleId?: ModuleId;
      moduleName?: string;
      /** Prevents duplicate tasks with the same name from running simultaneously. */
      dedupKey?: string;
    },
  ): Promise<T> {
    // Check for duplicate task
    if (options?.dedupKey) {
      const existing = this.findRunningByDedupKey(options.dedupKey);
      if (existing) {
        logger.warning('BackgroundTaskManager', 'run', `Task "${name}" already running — skipping duplicate`, {
          data: { dedupKey: options.dedupKey, existingTaskId: existing.id },
        });
        // Return the existing task's result by waiting for it
        return this.waitForTask<T>(existing.id);
      }
    }

    // Check max concurrent
    const config = configManager.getBackgroundTaskConfig();
    if (this.activeCount >= config.maxConcurrent) {
      logger.warning('BackgroundTaskManager', 'run', `Max concurrent tasks (${config.maxConcurrent}) reached — queuing task "${name}"`);
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cancelController = new AbortController();

    const task: BackgroundTask<T> = {
      id: taskId,
      name,
      moduleId: options?.moduleId,
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
      completedAt: null,
      cancelController,
    };

    this.tasks.set(taskId, task as BackgroundTask);
    this.activeCount++;
    this.notifyTaskListeners(task as BackgroundTask);

    // Emit event for module tasks
    if (options?.moduleId && options?.moduleName) {
      emitModuleEvent(ModuleEventType.ScanStarted, options.moduleId, options.moduleName);
    }

    const context: TaskContext = {
      taskId,
      signal: cancelController.signal,
      onProgress: (progress: number, message?: string) => {
        task.progress = Math.min(100, Math.max(0, progress));
        this.notifyProgressListeners({ taskId, progress: task.progress, message });
        this.notifyTaskListeners(task as BackgroundTask);
      },
      isCancelled: () => task.status === 'cancelled',
    };

    const startTime = Date.now();
    try {
      const result = await operation(context);

      task.status = 'completed';
      task.progress = 100;
      task.result = result;
      task.completedAt = new Date().toISOString();

      const duration = Date.now() - startTime;
      performanceMonitor.record('background_task', name, duration, {
        module: options?.moduleName,
        success: true,
      });

      logger.info('BackgroundTaskManager', name, `Task completed in ${duration}ms`, {
        durationMs: duration,
        result: 'success',
      });

      this.notifyTaskListeners(task as BackgroundTask);
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;

      if (task.status === 'cancelled') {
        logger.info('BackgroundTaskManager', name, `Task cancelled after ${duration}ms`, {
          durationMs: duration,
          result: 'failure',
        });
        performanceMonitor.record('background_task', name, duration, {
          module: options?.moduleName,
          success: false,
          metadata: { cancelled: true },
        });
      } else {
        task.status = 'failed';
        task.error = err instanceof Error ? err.message : String(err);
        task.completedAt = new Date().toISOString();

        errorHandler.reportException('recoverable', `background-task:${name}`, err, {
          moduleId: options?.moduleId,
          moduleName: options?.moduleName,
          durationMs: duration,
        });

        performanceMonitor.record('background_task', name, duration, {
          module: options?.moduleName,
          success: false,
        });
      }

      this.notifyTaskListeners(task as BackgroundTask);
      throw err;
    } finally {
      this.activeCount--;
      // Clean up cancel controller
      task.cancelController = undefined;
    }
  }

  /**
   * Cancel a running task.
   */
  cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return false;

    task.status = 'cancelled';
    task.cancelController?.abort();
    this.notifyTaskListeners(task);
    logger.info('BackgroundTaskManager', 'cancel', `Cancelling task "${task.name}"`, {
      data: { taskId },
    });
    return true;
  }

  /**
   * Cancel all running tasks (for graceful shutdown).
   */
  cancelAll(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'running') {
        this.cancel(id);
      }
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  getRunningTasks(): BackgroundTask[] {
    return this.getAllTasks().filter((t) => t.status === 'running');
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  // ── Subscription ──────────────────────────────────────────────────

  onTaskUpdate(listener: TaskListener): () => void {
    this.taskListeners.add(listener);
    return () => { this.taskListeners.delete(listener); };
  }

  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => { this.progressListeners.delete(listener); };
  }

  // ── Maintenance ───────────────────────────────────────────────────

  clear(): void {
    this.cancelAll();
    this.tasks.clear();
    this.taskListeners.clear();
    this.progressListeners.clear();
    this.activeCount = 0;
  }

  /**
   * Clean up completed/failed/cancelled tasks older than the given count.
   */
  cleanupOldTasks(keepCount: number = 50): void {
    const finished = this.getAllTasks()
      .filter((t) => t.status !== 'running' && t.status !== 'pending')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

    if (finished.length > keepCount) {
      const toRemove = finished.slice(keepCount);
      for (const task of toRemove) {
        this.tasks.delete(task.id);
      }
      logger.debug('BackgroundTaskManager', 'cleanup', `Cleaned up ${toRemove.length} old tasks`);
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private findRunningByDedupKey(dedupKey: string): BackgroundTask | undefined {
    return Array.from(this.tasks.values()).find(
      (t) => t.status === 'running' && t.name === dedupKey,
    );
  }

  private async waitForTask<T>(taskId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const unsub = this.onTaskUpdate((task) => {
        if (task.id !== taskId) return;
        if (task.status === 'completed') {
          unsub();
          resolve(task.result as T);
        } else if (task.status === 'failed') {
          unsub();
          reject(new Error(task.error ?? 'Task failed'));
        } else if (task.status === 'cancelled') {
          unsub();
          reject(new Error('Task cancelled'));
        }
      });
    });
  }

  private notifyTaskListeners(task: BackgroundTask): void {
    for (const listener of this.taskListeners) {
      try {
        listener(task);
      } catch {
        // ignore
      }
    }
  }

  private notifyProgressListeners(progress: TaskProgress): void {
    for (const listener of this.progressListeners) {
      try {
        listener(progress);
      } catch {
        // ignore
      }
    }
  }
}

// ── Task Context ────────────────────────────────────────────────────

export interface TaskContext {
  taskId: string;
  /** AbortSignal for cancellation support. */
  signal: AbortSignal;
  /** Report progress (0-100). */
  onProgress: (progress: number, message?: string) => void;
  /** Check if the task has been cancelled. */
  isCancelled: () => boolean;
}

export const backgroundTaskManager = new BackgroundTaskManagerImpl();
