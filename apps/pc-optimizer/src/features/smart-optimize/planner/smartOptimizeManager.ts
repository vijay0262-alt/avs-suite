/**
 * Smart Optimize Manager — top-level orchestrator.
 *
 * Public APIs:
 *   generateSmartPlan()
 *   generatePlans()
 *   getSmartPlan()
 *   comparePlans()
 *   validatePlan()
 *   getPlannerStatistics()
 *   on() / off()
 */
import type {
  SmartPlan,
  PlanningContext,
  PlannerConfiguration,
  OptimizationGoal,
  SmartPlanComparison,
  PlannerEventType,
  PlannerEventListener,
  PlanValidationResult,
  PlanValidationError,
  PlanValidationWarning,
  PlannerHistoryEntry,
  PlannerStatistics,
} from './types';
import { generateComparisonId, generatePlannerHistoryId, riskToScore } from './types';
import { OptimizationPlanner } from './optimizationPlanner';
import { OptimizationPlannerEvents } from './optimizationPlannerEvents';
import { createPlannerConfiguration, type DeepPartial } from './optimizationPlannerConfiguration';

export class SmartOptimizeManager {
  private _config: PlannerConfiguration;
  private _planner: OptimizationPlanner;
  private _events: OptimizationPlannerEvents;
  private _plans: Map<string, SmartPlan> = new Map();
  private _history: PlannerHistoryEntry[] = [];
  private _comparisons: Map<string, SmartPlanComparison> = new Map();

  constructor(config?: PlannerConfiguration | DeepPartial<PlannerConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as PlannerConfiguration;
    } else {
      this._config = createPlannerConfiguration(config as DeepPartial<PlannerConfiguration>);
    }
    this._planner = new OptimizationPlanner(this._config);
    this._events = new OptimizationPlannerEvents();
  }

  generateSmartPlan(goal: OptimizationGoal, context: PlanningContext): SmartPlan {
    const plan = this._planner.plan(goal, context);
    this._plans.set(plan.id, plan);

    if (this._config.enableEvents) {
      this._events.emitStrategySelected(plan.id, { strategy: plan.strategy });
      this._events.emitGenerated(plan.id, { goal, actionCount: plan.recommendedActions.length });
    }
    this._recordHistory(plan.id, 'generated', { goal, strategy: plan.strategy });

    return plan;
  }

  generatePlans(goals: OptimizationGoal[], context: PlanningContext): SmartPlan[] {
    return goals.map((goal) => this.generateSmartPlan(goal, context));
  }

  getSmartPlan(planId: string): SmartPlan | undefined {
    return this._plans.get(planId);
  }

  getPlans(): SmartPlan[] {
    return Array.from(this._plans.values());
  }

  comparePlans(planAId: string, planBId: string): SmartPlanComparison | null {
    const planA = this._plans.get(planAId);
    const planB = this._plans.get(planBId);
    if (!planA || !planB) return null;

    const healthDelta = planA.estimatedBenefits.estimatedHealthGain - planB.estimatedBenefits.estimatedHealthGain;
    const storageDelta = planA.estimatedBenefits.estimatedStorageRecovery - planB.estimatedBenefits.estimatedStorageRecovery;
    const performanceDelta = planA.estimatedBenefits.estimatedPerformanceGain - planB.estimatedBenefits.estimatedPerformanceGain;
    const privacyDelta = planA.estimatedBenefits.estimatedPrivacyGain - planB.estimatedBenefits.estimatedPrivacyGain;
    const durationDelta = planA.estimatedDuration - planB.estimatedDuration;
    const confidenceDelta = planA.confidence - planB.confidence;
    const riskDeltaA = riskToScore(planA.estimatedRisk);
    const riskDeltaB = riskToScore(planB.estimatedRisk);
    const riskDelta = riskDeltaA > riskDeltaB ? `${planA.estimatedRisk} > ${planB.estimatedRisk}` : riskDeltaA < riskDeltaB ? `${planA.estimatedRisk} < ${planB.estimatedRisk}` : 'equal';

    const winner = this._determineWinner(healthDelta, storageDelta, performanceDelta, privacyDelta, durationDelta, confidenceDelta);
    const summary = this._generateComparisonSummary(planA, planB, healthDelta, storageDelta);

    const comparison: SmartPlanComparison = {
      id: generateComparisonId(),
      planAId,
      planBId,
      generatedAt: new Date().toISOString(),
      healthDelta,
      storageDelta,
      performanceDelta,
      privacyDelta,
      durationDelta,
      riskDelta,
      confidenceDelta,
      summary,
      winner,
    };

    this._comparisons.set(comparison.id, comparison);

    if (this._config.enableEvents) {
      this._events.emitCompared(planAId, { planBId, comparisonId: comparison.id });
    }
    this._recordHistory(planAId, 'compared', { planBId, comparisonId: comparison.id });

    return comparison;
  }

  validatePlan(planId: string): PlanValidationResult | null {
    const plan = this._plans.get(planId);
    if (!plan) return null;

    const errors: PlanValidationError[] = [];
    const warnings: PlanValidationWarning[] = [];

    if (plan.recommendedActions.length === 0) {
      errors.push({ code: 'NO_ACTIONS', message: 'Plan has no recommended actions' });
    }
    if (plan.estimatedDuration <= 0) {
      errors.push({ code: 'INVALID_DURATION', message: 'Estimated duration must be positive' });
    }
    if (plan.confidence < 0 || plan.confidence > 1) {
      errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence must be between 0 and 1' });
    }
    if (plan.expiresAt < new Date().toISOString()) {
      warnings.push({ code: 'PLAN_EXPIRED', message: 'Plan has expired' });
    }
    if (plan.safetyAssessment.unsafeActions.length > 0) {
      warnings.push({ code: 'UNSAFE_ACTIONS', message: `${plan.safetyAssessment.unsafeActions.length} unsafe action(s) detected` });
    }
    if (plan.eligibilityResult.ineligibleActions.length > 0) {
      warnings.push({ code: 'INELIGIBLE_ACTIONS', message: `${plan.eligibilityResult.ineligibleActions.length} ineligible action(s)` });
    }

    const result: PlanValidationResult = { valid: errors.length === 0, errors, warnings };

    if (this._config.enableEvents) {
      if (result.valid) {
        this._events.emitValidated(planId, { valid: true });
      } else {
        this._events.emitRejected(planId, { errors: errors.length });
      }
    }
    this._recordHistory(planId, result.valid ? 'validated' : 'rejected', { valid: result.valid });

    return result;
  }

  getPlannerStatistics(): PlannerStatistics {
    const all = this.getPlans();
    const byGoal: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    let totalDuration = 0;
    let totalConfidence = 0;
    let totalRiskScore = 0;
    let totalActionsRecommended = 0;
    let totalActionsDeferred = 0;
    let totalActionsExcluded = 0;

    for (const plan of all) {
      byGoal[plan.optimizationGoal] = (byGoal[plan.optimizationGoal] ?? 0) + 1;
      byStrategy[plan.strategy] = (byStrategy[plan.strategy] ?? 0) + 1;
      totalDuration += plan.estimatedDuration;
      totalConfidence += plan.confidence;
      totalRiskScore += riskToScore(plan.estimatedRisk);
      totalActionsRecommended += plan.recommendedActions.length;
      totalActionsDeferred += plan.deferredActions.length;
      totalActionsExcluded += plan.excludedActions.length;
    }

    const count = all.length || 1;

    return {
      totalPlans: all.length,
      byGoal,
      byStrategy,
      averageDuration: totalDuration / count,
      averageConfidence: all.length > 0 ? totalConfidence / all.length : 0,
      averageRiskScore: all.length > 0 ? totalRiskScore / all.length : 0,
      totalActionsRecommended,
      totalActionsDeferred,
      totalActionsExcluded,
    };
  }

  on(event: PlannerEventType, listener: PlannerEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: PlannerEventType, listener: PlannerEventListener): void {
    this._events.off(event, listener);
  }

  get config(): PlannerConfiguration {
    return this._config;
  }

  updateConfig(overrides: DeepPartial<PlannerConfiguration>): void {
    this._config = createPlannerConfiguration(overrides);
    this._planner.updateConfig(this._config);
  }

  get history(): PlannerHistoryEntry[] {
    return [...this._history];
  }

  get comparisons(): SmartPlanComparison[] {
    return Array.from(this._comparisons.values());
  }

  clear(): void {
    this._plans.clear();
    this._comparisons.clear();
    this._history = [];
    this._events.clear();
  }

  private _determineWinner(
    healthDelta: number,
    storageDelta: number,
    performanceDelta: number,
    privacyDelta: number,
    durationDelta: number,
    confidenceDelta: number,
  ): 'a' | 'b' | 'tie' {
    let scoreA = 0;
    let scoreB = 0;
    if (healthDelta > 0) scoreA++; else if (healthDelta < 0) scoreB++;
    if (storageDelta > 0) scoreA++; else if (storageDelta < 0) scoreB++;
    if (performanceDelta > 0) scoreA++; else if (performanceDelta < 0) scoreB++;
    if (privacyDelta > 0) scoreA++; else if (privacyDelta < 0) scoreB++;
    if (durationDelta < 0) scoreA++; else if (durationDelta > 0) scoreB++;
    if (confidenceDelta > 0) scoreA++; else if (confidenceDelta < 0) scoreB++;
    if (scoreA > scoreB) return 'a';
    if (scoreB > scoreA) return 'b';
    return 'tie';
  }

  private _generateComparisonSummary(
    planA: SmartPlan,
    planB: SmartPlan,
    healthDelta: number,
    storageDelta: number,
  ): string {
    const parts: string[] = [];
    parts.push(`Comparing "${planA.title}" vs "${planB.title}".`);
    if (healthDelta !== 0) {
      parts.push(`Health gain difference: ${healthDelta > 0 ? '+' : ''}${healthDelta}.`);
    }
    if (storageDelta !== 0) {
      parts.push(`Storage difference: ${Math.abs(storageDelta)} ${storageDelta > 0 ? 'more' : 'less'} in plan A.`);
    }
    return parts.join(' ');
  }

  private _recordHistory(planId: string, action: string, metadata: Record<string, unknown> = {}): void {
    this._history.push({
      id: generatePlannerHistoryId(),
      planId,
      action,
      timestamp: new Date().toISOString(),
      metadata,
    });
    if (this._history.length > this._config.maxHistoryEntries) {
      this._history = this._history.slice(-this._config.maxHistoryEntries);
    }
  }
}
