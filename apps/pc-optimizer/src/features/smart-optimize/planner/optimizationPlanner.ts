/**
 * Optimization Planner — orchestrates all planning components.
 *
 * Pipeline:
 *   Context → Strategy → Plan Generator → Priority Engine →
 *   Conflict Resolver → Safety Analyzer → Eligibility Validator →
 *   History Analyzer → Sequence Builder → Smart Plan
 */
import type {
  SmartPlan,
  PlanningContext,
  PlannerConfiguration,
  OptimizationGoal,
  OptimizationStrategy,
  SmartPlanAction,
  ExcludedAction,
  SmartPlanBenefits,
  RecommendationPriority,
  DeviceProfileSnapshot,
} from './types';
import {
  generateSmartPlanId,
  priorityToScore,
} from './types';
import { OptimizationStrategyEngine } from './optimizationStrategyEngine';
import { OptimizationProfileResolver } from './optimizationProfileResolver';
import { OptimizationPriorityEngine } from './optimizationPriorityEngine';
import { OptimizationSequenceBuilder } from './optimizationSequenceBuilder';
import { OptimizationConflictResolver } from './optimizationConflictResolver';
import { OptimizationSafetyAnalyzer } from './optimizationSafetyAnalyzer';
import { OptimizationEligibilityValidator } from './optimizationEligibilityValidator';
import { OptimizationHistoryAnalyzer } from './optimizationHistoryAnalyzer';
import { OptimizationPlanGenerator } from './optimizationPlanGenerator';

export class OptimizationPlanner {
  private _config: PlannerConfiguration;
  private _strategyEngine: OptimizationStrategyEngine;
  private _profileResolver: OptimizationProfileResolver;
  private _priorityEngine: OptimizationPriorityEngine;
  private _sequenceBuilder: OptimizationSequenceBuilder;
  private _conflictResolver: OptimizationConflictResolver;
  private _safetyAnalyzer: OptimizationSafetyAnalyzer;
  private _eligibilityValidator: OptimizationEligibilityValidator;
  private _historyAnalyzer: OptimizationHistoryAnalyzer;
  private _planGenerator: OptimizationPlanGenerator;

  constructor(config: PlannerConfiguration) {
    this._config = config;
    this._strategyEngine = new OptimizationStrategyEngine(config);
    this._profileResolver = new OptimizationProfileResolver();
    this._priorityEngine = new OptimizationPriorityEngine(config.priorityWeights);
    this._sequenceBuilder = new OptimizationSequenceBuilder();
    this._conflictResolver = new OptimizationConflictResolver();
    this._safetyAnalyzer = new OptimizationSafetyAnalyzer(config);
    this._eligibilityValidator = new OptimizationEligibilityValidator(config);
    this._historyAnalyzer = new OptimizationHistoryAnalyzer();
    this._planGenerator = new OptimizationPlanGenerator(config);
  }

  updateConfig(config: PlannerConfiguration): void {
    this._config = config;
    this._strategyEngine.updateConfig(config);
    this._priorityEngine.updateWeights(config.priorityWeights);
    this._safetyAnalyzer.updateConfig(config);
    this._eligibilityValidator.updateConfig(config);
    this._planGenerator.updateConfig(config);
  }

  plan(goal: OptimizationGoal, context: PlanningContext): SmartPlan {
    const strategy = this._strategyEngine.selectStrategy(goal, context);
    const profileSnapshot = this._profileResolver.resolve(context.deviceProfile);
    const profileAdjustments = this._profileResolver.getProfileAdjustments(
      profileSnapshot.profileType, goal,
    );

    let actions = this._planGenerator.generate(context, goal);

    if (this._config.featureFlags.enableHistoryAnalysis) {
      const historyAnalysis = this._historyAnalyzer.analyze(context.optimizationHistory);
      const result = this._historyAnalyzer.adjustActions(actions, historyAnalysis);
      actions = result.adjusted;
    }

    actions = this._priorityEngine.rank(actions);
    actions = this._priorityEngine.applyCategoryBoost(
      actions,
      profileAdjustments.priorityBoost,
      profileAdjustments.priorityPenalty,
    );

    if (this._config.featureFlags.enableConflictResolution) {
      const conflictResult = this._conflictResolver.resolve(actions);
      const allRemovals = conflictResult.resolvedConflicts.flatMap((rc) => rc.resolvedActionIds);
      actions = this._conflictResolver.removeActions(actions, allRemovals);
    }

    const strategyFilter = this._strategyEngine.filterActionsByStrategy(actions, strategy);
    actions = strategyFilter.included;
    const strategyExcluded = strategyFilter.excluded;

    if (this._config.featureFlags.enableSafetyAnalysis) {
      const safetyFilter = this._safetyAnalyzer.filterUnsafeActions(actions);
      actions = safetyFilter.safe;
    }

    if (this._config.featureFlags.enableEligibilityValidation) {
      const eligibility = this._eligibilityValidator.validate(actions, context);
      const eligibleSet = new Set(eligibility.eligibleActions);
      actions = actions.filter((a) => eligibleSet.has(a.id));
    }

    actions = this._sequenceBuilder.build(actions);
    actions = actions.slice(0, this._config.planningRules.maxActions);

    const deferredActions = strategyExcluded.slice(0, this._config.planningRules.maxDeferredActions);
    const excludedActions = this._buildExcludedActions(strategyExcluded, []);

    const safetyAssessment = this._safetyAnalyzer.analyze(actions);
    const eligibilityResult = this._eligibilityValidator.validate(actions, context);
    const benefits = this._computeBenefits(actions, context);
    const estimatedRisk = safetyAssessment.overallRisk;
    const confidence = this._computeConfidence(actions, profileSnapshot);
    const priority = this._determinePriority(actions);
    const title = this._generateTitle(goal, strategy);
    const summary = this._generateSummary(goal, actions, deferredActions);

    return {
      id: generateSmartPlanId(),
      title,
      summary,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this._config.planningRules.planExpiryHours * 3600000).toISOString(),
      deviceProfile: profileSnapshot,
      optimizationGoal: goal,
      strategy,
      estimatedDuration: this._sequenceBuilder.estimateTotalDuration(actions),
      estimatedBenefits: benefits,
      estimatedRisk,
      confidence,
      priority,
      recommendedActions: actions,
      deferredActions,
      excludedActions,
      rollbackAvailable: safetyAssessment.rollbackAvailable,
      requiresConfirmation: safetyAssessment.confirmationRequired,
      safetyAssessment,
      eligibilityResult,
      futureMetadata: {},
    };
  }

  private _buildExcludedActions(
    strategyExcluded: SmartPlanAction[],
    safetyExcluded: SmartPlanAction[],
  ): ExcludedAction[] {
    const excluded: ExcludedAction[] = [];
    for (const action of strategyExcluded) {
      excluded.push({
        id: action.id,
        title: action.title,
        reason: 'Excluded by strategy filter',
        category: action.category,
      });
    }
    for (const action of safetyExcluded) {
      if (!excluded.some((e) => e.id === action.id)) {
        excluded.push({
          id: action.id,
          title: action.title,
          reason: 'Excluded by safety filter',
          category: action.category,
        });
      }
    }
    return excluded;
  }

  private _computeBenefits(actions: SmartPlanAction[], context: PlanningContext): SmartPlanBenefits {
    let healthGain = 0;
    let storageRecovery = 0;
    let performanceGain = 0;
    let privacyGain = 0;
    let startupGain = 0;

    for (const action of actions) {
      const impact = action.predictedImpact;
      switch (action.category) {
        case 'storage':
          storageRecovery += Math.round(impact * 500);
          break;
        case 'performance':
          performanceGain += Math.round(impact * 10);
          break;
        case 'privacy':
          privacyGain += Math.round(impact * 5);
          break;
        case 'startup':
          startupGain += Math.round(impact * 2 * 10) / 10;
          break;
        case 'health':
        case 'maintenance':
          healthGain += Math.round(impact * 5);
          break;
        default:
          break;
      }
    }

    if (context.currentHealth !== null) {
      healthGain = Math.min(healthGain, 100 - context.currentHealth);
    }

    const timeSaved = actions.reduce((sum, a) => sum + a.estimatedDuration, 0);

    return {
      estimatedHealthGain: healthGain,
      estimatedStorageRecovery: storageRecovery,
      estimatedPerformanceGain: performanceGain,
      estimatedPrivacyGain: privacyGain,
      estimatedStartupGain: startupGain,
      estimatedTimeSaved: timeSaved,
    };
  }

  private _computeConfidence(actions: SmartPlanAction[], profile: DeviceProfileSnapshot): number {
    if (actions.length === 0) return 0;
    const avgActionConfidence = actions.reduce((sum, a) => sum + a.confidence, 0) / actions.length;
    const profileConfidence = profile.confidenceScore;
    return Math.round(((avgActionConfidence * 0.7) + (profileConfidence * 0.3)) * 100) / 100;
  }

  private _determinePriority(actions: SmartPlanAction[]): RecommendationPriority {
    if (actions.length === 0) return 'informational';
    const maxScore = Math.max(...actions.map((a) => priorityToScore(a.priority)));
    if (maxScore >= 1.0) return 'critical';
    if (maxScore >= 0.8) return 'high';
    if (maxScore >= 0.6) return 'medium';
    if (maxScore >= 0.4) return 'low';
    return 'informational';
  }

  private _generateTitle(goal: OptimizationGoal, strategy: OptimizationStrategy): string {
    const goalLabels: Record<OptimizationGoal, string> = {
      quick_boost: 'Quick Boost',
      maximum_performance: 'Maximum Performance',
      storage_recovery: 'Storage Recovery',
      privacy_protection: 'Privacy Protection',
      startup_optimization: 'Startup Optimization',
      battery_optimization: 'Battery Optimization',
      routine_maintenance: 'Routine Maintenance',
      gaming_preparation: 'Gaming Preparation',
      creator_workflow: 'Creator Workflow',
      business_productivity: 'Business Productivity',
      balanced: 'Balanced Optimization',
      custom: 'Custom Optimization',
      future_goal: 'Optimization',
    };
    const strategyLabel = this._strategyEngine.getStrategyLabel(strategy);
    return `${goalLabels[goal] ?? 'Optimization'} — ${strategyLabel}`;
  }

  private _generateSummary(
    goal: OptimizationGoal,
    actions: SmartPlanAction[],
    deferred: SmartPlanAction[],
  ): string {
    const parts: string[] = [];
    parts.push(`${actions.length} action${actions.length !== 1 ? 's' : ''} recommended`);
    if (deferred.length > 0) {
      parts.push(`${deferred.length} deferred`);
    }
    return parts.join(', ');
  }
}
