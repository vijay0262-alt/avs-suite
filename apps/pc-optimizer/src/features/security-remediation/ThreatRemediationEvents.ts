/**
 * ThreatRemediationEvents — pub/sub event bus for remediation lifecycle.
 *
 * Emits events for:
 *   - Plan created / approved / rejected
 *   - Action executing / completed / failed / rolled_back
 *   - Quarantine added / restored / deleted
 *   - False positive marked
 *   - Report generated
 */
import type { RemediationEvent, RemediationEventListener } from './types';

class RemediationEventBus {
  private listeners = new Set<RemediationEventListener>();

  subscribe(listener: RemediationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: RemediationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitPlanCreated(planId: string, investigationId: string, message?: string): void {
    this.emit({ type: 'plan_created', timestamp: Date.now(), planId, investigationId, message });
  }

  emitPlanApproved(planId: string, investigationId: string, message?: string): void {
    this.emit({ type: 'plan_approved', timestamp: Date.now(), planId, investigationId, message });
  }

  emitPlanRejected(planId: string, investigationId: string, message?: string): void {
    this.emit({ type: 'plan_rejected', timestamp: Date.now(), planId, investigationId, message });
  }

  emitActionExecuting(actionId: string, planId: string, message?: string): void {
    this.emit({ type: 'action_executing', timestamp: Date.now(), actionId, planId, message });
  }

  emitActionCompleted(actionId: string, planId: string, message?: string): void {
    this.emit({ type: 'action_completed', timestamp: Date.now(), actionId, planId, message });
  }

  emitActionFailed(actionId: string, planId: string, message?: string): void {
    this.emit({ type: 'action_failed', timestamp: Date.now(), actionId, planId, message });
  }

  emitActionRolledBack(actionId: string, planId: string, message?: string): void {
    this.emit({ type: 'action_rolled_back', timestamp: Date.now(), actionId, planId, message });
  }

  emitQuarantineAdded(quarantineId: string, threatId: string, message?: string): void {
    this.emit({ type: 'quarantine_added', timestamp: Date.now(), actionId: quarantineId, data: { threatId }, message });
  }

  emitQuarantineRestored(quarantineId: string, message?: string): void {
    this.emit({ type: 'quarantine_restored', timestamp: Date.now(), actionId: quarantineId, message });
  }

  emitQuarantineDeleted(quarantineId: string, message?: string): void {
    this.emit({ type: 'quarantine_deleted', timestamp: Date.now(), actionId: quarantineId, message });
  }

  emitFalsePositiveMarked(threatId: string, investigationId: string, message?: string): void {
    this.emit({ type: 'false_positive_marked', timestamp: Date.now(), investigationId, message, data: { threatId } });
  }

  emitReportGenerated(planId: string, investigationId: string, message?: string): void {
    this.emit({ type: 'report_generated', timestamp: Date.now(), planId, investigationId, message });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const remediationEventBus = new RemediationEventBus();
