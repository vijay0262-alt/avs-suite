/**
 * Optimization Plan Manager — top-level orchestrator for the Plan Engine.
 *
 * Public APIs:
 *   buildPlan()
 *   buildPlans()
 *   getPlan()
 *   getPlans()
 *   comparePlans()
 *   validatePlan()
 *   getPlanStatistics()
 *
 * Architecture:
 *   Recommendations → Plan Builder → Risk Analysis → Benefit Estimation →
 *   Execution Planning → Optimization Plan → Future Consumers
 */
import type {
  Recommendation,
} from '../ai-intelligence/recommendations/types';
import type {
  OptimizationPlanV2,
  OptimizationPlanType,
  PlanBuilderInput,
  PlanComparison,
  PlanComparisonEntry,
  PlanValidationResult,
  PlanStatistics,
  PlanConfiguration,
  PlanEventType,
  PlanEventListener,
  PlanUserPreferences,
} from './types';
import { PlanRegistry } from './planRegistry';
import { PlanBuilder } from './planBuilder';
import { PlanEstimator } from './planEstimator';
import { PlanScorer } from './planScorer';
import { PlanAnalyzer } from './planAnalyzer';
import { PlanValidator } from './planValidator';
import { PlanHistory } from './planHistory';
import { PlanEvents } from './planEvents';
import { createPlanConfiguration, type DeepPartial, isPlanTypeEnabled } from './planConfiguration';

export class OptimizationPlanManager {
  private _config: PlanConfiguration;
  private _registry: PlanRegistry;
  private _builder: PlanBuilder;
  private _estimator: PlanEstimator;
  private _scorer: PlanScorer;
  private _analyzer: PlanAnalyzer;
  private _validator: PlanValidator;
  private _history: PlanHistory;
  private _events: PlanEvents;

  constructor(config?: PlanConfiguration | DeepPartial<PlanConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as PlanConfiguration;
    } else {
      this._config = createPlanConfiguration(config as DeepPartial<PlanConfiguration>);
    }

    this._registry = new PlanRegistry();
    this._builder = new PlanBuilder(this._config);
    this._estimator = new PlanEstimator(this._config);
    this._scorer = new PlanScorer(this._config);
    this._analyzer = new PlanAnalyzer(this._config);
    this._validator = new PlanValidator(this._config);
    this._history = new PlanHistory();
    this._events = new PlanEvents();
  }

  // ── Public APIs ─────────────────────────────────────────────

  buildPlan(
    recommendations: Recommendation[],
    planType: OptimizationPlanType,
    options?: {
      customRecommendationIds?: string[];
      userPreferences?: PlanUserPreferences;
    },
  ): OptimizationPlanV2 {
    if (!isPlanTypeEnabled(this._config, planType)) {
      throw new Error(`Plan type '${planType}' is disabled by feature flag`);
    }

    const input: PlanBuilderInput = {
      recommendations,
      planType,
      customRecommendationIds: options?.customRecommendationIds,
      userPreferences: options?.userPreferences,
    };

    const plan = this._builder.build(input);
    this._registry.register(plan);

    if (this._config.enableEvents) {
      this._events.emitGenerated(plan.id, { plan });
    }
    this._history.record(plan.id, plan.planType, 'generated', { stepCount: plan.steps.length });

    return plan;
  }

  buildPlans(
    recommendations: Recommendation[],
    planTypes?: OptimizationPlanType[],
  ): OptimizationPlanV2[] {
    const types = planTypes ?? this._getEnabledPlanTypes();
    const plans: OptimizationPlanV2[] = [];

    for (const planType of types) {
      if (!isPlanTypeEnabled(this._config, planType)) continue;
      try {
        const plan = this.buildPlan(recommendations, planType);
        plans.push(plan);
      } catch (err) {
        console.error(`[PlanManager] Failed to build ${planType}:`, err);
      }
    }

    return plans;
  }

  getPlan(planId: string): OptimizationPlanV2 | undefined {
    return this._registry.get(planId);
  }

  getPlans(planType?: OptimizationPlanType): OptimizationPlanV2[] {
    if (planType) return this._registry.getByType(planType);
    return this._registry.getAll();
  }

  comparePlans(planIds: string[]): PlanComparison {
    const plans = planIds
      .map((id) => this._registry.get(id))
      .filter((p): p is OptimizationPlanV2 => p !== undefined);

    const entries: PlanComparisonEntry[] = plans.map((p) => ({
      planId: p.id,
      planType: p.planType,
      title: p.title,
      estimatedDuration: p.estimatedDuration,
      estimatedHealthGain: p.estimatedHealthGain,
      estimatedRisk: p.estimatedRisk,
      stepCount: p.steps.length,
      rollbackAvailable: p.rollbackAvailable,
      confidenceScore: p.confidenceScore,
    }));

    const bestForHealth = entries.length > 0
      ? entries.reduce((best, e) => e.estimatedHealthGain > best.estimatedHealthGain ? e : best).planId
      : null;
    const bestForSpeed = entries.length > 0
      ? entries.reduce((best, e) => e.estimatedDuration < best.estimatedDuration ? e : best).planId
      : null;
    const bestForSafety = entries.length > 0
      ? this._findSafest(entries) : null;
    const bestForStorage = entries.length > 0
      ? plans.reduce((best, p) => (p.estimatedStorageRecovery > (this._registry.get(best)?.estimatedStorageRecovery ?? -1) ? p.id : best), plans[0]?.id ?? '')
      : null;

    if (this._config.enableEvents && entries.length > 0 && entries[0]) {
      this._events.emitCompared(entries[0].planId, { entries });
    }

    return {
      plans: entries,
      bestForHealth,
      bestForSpeed,
      bestForSafety,
      bestForStorage,
    };
  }

  validatePlan(planId: string): PlanValidationResult {
    const plan = this._registry.get(planId);
    if (!plan) {
      return { valid: false, errors: [`Plan not found: ${planId}`], warnings: [] };
    }
    const result = this._validator.validate(plan);
    if (this._config.enableEvents) {
      this._events.emitValidated(planId, { result });
    }
    this._history.record(planId, plan.planType, 'validated', { valid: result.valid });
    return result;
  }

  getPlanStatistics(): PlanStatistics {
    const all = this._registry.getAll();
    const byType: Record<string, number> = {};
    const byRisk: Record<string, number> = {};
    let totalDuration = 0;
    let totalHealthGain = 0;
    let totalConfidence = 0;
    let totalSteps = 0;

    for (const plan of all) {
      byType[plan.planType] = (byType[plan.planType] ?? 0) + 1;
      byRisk[plan.estimatedRisk] = (byRisk[plan.estimatedRisk] ?? 0) + 1;
      totalDuration += plan.estimatedDuration;
      totalHealthGain += plan.estimatedHealthGain;
      totalConfidence += plan.confidenceScore;
      totalSteps += plan.steps.length;
    }

    const count = all.length || 1;

    return {
      totalPlans: all.length,
      byType,
      byRisk,
      averageDuration: totalDuration / count,
      averageHealthGain: totalHealthGain / count,
      averageConfidence: totalConfidence / count,
      totalSteps,
    };
  }

  selectPlan(planId: string): boolean {
    const plan = this._registry.get(planId);
    if (!plan) return false;
    if (this._config.enableEvents) {
      this._events.emitSelected(planId, { plan });
    }
    this._history.record(planId, plan.planType, 'selected');
    return true;
  }

  // ── Events ──────────────────────────────────────────────────

  on(event: PlanEventType, listener: PlanEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: PlanEventType, listener: PlanEventListener): void {
    this._events.off(event, listener);
  }

  // ── Analysis ────────────────────────────────────────────────

  analyzePlan(planId: string) {
    const plan = this._registry.get(planId);
    if (!plan) return null;
    return this._analyzer.analyze(plan);
  }

  scorePlan(planId: string) {
    const plan = this._registry.get(planId);
    if (!plan) return null;
    return this._scorer.score(plan);
  }

  // ── Configuration ───────────────────────────────────────────

  get config(): PlanConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<PlanConfiguration>): void {
    this._config = createPlanConfiguration(overrides);
    this._builder.updateConfig(this._config);
    this._estimator.updateConfig(this._config);
    this._scorer.updateConfig(this._config);
    this._analyzer.updateConfig(this._config);
    this._validator.updateConfig(this._config);
  }

  // ── Utility ─────────────────────────────────────────────────

  get registry(): PlanRegistry {
    return this._registry;
  }

  get history(): PlanHistory {
    return this._history;
  }

  clear(): void {
    this._registry.clear();
    this._history.clear();
    this._events.clear();
  }

  // ── Private ─────────────────────────────────────────────────

  private _getEnabledPlanTypes(): OptimizationPlanType[] {
    const all: OptimizationPlanType[] = [
      'quick_optimize', 'performance_boost', 'storage_recovery',
      'privacy_cleanup', 'startup_optimization', 'maintenance',
      'health_recovery', 'deep_optimization',
    ];
    return all.filter((t) => isPlanTypeEnabled(this._config, t));
  }

  private _findSafest(entries: PlanComparisonEntry[]): string | null {
    const riskWeights: Record<string, number> = { none: 0, very_low: 10, low: 25, medium: 50, high: 75, critical: 100 };
    let safest = entries[0];
    if (!safest) return null;
    for (const e of entries) {
      if ((riskWeights[e.estimatedRisk] ?? 50) < (riskWeights[safest.estimatedRisk] ?? 50)) {
        safest = e;
      }
    }
    return safest?.planId ?? null;
  }
}
