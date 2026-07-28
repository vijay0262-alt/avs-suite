/**
 * Maintenance Execution Engine — Type Definitions
 *
 * Core abstractions:
 *   MaintenanceTask  — common interface for all maintenance tasks
 *   MaintenanceJob   — a unit of work submitted to the engine
 *   ExecutionResult  — the outcome of a completed job
 *   ExecutionEvent   — lifecycle events emitted during execution
 */

// ── Task Status ───────────────────────────────────────────────

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type JobSource = 'scheduled' | 'manual' | 'quick_scan' | 'ai_recommended' | 'startup' | 'browser_cleanup';

// ── Maintenance Task Interface ────────────────────────────────

export interface MaintenanceTask {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;

  /**
   * Validate that the task can run (e.g. RPC bridge available,
   * capability available, prerequisites met).
   * Returns warnings that don't block execution, or throws on hard failure.
   */
  validate(): Promise<ValidationResult>;

  /**
   * Execute the task. Returns the result.
   * Must not throw — errors are captured in TaskResult.
   */
  execute(): Promise<TaskResult>;

  /**
   * Estimate duration in milliseconds.
   * Used for UI progress display and scheduling.
   */
  estimateDuration(): number;
}

export interface ValidationResult {
  canRun: boolean;
  warnings: string[];
  errors: string[];
}

// ── Task Result ───────────────────────────────────────────────

export interface TaskResult {
  taskId: string;
  taskName: string;
  status: TaskStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  filesCleaned: number;
  bytesRecovered: number;
  errors: string[];
  warnings: string[];
  metadata?: Record<string, unknown>;
}

// ── Execution Result ──────────────────────────────────────────

export interface ExecutionResult {
  executionId: string;
  scheduleId: string | null;
  jobSource: JobSource;
  startTime: string;
  endTime: string;
  durationMs: number;
  taskResults: TaskResult[];
  totalFilesCleaned: number;
  totalBytesRecovered: number;
  errors: string[];
  warnings: string[];
  overallStatus: ExecutionStatus;
}

// ── Maintenance Job ───────────────────────────────────────────

export interface MaintenanceJob {
  id: string;
  source: JobSource;
  scheduleId: string | null;
  scheduleName: string | null;
  tasks: MaintenanceTask[];
  createdAt: string;
  /**
   * If true, the engine skips pause condition checks.
   * Used for manual jobs that the user explicitly triggered.
   */
  bypassPauseConditions: boolean;
}

// ── Execution Events ──────────────────────────────────────────

export type ExecutionEventType =
  | 'execution_started'
  | 'task_started'
  | 'task_completed'
  | 'execution_completed'
  | 'execution_failed'
  | 'schedule_skipped';

export interface ExecutionEventPayloads {
  execution_started: { executionId: string; job: MaintenanceJob };
  task_started: { executionId: string; taskId: string; taskName: string };
  task_completed: { executionId: string; result: TaskResult };
  execution_completed: { executionId: string; result: ExecutionResult };
  execution_failed: { executionId: string; error: string; partialResult?: ExecutionResult };
  schedule_skipped: { scheduleId: string; reason: string };
}

export type ExecutionEventListener = (payload: unknown) => void;

// ── Pause Conditions ──────────────────────────────────────────

export interface PauseConditionResult {
  shouldPause: boolean;
  reason: string;
}

export interface PauseConditionChecker {
  readonly id: string;
  readonly displayName: string;
  shouldPause(): Promise<PauseConditionResult>;
}

// ── Engine State ──────────────────────────────────────────────

export type EngineState = 'idle' | 'running' | 'paused' | 'stopped';

export interface EngineSnapshot {
  state: EngineState;
  currentExecutionId: string | null;
  currentTaskId: string | null;
  lastExecutionResult: ExecutionResult | null;
  pendingJobCount: number;
  lastError: string | null;
}

// ── Crash Recovery ────────────────────────────────────────────

export interface PersistedExecutionState {
  currentExecutionId: string | null;
  currentScheduleId: string | null;
  startedAt: string | null;
  state: EngineState;
}

// ── Schedule Due Check ────────────────────────────────────────

export interface ScheduleDueInfo {
  scheduleId: string;
  isDue: boolean;
  nextRunAt: string | null;
  reason: string;
}
