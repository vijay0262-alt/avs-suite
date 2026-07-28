/**
 * Base Maintenance Task — shared logic for all maintenance tasks.
 *
 * Provides:
 *   • Unique ID generation
 *   • Timing (start/end/duration)
 *   • Error capture (never throws — errors go into TaskResult)
 *   • Structured logging
 */
import type {
  MaintenanceTask,
  TaskResult,
  ValidationResult,
  TaskStatus,
} from '../types';

let _taskCounter = 0;

function generateTaskId(prefix: string): string {
  _taskCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_taskCounter}`;
}

export abstract class BaseMaintenanceTask implements MaintenanceTask {
  public readonly id: string;
  public abstract readonly displayName: string;
  public abstract readonly description: string;

  protected _status: TaskStatus = 'pending';
  protected _startTime: string | null = null;
  protected _endTime: string | null = null;
  protected _errors: string[] = [];
  protected _warnings: string[] = [];
  protected _filesCleaned = 0;
  protected _bytesRecovered = 0;

  constructor(idPrefix: string) {
    this.id = generateTaskId(idPrefix);
  }

  abstract validate(): Promise<ValidationResult>;
  abstract execute(): Promise<TaskResult>;
  abstract estimateDuration(): number;

  /**
   * Helper to build a TaskResult from the current state.
   */
  protected buildResult(): TaskResult {
    const start = this._startTime ?? new Date().toISOString();
    const end = this._endTime ?? new Date().toISOString();
    const durationMs = this._startTime
      ? new Date(end).getTime() - new Date(start).getTime()
      : 0;

    return {
      taskId: this.id,
      taskName: this.displayName,
      status: this._status,
      startTime: start,
      endTime: end,
      durationMs,
      filesCleaned: this._filesCleaned,
      bytesRecovered: this._bytesRecovered,
      errors: [...this._errors],
      warnings: [...this._warnings],
    };
  }

  /**
   * Helper to safely run a task body, capturing all errors.
   */
  protected async runSafely(fn: () => Promise<void>): Promise<TaskResult> {
    this._status = 'running';
    this._startTime = new Date().toISOString();
    console.info(`[MaintenanceEngine] Task started: ${this.displayName} (${this.id})`);

    try {
      await fn();
      this._status = 'completed';
      this._endTime = new Date().toISOString();
      console.info(
        `[MaintenanceEngine] Task completed: ${this.displayName} — files=${this._filesCleaned}, bytes=${this._bytesRecovered}`,
      );
    } catch (err) {
      this._status = 'failed';
      this._endTime = new Date().toISOString();
      const errMsg = err instanceof Error ? err.message : String(err);
      this._errors.push(errMsg);
      console.error(`[MaintenanceEngine] Task failed: ${this.displayName} — ${errMsg}`);
    }

    return this.buildResult();
  }

  /**
   * Reset the task state for re-execution.
   */
  protected resetState(): void {
    this._status = 'pending';
    this._startTime = null;
    this._endTime = null;
    this._errors = [];
    this._warnings = [];
    this._filesCleaned = 0;
    this._bytesRecovered = 0;
  }
}

// ── RPC Bridge Helper ─────────────────────────────────────────

export function getRpcBridge(): { call: (method: string, params?: unknown) => Promise<unknown> } | null {
  if (typeof window === 'undefined' || !window.avs) {
    return null;
  }
  return window.avs.rpc;
}

export function isRpcAvailable(): boolean {
  return getRpcBridge() !== null;
}
