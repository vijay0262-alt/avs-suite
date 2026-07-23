/**
 * OptimizationEventBus — lightweight pub/sub for cross-module notifications.
 *
 * When any optimization module completes a cleanup action (junk cleaned,
 * privacy cleaned, registry fixed, startup disabled, etc.), it emits an
 * event. The Dashboard listens and refreshes its health score.
 *
 * This decouples modules from the Dashboard — they don't need to import
 * DashboardViewModel or know about its internals.
 */

import type { ModuleId } from './HealthContribution';

/**
 * Typed optimization event names.
 *
 * Future modules publish events using these constants so the Dashboard
 * can subscribe without knowing about specific module implementations.
 * To add a new event type, just add a constant here and emit it —
 * no Dashboard changes required.
 */
export const OptimizationEventType = {
  CleaningCompleted: 'cleaning_completed',
  RegistryOptimized: 'registry_optimized',
  PrivacyCleaned: 'privacy_cleaned',
  StartupOptimized: 'startup_optimized',
  DuplicateRemoved: 'duplicate_removed',
  PerformanceOptimized: 'performance_optimized',
  ScanCompleted: 'scan_completed',
} as const;

export type OptimizationEventTypeName =
  (typeof OptimizationEventType)[keyof typeof OptimizationEventType];

export interface OptimizationEvent {
  type: OptimizationEventTypeName;
  moduleId: ModuleId;
  action: string;
  bytesRecovered?: number;
  itemsProcessed?: number;
  timestamp: number;
}

type Listener = (event: OptimizationEvent) => void;

class OptimizationEventBusImpl {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(event: OptimizationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[OptimizationEventBus] listener error:', err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const optimizationEventBus = new OptimizationEventBusImpl();
