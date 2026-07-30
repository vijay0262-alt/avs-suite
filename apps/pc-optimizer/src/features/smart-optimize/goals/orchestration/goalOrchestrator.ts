/**
 * Goal Orchestration Engine — Goal Orchestrator
 *
 * The central decision layer above all Smart Optimize components.
 * Coordinates multiple active goals: evaluates priorities, dependencies,
 * conflicts, and system state to determine the optimal optimization strategy.
 *
 * MUST NOT execute optimizations directly — only plans and coordinates.
 *
 * Architecture:
 *   Goals → Goal Orchestrator → Priority Engine → Conflict Resolver →
 *   Strategy Coordinator → Optimization Planner → Automation →
 *   Maintenance → Timeline
 */
import type {
  Goal,
  OrchestrationInput,
  OrchestrationResult,
  OrchestrationDecision,
  OrchestrationStatus,
  OrchestrationMetrics,
  PriorityScore,
  OrchestrationConflict,
  OrchestrationSchedule,
  CoordinatedStrategy,
  ResourceAllocation,
  OrchestrationConfiguration,
  OrchestrationProviderPlugin,
  Evidence,
  ExplainabilityReport,
  OrchestrationState,
  OrchestrationEventType,
  OrchestrationEventListener,
} from './types';
import { generateOrchestrationId, generateDecisionId } from './types';
import { GoalPriorityEngine } from './goalPriorityEngine';
import { GoalConflictEngine } from './goalConflictEngine';
import { GoalDependencyResolver } from './goalDependencyResolver';
import { GoalSchedulingEngine } from './goalSchedulingEngine';
import { GoalStrategyCoordinator } from './goalStrategyCoordinator';
import { GoalExecutionPlanner } from './goalExecutionPlanner';
import { GoalStateCoordinator } from './goalStateCoordinator';
import { GoalPolicyEngine } from './goalPolicyEngine';
import { GoalResourceAllocator } from './goalResourceAllocator';
import { GoalMetricsEngine } from './goalMetricsEngine';
import { GoalHistoryAggregator } from './goalHistoryAggregator';
import { OrchestrationEvents } from './orchestrationEvents';

export class GoalOrchestrator {
  private _config: OrchestrationConfiguration;
  private _priorityEngine: GoalPriorityEngine;
  private _conflictEngine: GoalConflictEngine;
  private _dependencyResolver: GoalDependencyResolver;
  private _schedulingEngine: GoalSchedulingEngine;
  private _strategyCoordinator: GoalStrategyCoordinator;
  private _executionPlanner: GoalExecutionPlanner;
  private _stateCoordinator: GoalStateCoordinator;
  private _policyEngine: GoalPolicyEngine;
  private _resourceAllocator: GoalResourceAllocator;
  private _metricsEngine: GoalMetricsEngine;
  private _history: GoalHistoryAggregator;
  private _events: OrchestrationEvents;
  private _providers: OrchestrationProviderPlugin[] = [];

  constructor(config: OrchestrationConfiguration) {
    this._config = config;
    this._priorityEngine = new GoalPriorityEngine(config);
    this._conflictEngine = new GoalConflictEngine(config);
    this._dependencyResolver = new GoalDependencyResolver();
    this._schedulingEngine = new GoalSchedulingEngine(config);
    this._strategyCoordinator = new GoalStrategyCoordinator(config);
    this._executionPlanner = new GoalExecutionPlanner(config);
    this._stateCoordinator = new GoalStateCoordinator();
    this._policyEngine = new GoalPolicyEngine(config);
    this._resourceAllocator = new GoalResourceAllocator(config);
    this._metricsEngine = new GoalMetricsEngine();
    this._history = new GoalHistoryAggregator(config.maxHistoryEntries);
    this._events = new OrchestrationEvents();
  }

  // ── Public APIs ──────────────────────────────────────────

  orchestrateGoals(input: OrchestrationInput): OrchestrationResult {
    const orchestrationId = generateOrchestrationId();
    const startTime = Date.now();

    // Record start
    this._history.record(orchestrationId, null, 'orchestration_started', 'Orchestration started');
    if (this._config.enableEvents) {
      this._events.emitOrchestrationStarted(orchestrationId, { goalCount: input.goals.length });
    }

    // Set all goals to pending state
    for (const goal of input.goals) {
      this._stateCoordinator.setState(goal.id, 'pending');
    }

    // 1. Prioritize goals
    const priorityScores = this.prioritizeGoals(input);
    if (this._config.enableEvents) {
      this._events.emitGoalsPrioritized(orchestrationId, { scores: priorityScores.length });
    }
    this._history.record(orchestrationId, null, 'goals_prioritized', `Prioritized ${priorityScores.length} goals`);

    // 2. Resolve dependencies
    const goalMap = new Map(input.goals.map((g) => [g.id, g]));
    const dependencyResolutions = this._dependencyResolver.resolveAll(input.goals, goalMap);

    // Update states based on dependency resolution
    for (const res of dependencyResolutions) {
      if (!res.canExecute) {
        this._stateCoordinator.setState(res.goalId, 'blocked');
      } else {
        this._stateCoordinator.setState(res.goalId, 'planning');
      }
    }

    // 3. Detect and resolve conflicts
    const conflicts = this._conflictEngine.detectConflicts(input.goals);
    const resolvedConflicts = this._conflictEngine.resolveAll(conflicts, goalMap);

    for (const conflict of resolvedConflicts) {
      if (this._config.enableEvents) {
        this._events.emitConflictDetected(orchestrationId, conflict.goalIds[0] ?? null, conflict);
      }
      this._history.record(orchestrationId, conflict.goalIds[0] ?? null, 'conflict_detected', conflict.description);

      if (conflict.resolution) {
        if (this._config.enableEvents) {
          this._events.emitConflictResolved(orchestrationId, conflict.goalIds[0] ?? null, conflict.resolution);
        }
        this._history.record(orchestrationId, conflict.goalIds[0] ?? null, 'conflict_resolved', conflict.resolution.description);
      }
    }

    // 4. Allocate resources
    const resourceAllocations = this._resourceAllocator.allocate(input.goals, input);
    if (this._config.enableEvents) {
      this._events.emitResourcesAllocated(orchestrationId, { allocations: resourceAllocations.length });
    }
    this._history.record(orchestrationId, null, 'resources_allocated', `Allocated ${resourceAllocations.length} resources`);

    // 5. Coordinate strategies
    const activeGoalIds = priorityScores
      .slice(0, this._config.priorityRules.maxActiveGoals)
      .map((s) => s.goalId);
    const activeGoals = input.goals.filter((g) => activeGoalIds.includes(g.id));
    const coordinatedStrategies = this._strategyCoordinator.coordinateAll(activeGoals, input);

    for (const strategy of coordinatedStrategies) {
      if (this._config.enableEvents) {
        this._events.emitStrategyGenerated(orchestrationId, strategy.goalId, strategy);
      }
      this._history.record(orchestrationId, strategy.goalId, 'strategy_generated', `Strategy coordinated for goal ${strategy.goalId}`);
      this._stateCoordinator.setState(strategy.goalId, 'executing');
    }

    // 6. Generate execution plans
    const executionPlans = this._executionPlanner.planAll(activeGoals, coordinatedStrategies);

    // 7. Schedule goals
    const schedules: OrchestrationSchedule[] = [];
    for (const score of priorityScores) {
      const goal = goalMap.get(score.goalId);
      if (!goal) continue;
      const sched = this._schedulingEngine.schedule(goal, score.rank);
      schedules.push(sched);
    }

    // 8. Determine deferred goals
    const deferredGoalIds = priorityScores
      .slice(this._config.priorityRules.maxActiveGoals)
      .map((s) => s.goalId);

    for (const goalId of deferredGoalIds) {
      this._stateCoordinator.setState(goalId, 'paused');
      if (this._config.enableEvents) {
        this._events.emitGoalDeferred(orchestrationId, goalId, { reason: 'Deferred due to priority limits' });
      }
      this._history.record(orchestrationId, goalId, 'goal_deferred', 'Goal deferred due to priority limits');
    }

    // 9. Check for completed goals
    for (const goal of input.goals) {
      if (goal.status === 'completed') {
        this._stateCoordinator.setState(goal.id, 'completed');
        if (this._config.enableEvents) {
          this._events.emitGoalCompleted(orchestrationId, goal.id, { goalId: goal.id });
        }
        this._history.record(orchestrationId, goal.id, 'goal_completed', `Goal ${goal.name} completed`);
      }
    }

    // 10. Build decision
    const selectedGoals = activeGoalIds;
    const estimatedBenefit = coordinatedStrategies.reduce((sum, s) => sum + s.estimatedBenefit, 0) / Math.max(1, coordinatedStrategies.length);
    const evidence = this._collectDecisionEvidence(priorityScores, resolvedConflicts, resourceAllocations, coordinatedStrategies);

    const decision: OrchestrationDecision = {
      id: generateDecisionId(),
      timestamp: new Date().toISOString(),
      activeGoals: input.goals.map((g) => g.id),
      selectedGoals,
      deferredGoals: deferredGoalIds,
      reason: this._generateDecisionReason(priorityScores, resolvedConflicts, deferredGoalIds),
      supportingEvidence: evidence,
      confidence: this._computeDecisionConfidence(priorityScores, coordinatedStrategies),
      estimatedBenefit,
      estimatedRisk: this._computeOverallRisk(coordinatedStrategies),
      resourceUsage: resourceAllocations,
      futureMetadata: {},
    };

    this._stateCoordinator.setCurrentDecision(decision);

    // 11. Build status
    const status = this._stateCoordinator.getStatus(input.goals);

    const elapsedMs = Date.now() - startTime;
    this._history.record(orchestrationId, null, 'state_changed', `Orchestration completed in ${elapsedMs}ms`, 'executing', 'completed');

    return {
      decision,
      priorityScores,
      conflicts: resolvedConflicts,
      dependencyResolutions,
      schedule: schedules,
      coordinatedStrategies,
      executionPlans,
      resourceAllocations,
      status,
      evidence,
      futureMetadata: {},
    };
  }

  prioritizeGoals(input: OrchestrationInput): PriorityScore[] {
    if (!this._config.featureFlags.enablePrioritization) return [];
    return this._priorityEngine.prioritize(input.goals, input);
  }

  resolveConflicts(goals: Goal[]): OrchestrationConflict[] {
    if (!this._config.featureFlags.enableConflictResolution) return [];
    const goalMap = new Map(goals.map((g) => [g.id, g]));
    const conflicts = this._conflictEngine.detectConflicts(goals);
    return this._conflictEngine.resolveAll(conflicts, goalMap);
  }

  allocateResources(input: OrchestrationInput): ResourceAllocation[] {
    if (!this._config.featureFlags.enableResourceAllocation) return [];
    return this._resourceAllocator.allocate(input.goals, input);
  }

  generateExecutionStrategy(goal: Goal, input: OrchestrationInput): CoordinatedStrategy {
    return this._strategyCoordinator.coordinate(goal, input);
  }

  getOrchestrationStatus(goals: Goal[]): OrchestrationStatus {
    return this._stateCoordinator.getStatus(goals);
  }

  getGoalMetrics(
    goals: Goal[],
    conflicts: OrchestrationConflict[],
    allocations: ResourceAllocation[],
  ): OrchestrationMetrics {
    return this._metricsEngine.computeMetrics(goals, this._history.getAll(), conflicts, allocations);
  }

  getExplainabilityReport(goalId: string, result: OrchestrationResult): ExplainabilityReport | null {
    const score = result.priorityScores.find((s) => s.goalId === goalId);
    if (!score) return null;

    const isDeferred = result.decision.deferredGoals.includes(goalId);
    const strategy = result.coordinatedStrategies.find((s) => s.goalId === goalId);
    const conflicts = result.conflicts.filter((c) => c.goalIds.includes(goalId));

    return {
      decisionId: result.decision.id,
      goalId,
      whyPrioritized: isDeferred
        ? `Goal was deferred (rank ${score.rank}) due to priority limits`
        : `Goal was selected (rank ${score.rank}) with score ${score.score.toFixed(3)}`,
      whyDeferred: isDeferred ? 'Deferred due to lower priority score or active goal limit' : null,
      expectedOutcome: strategy
        ? `Estimated benefit: ${strategy.estimatedBenefit.toFixed(2)}, risk: ${strategy.estimatedRisk}`
        : 'No strategy coordinated',
      supportingEvidence: score.evidence,
      confidence: score.score,
      alternativeStrategy: strategy?.alternativeStrategy ?? 'No alternative available',
      potentialConflicts: conflicts.map((c) => c.description),
      futureMetadata: {},
    };
  }

  // ── Provider Registration ────────────────────────────────

  registerProvider(plugin: OrchestrationProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._providers.push(plugin);
    this._priorityEngine.registerProvider(plugin);
    this._conflictEngine.registerProvider(plugin);
    this._resourceAllocator.registerProvider(plugin);
    return true;
  }

  // ── Events ───────────────────────────────────────────────

  on(event: OrchestrationEventType, listener: OrchestrationEventListener): () => void {
    return this._events.on(event, listener);
  }

  getEvents(): OrchestrationEvents {
    return this._events;
  }

  // ── History ──────────────────────────────────────────────

  getHistory() {
    return this._history;
  }

  // ── Configuration ────────────────────────────────────────

  getConfig(): OrchestrationConfiguration {
    return this._config;
  }

  // ── State ────────────────────────────────────────────────

  getGoalState(goalId: string): OrchestrationState {
    return this._stateCoordinator.getState(goalId);
  }

  setGoalState(goalId: string, state: OrchestrationState): void {
    this._stateCoordinator.setState(goalId, state);
  }

  // ── Clear ────────────────────────────────────────────────

  clear(): void {
    this._schedulingEngine.clear();
    this._stateCoordinator.clear();
    this._history.clear();
    this._events.clear();
    this._policyEngine.clear();
  }

  // ── Private Helpers ──────────────────────────────────────

  private _collectDecisionEvidence(
    scores: PriorityScore[],
    conflicts: OrchestrationConflict[],
    allocations: ResourceAllocation[],
    strategies: CoordinatedStrategy[],
  ): Evidence[] {
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    if (scores.length > 0) {
      evidence.push({
        source: 'priority-engine',
        metric: 'top_priority_score',
        value: scores[0]!.score,
        timestamp: now,
        description: `Top priority score: ${scores[0]!.score.toFixed(3)} for goal ${scores[0]!.goalId}`,
        futureMetadata: {},
      });
    }

    if (conflicts.length > 0) {
      evidence.push({
        source: 'conflict-engine',
        metric: 'conflict_count',
        value: conflicts.length,
        timestamp: now,
        description: `${conflicts.length} conflicts detected and resolved`,
        futureMetadata: {},
      });
    }

    if (allocations.length > 0) {
      evidence.push({
        source: 'resource-allocator',
        metric: 'resource_allocations',
        value: allocations.length,
        timestamp: now,
        description: `${allocations.length} resources allocated`,
        futureMetadata: {},
      });
    }

    for (const strategy of strategies) {
      evidence.push(...strategy.evidence);
    }

    return evidence;
  }

  private _generateDecisionReason(
    scores: PriorityScore[],
    conflicts: OrchestrationConflict[],
    deferredGoalIds: string[],
  ): string {
    const parts: string[] = [];
    parts.push(`Selected ${scores.length - deferredGoalIds.length} goals from ${scores.length} active`);
    if (conflicts.length > 0) {
      parts.push(`resolved ${conflicts.length} conflicts`);
    }
    if (deferredGoalIds.length > 0) {
      parts.push(`deferred ${deferredGoalIds.length} goals`);
    }
    return parts.join(', ');
  }

  private _computeDecisionConfidence(
    scores: PriorityScore[],
    strategies: CoordinatedStrategy[],
  ): number {
    if (scores.length === 0) return 0;
    const avgPriority = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
    const avgStrategyConf = strategies.length > 0
      ? strategies.reduce((sum, s) => sum + s.strategy.confidence, 0) / strategies.length
      : 0.5;
    return Math.min(1, (avgPriority + avgStrategyConf) / 2);
  }

  private _computeOverallRisk(strategies: CoordinatedStrategy[]): CoordinatedStrategy['estimatedRisk'] {
    if (strategies.length === 0) return 'none';
    const hasCritical = strategies.some((s) => s.estimatedRisk === 'critical');
    const hasHigh = strategies.some((s) => s.estimatedRisk === 'high');
    const hasMedium = strategies.some((s) => s.estimatedRisk === 'medium');
    if (hasCritical) return 'critical';
    if (hasHigh) return 'high';
    if (hasMedium) return 'medium';
    return 'low';
  }
}
