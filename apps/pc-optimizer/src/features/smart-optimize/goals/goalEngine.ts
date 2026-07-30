/**
 * Goals & Objectives Engine — Engine
 *
 * The core engine that manages goals, coordinates planning,
 * measurement, progress, conflicts, dependencies, and scheduling.
 */
import type {
  Goal,
  GoalMeasurementInput,
  GoalProgress,
  GoalConflict,
  GoalConfiguration,
  GoalAnalytics,
  GoalStatus,
  GoalProviderPlugin,
} from './types';
import { GoalPlanner } from './goalPlanner';
import { GoalDependencyEngine } from './goalDependencyEngine';
import { GoalScheduler } from './goalScheduler';
import { GoalHistory } from './goalHistory';
import { GoalAnalyticsEngine } from './goalAnalytics';
import { GoalValidator } from './goalValidator';
import { GoalRegistry } from './goalRegistry';

export class GoalEngine {
  private _config: GoalConfiguration;
  private _goals: Map<string, Goal> = new Map();
  private _planner: GoalPlanner;
  private _dependencyEngine: GoalDependencyEngine;
  private _scheduler: GoalScheduler;
  private _history: GoalHistory;
  private _analyticsEngine: GoalAnalyticsEngine;
  private _validator: GoalValidator;
  private _registry: GoalRegistry;

  constructor(config: GoalConfiguration) {
    this._config = config;
    this._planner = new GoalPlanner(config);
    this._dependencyEngine = new GoalDependencyEngine();
    this._scheduler = new GoalScheduler(config);
    this._history = new GoalHistory(config.maxHistoryEntries);
    this._analyticsEngine = new GoalAnalyticsEngine(config);
    this._validator = new GoalValidator(config);
    this._registry = new GoalRegistry();
  }

  add(goal: Goal): void {
    this._goals.set(goal.id, goal);
  }

  get(goalId: string): Goal | null {
    return this._goals.get(goalId) ?? null;
  }

  getAll(): Goal[] {
    return Array.from(this._goals.values());
  }

  getActiveGoals(): Goal[] {
    return this.getAll().filter((g) => g.status === 'started' || g.status === 'in_progress');
  }

  update(goalId: string, updates: Partial<Goal>): boolean {
    const goal = this._goals.get(goalId);
    if (!goal) return false;
    Object.assign(goal, updates, { updatedAt: new Date().toISOString() });
    return true;
  }

  remove(goalId: string): boolean {
    const result = this._goals.delete(goalId);
    if (result) {
      this._scheduler.unschedule(goalId);
      this._planner.progressEngine.clearForGoal(goalId);
    }
    return result;
  }

  setStatus(goalId: string, status: GoalStatus): boolean {
    const goal = this._goals.get(goalId);
    if (!goal) return false;
    const oldStatus = goal.status;
    goal.status = status;
    goal.updatedAt = new Date().toISOString();
    if (status === 'started' && !goal.startedAt) goal.startedAt = new Date().toISOString();
    if (status === 'completed') goal.completedAt = new Date().toISOString();
    this._history.record(goalId, status as never, `Status changed from ${oldStatus} to ${status}`, oldStatus, status);
    return true;
  }

  evaluate(goalId: string, input: GoalMeasurementInput): GoalProgress | null {
    const goal = this._goals.get(goalId);
    if (!goal) return null;
    const allGoals = this.getAll();
    const result = this._planner.plan(goal, input, allGoals);
    this._history.record(goalId, 'measured', `Measured: progress=${(result.progress.progress * 100).toFixed(1)}%`);
    return result.progress;
  }

  generateStrategy(goalId: string, input: GoalMeasurementInput): Goal['strategy'] | null {
    const goal = this._goals.get(goalId);
    if (!goal) return null;
    const strategy = this._planner.strategyEngine.generateStrategy(goal, input);
    goal.strategy = strategy;
    goal.updatedAt = new Date().toISOString();
    this._history.record(goalId, 'strategy_generated', `Strategy generated: ${strategy.steps.length} steps`);
    return strategy;
  }

  detectConflicts(): GoalConflict[] {
    return this._planner.conflictResolver.detectConflicts(this.getActiveGoals());
  }

  resolveConflict(conflict: GoalConflict): GoalConflict {
    return this._planner.conflictResolver.resolve(conflict, this._goals);
  }

  isGoalBlocked(goalId: string): boolean {
    const goal = this._goals.get(goalId);
    if (!goal) return false;
    return this._dependencyEngine.isBlocked(goal, this._goals);
  }

  canStart(goalId: string): boolean {
    const goal = this._goals.get(goalId);
    if (!goal) return false;
    return this._dependencyEngine.canStart(goal, this._goals);
  }

  schedule(goalId: string): boolean {
    const goal = this._goals.get(goalId);
    if (!goal) return false;
    this._scheduler.schedule(goal);
    return true;
  }

  getAnalytics(): GoalAnalytics {
    return this._analyticsEngine.compute(this.getAll());
  }

  getHistory(goalId?: string) {
    if (goalId) return this._history.getByGoal(goalId);
    return this._history.getAll();
  }

  registerProvider(plugin: GoalProviderPlugin): boolean {
    this._registry.register(plugin);
    this._planner.strategyEngine.registerProvider(plugin);
    this._planner.measurementEngine.registerProvider(plugin);
    return true;
  }

  clear(): void {
    this._goals.clear();
    this._scheduler.clear();
    this._history.clear();
    this._planner.progressEngine.clear();
    this._registry.clear();
  }

  get config(): GoalConfiguration { return this._config; }
  get planner(): GoalPlanner { return this._planner; }
  get dependencyEngine(): GoalDependencyEngine { return this._dependencyEngine; }
  get scheduler(): GoalScheduler { return this._scheduler; }
  get history(): GoalHistory { return this._history; }
  get validator(): GoalValidator { return this._validator; }
  get registry(): GoalRegistry { return this._registry; }
  get count(): number { return this._goals.size; }
}
