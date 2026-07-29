/**
 * Optimization Preview & Simulation Engine — Comprehensive Test Suite
 *
 * EPIC 4 PHASE B PART 2
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SimulationManager,
  SimulationEngine,
  SimulationPlanner,
  SimulationComparisonEngine,
  SimulationValidator,
  SimulationHistory,
  SimulationAnalyticsEngine,
  SimulationExporter,
  SimulationFormatter,
  SimulationEvents,
  SimulationScenarioBuilder,
  SimulationEstimator,
  createSimulationConfiguration,
  createDefaultSimulationInput,
  DEFAULT_SIMULATION_CONFIGURATION,
  generateSimulationId,
  generateComparisonId,
  generateSimulationHistoryId,
  generateAssumptionId,
  generateDeltaId,
  generateExportId,
  riskToScore,
  scoreToRisk,
  priorityToScore,
} from '../index';
import type {
  SmartPlan,
  SimulationInput,
  SimulationResult,
  SimulationHistoryEntry,
  EstimationPlugin,
  SystemState,
  OptimizationHistoryEntry,
} from '../index';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockSystemState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    cpuUsage: 30, memoryUsage: 50, diskActivity: 20, batteryLevel: 80,
    powerSource: 'ac', userActive: false, fullScreenApp: false, gamingMode: false,
    windowsUpdateActive: false, networkActivity: 10, thermalState: 'normal',
    storagePressure: 40, isIdle: true, timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockPlan(overrides: Partial<SmartPlan> = {}): SmartPlan {
  return {
    id: 'plan_test_001', title: 'Test Plan', summary: 'Test',
    generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    deviceProfile: { profileType: 'general' as never, performanceTier: 'mid' as never, primaryWorkload: 'general' as never, deviceName: 'Dev', confidenceScore: 0.8 },
    optimizationGoal: 'balanced', strategy: 'balanced', estimatedDuration: 120000,
    estimatedBenefits: { estimatedHealthGain: 10, estimatedStorageRecovery: 500, estimatedPerformanceGain: 0.15, estimatedPrivacyGain: 0.1, estimatedStartupGain: 0.08, estimatedTimeSaved: 30 },
    estimatedRisk: 'low', confidence: 0.75, priority: 'medium',
    recommendedActions: [
      { id: 'a1', recommendationId: 'r1', title: 'Clean Temp', description: 'Clean', category: 'storage', priority: 'high', estimatedDuration: 30000, estimatedBenefit: '200 MB', riskLevel: 'low', confidence: 0.85, rollbackAvailable: true, priorityScore: 0.8, dependencies: [], predictedImpact: 0.7, futureLearningWeight: 0.5 },
      { id: 'a2', recommendationId: 'r2', title: 'Optimize Startup', description: 'Opt', category: 'startup', priority: 'medium', estimatedDuration: 45000, estimatedBenefit: 'Faster', riskLevel: 'low', confidence: 0.7, rollbackAvailable: true, priorityScore: 0.6, dependencies: [], predictedImpact: 0.5, futureLearningWeight: 0.3 },
    ],
    deferredActions: [], excludedActions: [], rollbackAvailable: true, requiresConfirmation: false,
    safetyAssessment: { overallRisk: 'low', confirmationRequired: false, rollbackAvailable: true, protectedAreas: [], unsafeActions: [], skippedActions: [], riskScore: 0.2 },
    eligibilityResult: { eligible: true, eligibleActions: ['a1', 'a2'], ineligibleActions: [] },
    futureMetadata: {}, ...overrides,
  };
}

function createMockHistoryEntry(overrides: Partial<OptimizationHistoryEntry> = {}): OptimizationHistoryEntry {
  return { planId: 'plan_test_001', executedAt: new Date().toISOString(), goal: 'balanced', actionsCompleted: ['a1', 'a2'], actionsSkipped: [], healthBefore: 60, healthAfter: 75, successRate: 0.9, ...overrides };
}

function createMockInput(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return { plan: createMockPlan(), systemState: createMockSystemState(), healthScore: 65, deviceProfileType: 'general', optimizationHistory: [createMockHistoryEntry()], futureMetadata: {}, ...overrides };
}

function createMockSimulationResult(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    id: generateSimulationId(), planId: 'plan_test_001', type: 'quick_optimize', generatedAt: new Date().toISOString(),
    estimatedDuration: 120000, estimatedHealthBefore: 65, estimatedHealthAfter: 75, estimatedStorageRecovered: 450,
    estimatedPerformanceGain: 0.12, estimatedPrivacyImprovement: 0.08, estimatedMemoryRecovery: 5, estimatedStartupImprovement: 0.06,
    estimatedRisk: 'low', estimatedConfidence: 0.75, rollbackAvailability: true,
    assumptions: [{ id: generateAssumptionId(), description: 'Stable system', impact: 0.1, confidence: 0.8, category: 'system_stability', futureMetadata: {} }],
    supportingEvidence: [{ source: 'estimation', metric: 'test', value: 1, timestamp: new Date().toISOString(), description: 'Test', futureMetadata: {} }],
    explainability: { whyThisEstimate: 'Test', evidenceUsed: ['estimation:test'], confidenceScore: 0.75, assumptions: ['Stable system'], potentialUncertainty: 'Moderate', alternativePlanId: null, futureMetadata: {} },
    actionBreakdown: [], futureMetadata: {}, ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('Simulation Engine', () => {
  // ── Types & Helpers ──
  describe('Types & Helpers', () => {
    it('generateSimulationId produces unique ids', () => {
      expect(generateSimulationId()).not.toBe(generateSimulationId());
      expect(generateSimulationId()).toMatch(/^sim_/);
    });
    it('generateComparisonId produces unique ids', () => expect(generateComparisonId()).toMatch(/^cmp_/));
    it('generateSimulationHistoryId produces unique ids', () => expect(generateSimulationHistoryId()).toMatch(/^simhist_/));
    it('generateAssumptionId produces unique ids', () => expect(generateAssumptionId()).toMatch(/^assumption_/));
    it('generateDeltaId produces unique ids', () => expect(generateDeltaId()).toMatch(/^delta_/));
    it('generateExportId produces unique ids', () => expect(generateExportId()).toMatch(/^export_/));
    it('riskToScore converts correctly', () => {
      expect(riskToScore('none')).toBe(0); expect(riskToScore('low')).toBe(0.2);
      expect(riskToScore('medium')).toBe(0.5); expect(riskToScore('high')).toBe(0.8); expect(riskToScore('critical')).toBe(1.0);
    });
    it('scoreToRisk converts correctly', () => {
      expect(scoreToRisk(0)).toBe('none'); expect(scoreToRisk(0.2)).toBe('low');
      expect(scoreToRisk(0.5)).toBe('medium'); expect(scoreToRisk(0.8)).toBe('high'); expect(scoreToRisk(1.0)).toBe('critical');
    });
    it('priorityToScore converts correctly', () => {
      expect(priorityToScore('critical')).toBe(1.0); expect(priorityToScore('high')).toBe(0.8);
      expect(priorityToScore('medium')).toBe(0.5); expect(priorityToScore('low')).toBe(0.2); expect(priorityToScore('informational')).toBe(0.1);
    });
    it('createDefaultSimulationInput has defaults', () => {
      const input = createDefaultSimulationInput();
      expect(input.healthScore).toBe(50); expect(input.deviceProfileType).toBe('general'); expect(input.optimizationHistory).toEqual([]);
    });
  });

  // ── Configuration ──
  describe('SimulationConfiguration', () => {
    it('has defaults', () => {
      expect(DEFAULT_SIMULATION_CONFIGURATION.configVersion).toBe('1.0.0');
      expect(DEFAULT_SIMULATION_CONFIGURATION.estimationRules.length).toBeGreaterThan(0);
      expect(DEFAULT_SIMULATION_CONFIGURATION.featureFlags.enableEstimation).toBe(true);
      expect(DEFAULT_SIMULATION_CONFIGURATION.performanceTargetMs).toBe(200);
    });
    it('createSimulationConfiguration accepts overrides', () => {
      const config = createSimulationConfiguration({ performanceTargetMs: 500, enableEvents: false });
      expect(config.performanceTargetMs).toBe(500); expect(config.enableEvents).toBe(false);
    });
    it('merges featureFlags', () => {
      const config = createSimulationConfiguration({ featureFlags: { enableComparison: false } });
      expect(config.featureFlags.enableComparison).toBe(false); expect(config.featureFlags.enableEstimation).toBe(true);
    });
    it('merges futureFlags', () => {
      const config = createSimulationConfiguration({ featureFlags: { futureFlags: { custom_flag: true } } });
      expect(config.featureFlags.futureFlags.custom_flag).toBe(true);
    });
  });

  // ── Events ──
  describe('SimulationEvents', () => {
    it('on/emit receives events', () => {
      const events = new SimulationEvents(); let received = 0;
      events.on('simulation_generated', () => { received++; });
      events.emitGenerated('sim_1', {}); expect(received).toBe(1);
    });
    it('off removes listener', () => {
      const events = new SimulationEvents(); let received = 0;
      const l = () => { received++; }; events.on('simulation_started', l); events.off('simulation_started', l);
      events.emitStarted('sim_1', {}); expect(received).toBe(0);
    });
    it('on returns unsubscribe function', () => {
      const events = new SimulationEvents(); let received = 0;
      const unsub = events.on('simulation_expired', () => { received++; });
      events.emitExpired('sim_1', {}); expect(received).toBe(1); unsub();
      events.emitExpired('sim_2', {}); expect(received).toBe(1);
    });
    it('emitCompared works', () => {
      const events = new SimulationEvents(); let received = 0;
      events.on('simulation_compared', () => { received++; }); events.emitCompared('cmp_1', {}); expect(received).toBe(1);
    });
    it('emitExported works', () => {
      const events = new SimulationEvents(); let received = 0;
      events.on('simulation_exported', () => { received++; }); events.emitExported('sim_1', {}); expect(received).toBe(1);
    });
    it('clear removes all', () => {
      const events = new SimulationEvents(); events.on('simulation_started', () => {});
      events.clear(); expect(events.listenerCount()).toBe(0);
    });
    it('listenerCount returns correct count', () => {
      const events = new SimulationEvents();
      events.on('simulation_started', () => {}); events.on('simulation_started', () => {}); events.on('simulation_generated', () => {});
      expect(events.listenerCount('simulation_started')).toBe(2); expect(events.listenerCount()).toBe(3);
    });
    it('does not crash on listener error', () => {
      const events = new SimulationEvents();
      events.on('simulation_started', () => { throw new Error('test'); });
      events.on('simulation_started', () => {});
      expect(() => events.emitStarted('sim_1', {})).not.toThrow();
    });
  });

  // ── History ──
  describe('SimulationHistory', () => {
    it('records entries', () => {
      const h = new SimulationHistory(); const e = h.record('sim_1', 'plan_1', 'generated');
      expect(e.simulationId).toBe('sim_1'); expect(h.count).toBe(1);
    });
    it('getAll returns all', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.record('sim_2', 'p2', 'viewed');
      expect(h.getAll().length).toBe(2);
    });
    it('getBySimulation filters', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.record('sim_2', 'p1', 'generated'); h.record('sim_1', 'p1', 'viewed');
      expect(h.getBySimulation('sim_1').length).toBe(2);
    });
    it('getByPlan filters', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.record('sim_2', 'p2', 'generated');
      expect(h.getByPlan('p1').length).toBe(1);
    });
    it('getByStatus filters', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.record('sim_2', 'p1', 'accepted');
      expect(h.getByStatus('accepted').length).toBe(1);
    });
    it('getLatest returns last', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.record('sim_2', 'p1', 'viewed');
      expect(h.getLatest()?.simulationId).toBe('sim_2');
    });
    it('getLatestBySimulation returns last for sim', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.record('sim_1', 'p1', 'viewed');
      expect(h.getLatestBySimulation('sim_1')?.status).toBe('viewed');
    });
    it('updateStatus adds entry', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.updateStatus('sim_1', 'accepted');
      expect(h.getBySimulation('sim_1').length).toBe(2);
    });
    it('clear resets', () => {
      const h = new SimulationHistory(); h.record('sim_1', 'p1', 'generated'); h.clear(); expect(h.count).toBe(0);
    });
    it('respects max entries', () => {
      const h = new SimulationHistory(3);
      for (let i = 0; i < 5; i++) h.record(`sim_${i}`, 'p1', 'generated');
      expect(h.count).toBe(3);
    });
    it('setMaxEntries trims', () => {
      const h = new SimulationHistory(100);
      for (let i = 0; i < 10; i++) h.record(`sim_${i}`, 'p1', 'generated');
      h.setMaxEntries(5); expect(h.count).toBe(5);
    });
  });

  // ── Validator ──
  describe('SimulationValidator', () => {
    let v: SimulationValidator;
    beforeEach(() => { v = new SimulationValidator(DEFAULT_SIMULATION_CONFIGURATION); });
    it('validates correct input', () => { expect(v.validateInput(createMockInput()).valid).toBe(true); });
    it('detects missing plan id', () => {
      const r = v.validateInput(createMockInput({ plan: createMockPlan({ id: '' }) }));
      expect(r.valid).toBe(false); expect(r.errors.some((e) => e.code === 'MISSING_PLAN_ID')).toBe(true);
    });
    it('detects invalid health score', () => {
      const r = v.validateInput(createMockInput({ healthScore: 150 }));
      expect(r.errors.some((e) => e.code === 'INVALID_HEALTH_SCORE')).toBe(true);
    });
    it('warns on no actions', () => {
      const r = v.validateInput(createMockInput({ plan: createMockPlan({ recommendedActions: [] }) }));
      expect(r.warnings.some((w) => w.code === 'NO_ACTIONS')).toBe(true);
    });
    it('warns on high risk', () => {
      const r = v.validateInput(createMockInput({ plan: createMockPlan({ estimatedRisk: 'high' }) }));
      expect(r.warnings.some((w) => w.code === 'HIGH_RISK_PLAN')).toBe(true);
    });
    it('warns on no rollback', () => {
      const r = v.validateInput(createMockInput({ plan: createMockPlan({ rollbackAvailable: false }) }));
      expect(r.warnings.some((w) => w.code === 'NO_ROLLBACK')).toBe(true);
    });
    it('validates correct result', () => { expect(v.validateResult(createMockSimulationResult()).valid).toBe(true); });
    it('detects invalid confidence', () => {
      expect(v.validateResult(createMockSimulationResult({ estimatedConfidence: 1.5 })).valid).toBe(false);
    });
    it('detects invalid health after', () => {
      expect(v.validateResult(createMockSimulationResult({ estimatedHealthAfter: 150 })).valid).toBe(false);
    });
    it('warns on no evidence', () => {
      expect(v.validateResult(createMockSimulationResult({ supportingEvidence: [] })).warnings.some((w) => w.code === 'NO_EVIDENCE')).toBe(true);
    });
    it('warns on no assumptions', () => {
      expect(v.validateResult(createMockSimulationResult({ assumptions: [] })).warnings.some((w) => w.code === 'NO_ASSUMPTIONS')).toBe(true);
    });
    it('warns on negative health gain', () => {
      expect(v.validateResult(createMockSimulationResult({ estimatedHealthBefore: 80, estimatedHealthAfter: 70 })).warnings.some((w) => w.code === 'NEGATIVE_HEALTH_GAIN')).toBe(true);
    });
    it('warns on missing explanation', () => {
      const r = createMockSimulationResult({ explainability: { whyThisEstimate: '', evidenceUsed: [], confidenceScore: 0.5, assumptions: [], potentialUncertainty: '', alternativePlanId: null, futureMetadata: {} } });
      expect(v.validateResult(r).warnings.some((w) => w.code === 'NO_EXPLANATION')).toBe(true);
    });
    it('validateSimulation combines both', () => {
      expect(v.validateSimulation(createMockInput(), createMockSimulationResult()).valid).toBe(true);
    });
  });

  // ── Estimator ──
  describe('SimulationEstimator', () => {
    let est: SimulationEstimator;
    beforeEach(() => { est = new SimulationEstimator(DEFAULT_SIMULATION_CONFIGURATION); });
    it('estimates health before', () => {
      const r = est.estimateHealthBefore(createMockInput({ healthScore: 65 }));
      expect(r.value).toBe(65); expect(r.evidence.length).toBeGreaterThan(0);
    });
    it('estimates health after > before', () => {
      const r = est.estimateHealthAfter(createMockInput({ healthScore: 65 }));
      expect(r.value).toBeGreaterThan(65); expect(r.value).toBeLessThanOrEqual(100);
    });
    it('estimates storage recovered', () => {
      expect(est.estimateStorageRecovered(createMockInput()).value).toBeGreaterThan(0);
    });
    it('estimates performance gain', () => {
      const r = est.estimatePerformanceGain(createMockInput());
      expect(r.value).toBeGreaterThan(0); expect(r.value).toBeLessThanOrEqual(1);
    });
    it('estimates privacy improvement', () => {
      expect(est.estimatePrivacyImprovement(createMockInput()).value).toBeGreaterThan(0);
    });
    it('estimates memory recovery', () => {
      expect(est.estimateMemoryRecovery(createMockInput()).value).toBeGreaterThan(0);
    });
    it('estimates startup improvement', () => {
      expect(est.estimateStartupImprovement(createMockInput()).value).toBeGreaterThan(0);
    });
    it('estimates duration', () => {
      expect(est.estimateDuration(createMockInput()).value).toBeGreaterThan(0);
    });
    it('estimates risk', () => {
      expect(['none', 'low', 'medium', 'high', 'critical']).toContain(est.estimateRisk(createMockInput()).value);
    });
    it('estimates confidence', () => {
      const r = est.estimateConfidence(createMockInput());
      expect(r.value).toBeGreaterThan(0); expect(r.value).toBeLessThanOrEqual(1);
    });
    it('estimates rollback availability', () => {
      expect(est.estimateRollbackAvailability(createMockInput()).value).toBe(true);
    });
    it('generates assumptions', () => {
      const a = est.generateAssumptions(createMockInput());
      expect(a.length).toBeGreaterThan(0); a.forEach((x) => expect(x.description).toBeTruthy());
    });
    it('generates action breakdown', () => {
      const b = est.generateActionBreakdown(createMockInput());
      expect(b.length).toBe(2); expect(b[0]!.title).toBe('Clean Temp');
    });
    it('confidence increases with more history', () => {
      const c1 = est.estimateConfidence(createMockInput({ optimizationHistory: [] }));
      const c2 = est.estimateConfidence(createMockInput({ optimizationHistory: Array.from({ length: 10 }, (_, i) => createMockHistoryEntry({ planId: `p${i}`, successRate: 0.9 })) }));
      expect(c2.value).toBeGreaterThanOrEqual(c1.value);
    });
    it('registers and uses plugins', () => {
      const plugin: EstimationPlugin = {
        getPluginName: () => 'test', getVersion: () => '1.0.0', getPriority: () => 1,
        isAvailable: () => true, getFactor: () => 'historical_success', estimate: () => 0.95,
      };
      est.registerPlugin(plugin);
      expect(est.estimateConfidence(createMockInput()).value).toBeGreaterThan(0);
    });
    it('all estimates include evidence', () => {
      const input = createMockInput();
      const estimates = [est.estimateHealthBefore(input), est.estimateHealthAfter(input), est.estimateStorageRecovered(input), est.estimatePerformanceGain(input), est.estimatePrivacyImprovement(input), est.estimateMemoryRecovery(input), est.estimateStartupImprovement(input), est.estimateDuration(input), est.estimateRisk(input), est.estimateConfidence(input), est.estimateRollbackAvailability(input)];
      estimates.forEach((e) => expect(e.evidence.length).toBeGreaterThan(0));
    });
  });

  // ── Scenario Builder ──
  describe('SimulationScenarioBuilder', () => {
    let b: SimulationScenarioBuilder;
    beforeEach(() => { b = new SimulationScenarioBuilder(DEFAULT_SIMULATION_CONFIGURATION); });
    it('builds input from plan', () => {
      const input = b.buildInput(createMockPlan(), createMockSystemState(), 70, 'desktop', []);
      expect(input.plan.id).toBe('plan_test_001'); expect(input.healthScore).toBe(70);
    });
    it('determines simulation type from goal', () => {
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'quick_boost' }))).toBe('quick_optimize');
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'maximum_performance' }))).toBe('performance_boost');
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'storage_recovery' }))).toBe('storage_recovery');
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'privacy_protection' }))).toBe('privacy_cleanup');
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'startup_optimization' }))).toBe('startup_optimization');
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'routine_maintenance' }))).toBe('maintenance_plan');
      expect(b.determineSimulationType(createMockPlan({ optimizationGoal: 'custom' }))).toBe('custom_plan');
    });
    it('builds multiple inputs', () => {
      const inputs = b.buildMultipleInputs([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 60, 'laptop');
      expect(inputs.length).toBe(2);
    });
    it('getSimulationTypeLabel works', () => {
      expect(b.getSimulationTypeLabel('quick_optimize')).toBe('Quick Optimize');
    });
    it('getSimulationTypeDescription works', () => {
      expect(b.getSimulationTypeDescription('storage_recovery')).toBeTruthy();
    });
  });

  // ── Engine ──
  describe('SimulationEngine', () => {
    let engine: SimulationEngine;
    beforeEach(() => { engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION); });
    it('produces a simulation result', () => {
      const r = engine.simulate(createMockInput());
      expect(r.id).toBeTruthy(); expect(r.planId).toBe('plan_test_001');
      expect(r.estimatedHealthAfter).toBeGreaterThan(r.estimatedHealthBefore);
      expect(r.assumptions.length).toBeGreaterThan(0); expect(r.supportingEvidence.length).toBeGreaterThan(0);
    });
    it('includes explainability', () => {
      const r = engine.simulate(createMockInput());
      expect(r.explainability.whyThisEstimate).toBeTruthy();
      expect(r.explainability.evidenceUsed.length).toBeGreaterThan(0);
      expect(r.explainability.potentialUncertainty).toBeTruthy();
    });
    it('determines type correctly', () => {
      expect(engine.simulate(createMockInput({ plan: createMockPlan({ optimizationGoal: 'storage_recovery' }) })).type).toBe('storage_recovery');
    });
    it('handles empty actions', () => {
      const r = engine.simulate(createMockInput({ plan: createMockPlan({ recommendedActions: [] }) }));
      expect(r.actionBreakdown.length).toBe(0);
    });
    it('registers and uses provider plugins', () => {
      const mock = createMockSimulationResult();
      engine.registerPlugin({ getPluginName: () => 'tp', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, getSimulationType: () => 'quick_optimize', simulate: () => mock });
      expect(engine.simulate(createMockInput({ plan: createMockPlan({ optimizationGoal: 'quick_boost' }) })).id).toBe(mock.id);
    });
    it('falls back to builtin when plugin unavailable', () => {
      engine.registerPlugin({ getPluginName: () => 'tp', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, getSimulationType: () => 'quick_optimize', simulate: () => null });
      expect(engine.simulate(createMockInput()).id).not.toBe('');
    });
  });

  // ── Comparison Engine ──
  describe('SimulationComparisonEngine', () => {
    let cmp: SimulationComparisonEngine;
    beforeEach(() => { cmp = new SimulationComparisonEngine(DEFAULT_SIMULATION_CONFIGURATION); });
    it('compares two simulations', () => {
      const c = cmp.compare([createMockSimulationResult({ id: 's1', estimatedHealthAfter: 75 }), createMockSimulationResult({ id: 's2', estimatedHealthAfter: 80 })]);
      expect(c.simulations.length).toBe(2); expect(c.deltas.length).toBeGreaterThan(0); expect(c.winner).toBeTruthy();
    });
    it('handles single simulation', () => {
      const s = createMockSimulationResult(); expect(cmp.compare([s]).winner).toBe(s.id);
    });
    it('determines winner correctly', () => {
      expect(cmp.compare([createMockSimulationResult({ id: 's1', estimatedHealthAfter: 70, estimatedStorageRecovered: 200, estimatedDuration: 120000 }), createMockSimulationResult({ id: 's2', estimatedHealthAfter: 85, estimatedStorageRecovered: 500, estimatedDuration: 90000 })]).winner).toBe('s2');
    });
    it('generates deltas for all enabled metrics', () => {
      const c = cmp.compare([createMockSimulationResult({ id: 's1' }), createMockSimulationResult({ id: 's2' })]);
      const metrics = c.deltas.map((d) => d.metric);
      expect(metrics).toContain('estimatedHealthAfter'); expect(metrics).toContain('estimatedStorageRecovered');
      expect(metrics).toContain('estimatedDuration'); expect(metrics).toContain('estimatedRisk');
    });
    it('registers and uses comparison plugins', () => {
      cmp.registerPlugin({ getPluginName: () => 'tc', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, getMetric: () => 'custom', compare: (sims) => ({ metric: 'custom', label: 'Custom', values: sims.map((s) => s.estimatedConfidence), unit: 'score', bestIndex: 0, futureMetadata: {} }) });
      const c = cmp.compare([createMockSimulationResult({ id: 's1' }), createMockSimulationResult({ id: 's2' })]);
      expect(c.deltas.some((d) => d.metric === 'custom')).toBe(true);
    });
  });

  // ── Analytics ──
  describe('SimulationAnalytics', () => {
    it('computes empty analytics', () => {
      const r = new SimulationAnalyticsEngine().compute([], []);
      expect(r.totalSimulations).toBe(0); expect(r.averageHealthGain).toBe(0);
    });
    it('computes total simulations', () => {
      const r = new SimulationAnalyticsEngine().compute([], [createMockSimulationResult({ type: 'quick_optimize' }), createMockSimulationResult({ type: 'storage_recovery' })]);
      expect(r.totalSimulations).toBe(2); expect(r.byType['quick_optimize']).toBe(1);
    });
    it('computes averages', () => {
      const r = new SimulationAnalyticsEngine().compute([], [createMockSimulationResult({ estimatedHealthAfter: 75, estimatedHealthBefore: 65, estimatedStorageRecovered: 400, estimatedConfidence: 0.8 }), createMockSimulationResult({ estimatedHealthAfter: 80, estimatedHealthBefore: 60, estimatedStorageRecovered: 600, estimatedConfidence: 0.9 })]);
      expect(r.averageHealthGain).toBe(15); expect(r.averageStorageRecovered).toBe(500); expect(r.averageConfidence).toBeCloseTo(0.85, 5);
    });
    it('computes status rates', () => {
      const history: SimulationHistoryEntry[] = [
        { id: 'h1', simulationId: 's1', planId: 'p1', status: 'accepted', timestamp: new Date().toISOString(), metadata: {}, futureMetadata: {} },
        { id: 'h2', simulationId: 's2', planId: 'p2', status: 'rejected', timestamp: new Date().toISOString(), metadata: {}, futureMetadata: {} },
        { id: 'h3', simulationId: 's3', planId: 'p3', status: 'accepted', timestamp: new Date().toISOString(), metadata: {}, futureMetadata: {} },
        { id: 'h4', simulationId: 's4', planId: 'p4', status: 'expired', timestamp: new Date().toISOString(), metadata: {}, futureMetadata: {} },
      ];
      const r = new SimulationAnalyticsEngine().compute(history, []);
      expect(r.acceptanceRate).toBe(0.5); expect(r.rejectionRate).toBe(0.25); expect(r.expiryRate).toBe(0.25);
    });
  });

  // ── Formatter ──
  describe('SimulationFormatter', () => {
    let f: SimulationFormatter;
    beforeEach(() => { f = new SimulationFormatter(DEFAULT_SIMULATION_CONFIGURATION); });
    it('formats as JSON', () => { expect(JSON.parse(f.formatJSON(createMockSimulationResult())).id).toBeTruthy(); });
    it('formats as Markdown', () => { const md = f.formatMarkdown(createMockSimulationResult()); expect(md).toContain('#'); expect(md).toContain('Estimated Outcomes'); });
    it('formats as PDF-ready', () => { expect(JSON.parse(f.formatPDFReady(createMockSimulationResult())).documentType).toBe('simulation_report'); });
    it('formats comparison as JSON', () => {
      const c = new SimulationComparisonEngine(DEFAULT_SIMULATION_CONFIGURATION).compare([createMockSimulationResult({ id: 's1' }), createMockSimulationResult({ id: 's2' })]);
      expect(JSON.parse(f.formatJSONComparison(c)).simulations.length).toBe(2);
    });
    it('formats comparison as Markdown', () => {
      const c = new SimulationComparisonEngine(DEFAULT_SIMULATION_CONFIGURATION).compare([createMockSimulationResult({ id: 's1' }), createMockSimulationResult({ id: 's2' })]);
      expect(f.formatMarkdownComparison(c)).toContain('# Simulation Comparison');
    });
    it('format dispatches correctly', () => {
      const s = createMockSimulationResult();
      expect(JSON.parse(f.format(s, 'json')).id).toBe(s.id);
      expect(f.format(s, 'markdown')).toContain('#');
      expect(JSON.parse(f.format(s, 'pdf_ready')).documentType).toBe('simulation_report');
    });
  });

  // ── Exporter ──
  describe('SimulationExporter', () => {
    let ex: SimulationExporter;
    beforeEach(() => { ex = new SimulationExporter(DEFAULT_SIMULATION_CONFIGURATION); });
    it('exports as JSON', () => {
      const r = ex.export(createMockSimulationResult(), 'json');
      expect(r.format).toBe('json'); expect(r.metadata.byteSize).toBeGreaterThan(0);
    });
    it('exports as Markdown', () => { expect(ex.export(createMockSimulationResult(), 'markdown').content).toContain('#'); });
    it('exports as PDF-ready', () => { expect(JSON.parse(ex.export(createMockSimulationResult(), 'pdf_ready').content).documentType).toBe('simulation_report'); });
    it('exports comparison', () => {
      const c = new SimulationComparisonEngine(DEFAULT_SIMULATION_CONFIGURATION).compare([createMockSimulationResult({ id: 's1' }), createMockSimulationResult({ id: 's2' })]);
      expect(JSON.parse(ex.exportComparison(c, 'json').content).simulations.length).toBe(2);
    });
    it('exports all formats', () => { expect(ex.exportAll(createMockSimulationResult()).length).toBe(3); });
    it('getSupportedFormats includes built-in', () => {
      const f = ex.getSupportedFormats(); expect(f).toContain('json'); expect(f).toContain('markdown'); expect(f).toContain('pdf_ready');
    });
    it('registers and uses export plugins', () => {
      ex.registerPlugin({ getPluginName: () => 'te', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, getFormat: () => 'future_format', export: (s) => ({ format: 'future_format', content: 'custom', metadata: { exportedAt: new Date().toISOString(), simulationId: s.id, formatVersion: '2', byteSize: 6, futureMetadata: {} }, futureMetadata: {} }) });
      expect(ex.export(createMockSimulationResult(), 'future_format').content).toBe('custom');
      expect(ex.getSupportedFormats()).toContain('future_format');
    });
  });

  // ── Planner ──
  describe('SimulationPlanner', () => {
    let p: SimulationPlanner;
    beforeEach(() => { p = new SimulationPlanner(DEFAULT_SIMULATION_CONFIGURATION); });
    it('prepares simulation input', () => {
      const r = p.prepare(createMockPlan(), createMockSystemState(), 70, 'desktop', []);
      expect(r.input.plan.id).toBe('plan_test_001'); expect(r.type).toBe('custom_plan'); expect(r.validation).toBeDefined();
    });
    it('prepares multiple plans', () => {
      const r = p.prepareMultiple([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 60, 'laptop');
      expect(r.length).toBe(2);
    });
    it('exposes scenarioBuilder and validator', () => {
      expect(p.scenarioBuilder).toBeDefined(); expect(p.validator).toBeDefined();
    });
  });

  // ── Manager ──
  describe('SimulationManager', () => {
    let mgr: SimulationManager;
    beforeEach(() => { mgr = new SimulationManager(); });
    it('simulatePlan returns result', () => {
      const r = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general', [createMockHistoryEntry()]);
      expect(r.id).toBeTruthy(); expect(r.planId).toBe('plan_test_001');
    });
    it('comparePlans returns comparison', () => {
      const c = mgr.comparePlans([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 65, 'general');
      expect(c.simulations.length).toBe(2); expect(c.winner).toBeTruthy();
    });
    it('generateSimulation returns result', () => {
      const r = mgr.generateSimulation(createMockInput());
      expect(r.id).toBeTruthy();
    });
    it('validateSimulation returns result', () => {
      expect(mgr.validateSimulation(createMockInput(), createMockSimulationResult()).valid).toBe(true);
    });
    it('getSimulationHistory returns entries', () => {
      mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(mgr.getSimulationHistory().length).toBeGreaterThan(0);
    });
    it('exportSimulation returns export', () => {
      const sim = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      const exp = mgr.exportSimulation(sim, 'json');
      expect(exp.format).toBe('json');
    });
    it('getSimulationAnalytics returns analytics', () => {
      mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      const a = mgr.getSimulationAnalytics();
      expect(a.totalSimulations).toBeGreaterThan(0);
    });
    it('getSimulation returns cached result', () => {
      const r = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(mgr.getSimulation(r.id)?.id).toBe(r.id);
    });
    it('getComparison returns cached comparison', () => {
      const c = mgr.comparePlans([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 65, 'general');
      expect(mgr.getComparison(c.id)?.id).toBe(c.id);
    });
    it('updateSimulationStatus records history', () => {
      const r = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      mgr.updateSimulationStatus(r.id, 'accepted');
      expect(mgr.getSimulationHistory().some((h) => h.status === 'accepted')).toBe(true);
    });
    it('expireSimulation records expired', () => {
      const r = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      mgr.expireSimulation(r.id);
      expect(mgr.getSimulationHistory().some((h) => h.status === 'expired')).toBe(true);
    });
    it('emits simulation_started event', () => {
      let received = 0;
      mgr.on('simulation_started', () => { received++; });
      mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(received).toBe(1);
    });
    it('emits simulation_generated event', () => {
      let received = 0;
      mgr.on('simulation_generated', () => { received++; });
      mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(received).toBe(1);
    });
    it('emits simulation_compared event', () => {
      let received = 0;
      mgr.on('simulation_compared', () => { received++; });
      mgr.comparePlans([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 65, 'general');
      expect(received).toBe(1);
    });
    it('emits simulation_exported event', () => {
      let received = 0;
      mgr.on('simulation_exported', () => { received++; });
      const r = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      mgr.exportSimulation(r, 'json');
      expect(received).toBe(1);
    });
    it('events disabled does not emit', () => {
      const m = new SimulationManager({ enableEvents: false });
      let received = 0;
      m.on('simulation_started', () => { received++; });
      m.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(received).toBe(0);
    });
    it('config is accessible', () => { expect(mgr.config).toBeDefined(); });
    it('updateConfig updates config', () => {
      mgr.updateConfig({ performanceTargetMs: 500 });
      expect(mgr.config.performanceTargetMs).toBe(500);
    });
    it('clear resets state', () => {
      mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      mgr.clear();
      expect(mgr.getSimulationHistory().length).toBe(0);
    });
    it('registerProviderPlugin adds plugin', () => {
      mgr.registerProviderPlugin({ getPluginName: () => 'tp', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, getSimulationType: () => 'quick_optimize', simulate: () => null });
      // Should not crash
    });
    it('exportComparison works', () => {
      const c = mgr.comparePlans([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 65, 'general');
      const exp = mgr.exportComparison(c, 'json');
      expect(exp.format).toBe('json');
    });
  });

  // ── Regression ──
  describe('Regression', () => {
    it('all exports are defined', () => {
      expect(SimulationManager).toBeDefined(); expect(SimulationEngine).toBeDefined();
      expect(SimulationPlanner).toBeDefined(); expect(SimulationComparisonEngine).toBeDefined();
      expect(SimulationValidator).toBeDefined(); expect(SimulationHistory).toBeDefined();
      expect(SimulationAnalyticsEngine).toBeDefined(); expect(SimulationExporter).toBeDefined();
      expect(SimulationFormatter).toBeDefined(); expect(SimulationEvents).toBeDefined();
      expect(SimulationScenarioBuilder).toBeDefined(); expect(SimulationEstimator).toBeDefined();
    });
    it('full lifecycle: simulate → compare → validate → export', () => {
      const mgr = new SimulationManager();
      const sim = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general', [createMockHistoryEntry()]);
      expect(sim.id).toBeTruthy();
      const c = mgr.comparePlans([createMockPlan({ id: 'p1' }), createMockPlan({ id: 'p2' })], createMockSystemState(), 65, 'general');
      expect(c.winner).toBeTruthy();
      const v = mgr.validateSimulation(createMockInput(), sim);
      expect(v).toBeDefined();
      const exp = mgr.exportSimulation(sim, 'markdown');
      expect(exp.content).toContain('#');
    });
    it('built-in estimation rules cover all specified factors', () => {
      const factors = DEFAULT_SIMULATION_CONFIGURATION.estimationRules.map((r) => r.factor);
      expect(factors).toContain('historical_success'); expect(factors).toContain('plan_confidence');
      expect(factors).toContain('risk_level'); expect(factors).toContain('health_score');
      expect(factors).toContain('device_profile'); expect(factors).toContain('optimization_history');
    });
    it('built-in comparison rules cover all specified metrics', () => {
      const metrics = DEFAULT_SIMULATION_CONFIGURATION.comparisonRules.map((r) => r.metric);
      expect(metrics).toContain('estimatedHealthAfter'); expect(metrics).toContain('estimatedStorageRecovered');
      expect(metrics).toContain('estimatedPerformanceGain'); expect(metrics).toContain('estimatedDuration');
      expect(metrics).toContain('estimatedRisk');
    });
    it('every simulation is explainable', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput());
      expect(r.explainability.whyThisEstimate).toBeTruthy();
      expect(r.explainability.evidenceUsed.length).toBeGreaterThan(0);
      expect(r.explainability.assumptions.length).toBeGreaterThan(0);
      expect(r.explainability.potentialUncertainty).toBeTruthy();
    });
    it('simulation does not modify system state', () => {
      const state = createMockSystemState();
      const stateCopy = { ...state };
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      engine.simulate(createMockInput({ systemState: state }));
      expect(state).toEqual(stateCopy);
    });
    it('all simulation types are supported', () => {
      const goals = ['quick_boost', 'maximum_performance', 'storage_recovery', 'privacy_protection', 'startup_optimization', 'routine_maintenance', 'custom'] as const;
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      for (const goal of goals) {
        const r = engine.simulate(createMockInput({ plan: createMockPlan({ optimizationGoal: goal }) }));
        expect(r.type).toBeTruthy();
      }
    });
  });

  // ── Performance ──
  describe('Performance', () => {
    it('simulation generation under 200ms', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const start = performance.now();
      engine.simulate(createMockInput());
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });
    it('comparison under 50ms', () => {
      const cmp = new SimulationComparisonEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const sims = Array.from({ length: 5 }, () => createMockSimulationResult());
      const start = performance.now();
      cmp.compare(sims);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ── Edge Cases ──
  describe('Edge Cases', () => {
    it('handles no history', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ optimizationHistory: [] }));
      expect(r.estimatedConfidence).toBeGreaterThan(0);
    });
    it('handles single action', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ plan: createMockPlan({ recommendedActions: [createMockPlan().recommendedActions[0]!] }) }));
      expect(r.actionBreakdown.length).toBe(1);
    });
    it('handles high risk plan', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ plan: createMockPlan({ estimatedRisk: 'high' }) }));
      expect(r.estimatedRisk).toBeTruthy();
    });
    it('handles extreme health score 0', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ healthScore: 0 }));
      expect(r.estimatedHealthAfter).toBeGreaterThanOrEqual(0);
    });
    it('handles extreme health score 100', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ healthScore: 100 }));
      expect(r.estimatedHealthAfter).toBeLessThanOrEqual(100);
    });
    it('handles unknown device profile', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ deviceProfileType: 'unknown_device' }));
      expect(r.id).toBeTruthy();
    });
    it('handles all feature flags disabled', () => {
      const config = createSimulationConfiguration({ featureFlags: { enableEstimation: false, enableComparison: false, enableValidation: false, enableHistory: false, enableAnalytics: false, enableExport: false, enableExplainability: false, enableIncrementalUpdates: false, enableCaching: false } });
      const mgr = new SimulationManager(config);
      const r = mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(r.id).toBeTruthy();
    });
    it('handles events disabled', () => {
      const mgr = new SimulationManager({ enableEvents: false });
      let received = 0;
      mgr.on('simulation_generated', () => { received++; });
      mgr.simulatePlan(createMockPlan(), createMockSystemState(), 65, 'general');
      expect(received).toBe(0);
    });
    it('handles high CPU system state', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ systemState: createMockSystemState({ cpuUsage: 95 }) }));
      expect(r.estimatedDuration).toBeGreaterThan(0);
    });
    it('handles plan with no rollback', () => {
      const engine = new SimulationEngine(DEFAULT_SIMULATION_CONFIGURATION);
      const r = engine.simulate(createMockInput({ plan: createMockPlan({ rollbackAvailable: false }) }));
      expect(r.rollbackAvailability).toBe(false);
    });
  });
});
