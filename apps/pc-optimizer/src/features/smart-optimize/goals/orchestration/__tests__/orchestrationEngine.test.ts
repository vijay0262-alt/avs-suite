/**
 * Goal Orchestration Engine — Comprehensive Test Suite
 *
 * EPIC 4 PHASE B PART 6
 *
 * Tests cover: Prioritization, Conflict Resolution, Dependencies,
 * Scheduling, Resource Allocation, Analytics, Events, Regression,
 * Performance, Edge Cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { GoalOrchestrator } from '../goalOrchestrator';
import { GoalPriorityEngine } from '../goalPriorityEngine';
import { GoalConflictEngine } from '../goalConflictEngine';
import { GoalDependencyResolver } from '../goalDependencyResolver';
import { GoalSchedulingEngine } from '../goalSchedulingEngine';
import { GoalStrategyCoordinator } from '../goalStrategyCoordinator';
import { GoalExecutionPlanner } from '../goalExecutionPlanner';
import { GoalStateCoordinator } from '../goalStateCoordinator';
import { GoalPolicyEngine } from '../goalPolicyEngine';
import { GoalResourceAllocator } from '../goalResourceAllocator';
import { GoalMetricsEngine } from '../goalMetricsEngine';
import { GoalHistoryAggregator } from '../goalHistoryAggregator';
import { OrchestrationEvents } from '../orchestrationEvents';
import {
  DEFAULT_ORCHESTRATION_CONFIGURATION,
  createOrchestrationConfiguration,
} from '../orchestrationConfiguration';
import {
  generateOrchestrationId,
  generateDecisionId,
  getOrchestrationTypeLabel,
  getOrchestrationStateLabel,
  getResourceTypeLabel,
  getOrchestrationConflictTypeLabel,
  getOrchestrationDependencyTypeLabel,
  getOrchestrationHistoryActionLabel,
  getOrchestrationEventTypeLabel,
  createDefaultPriorityRules,
  createDefaultOrchestrationConflictRules,
  createDefaultSchedulingRules,
  createDefaultResourcePolicies,
  createDefaultEnterprisePolicies,
  createDefaultOrchestrationFeatureFlags,
} from '../types';
import type {
  Goal,
  OrchestrationInput,
  OrchestrationConfiguration,
  OrchestrationProviderPlugin,
  GoalMeasurementInput,
  OrchestrationType,
  OrchestrationState,
  OrchestrationConflictType,
} from '../types';
import { generateGoalId } from '../../types';

// ── Helpers ──────────────────────────────────────────────────

const DC: OrchestrationConfiguration = DEFAULT_ORCHESTRATION_CONFIGURATION;

function mockGoal(overrides: Partial<Goal> = {}): Goal {
  const id = overrides.id ?? generateGoalId();
  const now = new Date().toISOString();
  return {
    id,
    name: overrides.name ?? 'Test Goal',
    description: overrides.description ?? 'Test Description',
    category: overrides.category ?? 'performance',
    priority: overrides.priority ?? 'high',
    status: overrides.status ?? 'started',
    targetMetric: overrides.targetMetric ?? 'health_score',
    targetValue: overrides.targetValue ?? 90,
    currentValue: overrides.currentValue ?? 50,
    progress: overrides.progress ?? 0.5,
    confidence: overrides.confidence ?? 0.7,
    strategy: overrides.strategy ?? {
      type: 'adaptive',
      steps: [
        { id: 's1', name: 'Step 1', description: 'Test step', action: 'test', module: 'smart-optimize', priority: 'high', estimatedImpact: 0.3, evidence: [], futureMetadata: {} },
        { id: 's2', name: 'Step 2', description: 'Test step 2', action: 'test2', module: 'smart-optimize', priority: 'medium', estimatedImpact: 0.2, evidence: [], futureMetadata: {} },
      ],
      estimatedDurationMs: 120000,
      estimatedEffort: 'medium',
      riskLevel: 'low',
      confidence: 0.7,
      rationale: 'Test rationale',
      futureMetadata: {},
    },
    estimatedCompletion: overrides.estimatedCompletion ?? null,
    dependencies: overrides.dependencies ?? [],
    constraints: overrides.constraints ?? [],
    recommendations: overrides.recommendations ?? [],
    evidence: overrides.evidence ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    startedAt: overrides.startedAt ?? now,
    completedAt: overrides.completedAt ?? null,
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function mockMeasurementInput(): GoalMeasurementInput {
  return {
    goalId: 'test',
    timelineEvents: [],
    recommendations: [
      { id: 'r1', category: 'performance', priority: 'high', confidence: 0.8, accepted: true },
    ],
    predictions: [
      { type: 'health', confidence: 0.75, predictedValue: 85, timestamp: new Date().toISOString() },
    ],
    maintenanceResults: [],
    optimizationHistory: [],
    healthScore: 65,
    deviceProfile: { profileType: 'desktop', performanceTier: 'high', confidence: 0.9 },
    systemMetrics: {
      cpuUsage: 30,
      memoryUsage: 50,
      diskUsage: 60,
      bootTimeMs: 15000,
      freeDiskSpaceBytes: 50000000000,
      backgroundProcessCount: 80,
      privacyScore: 70,
      securityScore: 75,
      startupDurationMs: 12000,
      appLaunchTimeMs: 2000,
      batteryLevel: null,
      batteryUsagePerHour: null,
      futureMetrics: {},
    },
    futureData: {},
  };
}

function mockInput(goals: Goal[] = [mockGoal()]): OrchestrationInput {
  return {
    goals,
    measurementInput: mockMeasurementInput(),
    systemMetrics: null,
    deviceProfile: { profileType: 'desktop', performanceTier: 'high', confidence: 0.9 },
    healthScore: 65,
    enterprisePolicies: [],
    userPreferences: {},
    futureData: {},
  };
}

function mockProviderPlugin(
  name: string = 'test-provider',
  type: OrchestrationType = 'single',
): OrchestrationProviderPlugin {
  return {
    getPluginName: () => name,
    getVersion: () => '1.0.0',
    getPriority: () => 10,
    isAvailable: () => true,
    getOrchestrationType: () => type,
    prioritize: () => null,
    resolveConflicts: () => null,
    allocateResources: () => null,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('Goal Orchestration Engine', () => {

  // ── Types & Helpers ──────────────────────────────────────

  describe('Types & Helpers', () => {
    it('generateOrchestrationId produces unique ids', () => {
      const a = generateOrchestrationId();
      const b = generateOrchestrationId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^orch_/);
    });

    it('generateDecisionId produces unique ids', () => {
      const a = generateDecisionId();
      const b = generateDecisionId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^dec_/);
    });

    it('getOrchestrationTypeLabel works', () => {
      expect(getOrchestrationTypeLabel('single')).toBe('Single Goal');
      expect(getOrchestrationTypeLabel('multiple')).toBe('Multiple Goals');
      expect(getOrchestrationTypeLabel('enterprise')).toBe('Enterprise Goals');
    });

    it('getOrchestrationStateLabel works', () => {
      expect(getOrchestrationStateLabel('pending')).toBe('Pending');
      expect(getOrchestrationStateLabel('executing')).toBe('Executing');
      expect(getOrchestrationStateLabel('completed')).toBe('Completed');
    });

    it('getResourceTypeLabel works', () => {
      expect(getResourceTypeLabel('cpu_budget')).toBe('CPU Budget');
      expect(getResourceTypeLabel('memory_budget')).toBe('Memory Budget');
      expect(getResourceTypeLabel('execution_slot')).toBe('Execution Slot');
    });

    it('getOrchestrationConflictTypeLabel works', () => {
      expect(getOrchestrationConflictTypeLabel('performance_vs_battery')).toBe('Performance vs Battery');
      expect(getOrchestrationConflictTypeLabel('security_vs_speed')).toBe('Security vs Speed');
    });

    it('getOrchestrationDependencyTypeLabel works', () => {
      expect(getOrchestrationDependencyTypeLabel('chain')).toBe('Chain');
      expect(getOrchestrationDependencyTypeLabel('mutually_exclusive')).toBe('Mutually Exclusive');
    });

    it('getOrchestrationHistoryActionLabel works', () => {
      expect(getOrchestrationHistoryActionLabel('orchestration_started')).toBe('Orchestration Started');
      expect(getOrchestrationHistoryActionLabel('goal_deferred')).toBe('Goal Deferred');
    });

    it('getOrchestrationEventTypeLabel works', () => {
      expect(getOrchestrationEventTypeLabel('goals_prioritized')).toBe('Goals Prioritized');
      expect(getOrchestrationEventTypeLabel('resources_allocated')).toBe('Resources Allocated');
    });

    it('createDefaultPriorityRules has defaults', () => {
      const rules = createDefaultPriorityRules();
      expect(rules.priorityWeight).toBeGreaterThan(0);
      expect(rules.maxActiveGoals).toBe(5);
    });

    it('createDefaultOrchestrationConflictRules has defaults', () => {
      const rules = createDefaultOrchestrationConflictRules();
      expect(rules.autoResolve).toBe(true);
      expect(rules.maxConflictsBeforePause).toBe(3);
    });

    it('createDefaultSchedulingRules has defaults', () => {
      const rules = createDefaultSchedulingRules();
      expect(rules.defaultIntervalMs).toBe(3600000);
      expect(rules.maxConcurrentExecutions).toBe(3);
    });

    it('createDefaultResourcePolicies has defaults', () => {
      const policies = createDefaultResourcePolicies();
      expect(policies.maxCpuBudget).toBe(100);
      expect(policies.maxExecutionSlots).toBe(3);
    });

    it('createDefaultEnterprisePolicies has defaults', () => {
      const policies = createDefaultEnterprisePolicies();
      expect(policies.enforcePolicies).toBe(false);
      expect(policies.allowedGoalTypes).toEqual([]);
    });

    it('createDefaultOrchestrationFeatureFlags has defaults', () => {
      const flags = createDefaultOrchestrationFeatureFlags();
      expect(flags.enableOrchestration).toBe(true);
      expect(flags.enablePrioritization).toBe(true);
      expect(flags.enableExplainability).toBe(true);
    });
  });

  // ── Configuration ────────────────────────────────────────

  describe('OrchestrationConfiguration', () => {
    it('has defaults', () => {
      expect(DC.configVersion).toBe('1.0.0');
      expect(DC.performanceTargetMs).toBe(150);
      expect(DC.maxOrchestrations).toBe(100);
    });

    it('accepts overrides', () => {
      const config = createOrchestrationConfiguration({ configVersion: '2.0.0' });
      expect(config.configVersion).toBe('2.0.0');
      expect(config.priorityRules.maxActiveGoals).toBe(5);
    });

    it('merges priorityRules', () => {
      const config = createOrchestrationConfiguration({
        priorityRules: { maxActiveGoals: 10 },
      });
      expect(config.priorityRules.maxActiveGoals).toBe(10);
      expect(config.priorityRules.priorityWeight).toBe(0.25);
    });

    it('merges featureFlags', () => {
      const config = createOrchestrationConfiguration({
        featureFlags: { enableOrchestration: false },
      });
      expect(config.featureFlags.enableOrchestration).toBe(false);
      expect(config.featureFlags.enablePrioritization).toBe(true);
    });

    it('merges schedulingRules', () => {
      const config = createOrchestrationConfiguration({
        schedulingRules: { maxConcurrentExecutions: 5 },
      });
      expect(config.schedulingRules.maxConcurrentExecutions).toBe(5);
    });

    it('merges resourcePolicies', () => {
      const config = createOrchestrationConfiguration({
        resourcePolicies: { maxCpuBudget: 200 },
      });
      expect(config.resourcePolicies.maxCpuBudget).toBe(200);
    });

    it('merges enterprisePolicies', () => {
      const config = createOrchestrationConfiguration({
        enterprisePolicies: { enforcePolicies: true, blockedGoalTypes: ['gaming'] },
      });
      expect(config.enterprisePolicies.enforcePolicies).toBe(true);
      expect(config.enterprisePolicies.blockedGoalTypes).toEqual(['gaming']);
    });
  });

  // ── Events ───────────────────────────────────────────────

  describe('OrchestrationEvents', () => {
    let events: OrchestrationEvents;

    beforeEach(() => {
      events = new OrchestrationEvents();
    });

    it('on/emit receives events', () => {
      let received = false;
      events.on('goal_orchestration_started', () => { received = true; });
      events.emitOrchestrationStarted('orch_1', { test: true });
      expect(received).toBe(true);
    });

    it('off removes listener', () => {
      let count = 0;
      const listener = () => { count++; };
      events.on('goals_prioritized', listener);
      events.emitGoalsPrioritized('orch_1', {});
      events.off('goals_prioritized', listener);
      events.emitGoalsPrioritized('orch_1', {});
      expect(count).toBe(1);
    });

    it('on returns unsubscribe', () => {
      let count = 0;
      const unsub = events.on('goal_completed', () => { count++; });
      events.emitGoalCompleted('orch_1', 'goal_1', {});
      unsub();
      events.emitGoalCompleted('orch_1', 'goal_1', {});
      expect(count).toBe(1);
    });

    it('emitConflictDetected works', () => {
      let received = false;
      events.on('conflict_detected', () => { received = true; });
      events.emitConflictDetected('orch_1', 'goal_1', {});
      expect(received).toBe(true);
    });

    it('emitConflictResolved works', () => {
      let received = false;
      events.on('conflict_resolved', () => { received = true; });
      events.emitConflictResolved('orch_1', 'goal_1', {});
      expect(received).toBe(true);
    });

    it('emitResourcesAllocated works', () => {
      let received = false;
      events.on('resources_allocated', () => { received = true; });
      events.emitResourcesAllocated('orch_1', {});
      expect(received).toBe(true);
    });

    it('emitStrategyGenerated works', () => {
      let received = false;
      events.on('strategy_generated', () => { received = true; });
      events.emitStrategyGenerated('orch_1', 'goal_1', {});
      expect(received).toBe(true);
    });

    it('emitGoalDeferred works', () => {
      let received = false;
      events.on('goal_deferred', () => { received = true; });
      events.emitGoalDeferred('orch_1', 'goal_1', {});
      expect(received).toBe(true);
    });

    it('clear removes all', () => {
      events.on('goal_orchestration_started', () => {});
      events.clear();
      expect(events.listenerCount()).toBe(0);
    });

    it('listenerCount returns correct count', () => {
      events.on('goal_orchestration_started', () => {});
      events.on('goal_orchestration_started', () => {});
      events.on('goals_prioritized', () => {});
      expect(events.listenerCount()).toBe(3);
      expect(events.listenerCount('goal_orchestration_started')).toBe(2);
    });

    it('does not crash on listener error', () => {
      events.on('goal_orchestration_started', () => { throw new Error('test'); });
      expect(() => events.emitOrchestrationStarted('orch_1', {})).not.toThrow();
    });

    it('emitConflictDetected with null goalId', () => {
      let received = false;
      events.on('conflict_detected', () => { received = true; });
      events.emitConflictDetected('orch_1', null, {});
      expect(received).toBe(true);
    });
  });

  // ── Priority Engine ──────────────────────────────────────

  describe('GoalPriorityEngine', () => {
    let engine: GoalPriorityEngine;

    beforeEach(() => {
      engine = new GoalPriorityEngine(DC);
    });

    it('prioritizes goals', () => {
      const goals = [
        mockGoal({ id: 'g1', priority: 'high' }),
        mockGoal({ id: 'g2', priority: 'critical' }),
        mockGoal({ id: 'g3', priority: 'low' }),
      ];
      const scores = engine.prioritize(goals, mockInput(goals));
      expect(scores.length).toBe(3);
      expect(scores[0]!.goalId).toBe('g2');
      expect(scores[0]!.rank).toBe(1);
    });

    it('computes priority factors', () => {
      const goal = mockGoal({ priority: 'critical' });
      const scores = engine.prioritize([goal], mockInput([goal]));
      expect(scores[0]!.factors.goalPriority).toBe(1);
      expect(scores[0]!.factors.urgency).toBe(1);
    });

    it('assigns ranks in order', () => {
      const goals = [
        mockGoal({ id: 'g1', priority: 'low' }),
        mockGoal({ id: 'g2', priority: 'critical' }),
        mockGoal({ id: 'g3', priority: 'medium' }),
      ];
      const scores = engine.prioritize(goals, mockInput(goals));
      expect(scores[0]!.rank).toBe(1);
      expect(scores[1]!.rank).toBe(2);
      expect(scores[2]!.rank).toBe(3);
    });

    it('collects evidence', () => {
      const goal = mockGoal();
      const scores = engine.prioritize([goal], mockInput([goal]));
      expect(scores[0]!.evidence.length).toBeGreaterThan(0);
    });

    it('generates reason', () => {
      const goal = mockGoal({ name: 'My Goal' });
      const scores = engine.prioritize([goal], mockInput([goal]));
      expect(scores[0]!.reason).toContain('My Goal');
    });

    it('getTopGoals returns top N', () => {
      const goals = Array.from({ length: 5 }, (_, i) =>
        mockGoal({ id: `g${i}`, priority: i === 0 ? 'critical' : 'low' }),
      );
      const scores = engine.prioritize(goals, mockInput(goals));
      const top = engine.getTopGoals(scores, 2);
      expect(top.length).toBe(2);
      expect(top[0]!.goalId).toBe('g0');
    });

    it('getDeferredGoals returns rest', () => {
      const goals = Array.from({ length: 5 }, (_, i) =>
        mockGoal({ id: `g${i}`, priority: i === 0 ? 'critical' : 'low' }),
      );
      const scores = engine.prioritize(goals, mockInput(goals));
      const deferred = engine.getDeferredGoals(scores, 2);
      expect(deferred.length).toBe(3);
    });

    it('registers provider', () => {
      expect(engine.registerProvider(mockProviderPlugin())).toBe(true);
      expect(engine.registerProvider(mockProviderPlugin())).toBe(false);
    });

    it('filters out non-active goals', () => {
      const goals = [
        mockGoal({ id: 'g1', status: 'completed' }),
        mockGoal({ id: 'g2', status: 'started' }),
      ];
      const scores = engine.prioritize(goals, mockInput(goals));
      expect(scores.length).toBe(1);
      expect(scores[0]!.goalId).toBe('g2');
    });
  });

  // ── Conflict Engine ──────────────────────────────────────

  describe('GoalConflictEngine', () => {
    let engine: GoalConflictEngine;

    beforeEach(() => {
      engine = new GoalConflictEngine(DC);
    });

    it('detects performance vs battery', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance' }),
        mockGoal({ id: 'g2', category: 'battery' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts.some((c) => c.type === 'performance_vs_battery')).toBe(true);
    });

    it('detects gaming vs maintenance', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'gaming' }),
        mockGoal({ id: 'g2', category: 'health' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.some((c) => c.type === 'gaming_vs_maintenance')).toBe(true);
    });

    it('detects privacy vs convenience', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'privacy' }),
        mockGoal({ id: 'g2', category: 'performance' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.some((c) => c.type === 'privacy_vs_convenience')).toBe(true);
    });

    it('detects storage vs performance', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'storage' }),
        mockGoal({ id: 'g2', category: 'performance' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.some((c) => c.type === 'storage_vs_performance')).toBe(true);
    });

    it('detects security vs speed', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'security' }),
        mockGoal({ id: 'g2', category: 'performance' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.some((c) => c.type === 'security_vs_speed')).toBe(true);
    });

    it('detects business vs entertainment', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'business' }),
        mockGoal({ id: 'g2', category: 'gaming' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.some((c) => c.type === 'business_vs_entertainment')).toBe(true);
    });

    it('resolves pairwise conflict by priority', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance', priority: 'critical' }),
        mockGoal({ id: 'g2', category: 'battery', priority: 'low' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      const goalMap = new Map(goals.map((g) => [g.id, g]));
      const resolved = engine.resolve(conflicts[0]!, goalMap);
      expect(resolved.resolution).not.toBeNull();
      expect(resolved.resolution!.winningGoalId).toBe('g1');
      expect(resolved.resolution!.deferredGoalId).toBe('g2');
    });

    it('resolves all conflicts', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance', priority: 'critical' }),
        mockGoal({ id: 'g2', category: 'battery', priority: 'low' }),
        mockGoal({ id: 'g3', category: 'gaming', priority: 'high' }),
        mockGoal({ id: 'g4', category: 'health', priority: 'medium' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      const goalMap = new Map(goals.map((g) => [g.id, g]));
      const resolved = engine.resolveAll(conflicts, goalMap);
      for (const c of resolved) {
        expect(c.resolution).not.toBeNull();
      }
    });

    it('no conflict for non-active goals', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance', status: 'completed' }),
        mockGoal({ id: 'g2', category: 'battery', status: 'completed' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      expect(conflicts.length).toBe(0);
    });

    it('resolution includes alternative strategy', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance', priority: 'critical' }),
        mockGoal({ id: 'g2', category: 'battery', priority: 'low' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      const goalMap = new Map(goals.map((g) => [g.id, g]));
      const resolved = engine.resolve(conflicts[0]!, goalMap);
      expect(resolved.resolution!.alternativeStrategy).toBeTruthy();
    });

    it('registers provider', () => {
      expect(engine.registerProvider(mockProviderPlugin())).toBe(true);
      expect(engine.registerProvider(mockProviderPlugin())).toBe(false);
    });

    it('getConflictEvidence returns evidence', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance', priority: 'critical' }),
        mockGoal({ id: 'g2', category: 'battery', priority: 'low' }),
      ];
      const conflicts = engine.detectConflicts(goals);
      const goalMap = new Map(goals.map((g) => [g.id, g]));
      const evidence = engine.getConflictEvidence(conflicts[0]!, goalMap);
      expect(evidence.length).toBeGreaterThan(0);
    });
  });

  // ── Dependency Resolver ──────────────────────────────────

  describe('GoalDependencyResolver', () => {
    let resolver: GoalDependencyResolver;

    beforeEach(() => {
      resolver = new GoalDependencyResolver();
    });

    it('resolves goal with no dependencies', () => {
      const goal = mockGoal();
      const allGoals = new Map([[goal.id, goal]]);
      const res = resolver.resolve(goal, allGoals);
      expect(res.canExecute).toBe(true);
      expect(res.blockingDependencies).toEqual([]);
    });

    it('detects blocking dependencies', () => {
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b', status: 'started' });
      goalA.dependencies = [{ id: 'd1', goalId: 'b', type: 'blocking', required: true, description: 'test', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const res = resolver.resolve(goalA, allGoals);
      expect(res.canExecute).toBe(false);
      expect(res.blockingDependencies).toContain('b');
    });

    it('passes when blocking dep is completed', () => {
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b', status: 'completed' });
      goalA.dependencies = [{ id: 'd1', goalId: 'b', type: 'blocking', required: true, description: 'test', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const res = resolver.resolve(goalA, allGoals);
      expect(res.canExecute).toBe(true);
    });

    it('resolves all goals with execution order', () => {
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b' });
      goalB.dependencies = [{ id: 'd1', goalId: 'a', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const results = resolver.resolveAll([goalA, goalB], allGoals);
      expect(results.length).toBe(2);
      const aRes = results.find((r) => r.goalId === 'a')!;
      const bRes = results.find((r) => r.goalId === 'b')!;
      expect(aRes.executionOrder).toBeLessThanOrEqual(bRes.executionOrder);
    });

    it('builds dependency graph', () => {
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b' });
      goalB.dependencies = [{ id: 'd1', goalId: 'a', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const graph = resolver.buildGraph([goalA, goalB], allGoals);
      expect(graph.nodes.length).toBe(2);
      expect(graph.edges.length).toBe(1);
      expect(graph.edges[0]!.from).toBe('b');
      expect(graph.edges[0]!.to).toBe('a');
    });

    it('getDependents finds dependents', () => {
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b' });
      goalB.dependencies = [{ id: 'd1', goalId: 'a', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const dependents = resolver.getDependents('a', allGoals);
      expect(dependents.length).toBe(1);
      expect(dependents[0]!.id).toBe('b');
    });

    it('getMutuallyExclusive returns blocking deps', () => {
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b' });
      goalA.dependencies = [{ id: 'd1', goalId: 'b', type: 'blocking', required: true, description: 'test', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const exclusive = resolver.getMutuallyExclusive(goalA, allGoals);
      expect(exclusive.length).toBe(1);
      expect(exclusive[0]!.id).toBe('b');
    });

    it('getSharedObjectives finds goals with same metric', () => {
      const goalA = mockGoal({ id: 'a', targetMetric: 'health_score' });
      const goalB = mockGoal({ id: 'b', targetMetric: 'health_score' });
      const goalC = mockGoal({ id: 'c', targetMetric: 'cpu_usage' });
      const allGoals = new Map([['a', goalA], ['b', goalB], ['c', goalC]]);
      const shared = resolver.getSharedObjectives(goalA, allGoals);
      expect(shared.length).toBe(1);
      expect(shared[0]!.id).toBe('b');
    });
  });

  // ── Scheduling Engine ────────────────────────────────────

  describe('GoalSchedulingEngine', () => {
    let engine: GoalSchedulingEngine;

    beforeEach(() => {
      engine = new GoalSchedulingEngine(DC);
    });

    it('schedules a goal', () => {
      const goal = mockGoal();
      const sched = engine.schedule(goal, 1);
      expect(sched.goalId).toBe(goal.id);
      expect(sched.priority).toBe(1);
      expect(sched.nextRunAt).toBeTruthy();
    });

    it('unschedules', () => {
      const goal = mockGoal();
      engine.schedule(goal, 1);
      expect(engine.unschedule(goal.id)).toBe(true);
      expect(engine.getSchedule(goal.id)).toBeUndefined();
    });

    it('getSchedule returns schedule', () => {
      const goal = mockGoal();
      engine.schedule(goal, 1);
      expect(engine.getSchedule(goal.id)).toBeDefined();
    });

    it('getDueSchedules returns due', () => {
      const goal = mockGoal({ strategy: { type: 'one_time', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} } });
      engine.schedule(goal, 1);
      const future = new Date(Date.now() + 120000).toISOString();
      expect(engine.getDueSchedules(future).length).toBe(1);
    });

    it('updateNextRun for recurring', () => {
      const goal = mockGoal({ strategy: { type: 'continuous', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} } });
      engine.schedule(goal, 1);
      const updated = engine.updateNextRun(goal.id);
      expect(updated).toBeDefined();
    });

    it('updateNextRun for one-time removes', () => {
      const goal = mockGoal({ strategy: { type: 'one_time', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} } });
      engine.schedule(goal, 1);
      const updated = engine.updateNextRun(goal.id);
      expect(updated).toBeNull();
      expect(engine.getSchedule(goal.id)).toBeUndefined();
    });

    it('canScheduleMore respects max concurrent', () => {
      expect(engine.canScheduleMore()).toBe(true);
      expect(engine.getMaxConcurrent()).toBe(3);
    });

    it('clear removes all', () => {
      const goal = mockGoal();
      engine.schedule(goal, 1);
      engine.clear();
      expect(engine.getAllSchedules().length).toBe(0);
    });
  });

  // ── Strategy Coordinator ─────────────────────────────────

  describe('GoalStrategyCoordinator', () => {
    let coordinator: GoalStrategyCoordinator;

    beforeEach(() => {
      coordinator = new GoalStrategyCoordinator(DC);
    });

    it('coordinates a goal', () => {
      const goal = mockGoal();
      const result = coordinator.coordinate(goal, mockInput([goal]));
      expect(result.goalId).toBe(goal.id);
      expect(result.coordinatedModules.length).toBeGreaterThan(0);
      expect(result.coordinatedModules).toContain('optimization-planner');
    });

    it('includes recommendation engine when recommendations available', () => {
      const goal = mockGoal();
      const input = mockInput([goal]);
      const result = coordinator.coordinate(goal, input);
      expect(result.coordinatedModules).toContain('recommendation-engine');
    });

    it('includes prediction engine when predictions available', () => {
      const goal = mockGoal();
      const input = mockInput([goal]);
      const result = coordinator.coordinate(goal, input);
      expect(result.coordinatedModules).toContain('prediction-engine');
    });

    it('includes simulation for high-risk goals', () => {
      const goal = mockGoal({
        strategy: { type: 'adaptive', steps: [], estimatedDurationMs: 0, estimatedEffort: 'high', riskLevel: 'high', confidence: 0.5, rationale: '', futureMetadata: {} },
      });
      const result = coordinator.coordinate(goal, mockInput([goal]));
      expect(result.coordinatedModules).toContain('simulation');
    });

    it('includes recovery for security goals', () => {
      const goal = mockGoal({ category: 'security' });
      const result = coordinator.coordinate(goal, mockInput([goal]));
      expect(result.coordinatedModules).toContain('recovery');
    });

    it('estimates resources', () => {
      const goal = mockGoal();
      const result = coordinator.coordinate(goal, mockInput([goal]));
      expect(result.resourceRequirements.length).toBeGreaterThan(0);
    });

    it('generates alternative strategy', () => {
      const goal = mockGoal();
      const result = coordinator.coordinate(goal, mockInput([goal]));
      expect(result.alternativeStrategy).toBeTruthy();
    });

    it('coordinates all goals', () => {
      const goals = [mockGoal({ id: 'g1' }), mockGoal({ id: 'g2' })];
      const results = coordinator.coordinateAll(goals, mockInput(goals));
      expect(results.length).toBe(2);
    });
  });

  // ── Execution Planner ────────────────────────────────────

  describe('GoalExecutionPlanner', () => {
    let planner: GoalExecutionPlanner;

    beforeEach(() => {
      planner = new GoalExecutionPlanner(DC);
    });

    it('plans a goal', () => {
      const goal = mockGoal();
      const coordinator = new GoalStrategyCoordinator(DC);
      const strategy = coordinator.coordinate(goal, mockInput([goal]));
      const plan = planner.plan(goal, strategy);
      expect(plan.goalId).toBe(goal.id);
      expect(plan.steps.length).toBe(goal.strategy.steps.length);
      expect(plan.state).toBe('pending');
    });

    it('plan has estimated duration', () => {
      const goal = mockGoal();
      const coordinator = new GoalStrategyCoordinator(DC);
      const strategy = coordinator.coordinate(goal, mockInput([goal]));
      const plan = planner.plan(goal, strategy);
      expect(plan.estimatedDurationMs).toBeGreaterThan(0);
    });

    it('plan has resource usage', () => {
      const goal = mockGoal();
      const coordinator = new GoalStrategyCoordinator(DC);
      const strategy = coordinator.coordinate(goal, mockInput([goal]));
      const plan = planner.plan(goal, strategy);
      expect(plan.resourceUsage.length).toBeGreaterThan(0);
    });

    it('plan has dependencies', () => {
      const goal = mockGoal({
        dependencies: [{ id: 'd1', goalId: 'other', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} }],
      });
      const coordinator = new GoalStrategyCoordinator(DC);
      const strategy = coordinator.coordinate(goal, mockInput([goal]));
      const plan = planner.plan(goal, strategy);
      expect(plan.dependencies).toContain('other');
    });

    it('planAll plans multiple goals', () => {
      const goals = [mockGoal({ id: 'g1' }), mockGoal({ id: 'g2' })];
      const coordinator = new GoalStrategyCoordinator(DC);
      const strategies = coordinator.coordinateAll(goals, mockInput(goals));
      const plans = planner.planAll(goals, strategies);
      expect(plans.length).toBe(2);
    });

    it('updateState changes plan state', () => {
      const goal = mockGoal();
      const coordinator = new GoalStrategyCoordinator(DC);
      const strategy = coordinator.coordinate(goal, mockInput([goal]));
      const plan = planner.plan(goal, strategy);
      const updated = planner.updateState(plan, 'executing');
      expect(updated.state).toBe('executing');
    });
  });

  // ── State Coordinator ────────────────────────────────────

  describe('GoalStateCoordinator', () => {
    let coordinator: GoalStateCoordinator;

    beforeEach(() => {
      coordinator = new GoalStateCoordinator();
    });

    it('sets and gets state', () => {
      coordinator.setState('g1', 'executing');
      expect(coordinator.getState('g1')).toBe('executing');
    });

    it('default state is pending', () => {
      expect(coordinator.getState('unknown')).toBe('pending');
    });

    it('valid transition pending → planning', () => {
      const result = coordinator.transition('g1', 'planning');
      expect(result).toBe('planning');
    });

    it('invalid transition completed → executing', () => {
      coordinator.setState('g1', 'completed');
      const result = coordinator.transition('g1', 'executing');
      expect(result).toBe('completed');
    });

    it('valid transition planning → executing', () => {
      coordinator.setState('g1', 'planning');
      const result = coordinator.transition('g1', 'executing');
      expect(result).toBe('executing');
    });

    it('valid transition executing → completed', () => {
      coordinator.setState('g1', 'executing');
      const result = coordinator.transition('g1', 'completed');
      expect(result).toBe('completed');
    });

    it('valid transition executing → paused', () => {
      coordinator.setState('g1', 'executing');
      const result = coordinator.transition('g1', 'paused');
      expect(result).toBe('paused');
    });

    it('valid transition paused → executing', () => {
      coordinator.setState('g1', 'paused');
      const result = coordinator.transition('g1', 'executing');
      expect(result).toBe('executing');
    });

    it('valid transition blocked → planning', () => {
      coordinator.setState('g1', 'blocked');
      const result = coordinator.transition('g1', 'planning');
      expect(result).toBe('planning');
    });

    it('getStatus returns correct status', () => {
      const goals = [mockGoal({ id: 'g1' }), mockGoal({ id: 'g2' })];
      coordinator.setState('g1', 'executing');
      coordinator.setState('g2', 'pending');
      const status = coordinator.getStatus(goals);
      expect(status.activeGoals).toContain('g1');
      expect(status.pendingGoals).toContain('g2');
    });

    it('clear resets', () => {
      coordinator.setState('g1', 'executing');
      coordinator.clear();
      expect(coordinator.getState('g1')).toBe('pending');
    });

    it('clearForGoal resets single goal', () => {
      coordinator.setState('g1', 'executing');
      coordinator.setState('g2', 'planning');
      coordinator.clearForGoal('g1');
      expect(coordinator.getState('g1')).toBe('pending');
      expect(coordinator.getState('g2')).toBe('planning');
    });
  });

  // ── Policy Engine ────────────────────────────────────────

  describe('GoalPolicyEngine', () => {
    let engine: GoalPolicyEngine;

    beforeEach(() => {
      engine = new GoalPolicyEngine(DC);
    });

    it('registers builtin policies', () => {
      const policies = engine.getPolicies();
      expect(policies.length).toBeGreaterThan(0);
      expect(policies.some((p) => p.name === 'Critical Priority Policy')).toBe(true);
    });

    it('registers custom policy', () => {
      const policy = engine.createPolicy(
        'Custom Policy',
        'Test policy',
        'priority',
        [{ field: 'priority', operator: 'eq', value: 'low', action: 'block', description: 'Block low priority', futureMetadata: {} }],
        50,
      );
      expect(engine.registerPolicy(policy)).toBe(true);
      expect(engine.getPolicies().some((p) => p.name === 'Custom Policy')).toBe(true);
    });

    it('rejects duplicate policy', () => {
      const policy = engine.createPolicy('Test', 'Test', 'priority', [], 50);
      engine.registerPolicy(policy);
      const policy2 = engine.createPolicy('Test', 'Test', 'priority', [], 50);
      policy2.id = policy.id;
      expect(engine.registerPolicy(policy2)).toBe(false);
    });

    it('unregisters policy', () => {
      const policy = engine.createPolicy('Test', 'Test', 'priority', [], 50);
      engine.registerPolicy(policy);
      expect(engine.unregisterPolicy(policy.id)).toBe(true);
      expect(engine.getPolicies().some((p) => p.id === policy.id)).toBe(false);
    });

    it('enables and disables policy', () => {
      const policy = engine.createPolicy('Test', 'Test', 'priority', [], 50);
      engine.registerPolicy(policy);
      expect(engine.disablePolicy(policy.id)).toBe(true);
      expect(engine.getEnabledPolicies().some((p) => p.id === policy.id)).toBe(false);
      expect(engine.enablePolicy(policy.id)).toBe(true);
      expect(engine.getEnabledPolicies().some((p) => p.id === policy.id)).toBe(true);
    });

    it('evaluateGoal allows by default', () => {
      const goal = mockGoal();
      const result = engine.evaluateGoal(goal);
      expect(result.allowed).toBe(true);
    });

    it('evaluateGoal blocks when policy matches', () => {
      const config = createOrchestrationConfiguration({
        enterprisePolicies: { enforcePolicies: true, blockedGoalTypes: ['gaming'], allowedGoalTypes: [], policyOverrides: false, futureConfig: {} },
      });
      engine = new GoalPolicyEngine(config);
      const goal = mockGoal({ category: 'gaming' });
      const result = engine.evaluateGoal(goal);
      expect(result.allowed).toBe(false);
    });

    it('clear removes all policies', () => {
      engine.clear();
      expect(engine.getPolicies().length).toBe(0);
    });
  });

  // ── Resource Allocator ───────────────────────────────────

  describe('GoalResourceAllocator', () => {
    let allocator: GoalResourceAllocator;

    beforeEach(() => {
      allocator = new GoalResourceAllocator(DC);
    });

    it('allocates resources for active goals', () => {
      const goals = [mockGoal({ id: 'g1', priority: 'critical' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      expect(allocations.length).toBeGreaterThan(0);
    });

    it('higher priority gets more resources', () => {
      const goals = [
        mockGoal({ id: 'g1', priority: 'critical' }),
        mockGoal({ id: 'g2', priority: 'low' }),
      ];
      const allocations = allocator.allocate(goals, mockInput(goals));
      const g1Cpu = allocations.find((a) => a.goalId === 'g1' && a.resourceType === 'cpu_budget');
      const g2Cpu = allocations.find((a) => a.goalId === 'g2' && a.resourceType === 'cpu_budget');
      expect(g1Cpu!.allocatedAmount).toBeGreaterThan(g2Cpu!.allocatedAmount);
    });

    it('allocates execution slots', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      expect(allocations.some((a) => a.resourceType === 'execution_slot')).toBe(true);
    });

    it('allocates maintenance windows', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      expect(allocations.some((a) => a.resourceType === 'maintenance_window')).toBe(true);
    });

    it('getTotalAllocated sums correctly', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      const totals = allocator.getTotalAllocated(allocations);
      expect(totals.cpu_budget).toBeGreaterThan(0);
    });

    it('isWithinBudget returns true for small allocation', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      expect(allocator.isWithinBudget(allocations)).toBe(true);
    });

    it('getUtilizationRate returns rates', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      const rates = allocator.getUtilizationRate(allocations);
      expect(rates.cpu_budget).toBeGreaterThan(0);
      expect(rates.cpu_budget).toBeLessThanOrEqual(1);
    });

    it('registers provider', () => {
      expect(allocator.registerProvider(mockProviderPlugin())).toBe(true);
      expect(allocator.registerProvider(mockProviderPlugin())).toBe(false);
    });

    it('filters non-active goals', () => {
      const goals = [mockGoal({ id: 'g1', status: 'completed' })];
      const allocations = allocator.allocate(goals, mockInput(goals));
      expect(allocations.length).toBe(0);
    });
  });

  // ── Metrics Engine ───────────────────────────────────────

  describe('GoalMetricsEngine', () => {
    let engine: GoalMetricsEngine;

    beforeEach(() => {
      engine = new GoalMetricsEngine();
    });

    it('computes empty metrics', () => {
      const metrics = engine.computeMetrics([], [], [], []);
      expect(metrics.totalOrchestrations).toBe(0);
      expect(metrics.activeOrchestrations).toBe(0);
    });

    it('computes total orchestrations', () => {
      const goals = [mockGoal()];
      const history = [
        { id: 'h1', orchestrationId: 'o1', goalId: 'g1', action: 'orchestration_started' as const, timestamp: new Date().toISOString(), description: '', oldValue: null, newValue: null, evidence: [], futureMetadata: {} },
      ];
      const metrics = engine.computeMetrics(goals, history, [], []);
      expect(metrics.totalOrchestrations).toBe(1);
    });

    it('computes completion success rate', () => {
      const goals = [mockGoal()];
      const history = [
        { id: 'h1', orchestrationId: 'o1', goalId: 'g1', action: 'orchestration_started' as const, timestamp: new Date().toISOString(), description: '', oldValue: null, newValue: null, evidence: [], futureMetadata: {} },
        { id: 'h2', orchestrationId: 'o1', goalId: 'g1', action: 'goal_completed' as const, timestamp: new Date().toISOString(), description: '', oldValue: null, newValue: null, evidence: [], futureMetadata: {} },
      ];
      const metrics = engine.computeMetrics(goals, history, [], []);
      expect(metrics.completionSuccessRate).toBe(1);
    });

    it('computes conflict frequency', () => {
      const conflicts = [
        { id: 'c1', type: 'performance_vs_battery' as const, goalIds: ['g1', 'g2'], description: '', severity: 'high' as const, resolution: null, detectedAt: new Date().toISOString(), futureMetadata: {} },
        { id: 'c2', type: 'performance_vs_battery' as const, goalIds: ['g3', 'g4'], description: '', severity: 'medium' as const, resolution: null, detectedAt: new Date().toISOString(), futureMetadata: {} },
      ];
      const metrics = engine.computeMetrics([], [], conflicts, []);
      expect(metrics.conflictFrequency['performance_vs_battery']).toBe(2);
    });

    it('computes resource allocation summary', () => {
      const allocations = [
        { id: 'a1', goalId: 'g1', resourceType: 'cpu_budget' as const, allocatedAmount: 40, maxAmount: 100, unit: '%', reason: '', futureMetadata: {} },
        { id: 'a2', goalId: 'g1', resourceType: 'memory_budget' as const, allocatedAmount: 30, maxAmount: 100, unit: '%', reason: '', futureMetadata: {} },
      ];
      const metrics = engine.computeMetrics([], [], [], allocations);
      expect(metrics.resourceAllocationSummary.totalAllocated.cpu_budget).toBe(40);
      expect(metrics.resourceAllocationSummary.totalAllocated.memory_budget).toBe(30);
    });

    it('computes goal effectiveness', () => {
      const goals = [mockGoal({ id: 'g1', name: 'Test' })];
      const history = [
        { id: 'h1', orchestrationId: 'o1', goalId: 'g1', action: 'orchestration_started' as const, timestamp: new Date().toISOString(), description: '', oldValue: null, newValue: null, evidence: [], futureMetadata: {} },
        { id: 'h2', orchestrationId: 'o1', goalId: 'g1', action: 'goal_completed' as const, timestamp: new Date().toISOString(), description: '', oldValue: null, newValue: null, evidence: [], futureMetadata: {} },
      ];
      const metrics = engine.computeMetrics(goals, history, [], []);
      expect(metrics.goalEffectiveness.length).toBe(1);
      expect(metrics.goalEffectiveness[0]!.effectiveness).toBe(1);
    });

    it('computes average completion time', () => {
      const startTime = new Date('2024-01-01T00:00:00Z').toISOString();
      const endTime = new Date('2024-01-01T01:00:00Z').toISOString();
      const goals = [mockGoal({ startedAt: startTime, completedAt: endTime, status: 'completed' })];
      const metrics = engine.computeMetrics(goals, [], [], []);
      expect(metrics.averageCompletionTimeMs).toBe(3600000);
    });
  });

  // ── History Aggregator ───────────────────────────────────

  describe('GoalHistoryAggregator', () => {
    let history: GoalHistoryAggregator;

    beforeEach(() => {
      history = new GoalHistoryAggregator(100);
    });

    it('records entries', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      expect(history.count()).toBe(1);
    });

    it('getAll returns all', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      history.record('o1', 'g1', 'goals_prioritized', 'Prioritized');
      expect(history.getAll().length).toBe(2);
    });

    it('getByOrchestration filters', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      history.record('o2', 'g1', 'orchestration_started', 'Started');
      expect(history.getByOrchestration('o1').length).toBe(1);
    });

    it('getByGoal filters', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      history.record('o1', 'g2', 'orchestration_started', 'Started');
      expect(history.getByGoal('g1').length).toBe(1);
    });

    it('getByAction filters', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      history.record('o1', 'g1', 'goals_prioritized', 'Prioritized');
      expect(history.getByAction('orchestration_started').length).toBe(1);
    });

    it('getLatest returns last', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      history.record('o1', 'g1', 'goals_prioritized', 'Prioritized');
      const latest = history.getLatest();
      expect(latest!.action).toBe('goals_prioritized');
    });

    it('respects max entries', () => {
      history.setMaxEntries(3);
      for (let i = 0; i < 5; i++) {
        history.record('o1', 'g1', 'orchestration_started', `Entry ${i}`);
      }
      expect(history.count()).toBe(3);
    });

    it('clear resets', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Started');
      history.clear();
      expect(history.count()).toBe(0);
    });

    it('getEntriesSince filters by timestamp', () => {
      history.record('o1', 'g1', 'orchestration_started', 'Old');
      const cutoff = new Date(Date.now() + 5000).toISOString();
      // Wait is not needed — we test that old entries are excluded by a future cutoff
      const sinceCutoff = history.getEntriesSince(cutoff);
      expect(sinceCutoff.length).toBe(0);
    });
  });

  // ── Goal Orchestrator ────────────────────────────────────

  describe('GoalOrchestrator', () => {
    let orchestrator: GoalOrchestrator;

    beforeEach(() => {
      orchestrator = new GoalOrchestrator(DC);
    });

    it('orchestrates goals', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const result = orchestrator.orchestrateGoals(mockInput(goals));
      expect(result.decision).toBeDefined();
      expect(result.priorityScores.length).toBeGreaterThan(0);
      expect(result.status).toBeDefined();
    });

    it('orchestrates multiple goals', () => {
      const goals = [
        mockGoal({ id: 'g1', priority: 'critical' }),
        mockGoal({ id: 'g2', priority: 'low' }),
        mockGoal({ id: 'g3', priority: 'medium' }),
      ];
      const result = orchestrator.orchestrateGoals(mockInput(goals));
      expect(result.priorityScores.length).toBe(3);
      expect(result.decision.selectedGoals.length).toBeGreaterThan(0);
    });

    it('prioritizes goals via public API', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const scores = orchestrator.prioritizeGoals(mockInput(goals));
      expect(scores.length).toBeGreaterThan(0);
    });

    it('resolves conflicts via public API', () => {
      const goals = [
        mockGoal({ id: 'g1', category: 'performance' }),
        mockGoal({ id: 'g2', category: 'battery' }),
      ];
      const conflicts = orchestrator.resolveConflicts(goals);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]!.resolution).not.toBeNull();
    });

    it('allocates resources via public API', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const allocations = orchestrator.allocateResources(mockInput(goals));
      expect(allocations.length).toBeGreaterThan(0);
    });

    it('generates execution strategy via public API', () => {
      const goal = mockGoal({ id: 'g1' });
      const strategy = orchestrator.generateExecutionStrategy(goal, mockInput([goal]));
      expect(strategy.goalId).toBe('g1');
      expect(strategy.coordinatedModules.length).toBeGreaterThan(0);
    });

    it('gets orchestration status', () => {
      const goals = [mockGoal({ id: 'g1' })];
      orchestrator.orchestrateGoals(mockInput(goals));
      const status = orchestrator.getOrchestrationStatus(goals);
      expect(status).toBeDefined();
    });

    it('gets goal metrics', () => {
      const goals = [mockGoal({ id: 'g1' })];
      orchestrator.orchestrateGoals(mockInput(goals));
      const metrics = orchestrator.getGoalMetrics(goals, [], []);
      expect(metrics).toBeDefined();
      expect(metrics.generatedAt).toBeTruthy();
    });

    it('emits events', () => {
      let started = false;
      orchestrator.on('goal_orchestration_started', () => { started = true; });
      orchestrator.orchestrateGoals(mockInput([mockGoal()]));
      expect(started).toBe(true);
    });

    it('emits goals_prioritized event', () => {
      let prioritized = false;
      orchestrator.on('goals_prioritized', () => { prioritized = true; });
      orchestrator.orchestrateGoals(mockInput([mockGoal()]));
      expect(prioritized).toBe(true);
    });

    it('emits strategy_generated event', () => {
      let strategyGenerated = false;
      orchestrator.on('strategy_generated', () => { strategyGenerated = true; });
      orchestrator.orchestrateGoals(mockInput([mockGoal()]));
      expect(strategyGenerated).toBe(true);
    });

    it('emits conflict_detected event', () => {
      let conflictDetected = false;
      orchestrator.on('conflict_detected', () => { conflictDetected = true; });
      const goals = [
        mockGoal({ id: 'g1', category: 'performance' }),
        mockGoal({ id: 'g2', category: 'battery' }),
      ];
      orchestrator.orchestrateGoals(mockInput(goals));
      expect(conflictDetected).toBe(true);
    });

    it('defers lower-priority goals', () => {
      const goals = Array.from({ length: 7 }, (_, i) =>
        mockGoal({ id: `g${i}`, priority: i === 0 ? 'critical' : 'low' }),
      );
      const result = orchestrator.orchestrateGoals(mockInput(goals));
      expect(result.decision.deferredGoals.length).toBeGreaterThan(0);
    });

    it('emits goal_deferred event', () => {
      let deferred = false;
      orchestrator.on('goal_deferred', () => { deferred = true; });
      const goals = Array.from({ length: 7 }, (_, i) =>
        mockGoal({ id: `g${i}`, priority: i === 0 ? 'critical' : 'low' }),
      );
      orchestrator.orchestrateGoals(mockInput(goals));
      expect(deferred).toBe(true);
    });

    it('generates explainability report', () => {
      const goals = [mockGoal({ id: 'g1' })];
      const result = orchestrator.orchestrateGoals(mockInput(goals));
      const report = orchestrator.getExplainabilityReport('g1', result);
      expect(report).not.toBeNull();
      expect(report!.whyPrioritized).toBeTruthy();
      expect(report!.confidence).toBeGreaterThan(0);
    });

    it('explainability report for deferred goal', () => {
      const goals = Array.from({ length: 7 }, (_, i) =>
        mockGoal({ id: `g${i}`, priority: i === 0 ? 'critical' : 'low' }),
      );
      const result = orchestrator.orchestrateGoals(mockInput(goals));
      const deferredId = result.decision.deferredGoals[0]!;
      const report = orchestrator.getExplainabilityReport(deferredId, result);
      expect(report).not.toBeNull();
      expect(report!.whyDeferred).not.toBeNull();
    });

    it('registers provider', () => {
      expect(orchestrator.registerProvider(mockProviderPlugin())).toBe(true);
      expect(orchestrator.registerProvider(mockProviderPlugin())).toBe(false);
    });

    it('config is accessible', () => {
      expect(orchestrator.getConfig()).toBeDefined();
      expect(orchestrator.getConfig().configVersion).toBe('1.0.0');
    });

    it('history is accessible', () => {
      orchestrator.orchestrateGoals(mockInput([mockGoal()]));
      expect(orchestrator.getHistory().count()).toBeGreaterThan(0);
    });

    it('clear resets', () => {
      orchestrator.orchestrateGoals(mockInput([mockGoal()]));
      orchestrator.clear();
      expect(orchestrator.getHistory().count()).toBe(0);
    });

    it('events disabled does not emit', () => {
      const config = createOrchestrationConfiguration({ enableEvents: false });
      const orch = new GoalOrchestrator(config);
      let started = false;
      orch.on('goal_orchestration_started', () => { started = true; });
      orch.orchestrateGoals(mockInput([mockGoal()]));
      expect(started).toBe(false);
    });

    it('handles completed goals', () => {
      const goals = [mockGoal({ id: 'g1', status: 'completed' })];
      const result = orchestrator.orchestrateGoals(mockInput(goals));
      expect(result.status.completedGoals).toContain('g1');
    });
  });

  // ── Regression ───────────────────────────────────────────

  describe('Regression', () => {
    it('full orchestration lifecycle', () => {
      const orch = new GoalOrchestrator(DC);
      const goals = [
        mockGoal({ id: 'g1', priority: 'critical', category: 'performance' }),
        mockGoal({ id: 'g2', priority: 'medium', category: 'storage' }),
        mockGoal({ id: 'g3', priority: 'high', category: 'privacy' }),
      ];

      // Orchestrate
      const result = orch.orchestrateGoals(mockInput(goals));
      expect(result.decision).toBeDefined();
      expect(result.priorityScores.length).toBe(3);
      expect(result.coordinatedStrategies.length).toBeGreaterThan(0);
      expect(result.executionPlans.length).toBeGreaterThan(0);
      expect(result.schedule.length).toBeGreaterThan(0);

      // Status
      const status = orch.getOrchestrationStatus(goals);
      expect(status).toBeDefined();

      // Metrics
      const metrics = orch.getGoalMetrics(goals, result.conflicts, result.resourceAllocations);
      expect(metrics).toBeDefined();

      // Explainability
      const report = orch.getExplainabilityReport('g1', result);
      expect(report).not.toBeNull();
    });

    it('all orchestration types have labels', () => {
      const types: OrchestrationType[] = [
        'single', 'multiple', 'continuous', 'temporary', 'adaptive',
        'enterprise', 'background', 'future_orchestration',
      ];
      for (const t of types) {
        expect(getOrchestrationTypeLabel(t)).not.toBe('Unknown');
      }
    });

    it('all orchestration states have labels', () => {
      const states: OrchestrationState[] = [
        'pending', 'planning', 'waiting', 'executing', 'paused',
        'completed', 'cancelled', 'blocked', 'future_state',
      ];
      for (const s of states) {
        expect(getOrchestrationStateLabel(s)).not.toBe('Unknown');
      }
    });

    it('all conflict types have labels', () => {
      const types: OrchestrationConflictType[] = [
        'performance_vs_battery', 'gaming_vs_maintenance', 'privacy_vs_convenience',
        'storage_vs_performance', 'business_vs_entertainment', 'security_vs_speed',
        'custom_conflict', 'future_conflict',
      ];
      for (const t of types) {
        expect(getOrchestrationConflictTypeLabel(t)).not.toBe('Unknown');
      }
    });

    it('orchestration does not modify input goals', () => {
      const orch = new GoalOrchestrator(DC);
      const goal = mockGoal({ id: 'g1' });
      const originalStatus = goal.status;
      const originalProgress = goal.progress;
      orch.orchestrateGoals(mockInput([goal]));
      expect(goal.status).toBe(originalStatus);
      expect(goal.progress).toBe(originalProgress);
    });

    it('decision contains supporting evidence', () => {
      const orch = new GoalOrchestrator(DC);
      const result = orch.orchestrateGoals(mockInput([mockGoal()]));
      expect(result.decision.supportingEvidence.length).toBeGreaterThan(0);
    });

    it('decision contains confidence and estimated benefit', () => {
      const orch = new GoalOrchestrator(DC);
      const result = orch.orchestrateGoals(mockInput([mockGoal()]));
      expect(result.decision.confidence).toBeGreaterThanOrEqual(0);
      expect(result.decision.confidence).toBeLessThanOrEqual(1);
      expect(result.decision.estimatedBenefit).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Performance ──────────────────────────────────────────

  describe('Performance', () => {
    it('goal orchestration under 150ms', () => {
      const orch = new GoalOrchestrator(DC);
      const goals = Array.from({ length: 5 }, (_, i) =>
        mockGoal({ id: `g${i}`, priority: i === 0 ? 'critical' : 'medium' }),
      );
      const start = performance.now();
      orch.orchestrateGoals(mockInput(goals));
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(150);
    });

    it('prioritization under 50ms', () => {
      const engine = new GoalPriorityEngine(DC);
      const goals = Array.from({ length: 10 }, (_, i) =>
        mockGoal({ id: `g${i}` }),
      );
      const start = performance.now();
      engine.prioritize(goals, mockInput(goals));
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });

    it('conflict detection under 50ms', () => {
      const engine = new GoalConflictEngine(DC);
      const goals = Array.from({ length: 10 }, (_, i) =>
        mockGoal({ id: `g${i}`, category: i % 2 === 0 ? 'performance' : 'battery' }),
      );
      const start = performance.now();
      engine.detectConflicts(goals);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ── Edge Cases ───────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles empty goals', () => {
      const orch = new GoalOrchestrator(DC);
      const result = orch.orchestrateGoals(mockInput([]));
      expect(result.decision).toBeDefined();
      expect(result.priorityScores.length).toBe(0);
    });

    it('handles single goal', () => {
      const orch = new GoalOrchestrator(DC);
      const result = orch.orchestrateGoals(mockInput([mockGoal()]));
      expect(result.decision.selectedGoals.length).toBe(1);
    });

    it('handles all feature flags disabled', () => {
      const config = createOrchestrationConfiguration({
        featureFlags: {
          enableOrchestration: false,
          enablePrioritization: false,
          enableConflictResolution: false,
          enableDependencies: false,
          enableScheduling: false,
          enableStrategyCoordination: false,
          enableResourceAllocation: false,
          enableMetrics: false,
          enableHistory: false,
          enableEvents: false,
          enablePolicies: false,
          enableExplainability: false,
          futureFlags: {},
        },
      });
      const orch = new GoalOrchestrator(config);
      const result = orch.orchestrateGoals(mockInput([mockGoal()]));
      expect(result.priorityScores.length).toBe(0);
    });

    it('handles prioritization disabled', () => {
      const config = createOrchestrationConfiguration({
        featureFlags: { enablePrioritization: false },
      });
      const orch = new GoalOrchestrator(config);
      const scores = orch.prioritizeGoals(mockInput([mockGoal()]));
      expect(scores.length).toBe(0);
    });

    it('handles conflict resolution disabled', () => {
      const config = createOrchestrationConfiguration({
        featureFlags: { enableConflictResolution: false },
      });
      const orch = new GoalOrchestrator(config);
      const conflicts = orch.resolveConflicts([
        mockGoal({ id: 'g1', category: 'performance' }),
        mockGoal({ id: 'g2', category: 'battery' }),
      ]);
      expect(conflicts.length).toBe(0);
    });

    it('handles resource allocation disabled', () => {
      const config = createOrchestrationConfiguration({
        featureFlags: { enableResourceAllocation: false },
      });
      const orch = new GoalOrchestrator(config);
      const allocations = orch.allocateResources(mockInput([mockGoal()]));
      expect(allocations.length).toBe(0);
    });

    it('handles measurement with no system metrics', () => {
      const orch = new GoalOrchestrator(DC);
      const input = mockInput([mockGoal()]);
      input.measurementInput.systemMetrics = null;
      input.measurementInput.healthScore = null;
      const result = orch.orchestrateGoals(input);
      expect(result.decision).toBeDefined();
    });

    it('handles goal with no strategy steps', () => {
      const orch = new GoalOrchestrator(DC);
      const goal = mockGoal({
        strategy: { type: 'adaptive', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} },
      });
      const result = orch.orchestrateGoals(mockInput([goal]));
      expect(result.decision).toBeDefined();
    });

    it('handles explainability for non-existent goal', () => {
      const orch = new GoalOrchestrator(DC);
      const result = orch.orchestrateGoals(mockInput([mockGoal({ id: 'g1' })]));
      const report = orch.getExplainabilityReport('non-existent', result);
      expect(report).toBeNull();
    });

    it('handles enterprise policy blocking', () => {
      const config = createOrchestrationConfiguration({
        enterprisePolicies: { enforcePolicies: true, blockedGoalTypes: ['gaming'], allowedGoalTypes: [], policyOverrides: false, futureConfig: {} },
      });
      const orch = new GoalOrchestrator(config);
      const goal = mockGoal({ category: 'gaming' });
      const result = orch.orchestrateGoals(mockInput([goal]));
      expect(result.decision).toBeDefined();
    });

    it('handles mutually exclusive goals', () => {
      const resolver = new GoalDependencyResolver();
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b' });
      goalA.dependencies = [{ id: 'd1', goalId: 'b', type: 'blocking', required: true, description: 'mutually exclusive', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const exclusive = resolver.getMutuallyExclusive(goalA, allGoals);
      expect(exclusive.length).toBe(1);
    });

    it('handles circular dependencies', () => {
      const resolver = new GoalDependencyResolver();
      const goalA = mockGoal({ id: 'a' });
      const goalB = mockGoal({ id: 'b' });
      goalA.dependencies = [{ id: 'd1', goalId: 'b', type: 'prerequisite', required: true, description: 'cycle', futureMetadata: {} }];
      goalB.dependencies = [{ id: 'd2', goalId: 'a', type: 'prerequisite', required: true, description: 'cycle', futureMetadata: {} }];
      const allGoals = new Map([['a', goalA], ['b', goalB]]);
      const graph = resolver.buildGraph([goalA, goalB], allGoals);
      expect(graph.cycles.length).toBeGreaterThan(0);
    });
  });
});
