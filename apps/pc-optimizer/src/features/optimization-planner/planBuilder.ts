/**
 * Plan Builder — converts Recommendations into transparent Optimization Plans.
 *
 * Pipeline:
 *   Recommendations → Filter → Risk Analysis → Benefit Estimation →
 *   Execution Planning → Optimization Plan
 *
 * NEVER executes optimizations. Creates plans only.
 */
import type {
  Recommendation,
  RecommendationCategory,
} from '../ai-intelligence/recommendations/types';
import type {
  OptimizationPlanV2,
  OptimizationPlanType,
  PlanStep,
  PlanBuilderInput,
  PlanConfiguration,
  PlanUserPreferences,
} from './types';
import {
  generatePlanId,
  generateStepId,
  getPlanTypeLabel,
  riskToPlanRisk,
  createDefaultPlanUserPreferences,
} from './types';
import { PlanEstimator } from './planEstimator';

const PLAN_TYPE_CATEGORIES: Record<OptimizationPlanType, RecommendationCategory[] | '*'> = {
  quick_optimize: ['storage', 'maintenance'],
  performance_boost: ['performance', 'startup'],
  storage_recovery: ['storage'],
  privacy_cleanup: ['privacy', 'browser'],
  startup_optimization: ['startup'],
  maintenance: ['maintenance', 'windows'],
  health_recovery: ['health', 'performance'],
  deep_optimization: '*',
  custom_plan: '*',
  future_plan: '*',
};

const PRIORITY_WEIGHTS: Record<string, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  informational: 10,
};

export class PlanBuilder {
  private _estimator: PlanEstimator;
  private _config: PlanConfiguration;

  constructor(config: PlanConfiguration) {
    this._config = config;
    this._estimator = new PlanEstimator(config);
  }

  updateConfig(config: PlanConfiguration): void {
    this._config = config;
    this._estimator = new PlanEstimator(config);
  }

  build(input: PlanBuilderInput): OptimizationPlanV2 {
    const startTime = performance.now();
    const prefs = { ...createDefaultPlanUserPreferences(), ...input.userPreferences };

    let filtered = this._filterRecommendations(input.recommendations, input.planType, prefs);

    if (input.planType === 'custom_plan' && input.customRecommendationIds) {
      const idSet = new Set(input.customRecommendationIds);
      filtered = filtered.filter((r) => idSet.has(r.id));
    }

    filtered = this._sortRecommendations(filtered, prefs);
    filtered = filtered.slice(0, this._config.maxStepsPerPlan);

    const steps = this._buildSteps(filtered);
    const estimate = this._estimator.estimate(filtered);
    const recommendedOrder = this._computeOrder(steps);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this._config.planExpiryMinutes * 60 * 1000);

    const plan: OptimizationPlanV2 = {
      id: generatePlanId(input.planType),
      title: getPlanTypeLabel(input.planType),
      description: this._buildDescription(input.planType, filtered.length, estimate.estimatedHealthGain),
      summary: this._buildSummary(input.planType, filtered.length, estimate),
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      planType: input.planType,
      estimatedDuration: estimate.estimatedDuration,
      estimatedHealthGain: estimate.estimatedHealthGain,
      estimatedStorageRecovery: estimate.estimatedStorageRecovery,
      estimatedPerformanceGain: estimate.estimatedPerformanceGain,
      estimatedPrivacyGain: estimate.estimatedPrivacyGain,
      estimatedStartupGain: estimate.estimatedStartupGain,
      estimatedRisk: estimate.estimatedRisk,
      confidenceScore: estimate.confidenceScore,
      rollbackAvailable: estimate.rollbackAvailable,
      requiresConfirmation: this._requiresConfirmation(input.planType, estimate.estimatedRisk),
      recommendedOrder,
      steps,
      relatedRecommendations: filtered.map((r) => r.id),
      futureMetadata: {},
    };

    void startTime;
    return plan;
  }

  private _filterRecommendations(
    recs: Recommendation[],
    planType: OptimizationPlanType,
    prefs: PlanUserPreferences,
  ): Recommendation[] {
    const categories = PLAN_TYPE_CATEGORIES[planType];
    let filtered = categories === '*'
      ? [...recs]
      : recs.filter((r) => categories.includes(r.category));

    if (prefs.avoidHighRisk) {
      filtered = filtered.filter((r) => r.safety.riskLevel !== 'high' && r.safety.riskLevel !== 'critical');
    }

    if (prefs.maxDurationSeconds > 0) {
      let totalDuration = 0;
      filtered = filtered.filter((r) => {
        totalDuration += r.benefits.estimatedTime;
        return totalDuration <= prefs.maxDurationSeconds;
      });
    }

    if (prefs.prioritizePrivacy) {
      filtered = filtered.sort((a, b) => {
        const aPriv = a.category === 'privacy' ? 0 : 1;
        const bPriv = b.category === 'privacy' ? 0 : 1;
        return aPriv - bPriv;
      });
    }

    if (prefs.prioritizeStorage) {
      filtered = filtered.sort((a, b) => {
        const aStorage = a.category === 'storage' ? 0 : 1;
        const bStorage = b.category === 'storage' ? 0 : 1;
        return aStorage - bStorage;
      });
    }

    return filtered;
  }

  private _sortRecommendations(
    recs: Recommendation[],
    _prefs: PlanUserPreferences,
  ): Recommendation[] {
    const sortBy = this._config.orderingRules.prioritizeBy;
    const sorted = [...recs];

    if (sortBy === 'priority') {
      sorted.sort((a, b) => (PRIORITY_WEIGHTS[b.priority] ?? 0) - (PRIORITY_WEIGHTS[a.priority] ?? 0));
    } else if (sortBy === 'benefit') {
      sorted.sort((a, b) => (b.benefits.estimatedHealthIncrease ?? 0) - (a.benefits.estimatedHealthIncrease ?? 0));
    } else if (sortBy === 'risk') {
      sorted.sort((a, b) => {
        const aRisk = riskToPlanRisk(a.safety.riskLevel);
        const bRisk = riskToPlanRisk(b.safety.riskLevel);
        const weights: Record<string, number> = { none: 0, very_low: 10, low: 25, medium: 50, high: 75, critical: 100 };
        return (weights[aRisk] ?? 50) - (weights[bRisk] ?? 50);
      });
    } else if (sortBy === 'duration') {
      sorted.sort((a, b) => a.benefits.estimatedTime - b.benefits.estimatedTime);
    }

    if (this._config.orderingRules.criticalFirst) {
      sorted.sort((a, b) => {
        const aCritical = a.priority === 'critical' ? 0 : 1;
        const bCritical = b.priority === 'critical' ? 0 : 1;
        return aCritical - bCritical;
      });
    }

    return sorted;
  }

  private _buildSteps(recs: Recommendation[]): PlanStep[] {
    return recs.map((rec, index) => {
      const stepEst = this._estimator.estimateStep(rec);
      return {
        id: generateStepId(index),
        title: rec.title,
        description: rec.description,
        category: rec.category,
        estimatedDuration: stepEst.estimatedDuration,
        estimatedBenefit: stepEst.estimatedBenefit,
        riskLevel: stepEst.riskLevel,
        rollbackAvailable: stepEst.rollbackAvailable,
        rollbackMethod: stepEst.rollbackMethod,
        rollbackConfidence: stepEst.rollbackConfidence,
        estimatedRollbackTime: stepEst.estimatedRollbackTime,
        relatedRecommendation: rec.id,
        confidence: stepEst.confidence,
        status: 'pending' as const,
        priority: rec.priority,
        futureMetadata: {},
      };
    });
  }

  private _computeOrder(steps: PlanStep[]): string[] {
    if (this._config.orderingRules.groupByCategory) {
      const byCategory = new Map<string, PlanStep[]>();
      for (const step of steps) {
        let arr = byCategory.get(step.category);
        if (!arr) { arr = []; byCategory.set(step.category, arr); }
        arr.push(step);
      }
      return Array.from(byCategory.values()).flat().map((s) => s.id);
    }
    return steps.map((s) => s.id);
  }

  private _buildDescription(planType: OptimizationPlanType, stepCount: number, healthGain: number): string {
    return `${getPlanTypeLabel(planType)} plan with ${stepCount} optimization step${stepCount !== 1 ? 's' : ''}. Estimated health improvement: +${healthGain} points.`;
  }

  private _buildSummary(planType: OptimizationPlanType, stepCount: number, estimate: { estimatedDuration: number; estimatedHealthGain: number; estimatedRisk: string }): string {
    const minutes = Math.floor(estimate.estimatedDuration / 60);
    const seconds = estimate.estimatedDuration % 60;
    const duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    return `${getPlanTypeLabel(planType)}: ${stepCount} steps, ~${duration}, Health +${estimate.estimatedHealthGain}, Risk: ${estimate.estimatedRisk}`;
  }

  private _requiresConfirmation(planType: OptimizationPlanType, risk: string): boolean {
    if (planType === 'deep_optimization') return true;
    if (risk === 'high' || risk === 'critical') return true;
    return false;
  }
}
