/**
 * Optimization Progress Tracker — tracks real-time progress
 * of an optimization session by listening to execution engine events.
 *
 * The tracker subscribes to:
 *   task_started  — updates current task, recalculates progress
 *   task_completed — accumulates results, recalculates progress
 *
 * It computes:
 *   • Overall progress percentage
 *   • Elapsed time
 *   • Estimated remaining time
 *   • Bytes/files recovered so far
 *
 * The tracker does NOT modify the execution engine — it only
 * listens to its events.
 */
import type {
  OptimizationProgress,
} from './types';
import type { TaskResult } from '../maintenance-engine/types';
import { executionEvents } from '../maintenance-engine/executionEvents';
import { optimizationExecutionEvents } from './optimizationExecutionEvents';

export class ProgressTracker {
  private _sessionId: string | null = null;
  private _taskIds: string[] = [];
  private _taskNames: Map<string, string> = new Map();
  private _completedTaskIds: string[] = [];
  private _currentTaskId: string | null = null;
  private _startTime: number = 0;
  private _bytesRecovered: number = 0;
  private _filesCleaned: number = 0;
  private _taskDurations: number[] = [];
  private _unsubTaskStarted: (() => void) | null = null;
  private _unsubTaskCompleted: (() => void) | null = null;
  private _cancelled: boolean = false;

  /**
   * Start tracking progress for a session.
   * @param sessionId - The optimization session ID
   * @param taskIds - Ordered list of task IDs that will be executed
   * @param taskNames - Map of task ID → display name
   */
  start(sessionId: string, taskIds: string[], taskNames: Map<string, string>): void {
    this._sessionId = sessionId;
    this._taskIds = [...taskIds];
    this._taskNames = new Map(taskNames);
    this._completedTaskIds = [];
    this._currentTaskId = null;
    this._startTime = Date.now();
    this._bytesRecovered = 0;
    this._filesCleaned = 0;
    this._taskDurations = [];
    this._cancelled = false;

    // Subscribe to execution events
    this._unsubTaskStarted = executionEvents.on('task_started', (payload) => {
      const p = payload as { executionId: string; taskId: string; taskName: string };
      this._onTaskStarted(p.taskId, p.taskName);
    });

    this._unsubTaskCompleted = executionEvents.on('task_completed', (payload) => {
      const p = payload as { executionId: string; result: TaskResult };
      this._onTaskCompleted(p.result);
    });
  }

  /**
   * Stop tracking and unsubscribe from events.
   */
  stop(): void {
    this._unsubTaskStarted?.();
    this._unsubTaskCompleted?.();
    this._unsubTaskStarted = null;
    this._unsubTaskCompleted = null;
  }

  /**
   * Mark as cancelled. Prevents further progress updates.
   */
  cancel(): void {
    this._cancelled = true;
  }

  /**
   * Check if cancelled.
   */
  get isCancelled(): boolean {
    return this._cancelled;
  }

  /**
   * Get the current progress snapshot.
   */
  getProgress(): OptimizationProgress {
    const totalTasks = this._taskIds.length;
    const completedTasks = this._completedTaskIds.length;
    const overallProgress = totalTasks > 0
      ? (completedTasks / totalTasks) * 100
      : 0;

    const elapsedMs = Date.now() - this._startTime;

    // Estimate remaining time based on average task duration
    const avgTaskDuration = this._taskDurations.length > 0
      ? this._taskDurations.reduce((a, b) => a + b, 0) / this._taskDurations.length
      : 0;
    const remainingTasks = totalTasks - completedTasks;
    const estimatedRemainingMs = this._currentTaskId
      ? avgTaskDuration * (remainingTasks - 0.5)
      : avgTaskDuration * remainingTasks;

    const remainingTaskIds = this._taskIds.filter(
      (id) => !this._completedTaskIds.includes(id),
    );

    return {
      sessionId: this._sessionId ?? '',
      overallProgress,
      currentTaskName: this._currentTaskId
        ? this._taskNames.get(this._currentTaskId) ?? null
        : null,
      currentTaskId: this._currentTaskId,
      completedTaskIds: [...this._completedTaskIds],
      remainingTaskIds,
      elapsedMs,
      estimatedRemainingMs: Math.max(0, Math.round(estimatedRemainingMs)),
      currentBytesRecovered: this._bytesRecovered,
      currentFilesCleaned: this._filesCleaned,
      totalTasks,
      completedTasks,
    };
  }

  // ── Internal handlers ────────────────────────────────────────

  private _onTaskStarted(taskId: string, taskName: string): void {
    if (this._cancelled) return;
    this._currentTaskId = taskId;
    this._taskNames.set(taskId, taskName);
    this._emitProgress();
  }

  private _onTaskCompleted(result: TaskResult): void {
    if (this._cancelled) return;
    this._currentTaskId = null;
    this._completedTaskIds.push(result.taskId);
    this._bytesRecovered += result.bytesRecovered;
    this._filesCleaned += result.filesCleaned;
    this._taskDurations.push(result.durationMs);
    this._emitProgress();
  }

  private _emitProgress(): void {
    if (!this._sessionId) return;
    const progress = this.getProgress();
    optimizationExecutionEvents.emit('optimization_progress', { sessionId: this._sessionId, progress });
  }
}

/**
 * Default singleton instance.
 */
export const progressTracker = new ProgressTracker();
