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

export interface OptimizationEvent {
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
