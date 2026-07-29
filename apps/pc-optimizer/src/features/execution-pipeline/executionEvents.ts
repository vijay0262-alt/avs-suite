/**
 * Execution Events — typed event emitter for the execution pipeline.
 *
 * Emits: execution_started, validation_completed, snapshot_created,
 * confirmation_requested, execution_progress, step_completed,
 * verification_completed, execution_completed, execution_failed,
 * rollback_started, rollback_completed.
 */
import type { ExecutionEventType, ExecutionEventListener, ExecutionEvent } from './types';

export class ExecutionEvents {
  private _listeners: Map<ExecutionEventType, Set<ExecutionEventListener>> = new Map();

  on(event: ExecutionEventType, listener: ExecutionEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  off(event: ExecutionEventType, listener: ExecutionEventListener): void {
    const set = this._listeners.get(event);
    if (set) set.delete(listener);
  }

  emit(event: ExecutionEvent): void {
    const set = this._listeners.get(event.type);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ExecutionEvents] Listener error:', err);
      }
    }
  }

  emitStarted(executionId: string, data?: unknown): void {
    this.emit({ type: 'execution_started', executionId, timestamp: new Date().toISOString(), data });
  }

  emitValidationCompleted(executionId: string, data?: unknown): void {
    this.emit({ type: 'validation_completed', executionId, timestamp: new Date().toISOString(), data });
  }

  emitSnapshotCreated(executionId: string, data?: unknown): void {
    this.emit({ type: 'snapshot_created', executionId, timestamp: new Date().toISOString(), data });
  }

  emitConfirmationRequested(executionId: string, data?: unknown): void {
    this.emit({ type: 'confirmation_requested', executionId, timestamp: new Date().toISOString(), data });
  }

  emitProgress(executionId: string, data?: unknown): void {
    this.emit({ type: 'execution_progress', executionId, timestamp: new Date().toISOString(), data });
  }

  emitStepCompleted(executionId: string, data?: unknown): void {
    this.emit({ type: 'step_completed', executionId, timestamp: new Date().toISOString(), data });
  }

  emitVerificationCompleted(executionId: string, data?: unknown): void {
    this.emit({ type: 'verification_completed', executionId, timestamp: new Date().toISOString(), data });
  }

  emitCompleted(executionId: string, data?: unknown): void {
    this.emit({ type: 'execution_completed', executionId, timestamp: new Date().toISOString(), data });
  }

  emitFailed(executionId: string, data?: unknown): void {
    this.emit({ type: 'execution_failed', executionId, timestamp: new Date().toISOString(), data });
  }

  emitRollbackStarted(executionId: string, data?: unknown): void {
    this.emit({ type: 'rollback_started', executionId, timestamp: new Date().toISOString(), data });
  }

  emitRollbackCompleted(executionId: string, data?: unknown): void {
    this.emit({ type: 'rollback_completed', executionId, timestamp: new Date().toISOString(), data });
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: ExecutionEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
