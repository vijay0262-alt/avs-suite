/**
 * Goal Orchestration Engine — Execution Planner
 *
 * Generates detailed execution plans for goals based on coordinated strategies.
 * Does NOT execute optimizations — only plans them.
 */
import type {
  Goal,
  ExecutionPlan,
  ExecutionPlanStep,
  CoordinatedStrategy,
  OrchestrationConfiguration,
  Evidence,
  ResourceAllocation,
  OrchestrationState,
} from './types';
import { generateExecutionPlanId, generateExecutionPlanStepId } from './types';

export class GoalExecutionPlanner {
  private _config: OrchestrationConfiguration;

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
  }

  plan(goal: Goal, strategy: CoordinatedStrategy): ExecutionPlan {
    const steps = this._generateSteps(goal, strategy);
    const estimatedDurationMs = steps.reduce((sum, s) => sum + s.estimatedDurationMs, 0);
    const estimatedBenefit = strategy.estimatedBenefit;
    const estimatedRisk = strategy.estimatedRisk;
    const resourceUsage = strategy.resourceRequirements;
    const dependencies = goal.dependencies
      .filter((d) => d.required)
      .map((d) => d.goalId);
    const evidence = this._collectEvidence(goal, strategy);

    return {
      id: generateExecutionPlanId(),
      goalId: goal.id,
      steps,
      estimatedDurationMs,
      estimatedBenefit,
      estimatedRisk,
      resourceUsage,
      dependencies,
      state: 'pending',
      evidence,
      futureMetadata: {},
    };
  }

  planAll(goals: Goal[], strategies: CoordinatedStrategy[]): ExecutionPlan[] {
    const strategyMap = new Map(strategies.map((s) => [s.goalId, s]));
    return goals.map((g) => {
      const strat = strategyMap.get(g.id);
      if (!strat) {
        return this.plan(g, this._defaultStrategy(g));
      }
      return this.plan(g, strat);
    });
  }

  private _generateSteps(goal: Goal, _strategy: CoordinatedStrategy): ExecutionPlanStep[] {
    return goal.strategy.steps.map((step) => {
      const resourceReqs = this._estimateStepResources(goal, step.estimatedImpact);
      const evidence: Evidence[] = [...step.evidence];

      return {
        id: generateExecutionPlanStepId(),
        name: step.name,
        description: step.description,
        module: step.module,
        action: step.action,
        priority: step.priority,
        estimatedImpact: step.estimatedImpact,
        estimatedDurationMs: Math.ceil(goal.strategy.estimatedDurationMs / Math.max(1, goal.strategy.steps.length)),
        resourceRequirements: resourceReqs,
        evidence,
        futureMetadata: {},
      };
    });
  }

  private _estimateStepResources(goal: Goal, impact: number): ResourceAllocation[] {
    const resources: ResourceAllocation[] = [];
    const baseCpu = goal.category === 'performance' ? 40 : 20;
    const cpuAmount = Math.min(100, Math.round(baseCpu * impact + 10));

    resources.push({
      id: `rall_step_cpu_${goal.id}`,
      goalId: goal.id,
      resourceType: 'cpu_budget',
      allocatedAmount: cpuAmount,
      maxAmount: this._config.resourcePolicies.maxCpuBudget,
      unit: '%',
      reason: `CPU for step with ${impact} estimated impact`,
      futureMetadata: {},
    });

    return resources;
  }

  private _collectEvidence(goal: Goal, _strategy: CoordinatedStrategy): Evidence[] {
    const evidence: Evidence[] = [..._strategy.evidence];
    const now = new Date().toISOString();

    evidence.push({
      source: 'execution-planner',
      metric: 'step_count',
      value: goal.strategy.steps.length,
      timestamp: now,
      description: `Execution plan has ${goal.strategy.steps.length} steps`,
      futureMetadata: {},
    });

    return evidence;
  }

  private _defaultStrategy(goal: Goal): CoordinatedStrategy {
    return {
      id: 'default',
      goalId: goal.id,
      strategy: goal.strategy,
      coordinatedModules: ['optimization-planner'],
      estimatedDurationMs: goal.strategy.estimatedDurationMs,
      estimatedBenefit: 0.5,
      estimatedRisk: goal.strategy.riskLevel,
      resourceRequirements: [],
      evidence: [],
      alternativeStrategy: null,
      futureMetadata: {},
    };
  }

  updateState(plan: ExecutionPlan, state: OrchestrationState): ExecutionPlan {
    return { ...plan, state };
  }
}
