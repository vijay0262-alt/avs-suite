/**
 * Optimization Session — manages the state of a single optimization
 * execution session.
 *
 * A session is created when the user reviews a plan and starts
 * optimization. It tracks:
 *   • Which items were selected/deselected
 *   • Which tasks are being executed
 *   • Current progress and status
 *   • The final result
 *
 * The session is immutable once completed — it serves as a
 * historical record of the optimization.
 */
import type {
  OptimizationSession,
  SessionStatus,
  OptimizationResult,
  ValidationIssue,
} from './types';

let _sessionCounter = 0;

function generateSessionId(): string {
  _sessionCounter += 1;
  return `opt-session-${Date.now().toString(36)}-${_sessionCounter}`;
}

export class SessionManager {
  private _session: OptimizationSession | null = null;

  /**
   * Create a new session from a plan and user selections.
   */
  create(
    planId: string,
    sourceReportId: string,
    previousHealthScore: number,
    selectedItemIds: string[],
    deselectedItemIds: string[],
  ): OptimizationSession {
    this._session = {
      sessionId: generateSessionId(),
      planId,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      status: 'pending',
      selectedItemIds,
      deselectedItemIds,
      executedTaskIds: [],
      currentTaskId: null,
      executionId: null,
      progress: 0,
      result: null,
      validationIssues: [],
      sourceReportId,
      previousHealthScore,
    };
    return this._session;
  }

  /**
   * Get the current session.
   */
  get(): OptimizationSession | null {
    return this._session;
  }

  /**
   * Update session status.
   */
  setStatus(status: SessionStatus): void {
    if (!this._session) return;
    this._session.status = status;
  }

  /**
   * Mark session as started.
   */
  start(executionId: string, executedTaskIds: string[]): void {
    if (!this._session) return;
    this._session.status = 'running';
    this._session.startedAt = new Date().toISOString();
    this._session.executionId = executionId;
    this._session.executedTaskIds = executedTaskIds;
  }

  /**
   * Update current task.
   */
  setCurrentTask(taskId: string | null): void {
    if (!this._session) return;
    this._session.currentTaskId = taskId;
  }

  /**
   * Update progress.
   */
  setProgress(progress: number): void {
    if (!this._session) return;
    this._session.progress = Math.max(0, Math.min(100, progress));
  }

  /**
   * Set validation issues.
   */
  setValidationIssues(issues: ValidationIssue[]): void {
    if (!this._session) return;
    this._session.validationIssues = issues;
  }

  /**
   * Mark session as completed.
   */
  complete(result: OptimizationResult): void {
    if (!this._session) return;
    this._session.status = result.status === 'failed' ? 'failed' : 'completed';
    this._session.completedAt = new Date().toISOString();
    this._session.result = result;
    this._session.progress = 100;
    this._session.currentTaskId = null;
  }

  /**
   * Mark session as cancelled.
   */
  cancel(_reason: string): void {
    if (!this._session) return;
    this._session.status = 'cancelled';
    this._session.completedAt = new Date().toISOString();
    this._session.currentTaskId = null;
  }

  /**
   * Mark session as failed.
   */
  fail(_error: string): void {
    if (!this._session) return;
    this._session.status = 'failed';
    this._session.completedAt = new Date().toISOString();
    this._session.currentTaskId = null;
  }

  /**
   * Clear the current session.
   */
  clear(): void {
    this._session = null;
  }

  /**
   * Get a snapshot of the session for history storage.
   */
  toSnapshot(): OptimizationSession | null {
    if (!this._session) return null;
    return { ...this._session };
  }
}

/**
 * Default singleton instance.
 */
export const sessionManager = new SessionManager();
