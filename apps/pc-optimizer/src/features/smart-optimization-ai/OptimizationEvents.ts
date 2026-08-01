/**
 * OptimizationEvents — event bus for AI Smart Optimization lifecycle.
 *
 * Pub/sub pattern matching other AVS Shield event buses.
 */
import type { OptimizationEvent, OptimizationCategory } from './types';

type OptimizationEventListener = (event: OptimizationEvent) => void;

class OptimizationEventBus {
  private listeners = new Set<OptimizationEventListener>();

  subscribe(listener: OptimizationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: OptimizationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener errors are non-fatal
      }
    }
  }

  emitPlanGenerated(planId: string, actionCount: number): void {
    this.emit({ type: 'plan_generated', planId, actionCount });
  }

  emitActionApproved(actionId: string, planId: string): void {
    this.emit({ type: 'action_approved', actionId, planId });
  }

  emitActionRejected(actionId: string, planId: string, reason?: string): void {
    this.emit({ type: 'action_rejected', actionId, planId, reason });
  }

  emitExecutionStarted(planId: string): void {
    this.emit({ type: 'execution_started', planId });
  }

  emitActionExecuting(actionId: string, planId: string): void {
    this.emit({ type: 'action_executing', actionId, planId });
  }

  emitActionCompleted(actionId: string, planId: string, durationMs: number): void {
    this.emit({ type: 'action_completed', actionId, planId, durationMs });
  }

  emitActionFailed(actionId: string, planId: string, error: string): void {
    this.emit({ type: 'action_failed', actionId, planId, error });
  }

  emitExecutionCompleted(planId: string, successCount: number, failureCount: number): void {
    this.emit({ type: 'execution_completed', planId, successCount, failureCount });
  }

  emitRollbackStarted(actionId: string, planId: string): void {
    this.emit({ type: 'rollback_started', actionId, planId });
  }

  emitRollbackCompleted(actionId: string, planId: string): void {
    this.emit({ type: 'rollback_completed', actionId, planId });
  }

  emitHighImpact(actionId: string, category: OptimizationCategory): void {
    this.emit({ type: 'high_impact_detected', actionId, category });
  }

  emitUnsafeBlocked(actionId: string, reason: string): void {
    this.emit({ type: 'unsafe_action_blocked', actionId, reason });
  }

  emitLearningUpdated(totalOptimizations: number): void {
    this.emit({ type: 'learning_updated', totalOptimizations });
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const optimizationEventBus = new OptimizationEventBus();
