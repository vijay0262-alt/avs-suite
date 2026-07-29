/**
 * Simulation Events — typed event emitter for simulation lifecycle events.
 */
import type { SimulationEventType, SimulationEvent, SimulationEventListener } from './types';

export class SimulationEvents {
  private _listeners: Map<SimulationEventType, Set<SimulationEventListener>> = new Map();

  on(event: SimulationEventType, listener: SimulationEventListener): () => void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: SimulationEventType, listener: SimulationEventListener): void {
    this._listeners.get(event)?.delete(listener);
  }

  emit(event: SimulationEventType, simulationId: string | null, data: unknown): void {
    const listeners = this._listeners.get(event);
    if (listeners) {
      const evt: SimulationEvent = {
        type: event,
        simulationId,
        timestamp: new Date().toISOString(),
        data,
      };
      for (const listener of listeners) {
        try {
          listener(evt);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }

  emitStarted(simulationId: string, data?: unknown): void {
    this.emit('simulation_started', simulationId, data);
  }

  emitGenerated(simulationId: string, data?: unknown): void {
    this.emit('simulation_generated', simulationId, data);
  }

  emitCompared(comparisonId: string, data?: unknown): void {
    this.emit('simulation_compared', comparisonId, data);
  }

  emitExported(simulationId: string, data?: unknown): void {
    this.emit('simulation_exported', simulationId, data);
  }

  emitExpired(simulationId: string, data?: unknown): void {
    this.emit('simulation_expired', simulationId, data);
  }

  listenerCount(event?: SimulationEventType): number {
    if (event) return this._listeners.get(event)?.size ?? 0;
    let total = 0;
    for (const set of this._listeners.values()) total += set.size;
    return total;
  }

  clear(): void {
    this._listeners.clear();
  }
}
