/**
 * ThreatEvents — pub/sub event bus for investigation lifecycle events.
 *
 * Emits events for:
 *   - Investigation created / updated / resolved / false_positive
 *   - Correlation found
 *   - Evidence collected
 *   - Report generated
 */
import type { InvestigationEvent, InvestigationEventListener } from './types';

class ThreatEventBus {
  private listeners = new Set<InvestigationEventListener>();

  subscribe(listener: InvestigationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: InvestigationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitInvestigationCreated(investigationId: string, message?: string): void {
    this.emit({ type: 'investigation_created', timestamp: Date.now(), investigationId, message });
  }

  emitInvestigationUpdated(investigationId: string, message?: string): void {
    this.emit({ type: 'investigation_updated', timestamp: Date.now(), investigationId, message });
  }

  emitInvestigationResolved(investigationId: string, message?: string): void {
    this.emit({ type: 'investigation_resolved', timestamp: Date.now(), investigationId, message });
  }

  emitFalsePositive(investigationId: string, message?: string): void {
    this.emit({ type: 'investigation_false_positive', timestamp: Date.now(), investigationId, message });
  }

  emitCorrelationFound(investigationId: string, data?: Record<string, unknown>): void {
    this.emit({ type: 'correlation_found', timestamp: Date.now(), investigationId, data });
  }

  emitEvidenceCollected(investigationId: string, data?: Record<string, unknown>): void {
    this.emit({ type: 'evidence_collected', timestamp: Date.now(), investigationId, data });
  }

  emitReportGenerated(investigationId: string, message?: string): void {
    this.emit({ type: 'report_generated', timestamp: Date.now(), investigationId, message });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const threatEventBus = new ThreatEventBus();
