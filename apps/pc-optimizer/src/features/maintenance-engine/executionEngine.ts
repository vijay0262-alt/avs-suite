/**
 * Execution Engine — the core engine that processes maintenance jobs.
 *
 * Responsibilities:
 *   • Load synchronized schedules from ConfigurationManager
 *   • Determine when schedules are due
 *   • Execute enabled maintenance tasks sequentially
 *   • Prevent duplicate execution (never run two jobs simultaneously)
 *   • Update execution state
 *   • Generate execution results
 *   • Emit execution events
 *   • Crash recovery via persisted state
 *   • Run independently of UI (background execution)
 *
 * Architecture:
 *   Schedule → JobBuilder → MaintenanceJob → ExecutionEngine → Task Pipeline → Results
 *
 * Safety:
 *   • Never execute two maintenance jobs simultaneously
 *   • Skip execution if another job is active
 *   • Gracefully recover after crashes
 *   • Pause conditions are checked before scheduled jobs (not manual)
 *
 * Logging:
 *   • Execution Started
 *   • Task Started
 *   • Task Completed
 *   • Execution Finished
 *   • Execution Failed
 *   • Duration
 *   • Recovered Space
 */
import type {
  MaintenanceJob,
  ExecutionResult,
  TaskResult,
  EngineState,
  EngineSnapshot,
  PersistedExecutionState,
  ScheduleDueInfo,
} from './types';
import type { MaintenanceScheduleConfig } from '../config-sync/types';
import { executionEvents } from './executionEvents';
import { evaluatePauseConditions } from './pauseConditions';
import { jobBuilder, scheduleHasValidTasks } from './jobBuilder';
import { configManager } from '../config-sync/configManager';
import { schedulerBackendService } from './schedulerBackendService';

import { idbGetOne, idbPut, idbClear } from '../../services/avsWithIDB';

// ── Crash recovery persistence ────────────────────────────────

const EXEC_STATE_KEY = 'current';

function persistExecutionState(state: PersistedExecutionState): void {
  idbPut('executionState', { ...state, key: EXEC_STATE_KEY });
}

async function loadPersistedState(): Promise<PersistedExecutionState | null> {
  return idbGetOne<PersistedExecutionState & { key: string }>('executionState', EXEC_STATE_KEY);
}

function clearPersistedState(): void {
  idbClear('executionState');
}

// ── Schedule due checking ──────────────────────────────────────

function parseScheduleTime(timeStr: string): number {
  // timeStr is "HH:MM" format
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function getNextRunTime(schedule: MaintenanceScheduleConfig, now: Date): Date | null {
  if (!schedule.enabled) return null;

  const scheduledMinutes = parseScheduleTime(schedule.schedule_time);

  switch (schedule.frequency) {
    case 'daily': {
      // Next run is today at scheduled time if not yet passed, else tomorrow
      const today = new Date(now);
      today.setHours(Math.floor(scheduledMinutes / 60), scheduledMinutes % 60, 0, 0);
      if (today.getTime() > now.getTime()) return today;
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    case 'weekly': {
      if (schedule.day_of_week === null) return null;
      const targetDay = schedule.day_of_week;
      const today = new Date(now);
      today.setHours(Math.floor(scheduledMinutes / 60), scheduledMinutes % 60, 0, 0);
      const currentDay = now.getDay();
      let daysUntil = (targetDay - currentDay + 7) % 7;
      if (daysUntil === 0 && today.getTime() <= now.getTime()) {
        daysUntil = 7;
      }
      const next = new Date(today);
      next.setDate(next.getDate() + daysUntil);
      return next;
    }
    case 'monthly': {
      if (schedule.day_of_month === null) return null;
      const targetDate = schedule.day_of_month;
      const today = new Date(now);
      today.setHours(Math.floor(scheduledMinutes / 60), scheduledMinutes % 60, 0, 0);
      const currentDate = now.getDate();
      if (targetDate > currentDate || (targetDate === currentDate && today.getTime() > now.getTime())) {
        today.setDate(targetDate);
        return today;
      }
      // Next month
      const next = new Date(today);
      next.setMonth(next.getMonth() + 1);
      next.setDate(targetDate);
      return next;
    }
    case 'custom': {
      if (schedule.custom_interval_hours === null) return null;
      const intervalMs = schedule.custom_interval_hours * 60 * 60 * 1000;
      if (schedule.last_run_at) {
        const lastRun = new Date(schedule.last_run_at).getTime();
        const nextTime = lastRun + intervalMs;
        if (nextTime > now.getTime()) return new Date(nextTime);
        return now;
      }
      // No previous run — run now
      return now;
    }
    default:
      return null;
  }
}

// ── Execution Engine ──────────────────────────────────────────

class ExecutionEngineImpl {
  private _state: EngineState = 'idle';
  private _currentJob: MaintenanceJob | null = null;
  private _currentExecutionId: string | null = null;
  private _currentTaskId: string | null = null;
  private _lastResult: ExecutionResult | null = null;
  private _lastError: string | null = null;
  private _schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private _schedulerIntervalMs: number;
  private _initialized = false;

  constructor(schedulerIntervalMs: number = 60_000) {
    this._schedulerIntervalMs = schedulerIntervalMs;
  }

  // ── State ───────────────────────────────────────────────────

  getSnapshot(): EngineSnapshot {
    return {
      state: this._state,
      currentExecutionId: this._currentExecutionId,
      currentTaskId: this._currentTaskId,
      lastExecutionResult: this._lastResult,
      pendingJobCount: 0,
      lastError: this._lastError,
    };
  }

  get state(): EngineState {
    return this._state;
  }

  get isRunning(): boolean {
    return this._state === 'running';
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Initialize the engine.
   * 1. Check for crash recovery (interrupted execution)
   * 2. Start the scheduler timer
   */
  async init(): Promise<void> {
    if (this._initialized) return;

    // Crash recovery: check if a previous execution was interrupted
    const persisted = await loadPersistedState();
    if (persisted && persisted.state === 'running' && persisted.currentExecutionId) {
      console.warn(
        `[ExecutionEngine] Crash recovery: previous execution ${persisted.currentExecutionId} was interrupted`,
      );
      // Clear the stale state — the interrupted execution cannot be resumed
      clearPersistedState();
      this._lastError = 'Previous execution was interrupted (crash recovery)';
    }

    this._initialized = true;
    this._startScheduler();
    console.info('[ExecutionEngine] Initialized, scheduler started');

    // Sync with Windows Task Scheduler backend
    void this.syncWithBackend();
  }

  /**
   * Stop the engine and clean up.
   */
  shutdown(): void {
    this._stopScheduler();
    this._state = 'stopped';
    this._initialized = false;
    clearPersistedState();
    console.info('[ExecutionEngine] Shut down');
  }

  // ── Job Submission ──────────────────────────────────────────

  /**
   * Submit a job for immediate execution.
   * If another job is already running, this will be rejected.
   *
   * @returns The execution result, or null if the job was rejected.
   */
  async executeJob(job: MaintenanceJob): Promise<ExecutionResult | null> {
    if (this._state === 'running') {
      console.warn(`[ExecutionEngine] Job ${job.id} rejected — another job is running`);
      return null;
    }

    // Check pause conditions (unless bypassed)
    if (!job.bypassPauseConditions) {
      const pause = await evaluatePauseConditions();
      if (pause.shouldPause) {
        console.info(`[ExecutionEngine] Job ${job.id} skipped — pause condition: ${pause.reason}`);
        if (job.scheduleId) {
          executionEvents.emit('schedule_skipped', {
            scheduleId: job.scheduleId,
            reason: pause.reason,
          });
        }
        return null;
      }
    }

    // Check capability for scheduled jobs
    if (job.source === 'scheduled' && job.scheduleId) {
      const config = configManager.get_config();
      const schedulerSection = config.maintenance_scheduler;
      const schedule = schedulerSection.schedules.find((s) => s.id === job.scheduleId);
      if (schedule && !schedule.enabled) {
        console.info(`[ExecutionEngine] Schedule ${schedule.name} is disabled, skipping`);
        executionEvents.emit('schedule_skipped', {
          scheduleId: schedule.id,
          reason: 'Schedule is disabled',
        });
        return null;
      }
    }

    return this._runJob(job);
  }

  /**
   * Execute a job synchronously (internal — assumes safety checks passed).
   */
  private async _runJob(job: MaintenanceJob): Promise<ExecutionResult> {
    const executionId = `exec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this._state = 'running';
    this._currentJob = job;
    this._currentExecutionId = executionId;
    this._currentTaskId = null;
    this._lastError = null;

    // Persist state for crash recovery
    persistExecutionState({
      currentExecutionId: executionId,
      currentScheduleId: job.scheduleId,
      startedAt: new Date().toISOString(),
      state: 'running',
    });

    const startTime = new Date();
    console.info(
      `[ExecutionEngine] Execution started: ${executionId} (source=${job.source}, tasks=${job.tasks.length})`,
    );
    executionEvents.emit('execution_started', { executionId, job });

    const taskResults: TaskResult[] = [];
    const allErrors: string[] = [];
    const allWarnings: string[] = [];
    let totalFilesCleaned = 0;
    let totalBytesRecovered = 0;

    // Execute tasks sequentially
    for (const task of job.tasks) {
      this._currentTaskId = task.id;

      console.info(`[ExecutionEngine] Task started: ${task.displayName} (${task.id})`);
      executionEvents.emit('task_started', {
        executionId,
        taskId: task.id,
        taskName: task.displayName,
      });

      const result = await task.execute();
      taskResults.push(result);

      executionEvents.emit('task_completed', { executionId, result });

      totalFilesCleaned += result.filesCleaned;
      totalBytesRecovered += result.bytesRecovered;
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);

      console.info(
        `[ExecutionEngine] Task completed: ${task.displayName} — status=${result.status}, files=${result.filesCleaned}, bytes=${result.bytesRecovered}`,
      );
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    // Determine overall status
    const hasFailures = taskResults.some((r) => r.status === 'failed');
    const allFailed = taskResults.length > 0 && taskResults.every((r) => r.status === 'failed');
    const overallStatus = allFailed ? 'failed' : hasFailures ? 'completed' : 'completed';

    const result: ExecutionResult = {
      executionId,
      scheduleId: job.scheduleId,
      jobSource: job.source,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs,
      taskResults,
      totalFilesCleaned,
      totalBytesRecovered,
      errors: allErrors,
      warnings: allWarnings,
      overallStatus,
    };

    this._lastResult = result;
    this._state = 'idle';
    this._currentJob = null;
    this._currentExecutionId = null;
    this._currentTaskId = null;
    clearPersistedState();

    if (allFailed) {
      console.error(
        `[ExecutionEngine] Execution failed: ${executionId} — duration=${durationMs}ms, errors=${allErrors.length}`,
      );
      executionEvents.emit('execution_failed', {
        executionId,
        error: allErrors.join('; ') || 'All tasks failed',
        partialResult: result,
      });
    } else {
      console.info(
        `[ExecutionEngine] Execution completed: ${executionId} — duration=${durationMs}ms, files=${totalFilesCleaned}, bytes=${totalBytesRecovered}`,
      );
      executionEvents.emit('execution_completed', { executionId, result });
    }

    return result;
  }

  // ── Scheduler ───────────────────────────────────────────────

  /**
   * Start the periodic scheduler that checks for due schedules.
   */
  private _startScheduler(): void {
    if (this._schedulerTimer) return;
    this._schedulerTimer = setInterval(() => {
      void this._checkSchedules();
    }, this._schedulerIntervalMs);
  }

  private _stopScheduler(): void {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
  }

  /**
   * Check all synchronized schedules for due execution.
   * Called periodically by the scheduler timer.
   */
  private async _checkSchedules(): Promise<void> {
    if (this._state === 'running') return; // Don't check if already running

    const config = configManager.get_config();
    const schedules = config.maintenance_scheduler.schedules;
    const now = new Date();

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      if (!scheduleHasValidTasks(schedule)) continue;

      const dueInfo = this.checkScheduleDue(schedule, now);
      if (dueInfo.isDue) {
        console.info(`[ExecutionEngine] Schedule "${schedule.name}" is due — building job`);
        const job = jobBuilder.fromSchedule(schedule);
        await this.executeJob(job);
        // Only run one schedule per tick
        return;
      }
    }
  }

  /**
   * Check if a specific schedule is due for execution.
   */
  checkScheduleDue(schedule: MaintenanceScheduleConfig, now: Date = new Date()): ScheduleDueInfo {
    if (!schedule.enabled) {
      return { scheduleId: schedule.id, isDue: false, nextRunAt: null, reason: 'Schedule is disabled' };
    }

    // Check if already ran recently (prevent duplicate execution)
    if (schedule.last_run_at) {
      const lastRun = new Date(schedule.last_run_at);
      const nextRun = getNextRunTime(schedule, lastRun);
      if (nextRun && nextRun.getTime() > now.getTime()) {
        return {
          scheduleId: schedule.id,
          isDue: false,
          nextRunAt: nextRun.toISOString(),
          reason: 'Not yet due',
        };
      }
    }

    // No last run — check if today's scheduled time has already passed (overdue)
    if (!schedule.last_run_at) {
      const scheduledMinutes = parseScheduleTime(schedule.schedule_time);
      const todayScheduled = new Date(now);
      todayScheduled.setHours(Math.floor(scheduledMinutes / 60), scheduledMinutes % 60, 0, 0);

      if (todayScheduled.getTime() <= now.getTime()) {
        return {
          scheduleId: schedule.id,
          isDue: true,
          nextRunAt: null,
          reason: 'Schedule is overdue (never ran)',
        };
      }
      return {
        scheduleId: schedule.id,
        isDue: false,
        nextRunAt: todayScheduled.toISOString(),
        reason: 'Not yet due',
      };
    }

    const nextRun = getNextRunTime(schedule, now);
    if (!nextRun) {
      return { scheduleId: schedule.id, isDue: false, nextRunAt: null, reason: 'Invalid schedule configuration' };
    }

    // Due if next run time is now or in the past
    const isDue = nextRun.getTime() <= now.getTime();
    return {
      scheduleId: schedule.id,
      isDue,
      nextRunAt: isDue ? null : nextRun.toISOString(),
      reason: isDue ? 'Schedule is due' : 'Not yet due',
    };
  }

  // ── Manual triggers ─────────────────────────────────────────

  /**
   * Sync frontend schedule configuration with the Windows Task Scheduler
   * backend. For each enabled frontend schedule, creates or updates a
   * corresponding Windows Task Scheduler task via the Python backend.
   *
   * This ensures maintenance tasks run even when the app is closed.
   */
  async syncWithBackend(): Promise<void> {
    try {
      const status = await schedulerBackendService.getStatus();
      if (!status.available || !status.serviceRunning) {
        console.info('[ExecutionEngine] Windows Task Scheduler not available, skipping sync');
        return;
      }

      const config = configManager.get_config();
      const schedules = config.maintenance_scheduler.schedules;

      for (const schedule of schedules) {
        if (!schedule.enabled) continue;

        // Map frontend schedule to backend action
        const taskIds = schedule.tasks;
        let action = 'full_optimize';
        if (taskIds.length === 1) {
          const taskId = taskIds[0] ?? '';
          if (taskId.includes('junk')) action = 'junk_clean';
          else if (taskId.includes('registry')) action = 'registry_clean';
          else if (taskId.includes('privacy') || taskId.includes('browser')) action = 'privacy_clean';
        }

        // Map frontend schedule frequency to backend schedule type
        const backendSchedule = schedule.frequency === 'weekly' ? 'weekly' :
          schedule.frequency === 'daily' ? 'daily' : 'daily';

        const timeParts = schedule.schedule_time.split(':');
        const backendTime = `${timeParts[0] || '03'}:${timeParts[1] || '00'}`;

        try {
          await schedulerBackendService.createTask({
            action,
            schedule: backendSchedule,
            time: backendTime,
            day: schedule.day_of_week !== null ? ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][schedule.day_of_week] : undefined,
          });
        } catch (err) {
          console.warn(`[ExecutionEngine] Failed to sync schedule "${schedule.name}" with backend:`, err);
        }
      }

      console.info('[ExecutionEngine] Backend sync complete');
    } catch (err) {
      console.warn('[ExecutionEngine] Backend sync failed:', err);
    }
  }

  /**
   * Trigger a quick scan (junk cleaner only).
   */
  async quickScan(): Promise<ExecutionResult | null> {
    const job = jobBuilder.quickScan();
    return this.executeJob(job);
  }

  /**
   * Trigger a browser cleanup.
   */
  async browserCleanup(): Promise<ExecutionResult | null> {
    const job = jobBuilder.browserCleanup();
    return this.executeJob(job);
  }

  /**
   * Trigger a deep clean (all available tasks).
   */
  async deepClean(): Promise<ExecutionResult | null> {
    const job = jobBuilder.deepClean();
    return this.executeJob(job);
  }

  /**
   * Trigger a custom manual job with specific task IDs.
   */
  async runManual(taskIds: string[], name?: string): Promise<ExecutionResult | null> {
    const job = jobBuilder.fromManual(taskIds, 'manual', name);
    return this.executeJob(job);
  }

  // ── Cleanup ─────────────────────────────────────────────────

  /**
   * Clear all state (e.g. on logout).
   */
  clear(): void {
    this._stopScheduler();
    this._state = 'idle';
    this._currentJob = null;
    this._currentExecutionId = null;
    this._currentTaskId = null;
    this._lastResult = null;
    this._lastError = null;
    this._initialized = false;
    clearPersistedState();
    executionEvents.clear();
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const executionEngine = new ExecutionEngineImpl();
