/**
 * Optimization Strategy Engine — selects and applies planning strategies.
 *
 * Strategies are configurable. The engine maps goals to strategies,
 * applies strategy rules to filter actions, and determines risk thresholds.
 */
import type {
  OptimizationGoal,
  OptimizationStrategy,
  PlannerConfiguration,
  StrategyRule,
  SmartPlanAction,
  PlanningContext,
} from './types';
import { riskToScore } from './types';
import { getStrategyRule } from './optimizationPlannerConfiguration';

export class OptimizationStrategyEngine {
  private _config: PlannerConfiguration;

  constructor(config: PlannerConfiguration) {
    this._config = config;
  }

  updateConfig(config: PlannerConfiguration): void {
    this._config = config;
  }

  selectStrategy(goal: OptimizationGoal, context: PlanningContext): OptimizationStrategy {
    if (context.userPreferences?.preferredStrategy) {
      return context.userPreferences.preferredStrategy;
    }

    const goalToStrategy: Record<OptimizationGoal, OptimizationStrategy> = {
      quick_boost: 'performance_first',
      maximum_performance: 'aggressive',
      storage_recovery: 'storage_first',
      privacy_protection: 'privacy_first',
      startup_optimization: 'performance_first',
      battery_optimization: 'conservative',
      routine_maintenance: 'balanced',
      gaming_preparation: 'performance_first',
      creator_workflow: 'balanced',
      business_productivity: 'balanced',
      balanced: 'balanced',
      custom: 'custom',
      future_goal: 'balanced',
    };

    return goalToStrategy[goal] ?? 'balanced';
  }

  getStrategyRule(strategy: OptimizationStrategy): StrategyRule {
    return getStrategyRule(this._config, strategy);
  }

  filterActionsByStrategy(
    actions: SmartPlanAction[],
    strategy: OptimizationStrategy,
  ): { included: SmartPlanAction[]; excluded: SmartPlanAction[] } {
    const rule = this.getStrategyRule(strategy);
    const included: SmartPlanAction[] = [];
    const excluded: SmartPlanAction[] = [];

    for (const action of actions) {
      const riskScore = riskToScore(action.riskLevel);
      const maxRiskScore = riskToScore(rule.maxRiskLevel);

      if (riskScore > maxRiskScore && !rule.allowUnsafeActions) {
        excluded.push(action);
        continue;
      }
      if (action.confidence < rule.minConfidence) {
        excluded.push(action);
        continue;
      }
      if (rule.requireRollback && !action.rollbackAvailable) {
        excluded.push(action);
        continue;
      }
      if (action.estimatedDuration > rule.maxDuration) {
        excluded.push(action);
        continue;
      }

      included.push(action);
    }

    return { included, excluded };
  }

  getStrategyLabel(strategy: OptimizationStrategy): string {
    const labels: Record<OptimizationStrategy, string> = {
      aggressive: 'Aggressive',
      balanced: 'Balanced',
      conservative: 'Conservative',
      safe_only: 'Safe Only',
      performance_first: 'Performance First',
      storage_first: 'Storage First',
      privacy_first: 'Privacy First',
      custom: 'Custom',
    };
    return labels[strategy] ?? 'Unknown';
  }

  getStrategyDescription(strategy: OptimizationStrategy): string {
    const descriptions: Record<OptimizationStrategy, string> = {
      aggressive: 'Maximizes improvements with higher risk tolerance',
      balanced: 'Balances benefit and risk for optimal results',
      conservative: 'Prioritizes safety with moderate improvements',
      safe_only: 'Only includes zero-risk actions',
      performance_first: 'Prioritizes performance improvements',
      storage_first: 'Prioritizes storage recovery',
      privacy_first: 'Prioritizes privacy protection',
      custom: 'Custom strategy based on user preferences',
    };
    return descriptions[strategy] ?? '';
  }
}
