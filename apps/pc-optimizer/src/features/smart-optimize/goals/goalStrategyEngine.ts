/**
 * Goals & Objectives Engine — Strategy Engine
 *
 * Generates optimization strategies for goals. Strategies describe
 * what steps to take, which modules to engage, and expected impact.
 * Does NOT execute optimizations — only plans them.
 */
import type {
  Goal,
  GoalStrategy,
  GoalStrategyStep,
  GoalMeasurementInput,
  GoalConfiguration,
  GoalProviderPlugin,
  Evidence,
  GoalStrategyType,
} from './types';
import { generateStrategyStepId, getMeasurementDirection } from './types';

export class GoalStrategyEngine {
  private _config: GoalConfiguration;
  private _providers: GoalProviderPlugin[] = [];

  constructor(config: GoalConfiguration) {
    this._config = config;
  }

  registerProvider(plugin: GoalProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  generateStrategy(goal: Goal, input: GoalMeasurementInput): GoalStrategy {
    // Check provider plugins first
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      if (provider.getGoalType() !== goal.category) continue;
      const strategy = provider.generateStrategy(goal, input);
      if (strategy) return strategy;
    }

    // Built-in strategy generation
    return this._generateBuiltinStrategy(goal, input);
  }

  private _generateBuiltinStrategy(goal: Goal, input: GoalMeasurementInput): GoalStrategy {
    const steps = this._generateSteps(goal, input);
    const direction = this._getDirection(goal.targetMetric);
    const remaining = Math.abs(goal.targetValue - goal.currentValue);
    const estimatedDurationMs = this._estimateDuration(goal, steps);

    return {
      type: this._selectStrategyType(goal, input),
      steps,
      estimatedDurationMs,
      estimatedEffort: remaining > 50 ? 'high' : remaining > 10 ? 'medium' : 'low',
      riskLevel: this._assessRisk(goal),
      confidence: this._computeConfidence(goal, input, steps),
      rationale: this._generateRationale(goal, direction, steps),
      futureMetadata: {},
    };
  }

  private _generateSteps(goal: Goal, input: GoalMeasurementInput): GoalStrategyStep[] {
    const steps: GoalStrategyStep[] = [];
    const now = new Date().toISOString();
    const maxSteps = this._config.strategyRules.maxStepsPerStrategy;

    // Generate steps based on goal category
    const templates = this._getStepTemplates(goal);
    for (let i = 0; i < Math.min(templates.length, maxSteps); i++) {
      const t = templates[i]!;
      const evidence: Evidence[] = [];

      // Add evidence from recommendations
      const matchingRecs = input.recommendations.filter((r) => r.category === t.recommendationCategory);
      if (matchingRecs.length > 0) {
        evidence.push({
          source: 'recommendation-engine',
          metric: 'matching_recommendations',
          value: matchingRecs.length,
          timestamp: now,
          description: `${matchingRecs.length} recommendations support this step`,
          futureMetadata: {},
        });
      }

      // Add evidence from optimization history
      if (input.optimizationHistory.length > 0) {
        evidence.push({
          source: 'optimization-history',
          metric: 'historical_success',
          value: input.optimizationHistory[0]!.successRate,
          timestamp: now,
          description: 'Historical optimization data available',
          futureMetadata: {},
        });
      }

      steps.push({
        id: generateStrategyStepId(),
        name: t.name,
        description: t.description,
        action: t.action,
        module: t.module,
        priority: t.priority,
        estimatedImpact: t.estimatedImpact,
        evidence,
        futureMetadata: {},
      });
    }

    return steps;
  }

  private _getStepTemplates(goal: Goal): Array<{
    name: string;
    description: string;
    action: string;
    module: string;
    priority: 'critical' | 'high' | 'medium' | 'low' | 'informational';
    estimatedImpact: number;
    recommendationCategory: string;
  }> {
    switch (goal.category) {
      case 'performance':
        return [
          { name: 'Optimize CPU Usage', description: 'Reduce CPU-intensive background processes', action: 'optimize_cpu', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.3, recommendationCategory: 'performance' },
          { name: 'Optimize Memory', description: 'Free up system memory', action: 'optimize_memory', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.2, recommendationCategory: 'performance' },
          { name: 'Clean Startup', description: 'Remove unnecessary startup items', action: 'clean_startup', module: 'startup-optimizer', priority: 'medium', estimatedImpact: 0.15, recommendationCategory: 'startup' },
        ];
      case 'storage':
        return [
          { name: 'Clean Temp Files', description: 'Remove temporary files', action: 'clean_temp', module: 'disk-cleaner', priority: 'high', estimatedImpact: 0.3, recommendationCategory: 'storage' },
          { name: 'Find Duplicates', description: 'Identify and remove duplicate files', action: 'find_duplicates', module: 'duplicate-finder', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'duplicates' },
          { name: 'Clean Browser Cache', description: 'Clear browser cache and cookies', action: 'clean_browser', module: 'browser-cleaner', priority: 'medium', estimatedImpact: 0.15, recommendationCategory: 'browser' },
        ];
      case 'privacy':
        return [
          { name: 'Privacy Sweep', description: 'Remove privacy traces', action: 'privacy_sweep', module: 'privacy-guard', priority: 'high', estimatedImpact: 0.4, recommendationCategory: 'privacy' },
          { name: 'Secure Browser', description: 'Apply browser privacy settings', action: 'secure_browser', module: 'privacy-guard', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'privacy' },
        ];
      case 'startup':
        return [
          { name: 'Disable Startup Items', description: 'Disable unnecessary startup programs', action: 'disable_startup', module: 'startup-optimizer', priority: 'high', estimatedImpact: 0.4, recommendationCategory: 'startup' },
          { name: 'Optimize Boot Config', description: 'Optimize boot configuration', action: 'optimize_boot', module: 'startup-optimizer', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'startup' },
        ];
      case 'battery':
        return [
          { name: 'Optimize Power Settings', description: 'Apply power-saving settings', action: 'optimize_power', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.3, recommendationCategory: 'performance' },
          { name: 'Reduce Background Activity', description: 'Minimize background process activity', action: 'reduce_background', module: 'smart-optimize', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'performance' },
        ];
      case 'gaming':
        return [
          { name: 'Game Mode Optimization', description: 'Apply gaming-specific optimizations', action: 'game_mode', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.3, recommendationCategory: 'performance' },
          { name: 'Free System Resources', description: 'Free up RAM and CPU for gaming', action: 'free_resources', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.25, recommendationCategory: 'performance' },
        ];
      case 'security':
        return [
          { name: 'Security Scan', description: 'Run security vulnerability scan', action: 'security_scan', module: 'security', priority: 'high', estimatedImpact: 0.4, recommendationCategory: 'security' },
          { name: 'Update Security Settings', description: 'Apply recommended security settings', action: 'update_security', module: 'security', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'security' },
        ];
      case 'health':
        return [
          { name: 'Comprehensive Health Check', description: 'Run full system health optimization', action: 'health_optimize', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.35, recommendationCategory: 'health' },
          { name: 'Maintenance Tasks', description: 'Execute pending maintenance tasks', action: 'run_maintenance', module: 'maintenance', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'maintenance' },
        ];
      default:
        return [
          { name: 'General Optimization', description: 'Apply general system optimizations', action: 'general_optimize', module: 'smart-optimize', priority: 'medium', estimatedImpact: 0.2, recommendationCategory: 'performance' },
        ];
    }
  }

  private _selectStrategyType(goal: Goal, input: GoalMeasurementInput): GoalStrategyType {
    if (input.predictions.length > 0 && this._config.strategyRules.allowPredictionDriven) {
      return 'prediction_driven';
    }
    if (input.maintenanceResults.length > 0) {
      return 'maintenance_assisted';
    }
    if (input.recommendations.some((r) => r.accepted)) {
      return 'automation_assisted';
    }
    return 'adaptive';
  }

  private _estimateDuration(goal: Goal, steps: GoalStrategyStep[]): number {
    const basePerStep = 60000;
    return steps.length * basePerStep;
  }

  private _assessRisk(goal: Goal): Goal['strategy']['riskLevel'] {
    if (goal.priority === 'critical') return 'medium';
    if (goal.category === 'security' || goal.category === 'privacy') return 'low';
    return 'low';
  }

  private _computeConfidence(goal: Goal, input: GoalMeasurementInput, steps: GoalStrategyStep[]): number {
    let confidence = 0.3;
    if (input.recommendations.length > 0) confidence += 0.2;
    if (input.predictions.length > 0) confidence += 0.15;
    if (input.optimizationHistory.length > 0) confidence += 0.15;
    if (input.healthScore !== null) confidence += 0.1;
    if (steps.length > 0) confidence += 0.1;
    return Math.min(1, confidence);
  }

  private _generateRationale(goal: Goal, direction: string, steps: GoalStrategyStep[]): string {
    return `Strategy to ${direction} ${goal.targetMetric} from ${goal.currentValue} to ${goal.targetValue} via ${steps.length} steps`;
  }

  private _getDirection(metric: Goal['targetMetric']): string {
    return getMeasurementDirection(metric);
  }
}
