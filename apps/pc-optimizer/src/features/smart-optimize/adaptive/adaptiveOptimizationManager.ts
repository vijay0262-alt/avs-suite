/**
 * Adaptive Optimization Manager — top-level orchestrator.
 *
 * Public APIs:
 *   adaptPlan()
 *   evaluateConditions()
 *   getAdaptivePlan()
 *   getAdaptiveHistory()
 *   registerCondition()
 *   registerPolicy()
 *   validateAdaptation()
 *   getAdaptiveStatistics()
 *   on() / off()
 */
import type {
  SmartPlan,
  SystemState,
  AdaptationResult,
  Condition,
  ConditionRule,
  AdaptivePolicy,
  AdaptationValidationResult,
  AdaptiveStatistics,
  AdaptiveConfiguration,
  AdaptiveEventType,
  AdaptiveEventListener,
  AdaptiveHistoryEntry,
  ConditionProviderPlugin,
  PolicyProviderPlugin,
  AdaptiveUserPreferences,
  RiskLevel,
  OptimizationGoal,
} from './types';
import { AdaptivePlanner } from './adaptivePlanner';
import { AdaptiveEvents } from './adaptiveEvents';
import { AdaptiveHistory } from './adaptiveHistory';
import { AdaptiveStateMonitor } from './adaptiveStateMonitor';
import { createAdaptiveConfiguration, type DeepPartial } from './adaptiveConfiguration';

export class AdaptiveOptimizationManager {
  private _config: AdaptiveConfiguration;
  private _planner: AdaptivePlanner;
  private _events: AdaptiveEvents;
  private _history: AdaptiveHistory;
  private _monitor: AdaptiveStateMonitor;
  private _results: Map<string, AdaptationResult> = new Map();

  constructor(config?: AdaptiveConfiguration | DeepPartial<AdaptiveConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as AdaptiveConfiguration;
    } else {
      this._config = createAdaptiveConfiguration(config as DeepPartial<AdaptiveConfiguration>);
    }
    this._planner = new AdaptivePlanner(this._config);
    this._events = new AdaptiveEvents();
    this._history = new AdaptiveHistory(this._config.maxHistoryEntries);
    this._monitor = new AdaptiveStateMonitor(this._config);
  }

  adaptPlan(
    plan: SmartPlan,
    state: SystemState,
    options?: {
      goal?: OptimizationGoal;
      deviceProfileType?: string;
      riskTolerance?: RiskLevel;
      userPreferences?: AdaptiveUserPreferences | null;
      historicalOutcomes?: AdaptiveHistoryEntry[];
    },
  ): AdaptationResult {
    if (this._config.enableEvents) {
      this._events.emitStarted(plan.id, { state });
    }

    const result = this._planner.adapt(plan, state, options);
    this._results.set(plan.id, result);

    if (this._config.enableEvents) {
      for (const condition of result.conditions) {
        this._events.emitConditionDetected(plan.id, { condition: condition.name, severity: condition.severity });
      }

      if (result.adapted) {
        this._events.emitPlanModified(plan.id, { decisions: result.decisions.length });
      }

      for (const decision of result.decisions) {
        this._history.record(plan.id, decision.decision, decision.conditionType, decision.confidence);

        if (decision.decision === 'pause_plan') {
          this._events.emitPlanPaused(plan.id, { reason: decision.reason });
        } else if (decision.decision === 'resume_plan') {
          this._events.emitPlanResumed(plan.id, { reason: decision.reason });
        } else if (decision.decision === 'cancel_plan') {
          this._events.emitPlanCancelled(plan.id, { reason: decision.reason });
        }
      }

      this._events.emitCompleted(plan.id, { adapted: result.adapted, summary: result.summary });
    } else {
      for (const decision of result.decisions) {
        this._history.record(plan.id, decision.decision, decision.conditionType, decision.confidence);
      }
    }

    return result;
  }

  evaluateConditions(state: SystemState): Condition[] {
    return this._planner.evaluateConditions(state);
  }

  getAdaptivePlan(planId: string): AdaptationResult | undefined {
    return this._results.get(planId);
  }

  getAdaptiveHistory(): AdaptiveHistoryEntry[] {
    return this._history.getAll();
  }

  registerCondition(rule: ConditionRule): boolean {
    return this._planner.registry.registerConditionRule(rule);
  }

  registerPolicy(policy: AdaptivePolicy): boolean {
    return this._planner.registry.registerPolicy(policy);
  }

  validateAdaptation(result: AdaptationResult): AdaptationValidationResult {
    return this._planner.validateAdaptation(result);
  }

  getAdaptiveStatistics(): AdaptiveStatistics {
    const entries = this._history.getAll();
    const byAction: Record<string, number> = {};
    const byConditionType: Record<string, number> = {};
    let totalConfidence = 0;
    const totalDelay = 0;
    let plansPaused = 0;
    let plansResumed = 0;
    let plansCancelled = 0;

    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
      byConditionType[entry.conditionType] = (byConditionType[entry.conditionType] ?? 0) + 1;
      totalConfidence += entry.confidence;
      if (entry.action === 'pause_plan') plansPaused++;
      if (entry.action === 'resume_plan') plansResumed++;
      if (entry.action === 'cancel_plan') plansCancelled++;
    }

    const count = entries.length || 1;
    const lastEntry = entries.length > 0 ? entries[entries.length - 1]! : null;

    return {
      totalAdaptations: entries.length,
      totalConditionsDetected: this._results.size,
      byAction,
      byConditionType,
      averageConfidence: entries.length > 0 ? totalConfidence / entries.length : 0,
      averageDelay: totalDelay / count,
      plansPaused,
      plansResumed,
      plansCancelled,
      lastAdaptationAt: lastEntry?.timestamp ?? null,
    };
  }

  registerConditionPlugin(plugin: ConditionProviderPlugin): void {
    this._planner.registry.registerConditionPlugin(plugin);
  }

  registerPolicyPlugin(plugin: PolicyProviderPlugin): void {
    this._planner.registry.registerPolicyPlugin(plugin);
    this._planner.registry.loadPlugins();
  }

  updateState(state: Partial<SystemState>): SystemState {
    return this._monitor.update(state);
  }

  getState(): SystemState {
    return this._monitor.getState();
  }

  on(event: AdaptiveEventType, listener: AdaptiveEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: AdaptiveEventType, listener: AdaptiveEventListener): void {
    this._events.off(event, listener);
  }

  get config(): AdaptiveConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<AdaptiveConfiguration>): void {
    this._config = createAdaptiveConfiguration(overrides);
  }

  clear(): void {
    this._results.clear();
    this._history.clear();
    this._events.clear();
    this._monitor.reset();
  }
}
