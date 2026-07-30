/**
 * Product Completion Program — Quality Events
 *
 * PCP PHASE 1 PART 1
 *
 * Event-driven architecture for quality audit lifecycle.
 * Events are emitted on audit start, progress, completion, issue detection,
 * baseline update, regression detection, and module health change.
 */
import type {
  QualityEventType,
  QualityEventListener,
  QualityEvent,
  QualityAuditResult,
  QualityIssue,
  PerformanceBaselineResult,
  RegressionResult,
  ModuleHealthResult,
} from './types';

type Listener = QualityEventListener;

export class QualityEventEmitter {
  private _listeners: Map<QualityEventType, Set<Listener>> = new Map();
  private _allListeners: Set<Listener> = new Set();
  private _history: QualityEvent[] = [];
  private _maxHistory = 200;

  on(type: QualityEventType | '*', listener: Listener): () => void {
    if (type === '*') {
      this._allListeners.add(listener);
      return () => this._allListeners.delete(listener);
    }
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  off(type: QualityEventType | '*', listener: Listener): void {
    if (type === '*') {
      this._allListeners.delete(listener);
      return;
    }
    this._listeners.get(type)?.delete(listener);
  }

  emit(event: QualityEvent): void {
    this._history.push(event);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }
    const specific = this._listeners.get(event.type);
    if (specific) {
      for (const l of specific) {
        try {
          l(event);
        } catch {
          // listener errors are swallowed to avoid breaking the emitter
        }
      }
    }
    for (const l of this._allListeners) {
      try {
        l(event);
      } catch {
        // listener errors are swallowed
      }
    }
  }

  getHistory(): QualityEvent[] {
    return [...this._history];
  }

  clearHistory(): void {
    this._history = [];
  }

  listenerCount(type?: QualityEventType): number {
    if (type) {
      return (this._listeners.get(type)?.size ?? 0) + this._allListeners.size;
    }
    let total = this._allListeners.size;
    for (const set of this._listeners.values()) {
      total += set.size;
    }
    return total;
  }

  removeAllListeners(): void {
    this._listeners.clear();
    this._allListeners.clear();
  }
}

export function createAuditStartedEvent(
  auditId: string,
  timestamp: string,
): QualityEvent {
  return {
    type: 'quality:audit:started',
    timestamp,
    auditId,
    data: { auditId },
  };
}

export function createAuditProgressEvent(
  auditId: string,
  timestamp: string,
  phase: string,
  progress: number,
): QualityEvent {
  return {
    type: 'quality:audit:progress',
    timestamp,
    auditId,
    data: { phase, progress },
  };
}

export function createAuditCompletedEvent(
  auditId: string,
  timestamp: string,
  result: QualityAuditResult,
): QualityEvent {
  return {
    type: 'quality:audit:completed',
    timestamp,
    auditId,
    data: { result },
  };
}

export function createIssueDetectedEvent(
  auditId: string,
  timestamp: string,
  issue: QualityIssue,
): QualityEvent {
  return {
    type: 'quality:issue:detected',
    timestamp,
    auditId,
    data: { issue },
  };
}

export function createBaselineUpdatedEvent(
  timestamp: string,
  baseline: PerformanceBaselineResult,
): QualityEvent {
  return {
    type: 'quality:baseline:updated',
    timestamp,
    data: { baseline },
  };
}

export function createRegressionDetectedEvent(
  timestamp: string,
  regression: RegressionResult,
): QualityEvent {
  return {
    type: 'quality:regression:detected',
    timestamp,
    data: { regression },
  };
}

export function createModuleHealthChangedEvent(
  timestamp: string,
  health: ModuleHealthResult,
): QualityEvent {
  return {
    type: 'quality:module:health_changed',
    timestamp,
    data: { health },
  };
}
