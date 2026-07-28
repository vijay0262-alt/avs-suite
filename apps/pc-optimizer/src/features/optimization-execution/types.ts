/**
 * One-Click Smart Optimize — Type Definitions
 *
 * This module coordinates between the Optimization Planner and the
 * existing Execution Engine. It NEVER bypasses the engine, capability
 * checks, or scheduler state. It only:
 *   1. Takes an OptimizationPlan and user selections
 *   2. Validates them
 *   3. Builds a MaintenanceJob from selected items
 *   4. Submits the job to the Execution Engine
 *   5. Tracks progress via execution events
 *   6. Collects results and generates an OptimizationResult
 *
 * This module does NOT modify the execution engine, scheduler,
 * planner, or any cleaning module.
 */
import type { OptimizationPlan } from '../optimization-planner/types';
import type { HealthReport } from '../ai-health-engine/types';
import type { ExecutionRecord } from '../maintenance-history/types';
import type { CapabilityInfo } from '../config-sync/types';

// ── Session ───────────────────────────────────────────────────

export type SessionStatus =
  | 'pending'    // Created, not yet started
  | 'validating' // Running pre-execution validation
  | 'running'    // Execution in progress
  | 'completed'  // Finished successfully
  | 'failed'     // Execution failed
  | 'cancelled'; // User cancelled

export interface OptimizationSession {
  /** Unique session ID. */
  sessionId: string;
  /** Source plan ID. */
  planId: string;
  /** ISO timestamp when session was created. */
  createdAt: string;
  /** ISO timestamp when execution started. */
  startedAt: string | null;
  /** ISO timestamp when execution completed. */
  completedAt: string | null;
  /** Current session status. */
  status: SessionStatus;
  /** Item IDs the user selected for execution. */
  selectedItemIds: string[];
  /** Item IDs the user deselected (skipped). */
  deselectedItemIds: string[];
  /** Task IDs that were submitted to the execution engine. */
  executedTaskIds: string[];
  /** Task ID currently executing. */
  currentTaskId: string | null;
  /** Execution ID from the engine. */
  executionId: string | null;
  /** Progress percentage (0–100). */
  progress: number;
  /** The execution result, if completed. */
  result: OptimizationResult | null;
  /** Validation issues, if any. */
  validationIssues: ValidationIssue[];
  /** Source health report ID. */
  sourceReportId: string;
  /** Previous health score before optimization. */
  previousHealthScore: number;
}

// ── Validation ────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  /** Item ID this issue relates to (null = plan-level). */
  itemId: string | null;
  severity: ValidationSeverity;
  message: string;
  code: string;
}

export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
}

// ── Progress ───────────────────────────────────────────────────

export interface OptimizationProgress {
  /** Session ID. */
  sessionId: string;
  /** Overall progress percentage (0–100). */
  overallProgress: number;
  /** Current task name. */
  currentTaskName: string | null;
  /** Current task ID. */
  currentTaskId: string | null;
  /** Completed task IDs. */
  completedTaskIds: string[];
  /** Remaining task IDs. */
  remainingTaskIds: string[];
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
  /** Estimated remaining time in milliseconds. */
  estimatedRemainingMs: number;
  /** Bytes recovered so far. */
  currentBytesRecovered: number;
  /** Files cleaned so far. */
  currentFilesCleaned: number;
  /** Total number of tasks. */
  totalTasks: number;
  /** Number of completed tasks. */
  completedTasks: number;
}

// ── Result ────────────────────────────────────────────────────

export interface OptimizationResult {
  /** Session ID. */
  sessionId: string;
  /** Execution ID from the engine. */
  executionId: string;
  /** Previous health score. */
  previousHealthScore: number;
  /** New health score (from re-analysis, if available). */
  newHealthScore: number | null;
  /** Health score improvement. */
  healthImprovement: number | null;
  /** Number of tasks completed. */
  tasksCompleted: number;
  /** Number of tasks skipped. */
  tasksSkipped: number;
  /** Total bytes recovered. */
  storageRecovered: number;
  /** Total files cleaned. */
  filesCleaned: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Warnings collected. */
  warnings: string[];
  /** Errors collected. */
  errors: string[];
  /** Recommendations for next steps. */
  recommendations: string[];
  /** Per-item results. */
  itemResults: ItemResult[];
  /** Execution record from history (if logged). */
  executionRecord: ExecutionRecord | null;
  /** Overall status. */
  status: 'completed' | 'failed' | 'partial' | 'cancelled';
}

export interface ItemResult {
  /** Item ID from the plan. */
  itemId: string;
  /** Task ID that was executed. */
  taskId: string;
  /** Task display name. */
  taskName: string;
  /** Task status. */
  status: 'completed' | 'failed' | 'skipped';
  /** Bytes recovered by this task. */
  bytesRecovered: number;
  /** Files cleaned by this task. */
  filesCleaned: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Warnings from this task. */
  warnings: string[];
  /** Errors from this task. */
  errors: string[];
}

// ── Coordinator Input ──────────────────────────────────────────

export interface CoordinatorInput {
  /** The optimization plan to execute. */
  plan: OptimizationPlan;
  /** Available capabilities. */
  capabilities: {
    available: CapabilityInfo[];
    locked: CapabilityInfo[];
  };
  /** Item IDs the user deselected (will not be executed). */
  deselectedItemIds: string[];
  /** The health report (for previous score and re-analysis). */
  healthReport: HealthReport;
}

// ── Events ────────────────────────────────────────────────────

export type OptimizationExecutionEventType =
  | 'optimization_started'
  | 'optimization_progress'
  | 'optimization_completed'
  | 'optimization_cancelled'
  | 'optimization_failed';

export interface OptimizationExecutionEventPayloads {
  optimization_started: { sessionId: string; planId: string; taskIds: string[] };
  optimization_progress: { sessionId: string; progress: OptimizationProgress };
  optimization_completed: { sessionId: string; result: OptimizationResult };
  optimization_cancelled: { sessionId: string; reason: string };
  optimization_failed: { sessionId: string; error: string };
}

export type OptimizationExecutionEventListener = (payload: unknown) => void;

// ── Helper Functions ────────────────────────────────────────────

/**
 * Format milliseconds into a human-readable duration string.
 */
export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `~${seconds} second${seconds > 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (remaining === 0) return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `~${minutes} min ${remaining} sec`;
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
