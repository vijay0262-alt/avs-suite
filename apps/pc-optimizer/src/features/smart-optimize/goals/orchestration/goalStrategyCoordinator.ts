/**
 * Goal Orchestration Engine — Strategy Coordinator
 *
 * Coordinates strategies across goals by engaging the appropriate
 * modules: Recommendation Engine, Prediction Engine, Optimization Planner,
 * Automation, Maintenance, Simulation, Recovery, Timeline.
 *
 * Does NOT execute optimizations — only coordinates strategy generation.
 */
import type {
  Goal,
  CoordinatedStrategy,
  OrchestrationConfiguration,
  OrchestrationInput,
  Evidence,
  ResourceAllocation,
} from './types';
import { generateCoordinatedStrategyId } from './types';

export class GoalStrategyCoordinator {
  private _config: OrchestrationConfiguration;

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
  }

  coordinate(goal: Goal, input: OrchestrationInput): CoordinatedStrategy {
    const coordinatedModules = this._selectModules(goal, input);
    const resourceRequirements = this._estimateResources(goal);
    const estimatedBenefit = this._estimateBenefit(goal);
    const estimatedRisk = this._estimateRisk(goal);
    const evidence = this._collectEvidence(goal, input);
    const alternativeStrategy = this._generateAlternative(goal, input);

    return {
      id: generateCoordinatedStrategyId(),
      goalId: goal.id,
      strategy: goal.strategy,
      coordinatedModules,
      estimatedDurationMs: goal.strategy.estimatedDurationMs,
      estimatedBenefit,
      estimatedRisk,
      resourceRequirements,
      evidence,
      alternativeStrategy,
      futureMetadata: {},
    };
  }

  coordinateAll(goals: Goal[], input: OrchestrationInput): CoordinatedStrategy[] {
    return goals.map((g) => this.coordinate(g, input));
  }

  private _selectModules(goal: Goal, input: OrchestrationInput): string[] {
    const modules: string[] = [];

    // Always include optimization planner
    modules.push('optimization-planner');

    // Include recommendation engine if recommendations are available
    if (input.measurementInput.recommendations.length > 0) {
      modules.push('recommendation-engine');
    }

    // Include prediction engine if predictions are available
    if (input.measurementInput.predictions.length > 0) {
      modules.push('prediction-engine');
    }

    // Include maintenance if maintenance results are available
    if (input.measurementInput.maintenanceResults.length > 0) {
      modules.push('maintenance');
    }

    // Include automation if recommendations are accepted
    if (input.measurementInput.recommendations.some((r) => r.accepted)) {
      modules.push('automation');
    }

    // Include timeline for tracking
    modules.push('timeline');

    // Include simulation for high-risk goals
    if (goal.strategy.riskLevel === 'high' || goal.strategy.riskLevel === 'critical') {
      modules.push('simulation');
    }

    // Include recovery for security/privacy goals
    if (goal.category === 'security' || goal.category === 'privacy') {
      modules.push('recovery');
    }

    return modules;
  }

  private _estimateResources(goal: Goal): ResourceAllocation[] {
    const resources: ResourceAllocation[] = [];

    const cpuBudget = goal.category === 'performance' || goal.category === 'gaming' ? 60 : 30;
    const memoryBudget = goal.category === 'performance' ? 50 : 25;
    const diskBudget = goal.category === 'storage' ? 80 : 20;
    const networkBudget = goal.category === 'security' ? 40 : 10;

    resources.push(this._makeResource(goal.id, 'cpu_budget', cpuBudget, this._config.resourcePolicies.maxCpuBudget, '%'));
    resources.push(this._makeResource(goal.id, 'memory_budget', memoryBudget, this._config.resourcePolicies.maxMemoryBudget, '%'));
    resources.push(this._makeResource(goal.id, 'disk_budget', diskBudget, this._config.resourcePolicies.maxDiskBudget, '%'));
    resources.push(this._makeResource(goal.id, 'network_budget', networkBudget, this._config.resourcePolicies.maxNetworkBudget, '%'));

    return resources;
  }

  private _makeResource(
    goalId: string,
    type: ResourceAllocation['resourceType'],
    allocated: number,
    max: number,
    unit: string,
  ): ResourceAllocation {
    return {
      id: `rall_${type}_${goalId}`,
      goalId,
      resourceType: type,
      allocatedAmount: allocated,
      maxAmount: max,
      unit,
      reason: `Estimated ${type} for goal execution`,
      futureMetadata: {},
    };
  }

  private _estimateBenefit(goal: Goal): number {
    const remaining = Math.abs(goal.targetValue - goal.currentValue);
    const total = Math.abs(goal.targetValue) || 1;
    return Math.min(1, 1 - (remaining / total));
  }

  private _estimateRisk(goal: Goal): CoordinatedStrategy['estimatedRisk'] {
    return goal.strategy.riskLevel;
  }

  private _collectEvidence(goal: Goal, input: OrchestrationInput): Evidence[] {
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    if (input.measurementInput.recommendations.length > 0) {
      evidence.push({
        source: 'recommendation-engine',
        metric: 'recommendation_count',
        value: input.measurementInput.recommendations.length,
        timestamp: now,
        description: `${input.measurementInput.recommendations.length} recommendations available for coordination`,
        futureMetadata: {},
      });
    }

    if (input.measurementInput.predictions.length > 0) {
      evidence.push({
        source: 'prediction-engine',
        metric: 'prediction_count',
        value: input.measurementInput.predictions.length,
        timestamp: now,
        description: `${input.measurementInput.predictions.length} predictions available for coordination`,
        futureMetadata: {},
      });
    }

    if (input.measurementInput.optimizationHistory.length > 0) {
      evidence.push({
        source: 'optimization-history',
        metric: 'history_count',
        value: input.measurementInput.optimizationHistory.length,
        timestamp: now,
        description: `${input.measurementInput.optimizationHistory.length} historical optimizations available`,
        futureMetadata: {},
      });
    }

    return evidence;
  }

  private _generateAlternative(goal: Goal, _input: OrchestrationInput): string {
    if (goal.strategy.type === 'adaptive') {
      return 'Fallback to one-time strategy if adaptive approach fails';
    }
    if (goal.strategy.type === 'continuous') {
      return 'Switch to scheduled strategy if continuous monitoring is too resource-intensive';
    }
    return 'Retry with reduced scope if initial strategy fails';
  }
}
