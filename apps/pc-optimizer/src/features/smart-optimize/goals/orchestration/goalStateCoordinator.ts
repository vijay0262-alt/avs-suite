/**
 * Goal Orchestration Engine — State Coordinator
 *
 * Tracks and manages goal orchestration states:
 * Pending, Planning, Waiting, Executing, Paused, Completed, Cancelled, Blocked.
 */
import type {
  Goal,
  OrchestrationState,
  OrchestrationStatus,
  OrchestrationDecision,
  ResourceAllocationSummary,
} from './types';

export class GoalStateCoordinator {
  private _goalStates: Map<string, OrchestrationState> = new Map();
  private _currentDecision: OrchestrationDecision | null = null;
  private _lastOrchestrationAt: string | null = null;

  setState(goalId: string, state: OrchestrationState): void {
    this._goalStates.set(goalId, state);
  }

  getState(goalId: string): OrchestrationState {
    return this._goalStates.get(goalId) ?? 'pending';
  }

  transition(goalId: string, target: OrchestrationState): OrchestrationState {
    const current = this.getState(goalId);
    if (!this._isValidTransition(current, target)) {
      return current;
    }
    this.setState(goalId, target);
    return target;
  }

  private _isValidTransition(from: OrchestrationState, to: OrchestrationState): boolean {
    const valid: Record<OrchestrationState, OrchestrationState[]> = {
      pending: ['planning', 'cancelled'],
      planning: ['waiting', 'executing', 'blocked', 'cancelled'],
      waiting: ['executing', 'blocked', 'cancelled'],
      executing: ['completed', 'paused', 'blocked', 'cancelled'],
      paused: ['executing', 'cancelled'],
      completed: [],
      cancelled: [],
      blocked: ['planning', 'cancelled'],
      future_state: [],
    };
    return valid[from]?.includes(to) ?? false;
  }

  setCurrentDecision(decision: OrchestrationDecision): void {
    this._currentDecision = decision;
    this._lastOrchestrationAt = decision.timestamp;
  }

  getCurrentDecision(): OrchestrationDecision | null {
    return this._currentDecision;
  }

  getLastOrchestrationAt(): string | null {
    return this._lastOrchestrationAt;
  }

  getStatus(goals: Goal[]): OrchestrationStatus {
    const activeGoals: string[] = [];
    const pendingGoals: string[] = [];
    const deferredGoals: string[] = [];
    const blockedGoals: string[] = [];
    const completedGoals: string[] = [];

    for (const goal of goals) {
      const state = this.getState(goal.id);
      switch (state) {
        case 'executing':
        case 'planning':
        case 'waiting':
          activeGoals.push(goal.id);
          break;
        case 'pending':
          pendingGoals.push(goal.id);
          break;
        case 'paused':
          deferredGoals.push(goal.id);
          break;
        case 'blocked':
          blockedGoals.push(goal.id);
          break;
        case 'completed':
          completedGoals.push(goal.id);
          break;
        default:
          break;
      }
    }

    return {
      state: activeGoals.length > 0 ? 'executing' : 'pending',
      activeGoals,
      pendingGoals,
      deferredGoals,
      blockedGoals,
      completedGoals,
      currentDecision: this._currentDecision,
      lastOrchestrationAt: this._lastOrchestrationAt,
      resourceUtilization: null,
      futureMetadata: {},
    };
  }

  setResourceUtilization(_summary: ResourceAllocationSummary): void {
    if (this._currentDecision) {
      // Resource utilization is part of status, not decision
    }
  }

  clear(): void {
    this._goalStates.clear();
    this._currentDecision = null;
    this._lastOrchestrationAt = null;
  }

  clearForGoal(goalId: string): void {
    this._goalStates.delete(goalId);
  }

  getAllStates(): Map<string, OrchestrationState> {
    return new Map(this._goalStates);
  }
}
