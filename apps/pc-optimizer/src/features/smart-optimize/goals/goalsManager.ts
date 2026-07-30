/**
 * Goals & Objectives Engine — Manager
 *
 * The top-level orchestrator and single source of truth for goals.
 * Exposes public APIs and emits lifecycle events.
 *
 * Public APIs:
 *   createGoal()
 *   updateGoal()
 *   deleteGoal()
 *   pauseGoal()
 *   resumeGoal()
 *   measureGoal()
 *   generateStrategy()
 *   getGoalProgress()
 *   getGoalAnalytics()
 */
import type {
  Goal,
  GoalMeasurementInput,
  GoalProgress,
  GoalStrategy,
  GoalAnalytics,
  GoalConflict,
  GoalConfiguration,
  GoalProviderPlugin,
  GoalEventType,
  GoalEventListener,
} from './types';
import {
  DEFAULT_GOAL_CONFIGURATION,
  createGoalConfiguration,
  type DeepPartial,
} from './goalConfiguration';
import { GoalEngine } from './goalEngine';
import { GoalBuilder, type GoalBuildInput } from './goalBuilder';
import { GoalEvents } from './goalEvents';

export class GoalsManager {
  private _config: GoalConfiguration;
  private _engine: GoalEngine;
  private _builder: GoalBuilder;
  private _events: GoalEvents;

  constructor(config?: DeepPartial<GoalConfiguration>) {
    this._config = config
      ? createGoalConfiguration(config)
      : structuredClone(DEFAULT_GOAL_CONFIGURATION);
    this._engine = new GoalEngine(this._config);
    this._builder = new GoalBuilder();
    this._events = new GoalEvents();
  }

  // ── Public APIs ────────────────────────────────────────────

  createGoal(input: GoalBuildInput): Goal | null {
    if (!this._config.featureFlags.enableGoals) return null;
    if (this._engine.count >= this._config.maxGoals) return null;
    const goal = this._builder.build(input);
    this._engine.add(goal);
    this._engine.history.record(goal.id, 'created', `Goal created: ${goal.name}`);
    if (this._config.enableEvents) this._events.emitCreated(goal.id, { name: goal.name });
    return goal;
  }

  updateGoal(goalId: string, updates: Partial<Goal>): boolean {
    const goal = this._engine.get(goalId);
    if (!goal) return false;
    const result = this._engine.update(goalId, updates);
    if (result && this._config.enableEvents) this._events.emitUpdated(goalId, updates);
    return result;
  }

  deleteGoal(goalId: string): boolean {
    const result = this._engine.remove(goalId);
    return result;
  }

  pauseGoal(goalId: string): boolean {
    const result = this._engine.setStatus(goalId, 'paused');
    if (result && this._config.enableEvents) this._events.emitPaused(goalId, {});
    return result;
  }

  resumeGoal(goalId: string): boolean {
    const goal = this._engine.get(goalId);
    if (!goal) return false;
    if (this._engine.isGoalBlocked(goalId)) {
      this._engine.setStatus(goalId, 'blocked');
      if (this._config.enableEvents) this._events.emitBlocked(goalId, { reason: 'dependencies' });
      return false;
    }
    const result = this._engine.setStatus(goalId, 'in_progress');
    return result;
  }

  startGoal(goalId: string): boolean {
    const goal = this._engine.get(goalId);
    if (!goal) return false;
    if (!this._engine.canStart(goalId)) {
      this._engine.setStatus(goalId, 'blocked');
      if (this._config.enableEvents) this._events.emitBlocked(goalId, { reason: 'dependencies' });
      return false;
    }
    const result = this._engine.setStatus(goalId, 'started');
    if (result && this._config.enableEvents) this._events.emitStarted(goalId, {});
    return result;
  }

  measureGoal(goalId: string, input: GoalMeasurementInput): GoalProgress | null {
    if (!this._config.featureFlags.enableMeasurement) return null;
    const progress = this._engine.evaluate(goalId, input);
    if (progress && this._config.enableEvents) this._events.emitMeasured(goalId, { progress: progress.progress });
    return progress;
  }

  generateStrategy(goalId: string, input: GoalMeasurementInput): GoalStrategy | null {
    if (!this._config.featureFlags.enableStrategies) return null;
    const strategy = this._engine.generateStrategy(goalId, input);
    if (strategy && this._config.enableEvents) this._events.emitStrategyGenerated(goalId, { steps: strategy.steps.length });
    return strategy;
  }

  getGoalProgress(goalId: string): GoalProgress[] {
    return this._engine.planner.progressEngine.getProgress(goalId);
  }

  getGoalAnalytics(): GoalAnalytics {
    return this._engine.getAnalytics();
  }

  // ── Goal Access ────────────────────────────────────────────

  getGoal(goalId: string): Goal | null {
    return this._engine.get(goalId);
  }

  getAllGoals(): Goal[] {
    return this._engine.getAll();
  }

  getActiveGoals(): Goal[] {
    return this._engine.getActiveGoals();
  }

  // ── Conflicts ──────────────────────────────────────────────

  detectConflicts(): GoalConflict[] {
    return this._engine.detectConflicts();
  }

  resolveConflict(conflict: GoalConflict): GoalConflict {
    return this._engine.resolveConflict(conflict);
  }

  // ── Dependencies ───────────────────────────────────────────

  isGoalBlocked(goalId: string): boolean {
    return this._engine.isGoalBlocked(goalId);
  }

  canStartGoal(goalId: string): boolean {
    return this._engine.canStart(goalId);
  }

  // ── History ────────────────────────────────────────────────

  getGoalHistory(goalId?: string) {
    return this._engine.getHistory(goalId);
  }

  // ── Provider ───────────────────────────────────────────────

  registerProvider(plugin: GoalProviderPlugin): boolean {
    return this._engine.registerProvider(plugin);
  }

  // ── Events ─────────────────────────────────────────────────

  on(event: GoalEventType, listener: GoalEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: GoalEventType, listener: GoalEventListener): void {
    this._events.off(event, listener);
  }

  // ── Config ─────────────────────────────────────────────────

  get config(): GoalConfiguration { return this._config; }

  updateConfig(overrides: DeepPartial<GoalConfiguration>): void {
    this._config = createGoalConfiguration(overrides);
    this._engine = new GoalEngine(this._config);
  }

  // ── Lifecycle ──────────────────────────────────────────────

  clear(): void {
    this._engine.clear();
    this._events.clear();
  }

  get goalCount(): number { return this._engine.count; }
}
