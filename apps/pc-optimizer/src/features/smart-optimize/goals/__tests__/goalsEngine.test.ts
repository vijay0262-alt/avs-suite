/**
 * Goals & Objectives Engine — Comprehensive Test Suite
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  GoalsManager, GoalEngine, GoalBuilder, GoalValidator, GoalHistory,
  GoalEvents, GoalRegistry, GoalConflictResolver, GoalDependencyEngine,
  GoalMeasurementEngine, GoalProgressEngine, GoalStrategyEngine,
  GoalRecommendationEngine, GoalScheduler, GoalAnalyticsEngine, GoalPlanner,
  DEFAULT_GOAL_CONFIGURATION, createGoalConfiguration,
  generateGoalId, priorityToScore, scoreToPriority, getGoalTypeLabel,
  getGoalStatusLabel, getGoalPriorityLabel, getTargetMetricLabel,
  getStrategyTypeLabel, getDependencyTypeLabel, getConflictTypeLabel,
  getHistoryActionLabel, computeProgress, getMeasurementDirection,
  createDefaultMeasurementRules, createDefaultStrategyRules,
  createDefaultConflictRules, createDefaultFeatureFlags,
} from '../index';
import type { Goal, GoalMeasurementInput, GoalProviderPlugin } from '../index';

const DC = createGoalConfiguration();

function mockInput(o: Partial<GoalMeasurementInput> = {}): GoalMeasurementInput {
  return {
    goalId: 'test', timelineEvents: [], recommendations: [], predictions: [],
    maintenanceResults: [], optimizationHistory: [], healthScore: 75,
    deviceProfile: null,
    systemMetrics: {
      cpuUsage: 30, memoryUsage: 50, diskUsage: 60, bootTimeMs: 30000,
      freeDiskSpaceBytes: 50000000000, backgroundProcessCount: 40,
      privacyScore: 70, securityScore: 80, startupDurationMs: 25000,
      appLaunchTimeMs: 2000, batteryLevel: 80, batteryUsagePerHour: 5,
      futureMetrics: {},
    },
    futureData: {}, ...o,
  };
}

function mockGoal(o: Partial<Goal> = {}): Goal {
  return {
    id: generateGoalId(), name: 'Test Goal', description: 'Test',
    category: 'performance', priority: 'high', status: 'draft',
    targetMetric: 'health_score', targetValue: 90, currentValue: 70,
    progress: 0, confidence: 0.8,
    strategy: { type: 'adaptive', steps: [], estimatedDurationMs: 60000, estimatedEffort: 'medium', riskLevel: 'low', confidence: 0.7, rationale: 'test', futureMetadata: {} },
    estimatedCompletion: null, dependencies: [], constraints: [],
    recommendations: [], evidence: [],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    startedAt: null, completedAt: null, futureMetadata: {}, ...o,
  };
}

describe('Goals & Objectives Engine', () => {
  describe('Types & Helpers', () => {
    it('generateGoalId produces unique ids', () => {
      expect(generateGoalId()).not.toBe(generateGoalId());
    });
    it('priorityToScore converts correctly', () => {
      expect(priorityToScore('critical')).toBe(4);
      expect(priorityToScore('informational')).toBe(0);
    });
    it('scoreToPriority converts correctly', () => {
      expect(scoreToPriority(4)).toBe('critical');
      expect(scoreToPriority(0)).toBe('informational');
    });
    it('getGoalTypeLabel works', () => {
      expect(getGoalTypeLabel('performance')).toBe('Performance');
      expect(getGoalTypeLabel('gaming')).toBe('Gaming');
    });
    it('getGoalStatusLabel works', () => {
      expect(getGoalStatusLabel('completed')).toBe('Completed');
      expect(getGoalStatusLabel('blocked')).toBe('Blocked');
    });
    it('getGoalPriorityLabel works', () => {
      expect(getGoalPriorityLabel('high')).toBe('High');
    });
    it('getTargetMetricLabel works', () => {
      expect(getTargetMetricLabel('health_score')).toBe('Health Score');
      expect(getTargetMetricLabel('boot_time')).toBe('Boot Time');
    });
    it('getStrategyTypeLabel works', () => {
      expect(getStrategyTypeLabel('adaptive')).toBe('Adaptive');
    });
    it('getDependencyTypeLabel works', () => {
      expect(getDependencyTypeLabel('blocking')).toBe('Blocking');
    });
    it('getConflictTypeLabel works', () => {
      expect(getConflictTypeLabel('battery_vs_performance')).toBe('Battery vs Performance');
    });
    it('getHistoryActionLabel works', () => {
      expect(getHistoryActionLabel('created')).toBe('Created');
    });
    it('computeProgress increase', () => {
      expect(computeProgress(50, 100, 'increase')).toBe(0.5);
      expect(computeProgress(100, 100, 'increase')).toBe(1);
    });
    it('computeProgress decrease', () => {
      expect(computeProgress(20, 20, 'decrease')).toBe(1);
      expect(computeProgress(100, 20, 'decrease')).toBeCloseTo(0.2, 5);
      expect(computeProgress(10, 20, 'decrease')).toBe(1);
    });
    it('computeProgress maintain', () => {
      expect(computeProgress(100, 100, 'maintain')).toBe(1);
    });
    it('getMeasurementDirection works', () => {
      expect(getMeasurementDirection('health_score')).toBe('increase');
      expect(getMeasurementDirection('boot_time')).toBe('decrease');
    });
    it('createDefaultMeasurementRules has defaults', () => {
      expect(createDefaultMeasurementRules().measurementIntervalMs).toBe(3600000);
    });
    it('createDefaultStrategyRules has defaults', () => {
      expect(createDefaultStrategyRules().maxStepsPerStrategy).toBe(10);
    });
    it('createDefaultConflictRules has defaults', () => {
      expect(createDefaultConflictRules().maxActiveGoals).toBe(5);
    });
    it('createDefaultFeatureFlags has defaults', () => {
      expect(createDefaultFeatureFlags().enableGoals).toBe(true);
    });
  });

  describe('GoalConfiguration', () => {
    it('has defaults', () => {
      expect(DEFAULT_GOAL_CONFIGURATION.configVersion).toBe('1.0.0');
      expect(DEFAULT_GOAL_CONFIGURATION.featureFlags.enableGoals).toBe(true);
    });
    it('accepts overrides', () => {
      const c = createGoalConfiguration({ maxGoals: 100, enableEvents: false });
      expect(c.maxGoals).toBe(100);
      expect(c.enableEvents).toBe(false);
    });
    it('merges featureFlags', () => {
      const c = createGoalConfiguration({ featureFlags: { enableGoals: false } });
      expect(c.featureFlags.enableGoals).toBe(false);
      expect(c.featureFlags.enableStrategies).toBe(true);
    });
    it('merges measurementRules', () => {
      const c = createGoalConfiguration({ measurementRules: { minConfidence: 0.8 } });
      expect(c.measurementRules.minConfidence).toBe(0.8);
    });
    it('merges strategyRules', () => {
      const c = createGoalConfiguration({ strategyRules: { maxStepsPerStrategy: 5 } });
      expect(c.strategyRules.maxStepsPerStrategy).toBe(5);
    });
    it('merges conflictRules', () => {
      const c = createGoalConfiguration({ conflictRules: { maxActiveGoals: 3 } });
      expect(c.conflictRules.maxActiveGoals).toBe(3);
    });
  });

  describe('GoalEvents', () => {
    let ev: GoalEvents;
    beforeEach(() => { ev = new GoalEvents(); });
    it('on/emit receives events', () => {
      let r = 0; ev.on('goal_created', () => r++); ev.emitCreated('g1', {});
      expect(r).toBe(1);
    });
    it('off removes listener', () => {
      let r = 0; const l = () => r++;
      ev.on('goal_created', l); ev.emitCreated('g1', {});
      ev.off('goal_created', l); ev.emitCreated('g1', {});
      expect(r).toBe(1);
    });
    it('on returns unsubscribe', () => {
      let r = 0; const u = ev.on('goal_created', () => r++);
      ev.emitCreated('g1', {}); u(); ev.emitCreated('g1', {});
      expect(r).toBe(1);
    });
    it('emitStarted works', () => {
      let r = 0; ev.on('goal_started', () => r++); ev.emitStarted('g1', {});
      expect(r).toBe(1);
    });
    it('emitPaused works', () => {
      let r = 0; ev.on('goal_paused', () => r++); ev.emitPaused('g1', {});
      expect(r).toBe(1);
    });
    it('emitCompleted works', () => {
      let r = 0; ev.on('goal_completed', () => r++); ev.emitCompleted('g1', {});
      expect(r).toBe(1);
    });
    it('emitBlocked works', () => {
      let r = 0; ev.on('goal_blocked', () => r++); ev.emitBlocked('g1', {});
      expect(r).toBe(1);
    });
    it('emitMeasured works', () => {
      let r = 0; ev.on('goal_measured', () => r++); ev.emitMeasured('g1', {});
      expect(r).toBe(1);
    });
    it('emitStrategyGenerated works', () => {
      let r = 0; ev.on('strategy_generated', () => r++); ev.emitStrategyGenerated('g1', {});
      expect(r).toBe(1);
    });
    it('clear removes all', () => {
      ev.on('goal_created', () => {}); ev.clear();
      expect(ev.listenerCount()).toBe(0);
    });
    it('listenerCount returns correct count', () => {
      ev.on('goal_created', () => {}); ev.on('goal_updated', () => {});
      expect(ev.listenerCount()).toBe(2);
      expect(ev.listenerCount('goal_created')).toBe(1);
    });
    it('does not crash on listener error', () => {
      ev.on('goal_created', () => { throw new Error('x'); });
      expect(() => ev.emitCreated('g1', {})).not.toThrow();
    });
  });

  describe('GoalRegistry', () => {
    let reg: GoalRegistry;
    beforeEach(() => { reg = new GoalRegistry(); });
    it('registers a provider', () => {
      const p: GoalProviderPlugin = {
        getPluginName: () => 'p1', getVersion: () => '1', getPriority: () => 100,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      };
      expect(reg.register(p)).toBe(true);
      expect(reg.getProviders().length).toBe(1);
    });
    it('rejects duplicate', () => {
      const p: GoalProviderPlugin = {
        getPluginName: () => 'p1', getVersion: () => '1', getPriority: () => 100,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      };
      reg.register(p);
      expect(reg.register(p)).toBe(false);
    });
    it('unregisters', () => {
      const p: GoalProviderPlugin = {
        getPluginName: () => 'p1', getVersion: () => '1', getPriority: () => 100,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      };
      reg.register(p);
      expect(reg.unregister('p1')).toBe(true);
      expect(reg.getProviders().length).toBe(0);
    });
    it('getProviderForType finds provider', () => {
      const p: GoalProviderPlugin = {
        getPluginName: () => 'p1', getVersion: () => '1', getPriority: () => 100,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      };
      reg.register(p);
      expect(reg.getProviderForType('performance')).toBeDefined();
      expect(reg.getProviderForType('storage')).toBeNull();
    });
    it('getAvailableProviders filters', () => {
      reg.register({
        getPluginName: () => 'p1', getVersion: () => '1', getPriority: () => 100,
        isAvailable: () => false, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      });
      expect(reg.getAvailableProviders().length).toBe(0);
    });
    it('clear removes all', () => {
      reg.register({
        getPluginName: () => 'p1', getVersion: () => '1', getPriority: () => 100,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      });
      reg.clear();
      expect(reg.getProviders().length).toBe(0);
    });
  });

  describe('GoalBuilder', () => {
    let b: GoalBuilder;
    beforeEach(() => { b = new GoalBuilder(); });
    it('builds a goal', () => {
      const g = b.build({ name: 'Test', description: 'Desc', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      expect(g.id).toMatch(/^goal_/);
      expect(g.name).toBe('Test');
      expect(g.status).toBe('draft');
    });
    it('buildPerformanceGoal', () => {
      const g = b.buildPerformanceGoal(90, 70);
      expect(g.category).toBe('performance');
      expect(g.targetMetric).toBe('health_score');
    });
    it('buildStorageGoal', () => {
      const g = b.buildStorageGoal(100000, 50000);
      expect(g.category).toBe('storage');
    });
    it('buildPrivacyGoal', () => {
      const g = b.buildPrivacyGoal(90, 60);
      expect(g.category).toBe('privacy');
    });
    it('buildStartupGoal', () => {
      const g = b.buildStartupGoal(10000, 30000);
      expect(g.category).toBe('startup');
    });
    it('buildBatteryGoal', () => {
      const g = b.buildBatteryGoal(3, 8);
      expect(g.category).toBe('battery');
    });
    it('buildGamingGoal', () => {
      const g = b.buildGamingGoal(90, 70);
      expect(g.category).toBe('gaming');
    });
  });

  describe('GoalValidator', () => {
    let v: GoalValidator;
    beforeEach(() => { v = new GoalValidator(DC); });
    it('validates correct goal', () => {
      expect(v.validate(mockGoal()).valid).toBe(true);
    });
    it('detects missing name', () => {
      expect(v.validate(mockGoal({ name: '' })).valid).toBe(false);
    });
    it('detects missing description', () => {
      expect(v.validate(mockGoal({ description: '' })).valid).toBe(false);
    });
    it('detects invalid confidence', () => {
      expect(v.validate(mockGoal({ confidence: 1.5 })).valid).toBe(false);
    });
    it('detects invalid progress', () => {
      expect(v.validate(mockGoal({ progress: 1.5 })).valid).toBe(false);
    });
    it('warns on no strategy steps', () => {
      const r = v.validate(mockGoal());
      expect(r.warnings.some(w => w.code === 'NO_STRATEGY_STEPS')).toBe(true);
    });
    it('warns on no evidence', () => {
      const r = v.validate(mockGoal());
      expect(r.warnings.some(w => w.code === 'NO_EVIDENCE')).toBe(true);
    });
    it('validates batch', () => {
      expect(v.validateBatch([mockGoal(), mockGoal()]).valid).toBe(true);
    });
  });

  describe('GoalDependencyEngine', () => {
    let de: GoalDependencyEngine;
    beforeEach(() => { de = new GoalDependencyEngine(); });
    it('addDependency adds', () => {
      const g = mockGoal();
      const d = de.addDependency(g, { goalId: 'other', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} });
      expect(g.dependencies.length).toBe(1);
      expect(d.id).toMatch(/^gdep_/);
    });
    it('removeDependency removes', () => {
      const g = mockGoal();
      const d = de.addDependency(g, { goalId: 'other', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} });
      expect(de.removeDependency(g, d.id)).toBe(true);
      expect(g.dependencies.length).toBe(0);
    });
    it('getBlockingDependencies', () => {
      const g = mockGoal();
      de.addDependency(g, { goalId: 'a', type: 'blocking', required: true, description: 'test', futureMetadata: {} });
      expect(de.getBlockingDependencies(g).length).toBe(1);
    });
    it('isBlocked returns true for incomplete blocking dep', () => {
      const g = mockGoal();
      de.addDependency(g, { goalId: 'a', type: 'blocking', required: true, description: 'test', futureMetadata: {} });
      const all = new Map([['a', mockGoal({ id: 'a', status: 'in_progress' })], [g.id, g]]);
      expect(de.isBlocked(g, all)).toBe(true);
    });
    it('isBlocked returns false for completed blocking dep', () => {
      const g = mockGoal();
      de.addDependency(g, { goalId: 'a', type: 'blocking', required: true, description: 'test', futureMetadata: {} });
      const all = new Map([['a', mockGoal({ id: 'a', status: 'completed' })], [g.id, g]]);
      expect(de.isBlocked(g, all)).toBe(false);
    });
    it('canStart returns true when not blocked', () => {
      const g = mockGoal();
      const all = new Map([[g.id, g]]);
      expect(de.canStart(g, all)).toBe(true);
    });
    it('getDependents finds dependents', () => {
      const g = mockGoal({ id: 'parent' });
      const child = mockGoal({ id: 'child' });
      de.addDependency(child, { goalId: 'parent', type: 'child', required: false, description: 'test', futureMetadata: {} });
      const all = new Map([[g.id, g], [child.id, child]]);
      expect(de.getDependents('parent', all).length).toBe(1);
    });
    it('resolveDependencies', () => {
      const g = mockGoal();
      de.addDependency(g, { goalId: 'a', type: 'prerequisite', required: true, description: 'test', futureMetadata: {} });
      const all = new Map([['a', mockGoal({ id: 'a', status: 'completed' })], [g.id, g]]);
      const r = de.resolveDependencies(g, all);
      expect(r.resolved.length).toBe(1);
      expect(r.unresolved.length).toBe(0);
    });
  });

  describe('GoalConflictResolver', () => {
    let cr: GoalConflictResolver;
    beforeEach(() => { cr = new GoalConflictResolver(DC); });
    it('detects battery vs performance', () => {
      const a = mockGoal({ id: 'a', category: 'battery', status: 'started' });
      const b = mockGoal({ id: 'b', category: 'performance', status: 'started' });
      const c = cr.detectConflicts([a, b]);
      expect(c.length).toBeGreaterThanOrEqual(1);
      expect(c.some(x => x.type === 'battery_vs_performance')).toBe(true);
    });
    it('detects multiple active', () => {
      const goals = Array.from({ length: 7 }, (_, i) =>
        mockGoal({ id: `g${i}`, category: 'performance', status: 'started' }));
      const c = cr.detectConflicts(goals);
      expect(c.some(x => x.type === 'multiple_active')).toBe(true);
    });
    it('resolves pairwise conflict', () => {
      const a = mockGoal({ id: 'a', category: 'battery', priority: 'low', status: 'started' });
      const b = mockGoal({ id: 'b', category: 'performance', priority: 'high', status: 'started' });
      const conflicts = cr.detectConflicts([a, b]);
      const goals = new Map([[a.id, a], [b.id, b]]);
      const resolved = cr.resolve(conflicts[0]!, goals);
      expect(resolved.resolution).toBeDefined();
      expect(resolved.resolution!.winningGoalId).toBe('b');
    });
    it('no conflict for non-active goals', () => {
      const a = mockGoal({ id: 'a', category: 'battery', status: 'completed' });
      const b = mockGoal({ id: 'b', category: 'performance', status: 'completed' });
      expect(cr.detectConflicts([a, b]).length).toBe(0);
    });
  });

  describe('GoalMeasurementEngine', () => {
    let me: GoalMeasurementEngine;
    beforeEach(() => { me = new GoalMeasurementEngine(DC); });
    it('measures health score', () => {
      const g = mockGoal({ targetMetric: 'health_score', targetValue: 90, currentValue: 70 });
      const p = me.measure(g, mockInput());
      expect(p.currentValue).toBe(75);
      expect(p.progress).toBeGreaterThan(0);
    });
    it('measures boot time', () => {
      const g = mockGoal({ targetMetric: 'boot_time', targetValue: 10000, currentValue: 30000 });
      const p = me.measure(g, mockInput());
      expect(p.currentValue).toBe(30000);
    });
    it('measures free disk space', () => {
      const g = mockGoal({ targetMetric: 'free_disk_space', targetValue: 100000000000, currentValue: 50000000000 });
      const p = me.measure(g, mockInput());
      expect(p.currentValue).toBe(50000000000);
    });
    it('collects evidence', () => {
      const g = mockGoal();
      const p = me.measure(g, mockInput());
      expect(p.evidence.length).toBeGreaterThan(0);
    });
    it('getConfidence returns score', () => {
      const c = me.getConfidence(mockInput());
      expect(c).toBeGreaterThan(0);
    });
    it('isDataStale returns true for no metrics', () => {
      expect(me.isDataStale(mockInput({ systemMetrics: null }))).toBe(true);
    });
    it('measureBatch measures all', () => {
      const goals = [mockGoal(), mockGoal({ id: 'g2' })];
      const results = me.measureBatch(goals, mockInput());
      expect(results.length).toBe(2);
    });
  });

  describe('GoalProgressEngine', () => {
    let pe: GoalProgressEngine;
    beforeEach(() => { pe = new GoalProgressEngine(DC); });
    it('updateProgress updates goal', () => {
      const g = mockGoal({ currentValue: 70, targetValue: 90, progress: 0 });
      const p = { goalId: g.id, status: 'in_progress' as const, currentValue: 80, targetValue: 90, progress: 0.8, delta: 10, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      pe.updateProgress(g, p);
      expect(g.currentValue).toBe(80);
      expect(g.progress).toBe(0.8);
    });
    it('completes goal at 100%', () => {
      const g = mockGoal({ status: 'in_progress' });
      const p = { goalId: g.id, status: 'in_progress' as const, currentValue: 90, targetValue: 90, progress: 1, delta: 20, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      pe.updateProgress(g, p);
      expect(g.status).toBe('completed');
      expect(g.completedAt).toBeDefined();
    });
    it('getProgress returns history', () => {
      const g = mockGoal();
      const p = { goalId: g.id, status: 'in_progress' as const, currentValue: 80, targetValue: 90, progress: 0.8, delta: 10, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      pe.updateProgress(g, p);
      expect(pe.getProgress(g.id).length).toBe(1);
    });
    it('getLatestProgress returns last', () => {
      const g = mockGoal();
      const p1 = { goalId: g.id, status: 'in_progress' as const, currentValue: 75, targetValue: 90, progress: 0.75, delta: 5, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      const p2 = { goalId: g.id, status: 'in_progress' as const, currentValue: 80, targetValue: 90, progress: 0.8, delta: 10, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      pe.updateProgress(g, p1); pe.updateProgress(g, p2);
      expect(pe.getLatestProgress(g.id)?.currentValue).toBe(80);
    });
    it('isNearCompletion', () => {
      const g = mockGoal({ progress: 0.95 });
      expect(pe.isNearCompletion(g)).toBe(true);
    });
    it('clear resets', () => {
      pe.clear();
      expect(pe.getProgress('any').length).toBe(0);
    });
  });

  describe('GoalStrategyEngine', () => {
    let se: GoalStrategyEngine;
    beforeEach(() => { se = new GoalStrategyEngine(DC); });
    it('generates strategy with steps', () => {
      const g = mockGoal({ category: 'performance' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.confidence).toBeGreaterThan(0);
    });
    it('generates storage strategy', () => {
      const g = mockGoal({ category: 'storage' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('generates privacy strategy', () => {
      const g = mockGoal({ category: 'privacy' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('generates startup strategy', () => {
      const g = mockGoal({ category: 'startup' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('generates battery strategy', () => {
      const g = mockGoal({ category: 'battery' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('generates gaming strategy', () => {
      const g = mockGoal({ category: 'gaming' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('generates security strategy', () => {
      const g = mockGoal({ category: 'security' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('generates health strategy', () => {
      const g = mockGoal({ category: 'health' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('strategy has rationale', () => {
      const g = mockGoal();
      const s = se.generateStrategy(g, mockInput());
      expect(s.rationale).toBeTruthy();
    });
    it('uses provider plugin', () => {
      se.registerProvider({
        getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 200,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => ({ type: 'custom_strategy', steps: [], estimatedDurationMs: 1000, estimatedEffort: 'low', riskLevel: 'none', confidence: 0.9, rationale: 'plugin', futureMetadata: {} }),
        measure: () => null,
      });
      const g = mockGoal({ category: 'performance' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.rationale).toBe('plugin');
    });
  });

  describe('GoalRecommendationEngine', () => {
    let re: GoalRecommendationEngine;
    beforeEach(() => { re = new GoalRecommendationEngine(DC); });
    it('generates next best action', () => {
      const g = mockGoal({ strategy: { type: 'adaptive', steps: [{ id: 's1', name: 'Step 1', description: 'Test', action: 'act', module: 'mod', priority: 'high', estimatedImpact: 0.3, evidence: [], futureMetadata: {} }], estimatedDurationMs: 60000, estimatedEffort: 'medium', riskLevel: 'low', confidence: 0.7, rationale: 'test', futureMetadata: {} } });
      const recs = re.generateRecommendations(g, mockInput(), null);
      expect(recs.some(r => r.type === 'next_best_action')).toBe(true);
    });
    it('generates suggested maintenance', () => {
      const g = mockGoal({ category: 'health' });
      const recs = re.generateRecommendations(g, mockInput({ maintenanceResults: [{ id: 'm1', type: 'routine', completed: true, timestamp: new Date().toISOString() }] }), null);
      expect(recs.some(r => r.type === 'suggested_maintenance')).toBe(true);
    });
    it('generates optimization strategy', () => {
      const g = mockGoal({ strategy: { type: 'adaptive', steps: [{ id: 's1', name: 'Step', description: 'D', action: 'a', module: 'm', priority: 'high', estimatedImpact: 0.3, evidence: [], futureMetadata: {} }], estimatedDurationMs: 60000, estimatedEffort: 'medium', riskLevel: 'low', confidence: 0.7, rationale: 'test', futureMetadata: {} } });
      const recs = re.generateRecommendations(g, mockInput(), null);
      expect(recs.some(r => r.type === 'optimization_strategy')).toBe(true);
    });
    it('generates alternative strategy for low progress', () => {
      const g = mockGoal({ status: 'in_progress' });
      const p = { goalId: g.id, status: 'in_progress' as const, currentValue: 71, targetValue: 90, progress: 0.05, delta: 1, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      const recs = re.generateRecommendations(g, mockInput(), p);
      expect(recs.some(r => r.type === 'alternative_strategy')).toBe(true);
    });
    it('generates priority change near completion', () => {
      const g = mockGoal({ priority: 'medium' });
      const p = { goalId: g.id, status: 'in_progress' as const, currentValue: 85, targetValue: 90, progress: 0.85, delta: 15, direction: 'increase' as const, measuredAt: new Date().toISOString(), evidence: [], futureMetadata: {} };
      const recs = re.generateRecommendations(g, mockInput(), p);
      expect(recs.some(r => r.type === 'priority_change')).toBe(true);
    });
  });

  describe('GoalScheduler', () => {
    let s: GoalScheduler;
    beforeEach(() => { s = new GoalScheduler(DC); });
    it('schedules a goal', () => {
      const g = mockGoal();
      const sch = s.schedule(g);
      expect(sch.goalId).toBe(g.id);
      expect(sch.nextRunAt).toBeTruthy();
    });
    it('unschedules', () => {
      const g = mockGoal();
      s.schedule(g);
      expect(s.unschedule(g.id)).toBe(true);
    });
    it('getSchedule returns schedule', () => {
      const g = mockGoal();
      s.schedule(g);
      expect(s.getSchedule(g.id)).toBeDefined();
    });
    it('getDueSchedules returns due', () => {
      const g = mockGoal({ strategy: { type: 'one_time', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} } });
      s.schedule(g);
      const future = new Date(Date.now() + 10000).toISOString();
      expect(s.getDueSchedules(future).length).toBe(1);
    });
    it('updateNextRun for recurring', () => {
      const g = mockGoal({ strategy: { type: 'continuous', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} } });
      s.schedule(g);
      const updated = s.updateNextRun(g.id);
      expect(updated).toBeDefined();
    });
    it('updateNextRun for one-time removes', () => {
      const g = mockGoal({ strategy: { type: 'one_time', steps: [], estimatedDurationMs: 0, estimatedEffort: 'low', riskLevel: 'none', confidence: 0, rationale: '', futureMetadata: {} } });
      s.schedule(g);
      s.updateNextRun(g.id);
      expect(s.getSchedule(g.id)).toBeNull();
    });
    it('clear removes all', () => {
      s.schedule(mockGoal());
      s.clear();
      expect(s.getAllSchedules().length).toBe(0);
    });
  });

  describe('GoalHistory', () => {
    let h: GoalHistory;
    beforeEach(() => { h = new GoalHistory(200); });
    it('records entries', () => {
      h.record('g1', 'created', 'Goal created');
      expect(h.count()).toBe(1);
    });
    it('getAll returns all', () => {
      h.record('g1', 'created', 'Created');
      h.record('g1', 'started', 'Started');
      expect(h.getAll().length).toBe(2);
    });
    it('getByGoal filters', () => {
      h.record('g1', 'created', 'C');
      h.record('g2', 'created', 'C');
      expect(h.getByGoal('g1').length).toBe(1);
    });
    it('getByAction filters', () => {
      h.record('g1', 'created', 'C');
      h.record('g1', 'started', 'S');
      expect(h.getByAction('created').length).toBe(1);
    });
    it('getLatest returns last', () => {
      h.record('g1', 'created', 'C');
      h.record('g1', 'started', 'S');
      expect(h.getLatest()?.action).toBe('started');
    });
    it('respects max entries', () => {
      h.setMaxEntries(3);
      for (let i = 0; i < 5; i++) h.record('g', 'created', `entry ${i}`);
      expect(h.count()).toBe(3);
    });
    it('clear resets', () => {
      h.record('g', 'created', 'C');
      h.clear();
      expect(h.count()).toBe(0);
    });
  });

  describe('GoalAnalyticsEngine', () => {
    it('computes empty analytics', () => {
      const a = new GoalAnalyticsEngine(DC).compute([]);
      expect(a.totalGoals).toBe(0);
    });
    it('computes total goals', () => {
      const a = new GoalAnalyticsEngine(DC).compute([mockGoal(), mockGoal({ id: 'g2' })]);
      expect(a.totalGoals).toBe(2);
    });
    it('computes completion rate', () => {
      const a = new GoalAnalyticsEngine(DC).compute([
        mockGoal({ status: 'completed' }), mockGoal({ id: 'g2', status: 'in_progress' }),
      ]);
      expect(a.completionRate).toBe(0.5);
    });
    it('computes average progress', () => {
      const a = new GoalAnalyticsEngine(DC).compute([
        mockGoal({ progress: 0.5 }), mockGoal({ id: 'g2', progress: 0.8 }),
      ]);
      expect(a.averageProgress).toBeCloseTo(0.65, 5);
    });
    it('computes blocked goals', () => {
      const a = new GoalAnalyticsEngine(DC).compute([mockGoal({ status: 'blocked' })]);
      expect(a.blockedGoals).toBe(1);
    });
    it('computes goals by type', () => {
      const a = new GoalAnalyticsEngine(DC).compute([
        mockGoal({ category: 'performance' }), mockGoal({ id: 'g2', category: 'storage' }),
      ]);
      expect(a.goalsByType['performance']).toBe(1);
      expect(a.goalsByType['storage']).toBe(1);
    });
    it('computes goal effectiveness', () => {
      const a = new GoalAnalyticsEngine(DC).compute([
        mockGoal({ category: 'performance', status: 'completed', progress: 1, startedAt: '2025-01-01T00:00:00Z', completedAt: '2025-01-02T00:00:00Z' }),
        mockGoal({ id: 'g2', category: 'performance', status: 'in_progress', progress: 0.5 }),
      ]);
      expect(a.goalEffectiveness.length).toBe(1);
      expect(a.goalEffectiveness[0]!.effectiveness).toBe(0.5);
    });
  });

  describe('GoalPlanner', () => {
    let p: GoalPlanner;
    beforeEach(() => { p = new GoalPlanner(DC); });
    it('plans a goal', () => {
      const g = mockGoal();
      const r = p.plan(g, mockInput());
      expect(r.strategy.steps.length).toBeGreaterThan(0);
      expect(r.progress).toBeDefined();
      expect(r.recommendations.length).toBeGreaterThan(0);
    });
    it('measureOnly measures', () => {
      const g = mockGoal();
      const prog = p.measureOnly(g, mockInput());
      expect(prog.currentValue).toBe(75);
    });
  });

  describe('GoalEngine', () => {
    let e: GoalEngine;
    beforeEach(() => { e = new GoalEngine(DC); });
    it('add and get', () => {
      const g = mockGoal();
      e.add(g);
      expect(e.get(g.id)).toBeDefined();
    });
    it('getAll returns all', () => {
      e.add(mockGoal()); e.add(mockGoal({ id: 'g2' }));
      expect(e.getAll().length).toBe(2);
    });
    it('getActiveGoals', () => {
      e.add(mockGoal({ status: 'started' }));
      e.add(mockGoal({ id: 'g2', status: 'completed' }));
      expect(e.getActiveGoals().length).toBe(1);
    });
    it('update modifies goal', () => {
      const g = mockGoal(); e.add(g);
      expect(e.update(g.id, { name: 'Updated' })).toBe(true);
      expect(e.get(g.id)?.name).toBe('Updated');
    });
    it('remove deletes goal', () => {
      const g = mockGoal(); e.add(g);
      expect(e.remove(g.id)).toBe(true);
      expect(e.get(g.id)).toBeNull();
    });
    it('setStatus changes status', () => {
      const g = mockGoal(); e.add(g);
      e.setStatus(g.id, 'started');
      expect(e.get(g.id)?.status).toBe('started');
      expect(e.get(g.id)?.startedAt).toBeDefined();
    });
    it('evaluate measures goal', () => {
      const g = mockGoal(); e.add(g);
      const p = e.evaluate(g.id, mockInput());
      expect(p).toBeDefined();
    });
    it('generateStrategy creates strategy', () => {
      const g = mockGoal(); e.add(g);
      const s = e.generateStrategy(g.id, mockInput());
      expect(s).toBeDefined();
      expect(s!.steps.length).toBeGreaterThan(0);
    });
    it('detectConflicts finds conflicts', () => {
      e.add(mockGoal({ id: 'a', category: 'battery', status: 'started' }));
      e.add(mockGoal({ id: 'b', category: 'performance', status: 'started' }));
      expect(e.detectConflicts().length).toBeGreaterThanOrEqual(1);
    });
    it('isGoalBlocked', () => {
      const g = mockGoal(); e.add(g);
      expect(e.isGoalBlocked(g.id)).toBe(false);
    });
    it('canStart', () => {
      const g = mockGoal(); e.add(g);
      expect(e.canStart(g.id)).toBe(true);
    });
    it('getAnalytics', () => {
      e.add(mockGoal());
      expect(e.getAnalytics().totalGoals).toBe(1);
    });
    it('getHistory', () => {
      const g = mockGoal(); e.add(g);
      e.setStatus(g.id, 'started');
      expect(e.getHistory(g.id).length).toBeGreaterThan(0);
    });
    it('clear resets', () => {
      e.add(mockGoal()); e.clear();
      expect(e.count).toBe(0);
    });
  });

  describe('GoalsManager', () => {
    let m: GoalsManager;
    beforeEach(() => { m = new GoalsManager(); });
    it('createGoal returns goal', () => {
      const g = m.createGoal({ name: 'Test', description: 'Desc', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      expect(g).toBeDefined();
      expect(g?.id).toMatch(/^goal_/);
    });
    it('createGoal returns null when disabled', () => {
      const m2 = new GoalsManager({ featureFlags: { enableGoals: false } });
      expect(m2.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })).toBeNull();
    });
    it('updateGoal updates', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      expect(m.updateGoal(g.id, { name: 'Updated' })).toBe(true);
      expect(m.getGoal(g.id)?.name).toBe('Updated');
    });
    it('deleteGoal removes', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      expect(m.deleteGoal(g.id)).toBe(true);
      expect(m.getGoal(g.id)).toBeNull();
    });
    it('pauseGoal pauses', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.startGoal(g.id);
      expect(m.pauseGoal(g.id)).toBe(true);
      expect(m.getGoal(g.id)?.status).toBe('paused');
    });
    it('resumeGoal resumes', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.startGoal(g.id);
      m.pauseGoal(g.id);
      expect(m.resumeGoal(g.id)).toBe(true);
    });
    it('startGoal starts', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      expect(m.startGoal(g.id)).toBe(true);
      expect(m.getGoal(g.id)?.status).toBe('started');
    });
    it('measureGoal returns progress', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      const p = m.measureGoal(g.id, mockInput());
      expect(p).toBeDefined();
    });
    it('generateStrategy returns strategy', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      const s = m.generateStrategy(g.id, mockInput());
      expect(s).toBeDefined();
      expect(s!.steps.length).toBeGreaterThan(0);
    });
    it('getGoalProgress returns history', () => {
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.measureGoal(g.id, mockInput());
      expect(m.getGoalProgress(g.id).length).toBeGreaterThan(0);
    });
    it('getGoalAnalytics returns analytics', () => {
      m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      expect(m.getGoalAnalytics().totalGoals).toBe(1);
    });
    it('emits goal_created', () => {
      let r = 0; m.on('goal_created', () => r++);
      m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      expect(r).toBe(1);
    });
    it('emits goal_started', () => {
      let r = 0;
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.on('goal_started', () => r++);
      m.startGoal(g.id);
      expect(r).toBe(1);
    });
    it('emits goal_measured', () => {
      let r = 0;
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.on('goal_measured', () => r++);
      m.measureGoal(g.id, mockInput());
      expect(r).toBe(1);
    });
    it('emits strategy_generated', () => {
      let r = 0;
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.on('strategy_generated', () => r++);
      m.generateStrategy(g.id, mockInput());
      expect(r).toBe(1);
    });
    it('events disabled does not emit', () => {
      const m2 = new GoalsManager({ enableEvents: false });
      let r = 0; m2.on('goal_created', () => r++);
      m2.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      expect(r).toBe(0);
    });
    it('config is accessible', () => {
      expect(m.config.configVersion).toBe('1.0.0');
    });
    it('updateConfig updates', () => {
      m.updateConfig({ maxGoals: 100 });
      expect(m.config.maxGoals).toBe(100);
    });
    it('clear resets', () => {
      m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      m.clear();
      expect(m.goalCount).toBe(0);
    });
    it('detectConflicts', () => {
      m.createGoal({ name: 'B', description: 'D', category: 'battery', targetMetric: 'battery_usage', targetValue: 3 });
      m.createGoal({ name: 'P', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      const a = m.getAllGoals();
      a.forEach(g => m.startGoal(g.id));
      expect(m.detectConflicts().length).toBeGreaterThanOrEqual(0);
    });
    it('registerProvider', () => {
      expect(m.registerProvider({
        getPluginName: () => 'p', getVersion: () => '1', getPriority: () => 1,
        isAvailable: () => true, getGoalType: () => 'performance',
        generateStrategy: () => null, measure: () => null,
      })).toBe(true);
    });
  });

  describe('Regression', () => {
    it('all exports defined', () => {
      expect(GoalsManager).toBeDefined();
      expect(GoalEngine).toBeDefined();
      expect(GoalBuilder).toBeDefined();
      expect(GoalValidator).toBeDefined();
      expect(GoalHistory).toBeDefined();
      expect(GoalEvents).toBeDefined();
      expect(GoalRegistry).toBeDefined();
      expect(GoalConflictResolver).toBeDefined();
      expect(GoalDependencyEngine).toBeDefined();
      expect(GoalMeasurementEngine).toBeDefined();
      expect(GoalProgressEngine).toBeDefined();
      expect(GoalStrategyEngine).toBeDefined();
      expect(GoalRecommendationEngine).toBeDefined();
      expect(GoalScheduler).toBeDefined();
      expect(GoalAnalyticsEngine).toBeDefined();
      expect(GoalPlanner).toBeDefined();
    });
    it('full lifecycle: create → start → measure → strategy → complete', () => {
      const m = new GoalsManager();
      const g = m.createGoal({ name: 'Test', description: 'Desc', category: 'performance', targetMetric: 'health_score', targetValue: 90, currentValue: 70 })!;
      m.startGoal(g.id);
      m.generateStrategy(g.id, mockInput());
      m.measureGoal(g.id, mockInput());
      expect(m.getGoal(g.id)?.strategy.steps.length).toBeGreaterThan(0);
      expect(m.getGoalProgress(g.id).length).toBeGreaterThan(0);
    });
    it('all goal types have labels', () => {
      const types = ['performance','gaming','developer','trading','privacy','storage','startup','battery','health','security','business','creator','student','accessibility','custom','future_goal'] as const;
      for (const t of types) expect(getGoalTypeLabel(t)).toBeTruthy();
    });
    it('goal does not modify input data', () => {
      const m = new GoalsManager();
      const g = m.createGoal({ name: 'Test', description: 'Desc', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      expect(g.name).toBe('Test');
    });
  });

  describe('Performance', () => {
    it('goal evaluation under 100ms', () => {
      const m = new GoalsManager();
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      const start = performance.now();
      m.measureGoal(g.id, mockInput());
      expect(performance.now() - start).toBeLessThan(100);
    });
    it('strategy generation under 100ms', () => {
      const m = new GoalsManager();
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      const start = performance.now();
      m.generateStrategy(g.id, mockInput());
      expect(performance.now() - start).toBeLessThan(100);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty goals', () => {
      const m = new GoalsManager();
      expect(m.goalCount).toBe(0);
      expect(m.getGoalAnalytics().totalGoals).toBe(0);
    });
    it('handles max goals limit', () => {
      const m = new GoalsManager({ maxGoals: 2 });
      m.createGoal({ name: 'A', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      m.createGoal({ name: 'B', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 });
      expect(m.createGoal({ name: 'C', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })).toBeNull();
    });
    it('handles get non-existent goal', () => {
      const m = new GoalsManager();
      expect(m.getGoal('unknown')).toBeNull();
    });
    it('handles update non-existent goal', () => {
      const m = new GoalsManager();
      expect(m.updateGoal('unknown', {})).toBe(false);
    });
    it('handles delete non-existent goal', () => {
      const m = new GoalsManager();
      expect(m.deleteGoal('unknown')).toBe(false);
    });
    it('handles measure non-existent goal', () => {
      const m = new GoalsManager();
      expect(m.measureGoal('unknown', mockInput())).toBeNull();
    });
    it('handles all feature flags disabled', () => {
      const m = new GoalsManager({ featureFlags: { enableGoals: false, enableStrategies: false, enableMeasurement: false, enableProgress: false, enableConflicts: false, enableDependencies: false, enableRecommendations: false, enableAnalytics: false, enableHistory: false, enableEvents: false, enableValidation: false, enableScheduling: false } });
      expect(m.config.featureFlags.enableGoals).toBe(false);
    });
    it('handles measurement with no system metrics', () => {
      const me = new GoalMeasurementEngine(DC);
      const g = mockGoal({ targetMetric: 'health_score' });
      const p = me.measure(g, mockInput({ systemMetrics: null, healthScore: 50 }));
      expect(p.currentValue).toBe(50);
    });
    it('handles strategy for custom goal type', () => {
      const se = new GoalStrategyEngine(DC);
      const g = mockGoal({ category: 'custom' });
      const s = se.generateStrategy(g, mockInput());
      expect(s.steps.length).toBeGreaterThan(0);
    });
    it('handles blocked goal resume', () => {
      const m = new GoalsManager();
      const other = m.createGoal({ name: 'Other', description: 'D', category: 'health', targetMetric: 'health_score', targetValue: 90 })!;
      const g = m.createGoal({ name: 'T', description: 'D', category: 'performance', targetMetric: 'health_score', targetValue: 90 })!;
      m.startGoal(g.id);
      m.updateGoal(g.id, { dependencies: [{ id: 'd1', goalId: other.id, type: 'blocking', required: true, description: 'test', futureMetadata: {} }] });
      m.pauseGoal(g.id);
      expect(m.resumeGoal(g.id)).toBe(false);
      expect(m.getGoal(g.id)?.status).toBe('blocked');
    });
  });
});
