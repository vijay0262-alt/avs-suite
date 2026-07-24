/**
 * Module Event System (Part 7) — standard events published by every module.
 *
 * Modules publish lifecycle events (scan started/completed, cleaning started/completed,
 * optimization started/completed, status changed, error occurred, recommendation updated).
 *
 * The Dashboard, History, Notifications, and Health Engine subscribe to these events
 * to react automatically — no module-specific wiring needed.
 */

import type { ModuleId } from '../health/HealthContribution';
import type { ModuleLifecycleState } from './moduleRegistry.types';

// ── Event Types ─────────────────────────────────────────────────────

export const ModuleEventType = {
  ScanStarted: 'scan_started',
  ScanCompleted: 'scan_completed',
  CleaningStarted: 'cleaning_started',
  CleaningCompleted: 'cleaning_completed',
  OptimizationStarted: 'optimization_started',
  OptimizationCompleted: 'optimization_completed',
  StatusChanged: 'status_changed',
  ErrorOccurred: 'error_occurred',
  RecommendationUpdated: 'recommendation_updated',
} as const;

export type ModuleEventTypeName =
  (typeof ModuleEventType)[keyof typeof ModuleEventType];

export interface ModuleEvent {
  type: ModuleEventTypeName;
  moduleId: ModuleId;
  moduleName: string;
  timestamp: number;
  /** Optional data payload (e.g. bytes recovered, items processed). */
  data?: ModuleEventData;
}

export interface ModuleEventData {
  bytesRecovered?: number;
  itemsProcessed?: number;
  itemsFound?: number;
  itemsResolved?: number;
  durationMs?: number;
  error?: string;
  oldStatus?: ModuleLifecycleState;
  newStatus?: ModuleLifecycleState;
  healthImpact?: number;
}

// ── Event Bus ───────────────────────────────────────────────────────

type ModuleEventListener = (event: ModuleEvent) => void;

class ModuleEventBusImpl {
  private listeners = new Set<ModuleEventListener>();

  subscribe(listener: ModuleEventListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(event: ModuleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ModuleEventBus] listener error:', err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const moduleEventBus = new ModuleEventBusImpl();

// ── Helper: emit from a module ──────────────────────────────────────

export function emitModuleEvent(
  type: ModuleEventTypeName,
  moduleId: ModuleId,
  moduleName: string,
  data?: ModuleEventData,
): void {
  moduleEventBus.emit({
    type,
    moduleId,
    moduleName,
    timestamp: Date.now(),
    data,
  });
}
