/**
 * Optimization Recovery & Rollback Center — Events
 *
 * Typed event emitter for recovery lifecycle events.
 */
import type { RecoveryEventType, RecoveryEvent, RecoveryEventListener } from './types';

export class RecoveryEvents {
  private _listeners: Map<RecoveryEventType, Set<RecoveryEventListener>> = new Map();

  on(event: RecoveryEventType, listener: RecoveryEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: RecoveryEventType, listener: RecoveryEventListener): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit(event: RecoveryEventType, recoveryId: string, data: unknown): void {
    const e: RecoveryEvent = {
      type: event,
      recoveryId,
      timestamp: new Date().toISOString(),
      data,
    };
    const set = this._listeners.get(event);
    if (set) {
      for (const listener of set) {
        try {
          listener(e);
        } catch {
          // listener error should not crash the emitter
        }
      }
    }
  }

  emitCreated(recoveryId: string, data: unknown): void {
    this.emit('recovery_created', recoveryId, data);
  }

  emitValidated(recoveryId: string, data: unknown): void {
    this.emit('recovery_validated', recoveryId, data);
  }

  emitStarted(recoveryId: string, data: unknown): void {
    this.emit('recovery_started', recoveryId, data);
  }

  emitCompleted(recoveryId: string, data: unknown): void {
    this.emit('recovery_completed', recoveryId, data);
  }

  emitFailed(recoveryId: string, data: unknown): void {
    this.emit('recovery_failed', recoveryId, data);
  }

  emitSnapshotCompared(recoveryId: string, data: unknown): void {
    this.emit('snapshot_compared', recoveryId, data);
  }

  emitExported(recoveryId: string, data: unknown): void {
    this.emit('recovery_exported', recoveryId, data);
  }

  clear(): void {
    this._listeners.clear();
  }

  listenerCount(event?: RecoveryEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }
}
