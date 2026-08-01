/**
 * OptimizationPlanner — generates a complete, prioritized optimization plan.
 *
 * Orchestrates: recommendation generation, conflict resolution, dependency
 * resolution, prioritization, scoring, and plan assembly.
 *
 * The plan is evidence-based, explainable, and every action has measurable
 * benefit estimates and rollback availability.
 */
import type {
  SourceFinding,
  OptimizationAction,
  OptimizationPlan,
  OptimizationConfiguration,
  OptimizationBenefits,
  RiskLevel,
  SourceModuleId,
  OptimizationImpactTier,
} from './types';
import { mergeBenefits, emptyBenefits } from './types';
import { OptimizationRecommendationEngine } from './OptimizationRecommendationEngine';
import { OptimizationConflictResolver } from './OptimizationConflictResolver';
import { OptimizationDependencyResolver } from './OptimizationDependencyResolver';
import { OptimizationPrioritizer } from './OptimizationPrioritizer';
import { OptimizationScorer } from './OptimizationScorer';
import type { OptimizationLearningData } from './types';

export class OptimizationPlanner {
  private recommendationEngine: OptimizationRecommendationEngine;
  private conflictResolver: OptimizationConflictResolver;
  private dependencyResolver: OptimizationDependencyResolver;
  private prioritizer: OptimizationPrioritizer;
  private scorer: OptimizationScorer;

  constructor(
    private config: OptimizationConfiguration,
    learning: OptimizationLearningData,
  ) {
    this.recommendationEngine = new OptimizationRecommendationEngine(config);
    this.conflictResolver = new OptimizationConflictResolver();
    this.dependencyResolver = new OptimizationDependencyResolver();
    this.prioritizer = new OptimizationPrioritizer(config);
    this.scorer = new OptimizationScorer(config, learning);
  }

  plan(
    findings: SourceFinding[],
    currentHealthScore: number,
  ): OptimizationPlan {
    // Step 1: Generate recommendations from findings
    let actions = this.recommendationEngine.generateRecommendations(findings);

    // Step 2: Filter by excluded categories
    actions = actions.filter((a) => !this.config.excludedCategories.includes(a.category));

    // Step 3: Filter by confidence threshold
    actions = actions.filter((a) => a.confidence >= this.config.minConfidence);

    // Step 4: Resolve conflicts
    const conflictResolution = this.conflictResolver.resolve(actions);
    const removeIds = new Set(this.conflictResolver.getActionIdsToRemove(conflictResolution));
    actions = actions.filter((a) => !removeIds.has(a.id));

    // Step 5: Resolve dependencies and compute execution order
    const dependencyResolution = this.dependencyResolver.resolve(actions);
    actions = actions.filter((a) => dependencyResolution.order.includes(a.id));

    // Step 6: Prioritize
    actions = this.prioritizer.prioritize(actions);

    // Step 7: Compute scores
    actions = actions.map((a) => ({ ...a }));

    // Step 8: Compute totals
    const totalBenefits = actions.reduce(
      (sum, a) => mergeBenefits(sum, a.benefits),
      emptyBenefits(),
    );

    const totalDuration = actions.reduce((sum, a) => sum + a.risk.estimatedDurationSeconds, 0);
    const totalHealthGain = actions.reduce((sum, a) => sum + a.impact.estimatedHealthScoreGain, 0);
    const overallConfidence = actions.length > 0
      ? actions.reduce((s, a) => s + a.confidence, 0) / actions.length
      : 0;

    const maxRiskScore = actions.reduce((max, a) => Math.max(max, a.risk.score), 0);
    const totalRisk: RiskLevel = maxRiskScore >= 70 ? 'high' :
      maxRiskScore >= 40 ? 'moderate' :
      maxRiskScore >= 15 ? 'low' : 'none';

    const planTier = this.prioritizer.determinePlanTier(actions);
    const rollbackAvailable = actions.every((a) => a.rollbackAvailable);
    const requiresConfirmation = actions.some((a) => a.requiresUserConfirmation);

    const sourceModules = [...new Set(actions.map((a) => a.sourceModule))] as SourceModuleId[];
    const reasoning = this.buildReasoning(actions, planTier, totalHealthGain);

    const planId = `opt-plan-${Date.now()}`;
    const now = Date.now();

    return {
      id: planId,
      title: this.buildPlanTitle(planTier, actions.length),
      summary: this.buildSummary(actions, totalBenefits, totalHealthGain),
      generatedAt: now,
      expiresAt: now + this.config.planExpiryMinutes * 60 * 1000,
      actions,
      executionOrder: dependencyResolution.order,
      totalBenefits,
      totalRisk,
      overallConfidence,
      estimatedTotalDurationSeconds: totalDuration,
      estimatedHealthScoreGain: totalHealthGain,
      currentHealthScore,
      predictedHealthScore: Math.min(100, currentHealthScore + totalHealthGain),
      impactTier: planTier,
      rollbackAvailable,
      requiresUserConfirmation: requiresConfirmation,
      reasoning,
      sourceModules,
    };
  }

  private buildPlanTitle(tier: OptimizationImpactTier, actionCount: number): string {
    const tierLabels: Record<OptimizationImpactTier, string> = {
      high: 'High Impact',
      medium: 'Medium Impact',
      low: 'Low Impact',
      informational: 'Informational',
    };
    return `${tierLabels[tier]} Optimization Plan (${actionCount} actions)`;
  }

  private buildSummary(
    actions: OptimizationAction[],
    benefits: OptimizationBenefits,
    healthGain: number,
  ): string {
    const parts: string[] = [];
    parts.push(`This plan includes ${actions.length} optimization actions.`);
    if (benefits.storageRecoveryMB > 0) parts.push(`Estimated storage recovery: ${benefits.storageRecoveryMB.toFixed(0)} MB.`);
    if (benefits.ramRecoveryMB > 0) parts.push(`Estimated RAM recovery: ${benefits.ramRecoveryMB.toFixed(0)} MB.`);
    if (benefits.startupImprovementMs > 0) parts.push(`Estimated startup improvement: ${(benefits.startupImprovementMs / 1000).toFixed(1)} seconds.`);
    if (benefits.privacyImprovement > 0) parts.push(`Privacy improvement: ${benefits.privacyImprovement.toFixed(0)}%.`);
    parts.push(`Expected health score gain: +${healthGain} points.`);
    return parts.join(' ');
  }

  private buildReasoning(
    actions: OptimizationAction[],
    tier: OptimizationImpactTier,
    healthGain: number,
  ): string[] {
    const reasons: string[] = [];
    const highImpact = actions.filter((a) => a.impactTier === 'high');
    if (highImpact.length > 0) {
      reasons.push(`${highImpact.length} high-impact actions identified from evidence analysis.`);
    }
    reasons.push(`Plan classified as ${tier} impact with +${healthGain} expected health score gain.`);
    const rollbackCount = actions.filter((a) => a.rollbackAvailable).length;
    reasons.push(`${rollbackCount} of ${actions.length} actions have rollback available.`);
    const evidenceCount = actions.reduce((s, a) => s + a.evidence.length, 0);
    reasons.push(`Plan is supported by ${evidenceCount} pieces of evidence from ${new Set(actions.map((a) => a.sourceModule)).size} source modules.`);
    return reasons;
  }
}
