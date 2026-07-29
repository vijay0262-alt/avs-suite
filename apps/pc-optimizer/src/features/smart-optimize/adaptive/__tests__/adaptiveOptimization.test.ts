/**
 * Tests for EPIC 4 PHASE A PART 3 — Adaptive Optimization Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SmartPlan,
  SystemState,
  Condition,
  ConditionRule,
  AdaptivePolicy,
  AdaptationAction,
  ConditionType,
  ConditionSeverity,
  RiskLevel,
  OptimizationGoal,
} from '../types';
import type { RecommendationCategory, DeviceProfileType, PerformanceTier, WorkloadType, SmartPlanAction, ExcludedAction, SafetyAssessment, EligibilityResult, SmartPlanBenefits, DeviceProfileSnapshot, RecommendationPriority } from '../../planner/types';
import {
  createDefaultAdaptiveConfiguration,
  createDefaultSystemState,
  generateAdaptationId,
  generateDecisionId,
  generateConditionId,
  generateAdaptiveHistoryId,
  severityToScore,
} from '../types';
import {
  DEFAULT_ADAPTIVE_CONFIGURATION,
  createAdaptiveConfiguration,
} from '../adaptiveConfiguration';
import { AdaptiveEvents } from '../adaptiveEvents';
import { AdaptiveConditionRegistry } from '../adaptiveConditionRegistry';
import { AdaptiveConditionEvaluator } from '../adaptiveConditionEvaluator';
import { AdaptivePolicyEngine } from '../adaptivePolicyEngine';
import { AdaptiveDecisionEngine } from '../adaptiveDecisionEngine';
import { AdaptivePlanModifier } from '../adaptivePlanModifier';
import { AdaptiveStateMonitor } from '../adaptiveStateMonitor';
import { AdaptiveValidator } from '../adaptiveValidator';
import { AdaptiveHistory } from '../adaptiveHistory';
import { AdaptivePlanner } from '../adaptivePlanner';
import { AdaptiveOptimizationManager } from '../adaptiveOptimizationManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockAction(overrides: Partial<SmartPlanAction> = {}): SmartPlanAction {
  return {
    id: overrides.id ?? 'action_1',
    recommendationId: overrides.recommendationId ?? 'rec_1',
    title: overrides.title ?? 'Test Action',
    description: overrides.description ?? 'A test action',
    category: overrides.category ?? 'performance' as RecommendationCategory,
    priority: overrides.priority ?? 'medium' as RecommendationPriority,
    estimatedDuration: overrides.estimatedDuration ?? 60,
    estimatedBenefit: overrides.estimatedBenefit ?? 'Improved performance',
    riskLevel: overrides.riskLevel ?? 'low' as RiskLevel,
    confidence: overrides.confidence ?? 0.8,
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    priorityScore: overrides.priorityScore ?? 0.7,
    dependencies: overrides.dependencies ?? [],
    predictedImpact: overrides.predictedImpact ?? 0.6,
    futureLearningWeight: overrides.futureLearningWeight ?? 0.5,
  };
}

function createMockPlan(overrides: Partial<SmartPlan> = {}): SmartPlan {
  const now = new Date().toISOString();
  const deviceProfile: DeviceProfileSnapshot = {
    profileType: 'general_purpose' as DeviceProfileType,
    performanceTier: 'mid_range' as PerformanceTier,
    primaryWorkload: 'general_use' as WorkloadType,
    deviceName: 'Test Device',
    confidenceScore: 0.85,
  };
  const benefits: SmartPlanBenefits = {
    estimatedHealthGain: 5,
    estimatedStorageRecovery: 100,
    estimatedPerformanceGain: 10,
    estimatedPrivacyGain: 3,
    estimatedStartupGain: 2,
    estimatedTimeSaved: 30,
  };
  const safety: SafetyAssessment = {
    overallRisk: 'low' as RiskLevel,
    confirmationRequired: false,
    rollbackAvailable: true,
    protectedAreas: [],
    unsafeActions: [],
    skippedActions: [],
    riskScore: 0.2,
  };
  const eligibility: EligibilityResult = {
    eligible: true,
    eligibleActions: ['action_1'],
    ineligibleActions: [],
  };
  return {
    id: overrides.id ?? 'plan_1',
    title: overrides.title ?? 'Test Plan',
    summary: overrides.summary ?? 'A test optimization plan',
    generatedAt: overrides.generatedAt ?? now,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3600000).toISOString(),
    deviceProfile: overrides.deviceProfile ?? deviceProfile,
    optimizationGoal: overrides.optimizationGoal ?? 'balanced' as OptimizationGoal,
    strategy: overrides.strategy ?? 'balanced',
    estimatedDuration: overrides.estimatedDuration ?? 300,
    estimatedBenefits: overrides.estimatedBenefits ?? benefits,
    estimatedRisk: overrides.estimatedRisk ?? 'low' as RiskLevel,
    confidence: overrides.confidence ?? 0.8,
    priority: overrides.priority ?? 'medium' as RecommendationPriority,
    recommendedActions: overrides.recommendedActions ?? [
      createMockAction({ id: 'action_1', priority: 'high' as RecommendationPriority }),
      createMockAction({ id: 'action_2', priority: 'medium' as RecommendationPriority, category: 'storage' as RecommendationCategory }),
      createMockAction({ id: 'action_3', priority: 'low' as RecommendationPriority, category: 'security' as RecommendationCategory }),
      createMockAction({ id: 'action_4', priority: 'critical' as RecommendationPriority }),
    ],
    deferredActions: overrides.deferredActions ?? [],
    excludedActions: overrides.excludedActions ?? [] as ExcludedAction[],
    rollbackAvailable: overrides.rollbackAvailable ?? true,
    requiresConfirmation: overrides.requiresConfirmation ?? false,
    safetyAssessment: overrides.safetyAssessment ?? safety,
    eligibilityResult: overrides.eligibilityResult ?? eligibility,
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    ...createDefaultSystemState(),
    ...overrides,
    timestamp: new Date().toISOString(),
  };
}

function createMockConditionRule(overrides: Partial<ConditionRule> = {}): ConditionRule {
  return {
    id: overrides.id ?? 'test_rule',
    conditionType: overrides.conditionType ?? 'cpu_usage' as ConditionType,
    name: overrides.name ?? 'Test Rule',
    description: overrides.description ?? 'A test condition rule',
    threshold: overrides.threshold ?? 80,
    operator: overrides.operator ?? '>',
    severity: overrides.severity ?? 'high' as ConditionSeverity,
    enabled: overrides.enabled ?? true,
    adaptationAction: overrides.adaptationAction ?? 'postpone_step' as AdaptationAction,
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultAdaptiveConfiguration has all sections', () => {
    const cfg = createDefaultAdaptiveConfiguration();
    expect(cfg.configVersion).toBe('1.0.0');
    expect(cfg.conditionRules.length).toBeGreaterThan(0);
    expect(cfg.policies.length).toBeGreaterThan(0);
    expect(cfg.thresholds).toBeDefined();
    expect(cfg.priorities).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
  });
  it('createDefaultSystemState has all fields', () => {
    const state = createDefaultSystemState();
    expect(state.cpuUsage).toBe(0);
    expect(state.powerSource).toBe('unknown');
    expect(state.userActive).toBe(true);
  });
  it('generateAdaptationId produces unique ids', () => {
    expect(generateAdaptationId()).not.toBe(generateAdaptationId());
    expect(generateAdaptationId()).toContain('adapt_');
  });
  it('generateDecisionId produces unique ids', () => {
    expect(generateDecisionId()).toContain('decision_');
  });
  it('generateConditionId produces unique ids', () => {
    expect(generateConditionId()).toContain('cond_');
  });
  it('generateAdaptiveHistoryId produces unique ids', () => {
    expect(generateAdaptiveHistoryId()).toContain('adaphist_');
  });
  it('severityToScore converts correctly', () => {
    expect(severityToScore('none')).toBe(0);
    expect(severityToScore('low')).toBe(0.25);
    expect(severityToScore('medium')).toBe(0.5);
    expect(severityToScore('high')).toBe(0.75);
    expect(severityToScore('critical')).toBe(1.0);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('AdaptiveConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_ADAPTIVE_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_ADAPTIVE_CONFIGURATION.evaluationIntervalMs).toBe(5000);
  });
  it('createAdaptiveConfiguration accepts overrides', () => {
    const cfg = createAdaptiveConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges thresholds', () => {
    const cfg = createAdaptiveConfiguration({ thresholds: { cpuHighUsage: 70 } });
    expect(cfg.thresholds.cpuHighUsage).toBe(70);
    expect(cfg.thresholds.cpuCriticalUsage).toBe(95);
  });
  it('merges featureFlags', () => {
    const cfg = createAdaptiveConfiguration({ featureFlags: { enablePlanPause: false } });
    expect(cfg.featureFlags.enablePlanPause).toBe(false);
    expect(cfg.featureFlags.enablePlanCancel).toBe(true);
  });
  it('merges priorities', () => {
    const cfg = createAdaptiveConfiguration({ priorities: { safetyPriority: 0 } });
    expect(cfg.priorities.safetyPriority).toBe(0);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('AdaptiveEvents', () => {
  let events: AdaptiveEvents;
  beforeEach(() => { events = new AdaptiveEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('adaptation_started', () => { received = true; });
    events.emitStarted('plan_1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('plan_paused', listener);
    events.off('plan_paused', listener);
    events.emitPlanPaused('plan_1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('plan_resumed', () => { received = true; });
    unsub();
    events.emitPlanResumed('plan_1');
    expect(received).toBe(false);
  });
  it('emitConditionDetected works', () => {
    let received = false;
    events.on('condition_detected', () => { received = true; });
    events.emitConditionDetected('plan_1');
    expect(received).toBe(true);
  });
  it('emitPlanModified works', () => {
    let received = false;
    events.on('plan_modified', () => { received = true; });
    events.emitPlanModified('plan_1');
    expect(received).toBe(true);
  });
  it('emitPlanCancelled works', () => {
    let received = false;
    events.on('plan_cancelled', () => { received = true; });
    events.emitPlanCancelled('plan_1');
    expect(received).toBe(true);
  });
  it('emitCompleted works', () => {
    let received = false;
    events.on('adaptation_completed', () => { received = true; });
    events.emitCompleted('plan_1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('adaptation_started', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('adaptation_started', () => {});
    events.on('plan_paused', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('adaptation_started')).toBe(1);
  });
  it('does not crash on listener error', () => {
    events.on('adaptation_started', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitStarted('plan_1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Condition Registry ───────────────────────────────────────

describe('ConditionRegistry', () => {
  let registry: AdaptiveConditionRegistry;
  beforeEach(() => { registry = new AdaptiveConditionRegistry(createDefaultAdaptiveConfiguration()); });

  it('registers built-in rules on construction', () => {
    expect(registry.conditionRuleCount()).toBeGreaterThan(0);
    expect(registry.getConditionRule('rule_cpu_high')).toBeDefined();
  });
  it('registers built-in policies on construction', () => {
    expect(registry.policyCount()).toBeGreaterThan(0);
    expect(registry.getPolicy('policy_safety')).toBeDefined();
  });
  it('registerConditionRule adds a new rule', () => {
    const rule = createMockConditionRule({ id: 'custom_rule' });
    expect(registry.registerConditionRule(rule)).toBe(true);
    expect(registry.getConditionRule('custom_rule')).toBeDefined();
  });
  it('registerConditionRule fails for duplicate', () => {
    const rule = createMockConditionRule({ id: 'rule_cpu_high' });
    expect(registry.registerConditionRule(rule)).toBe(false);
  });
  it('unregisterConditionRule removes rule', () => {
    const rule = createMockConditionRule({ id: 'custom_rule' });
    registry.registerConditionRule(rule);
    expect(registry.unregisterConditionRule('custom_rule')).toBe(true);
    expect(registry.getConditionRule('custom_rule')).toBeUndefined();
  });
  it('getEnabledConditionRules returns only enabled', () => {
    const enabled = registry.getEnabledConditionRules();
    expect(enabled.every((r) => r.enabled)).toBe(true);
  });
  it('getRulesByConditionType filters correctly', () => {
    const cpuRules = registry.getRulesByConditionType('cpu_usage');
    expect(cpuRules.length).toBeGreaterThan(0);
    expect(cpuRules.every((r) => r.conditionType === 'cpu_usage')).toBe(true);
  });
  it('registerPolicy adds a new policy', () => {
    const policy: AdaptivePolicy = {
      id: 'custom_policy', type: 'custom', name: 'Custom', description: 'Custom policy',
      priority: 10, enabled: true, rules: [], futureMetadata: {},
    };
    expect(registry.registerPolicy(policy)).toBe(true);
    expect(registry.getPolicy('custom_policy')).toBeDefined();
  });
  it('getEnabledPolicies returns sorted by priority', () => {
    const policies = registry.getEnabledPolicies();
    for (let i = 1; i < policies.length; i++) {
      expect(policies[i]!.priority).toBeGreaterThanOrEqual(policies[i - 1]!.priority);
    }
  });
});

// ── Condition Evaluator ──────────────────────────────────────

describe('ConditionEvaluator', () => {
  let registry: AdaptiveConditionRegistry;
  let evaluator: AdaptiveConditionEvaluator;
  beforeEach(() => {
    registry = new AdaptiveConditionRegistry(createDefaultAdaptiveConfiguration());
    evaluator = new AdaptiveConditionEvaluator(registry, createDefaultAdaptiveConfiguration());
  });

  it('evaluates high CPU usage', () => {
    const conditions = evaluator.evaluate(createMockState({ cpuUsage: 85 }));
    expect(conditions.some((c) => c.type === 'cpu_usage')).toBe(true);
  });
  it('evaluates low CPU as no condition', () => {
    const conditions = evaluator.evaluate(createMockState({ cpuUsage: 30 }));
    expect(conditions.some((c) => c.type === 'cpu_usage' && c.severity === 'high')).toBe(false);
  });
  it('evaluates critical CPU usage', () => {
    const conditions = evaluator.evaluate(createMockState({ cpuUsage: 96 }));
    expect(conditions.some((c) => c.type === 'cpu_usage' && c.severity === 'critical')).toBe(true);
  });
  it('evaluates low battery', () => {
    const conditions = evaluator.evaluate(createMockState({ batteryLevel: 15, powerSource: 'battery' }));
    expect(conditions.some((c) => c.type === 'battery_level')).toBe(true);
  });
  it('evaluates full screen app', () => {
    const conditions = evaluator.evaluate(createMockState({ fullScreenApp: true }));
    expect(conditions.some((c) => c.type === 'full_screen_app')).toBe(true);
  });
  it('evaluates gaming mode', () => {
    const conditions = evaluator.evaluate(createMockState({ gamingMode: true }));
    expect(conditions.some((c) => c.type === 'gaming_mode')).toBe(true);
  });
  it('evaluates windows update active', () => {
    const conditions = evaluator.evaluate(createMockState({ windowsUpdateActive: true }));
    expect(conditions.some((c) => c.type === 'windows_update')).toBe(true);
  });
  it('evaluates high memory usage', () => {
    const conditions = evaluator.evaluate(createMockState({ memoryUsage: 90 }));
    expect(conditions.some((c) => c.type === 'memory_usage')).toBe(true);
  });
  it('evaluates storage pressure', () => {
    const conditions = evaluator.evaluate(createMockState({ storagePressure: 95 }));
    expect(conditions.some((c) => c.type === 'storage_pressure')).toBe(true);
  });
  it('evaluates thermal hot', () => {
    const conditions = evaluator.evaluate(createMockState({ thermalState: 'hot' }));
    expect(conditions.some((c) => c.type === 'thermal_state')).toBe(true);
  });
  it('evaluates idle state', () => {
    const conditions = evaluator.evaluate(createMockState({ userActive: false, isIdle: true }));
    expect(conditions.some((c) => c.type === 'user_activity')).toBe(true);
  });
  it('returns empty for normal state', () => {
    const conditions = evaluator.evaluate(createMockState({ cpuUsage: 20, memoryUsage: 30 }));
    expect(conditions.length).toBe(0);
  });
  it('sorts conditions by severity (critical first)', () => {
    const conditions = evaluator.evaluate(createMockState({ cpuUsage: 96, memoryUsage: 90 }));
    expect(conditions[0]!.severity).toBe('critical');
  });
});

// ── Policy Engine ────────────────────────────────────────────

describe('PolicyEngine', () => {
  let registry: AdaptiveConditionRegistry;
  let engine: AdaptivePolicyEngine;
  beforeEach(() => {
    registry = new AdaptiveConditionRegistry(createDefaultAdaptiveConfiguration());
    engine = new AdaptivePolicyEngine(registry, createDefaultAdaptiveConfiguration());
  });

  it('returns no_action for no conditions', () => {
    const result = engine.evaluate([], {
      systemState: createMockState(),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(result.action).toBe('no_action');
  });
  it('cancels plan for critical condition', () => {
    const condition: Condition = {
      id: 'c1', type: 'cpu_usage', name: 'Critical CPU', description: 'CPU is critical',
      severity: 'critical', status: 'active', value: 96, threshold: 95, unit: '%',
      detectedAt: new Date().toISOString(), futureMetadata: {},
    };
    const result = engine.evaluate([condition], {
      systemState: createMockState({ cpuUsage: 96 }),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(result.action).toBe('cancel_plan');
  });
  it('pauses plan for gaming mode', () => {
    const condition: Condition = {
      id: 'c1', type: 'gaming_mode', name: 'Gaming Mode', description: 'Gaming active',
      severity: 'high', status: 'active', value: 1, threshold: 1, unit: 'boolean',
      detectedAt: new Date().toISOString(), futureMetadata: {},
    };
    const result = engine.evaluate([condition], {
      systemState: createMockState({ gamingMode: true }),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'gaming_pc',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(result.action).toBe('pause_plan');
  });
  it('reduces scope on battery', () => {
    const condition: Condition = {
      id: 'c1', type: 'battery_level', name: 'Low Battery', description: 'Battery low',
      severity: 'high', status: 'active', value: 15, threshold: 20, unit: '%',
      detectedAt: new Date().toISOString(), futureMetadata: {},
    };
    const result = engine.evaluate([condition], {
      systemState: createMockState({ batteryLevel: 15, powerSource: 'battery' }),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(result.action).toBe('reduce_scope');
  });
});

// ── Decision Engine ──────────────────────────────────────────

describe('DecisionEngine', () => {
  let registry: AdaptiveConditionRegistry;
  let policyEngine: AdaptivePolicyEngine;
  let engine: AdaptiveDecisionEngine;
  beforeEach(() => {
    registry = new AdaptiveConditionRegistry(createDefaultAdaptiveConfiguration());
    policyEngine = new AdaptivePolicyEngine(registry, createDefaultAdaptiveConfiguration());
    engine = new AdaptiveDecisionEngine(policyEngine, createDefaultAdaptiveConfiguration());
  });

  it('creates decisions for conditions', () => {
    const conditions: Condition[] = [{
      id: 'c1', type: 'cpu_usage', name: 'High CPU', description: 'CPU high',
      severity: 'high', status: 'active', value: 85, threshold: 80, unit: '%',
      detectedAt: new Date().toISOString(), futureMetadata: {},
    }];
    const decisions = engine.decide(conditions, {
      systemState: createMockState({ cpuUsage: 85 }),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0]!.id).toContain('decision_');
    expect(decisions[0]!.confidence).toBeGreaterThan(0);
  });
  it('returns empty for no conditions', () => {
    const decisions = engine.decide([], {
      systemState: createMockState(),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(decisions.length).toBe(0);
  });
  it('sorts decisions by severity', () => {
    const conditions: Condition[] = [
      { id: 'c1', type: 'cpu_usage', name: 'High CPU', description: '', severity: 'high', status: 'active', value: 85, threshold: 80, unit: '%', detectedAt: new Date().toISOString(), futureMetadata: {} },
      { id: 'c2', type: 'cpu_usage', name: 'Critical CPU', description: '', severity: 'critical', status: 'active', value: 96, threshold: 95, unit: '%', detectedAt: new Date().toISOString(), futureMetadata: {} },
    ];
    const decisions = engine.decide(conditions, {
      systemState: createMockState({ cpuUsage: 96 }),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(decisions[0]!.priority).toBe('critical');
  });
  it('includes affected action ids', () => {
    const conditions: Condition[] = [{
      id: 'c1', type: 'cpu_usage', name: 'High CPU', description: '',
      severity: 'high', status: 'active', value: 85, threshold: 80, unit: '%',
      detectedAt: new Date().toISOString(), futureMetadata: {},
    }];
    const decisions = engine.decide(conditions, {
      systemState: createMockState({ cpuUsage: 85 }),
      plan: createMockPlan(),
      goal: 'balanced' as OptimizationGoal,
      deviceProfileType: 'general_purpose',
      riskTolerance: 'low' as RiskLevel,
      userPreferences: null,
      historicalOutcomes: [],
    });
    expect(decisions[0]!.affectedActionIds).toBeDefined();
  });
});

// ── Plan Modifier ────────────────────────────────────────────

describe('PlanModifier', () => {
  let modifier: AdaptivePlanModifier;
  beforeEach(() => { modifier = new AdaptivePlanModifier(); });

  it('returns original plan for no decisions', () => {
    const plan = createMockPlan();
    const result = modifier.modify(plan, []);
    expect(result).toBe(plan);
  });
  it('postpones steps', () => {
    const plan = createMockPlan();
    const decisions = [{
      id: 'd1', condition: 'High CPU', conditionType: 'cpu_usage' as ConditionType,
      decision: 'postpone_step' as AdaptationAction, reason: 'CPU high',
      confidence: 0.8, priority: 'high' as RecommendationPriority,
      estimatedImpact: 0.6, estimatedDelay: 300, rollbackAvailable: true,
      affectedActionIds: ['action_1'], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.some((a) => a.id === 'action_1')).toBe(false);
    expect(result.deferredActions.some((a) => a.id === 'action_1')).toBe(true);
  });
  it('skips steps', () => {
    const plan = createMockPlan();
    const decisions = [{
      id: 'd1', condition: 'Windows Update', conditionType: 'windows_update' as ConditionType,
      decision: 'skip_step' as AdaptationAction, reason: 'Update active',
      confidence: 0.8, priority: 'medium' as RecommendationPriority,
      estimatedImpact: 0.5, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: ['action_1'], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.some((a) => a.id === 'action_1')).toBe(false);
    expect(result.excludedActions.some((a) => a.id === 'action_1')).toBe(true);
  });
  it('reduces scope', () => {
    const plan = createMockPlan();
    const decisions = [{
      id: 'd1', condition: 'Low Battery', conditionType: 'battery_level' as ConditionType,
      decision: 'reduce_scope' as AdaptationAction, reason: 'Battery low',
      confidence: 0.8, priority: 'high' as RecommendationPriority,
      estimatedImpact: 0.4, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.length).toBeLessThan(plan.recommendedActions.length);
  });
  it('pauses plan', () => {
    const plan = createMockPlan();
    const decisions = [{
      id: 'd1', condition: 'Gaming', conditionType: 'gaming_mode' as ConditionType,
      decision: 'pause_plan' as AdaptationAction, reason: 'Gaming active',
      confidence: 0.85, priority: 'high' as RecommendationPriority,
      estimatedImpact: 0.8, estimatedDelay: 600, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.length).toBe(0);
    expect(result.deferredActions.length).toBeGreaterThan(0);
  });
  it('cancels plan', () => {
    const plan = createMockPlan();
    const decisions = [{
      id: 'd1', condition: 'Critical', conditionType: 'cpu_usage' as ConditionType,
      decision: 'cancel_plan' as AdaptationAction, reason: 'Critical condition',
      confidence: 0.95, priority: 'critical' as RecommendationPriority,
      estimatedImpact: 1.0, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.length).toBe(0);
    expect(result.deferredActions.length).toBe(0);
    expect(result.excludedActions.length).toBeGreaterThan(0);
  });
  it('resumes plan', () => {
    const plan = createMockPlan({
      recommendedActions: [],
      deferredActions: [createMockAction({ id: 'action_1' })],
    });
    const decisions = [{
      id: 'd1', condition: 'Idle', conditionType: 'user_activity' as ConditionType,
      decision: 'resume_plan' as AdaptationAction, reason: 'System idle',
      confidence: 0.7, priority: 'low' as RecommendationPriority,
      estimatedImpact: 0.3, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.deferredActions.length).toBe(0);
  });
  it('isPlanPaused detects paused plan', () => {
    const paused = createMockPlan({ recommendedActions: [], deferredActions: [createMockAction()] });
    expect(modifier.isPlanPaused(paused)).toBe(true);
  });
  it('isPlanCancelled detects cancelled plan', () => {
    const cancelled = createMockPlan({ recommendedActions: [], deferredActions: [] });
    expect(modifier.isPlanCancelled(cancelled)).toBe(true);
  });
  it('recalculates duration', () => {
    const plan = createMockPlan();
    const decisions = [{
      id: 'd1', condition: 'Test', conditionType: 'cpu_usage' as ConditionType,
      decision: 'postpone_step' as AdaptationAction, reason: 'Test',
      confidence: 0.8, priority: 'high' as RecommendationPriority,
      estimatedImpact: 0.5, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: ['action_1', 'action_2', 'action_3', 'action_4'], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.estimatedDuration).toBe(0);
  });
});

// ── State Monitor ────────────────────────────────────────────

describe('StateMonitor', () => {
  let monitor: AdaptiveStateMonitor;
  beforeEach(() => { monitor = new AdaptiveStateMonitor(createDefaultAdaptiveConfiguration()); });

  it('returns current state', () => {
    expect(monitor.getState()).toBeDefined();
    expect(monitor.getState().cpuUsage).toBe(0);
  });
  it('updates state', () => {
    monitor.update({ cpuUsage: 50 });
    expect(monitor.getState().cpuUsage).toBe(50);
  });
  it('tracks previous state', () => {
    monitor.update({ cpuUsage: 50 });
    monitor.update({ cpuUsage: 60 });
    expect(monitor.getPreviousState()?.cpuUsage).toBe(50);
  });
  it('detects state change', () => {
    monitor.update({ cpuUsage: 50 });
    monitor.update({ cpuUsage: 60 });
    expect(monitor.hasStateChanged()).toBe(true);
  });
  it('isOnBattery detects battery power', () => {
    monitor.update({ powerSource: 'battery' });
    expect(monitor.isOnBattery()).toBe(true);
  });
  it('isGaming detects gaming mode', () => {
    monitor.update({ gamingMode: true });
    expect(monitor.isGaming()).toBe(true);
  });
  it('isUnderLoad detects high CPU', () => {
    monitor.update({ cpuUsage: 85 });
    expect(monitor.isUnderLoad()).toBe(true);
  });
  it('isThermalThrottled detects hot state', () => {
    monitor.update({ thermalState: 'hot' });
    expect(monitor.isThermalThrottled()).toBe(true);
  });
  it('getChangeSummary returns changes', () => {
    monitor.update({ cpuUsage: 50 });
    monitor.update({ cpuUsage: 60 });
    const changes = monitor.getChangeSummary();
    expect(changes.some((c) => c.includes('CPU'))).toBe(true);
  });
  it('reset clears state', () => {
    monitor.update({ cpuUsage: 50 });
    monitor.reset();
    expect(monitor.getState().cpuUsage).toBe(0);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('AdaptiveValidator', () => {
  let validator: AdaptiveValidator;
  beforeEach(() => { validator = new AdaptiveValidator(); });

  it('validates a correct plan', () => {
    const result = validator.validate(createMockPlan(), []);
    expect(result.valid).toBe(true);
  });
  it('detects empty plan', () => {
    const plan = createMockPlan({ recommendedActions: [], deferredActions: [], excludedActions: [] });
    const result = validator.validate(plan, []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EMPTY_PLAN')).toBe(true);
  });
  it('warns on unsafe actions', () => {
    const plan = createMockPlan({
      safetyAssessment: {
        overallRisk: 'high' as RiskLevel, confirmationRequired: true, rollbackAvailable: true,
        protectedAreas: [], unsafeActions: ['action_1'], skippedActions: [], riskScore: 0.7,
      },
    });
    const result = validator.validate(plan, []);
    expect(result.warnings.some((w) => w.code === 'UNSAFE_ACTIONS')).toBe(true);
  });
  it('warns on low confidence decisions', () => {
    const decisions = [{
      id: 'd1', condition: 'Test', conditionType: 'cpu_usage' as ConditionType,
      decision: 'postpone_step' as AdaptationAction, reason: 'Test',
      confidence: 0.3, priority: 'medium' as RecommendationPriority,
      estimatedImpact: 0.5, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = validator.validate(createMockPlan(), decisions);
    expect(result.warnings.some((w) => w.code === 'LOW_CONFIDENCE')).toBe(true);
  });
  it('detects invalid confidence', () => {
    const decisions = [{
      id: 'd1', condition: 'Test', conditionType: 'cpu_usage' as ConditionType,
      decision: 'postpone_step' as AdaptationAction, reason: 'Test',
      confidence: 1.5, priority: 'medium' as RecommendationPriority,
      estimatedImpact: 0.5, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = validator.validate(createMockPlan(), decisions);
    expect(result.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
  });
});

// ── History ──────────────────────────────────────────────────

describe('AdaptiveHistory', () => {
  let history: AdaptiveHistory;
  beforeEach(() => { history = new AdaptiveHistory(100); });

  it('records entries', () => {
    history.record('plan_1', 'postpone_step', 'cpu_usage', 0.8);
    expect(history.count).toBe(1);
  });
  it('getAll returns all entries', () => {
    history.record('plan_1', 'postpone_step', 'cpu_usage', 0.8);
    history.record('plan_2', 'pause_plan', 'gaming_mode', 0.85);
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    history.record('plan_1', 'postpone_step', 'cpu_usage', 0.8);
    history.record('plan_2', 'pause_plan', 'gaming_mode', 0.85);
    expect(history.getRecent(1).length).toBe(1);
    expect(history.getRecent(1)[0]!.planId).toBe('plan_2');
  });
  it('getByPlan filters', () => {
    history.record('plan_1', 'postpone_step', 'cpu_usage', 0.8);
    history.record('plan_2', 'pause_plan', 'gaming_mode', 0.85);
    expect(history.getByPlan('plan_1').length).toBe(1);
  });
  it('getByAction filters', () => {
    history.record('plan_1', 'postpone_step', 'cpu_usage', 0.8);
    history.record('plan_2', 'pause_plan', 'gaming_mode', 0.85);
    expect(history.getByAction('pause_plan').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('plan_1', 'postpone_step', 'cpu_usage', 0.8);
    history.clear();
    expect(history.count).toBe(0);
  });
  it('setMaxEntries trims', () => {
    for (let i = 0; i < 10; i++) history.record(`plan_${i}`, 'postpone_step', 'cpu_usage', 0.8);
    history.setMaxEntries(5);
    expect(history.count).toBe(5);
  });
});

// ── Adaptive Planner ─────────────────────────────────────────

describe('AdaptivePlanner', () => {
  let planner: AdaptivePlanner;
  beforeEach(() => { planner = new AdaptivePlanner(createDefaultAdaptiveConfiguration()); });

  it('adapts plan for high CPU', () => {
    const plan = createMockPlan();
    const state = createMockState({ cpuUsage: 85 });
    const result = planner.adapt(plan, state);
    expect(result).toBeDefined();
    expect(result.originalPlan).toBe(plan);
  });
  it('returns no adaptation for normal state', () => {
    const plan = createMockPlan();
    const state = createMockState({ cpuUsage: 20, memoryUsage: 30 });
    const result = planner.adapt(plan, state);
    expect(result.adapted).toBe(false);
  });
  it('pauses plan for gaming mode', () => {
    const plan = createMockPlan();
    const state = createMockState({ gamingMode: true });
    const result = planner.adapt(plan, state);
    expect(result.adapted).toBe(true);
    expect(result.adaptedPlan.recommendedActions.length).toBe(0);
  });
  it('cancels plan for critical CPU', () => {
    const plan = createMockPlan();
    const state = createMockState({ cpuUsage: 96 });
    const result = planner.adapt(plan, state);
    expect(result.adapted).toBe(true);
  });
  it('reduces scope on low battery', () => {
    const plan = createMockPlan();
    const state = createMockState({ batteryLevel: 15, powerSource: 'battery' });
    const result = planner.adapt(plan, state);
    expect(result.adapted).toBe(true);
    expect(result.adaptedPlan.recommendedActions.length).toBeLessThanOrEqual(plan.recommendedActions.length);
  });
  it('evaluateConditions returns conditions', () => {
    const conditions = planner.evaluateConditions(createMockState({ cpuUsage: 85 }));
    expect(conditions.some((c) => c.type === 'cpu_usage')).toBe(true);
  });
  it('validateAdaptation returns result', () => {
    const plan = createMockPlan();
    const result = planner.adapt(plan, createMockState({ cpuUsage: 85 }));
    const validation = planner.validateAdaptation(result);
    expect(validation).toBeDefined();
  });
  it('includes summary in result', () => {
    const result = planner.adapt(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
  });
  it('includes conditions in result', () => {
    const result = planner.adapt(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(result.conditions.length).toBeGreaterThan(0);
  });
  it('includes decisions in result', () => {
    const result = planner.adapt(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(result.decisions.length).toBeGreaterThan(0);
  });
});

// ── Adaptive Manager ─────────────────────────────────────────

describe('AdaptiveManager', () => {
  let manager: AdaptiveOptimizationManager;
  beforeEach(() => { manager = new AdaptiveOptimizationManager(); });

  it('adaptPlan returns result', () => {
    const result = manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(result).toBeDefined();
    expect(result.originalPlan).toBeDefined();
  });
  it('adaptPlan emits events', () => {
    let started = false;
    let completed = false;
    manager.on('adaptation_started', () => { started = true; });
    manager.on('adaptation_completed', () => { completed = true; });
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(started).toBe(true);
    expect(completed).toBe(true);
  });
  it('adaptPlan emits condition_detected', () => {
    let detected = false;
    manager.on('condition_detected', () => { detected = true; });
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(detected).toBe(true);
  });
  it('adaptPlan emits plan_modified when adapted', () => {
    let modified = false;
    manager.on('plan_modified', () => { modified = true; });
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(modified).toBe(true);
  });
  it('adaptPlan emits plan_paused for gaming', () => {
    let paused = false;
    manager.on('plan_paused', () => { paused = true; });
    manager.adaptPlan(createMockPlan(), createMockState({ gamingMode: true }));
    expect(paused).toBe(true);
  });
  it('adaptPlan emits plan_cancelled for critical', () => {
    let cancelled = false;
    manager.on('plan_cancelled', () => { cancelled = true; });
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 96 }));
    expect(cancelled).toBe(true);
  });
  it('evaluateConditions returns conditions', () => {
    const conditions = manager.evaluateConditions(createMockState({ cpuUsage: 85 }));
    expect(conditions.some((c) => c.type === 'cpu_usage')).toBe(true);
  });
  it('getAdaptivePlan returns stored result', () => {
    manager.adaptPlan(createMockPlan({ id: 'test_plan' }), createMockState({ cpuUsage: 85 }));
    expect(manager.getAdaptivePlan('test_plan')).toBeDefined();
  });
  it('getAdaptivePlan returns undefined for unknown', () => {
    expect(manager.getAdaptivePlan('unknown')).toBeUndefined();
  });
  it('getAdaptiveHistory returns entries', () => {
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(manager.getAdaptiveHistory().length).toBeGreaterThan(0);
  });
  it('registerCondition adds a rule', () => {
    const rule = createMockConditionRule({ id: 'custom_rule' });
    expect(manager.registerCondition(rule)).toBe(true);
  });
  it('registerPolicy adds a policy', () => {
    const policy: AdaptivePolicy = {
      id: 'custom_policy', type: 'custom', name: 'Custom', description: 'Custom',
      priority: 10, enabled: true, rules: [], futureMetadata: {},
    };
    expect(manager.registerPolicy(policy)).toBe(true);
  });
  it('validateAdaptation returns result', () => {
    const result = manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    const validation = manager.validateAdaptation(result);
    expect(validation).toBeDefined();
  });
  it('getAdaptiveStatistics returns stats', () => {
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    const stats = manager.getAdaptiveStatistics();
    expect(stats.totalAdaptations).toBeGreaterThan(0);
  });
  it('getAdaptiveStatistics with no history returns zeros', () => {
    const stats = manager.getAdaptiveStatistics();
    expect(stats.totalAdaptations).toBe(0);
    expect(stats.averageConfidence).toBe(0);
  });
  it('updateState updates monitor', () => {
    manager.updateState({ cpuUsage: 50 });
    expect(manager.getState().cpuUsage).toBe(50);
  });
  it('config is accessible', () => {
    expect(manager.config.configVersion).toBe('1.0.0');
  });
  it('updateConfig updates config', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('clear resets everything', () => {
    manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    manager.clear();
    expect(manager.getAdaptiveHistory().length).toBe(0);
  });
  it('events disabled does not emit', () => {
    const cfg = createAdaptiveConfiguration({ enableEvents: false });
    const m = new AdaptiveOptimizationManager(cfg);
    let emitted = false;
    m.on('adaptation_started', () => { emitted = true; });
    m.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 85 }));
    expect(emitted).toBe(false);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.AdaptiveOptimizationManager).toBeDefined();
    expect(module.AdaptivePlanner).toBeDefined();
    expect(module.AdaptivePolicyEngine).toBeDefined();
    expect(module.AdaptiveConditionRegistry).toBeDefined();
    expect(module.AdaptiveConditionEvaluator).toBeDefined();
    expect(module.AdaptiveDecisionEngine).toBeDefined();
    expect(module.AdaptivePlanModifier).toBeDefined();
    expect(module.AdaptiveStateMonitor).toBeDefined();
    expect(module.AdaptiveValidator).toBeDefined();
    expect(module.AdaptiveHistory).toBeDefined();
    expect(module.AdaptiveEvents).toBeDefined();
    expect(module.DEFAULT_ADAPTIVE_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: adapt → validate → statistics', () => {
    const manager = new AdaptiveOptimizationManager();
    const plan = createMockPlan();
    const result = manager.adaptPlan(plan, createMockState({ cpuUsage: 85, gamingMode: false }));
    const validation = manager.validateAdaptation(result);
    expect(validation).toBeDefined();
    const stats = manager.getAdaptiveStatistics();
    expect(stats.totalAdaptations).toBeGreaterThan(0);
  });
  it('built-in condition rules cover all specified conditions', () => {
    const cfg = createDefaultAdaptiveConfiguration();
    const types = cfg.conditionRules.map((r) => r.conditionType);
    expect(types).toContain('cpu_usage');
    expect(types).toContain('memory_usage');
    expect(types).toContain('battery_level');
    expect(types).toContain('full_screen_app');
    expect(types).toContain('gaming_mode');
    expect(types).toContain('windows_update');
    expect(types).toContain('thermal_state');
    expect(types).toContain('storage_pressure');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('adaptation under 100ms', () => {
    const manager = new AdaptiveOptimizationManager();
    const plan = createMockPlan();
    const state = createMockState({ cpuUsage: 85 });
    const start = performance.now();
    manager.adaptPlan(plan, state);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles normal system state with no conditions', () => {
    const manager = new AdaptiveOptimizationManager();
    const result = manager.adaptPlan(createMockPlan(), createMockState({ cpuUsage: 20 }));
    expect(result.adapted).toBe(false);
  });
  it('handles plan with no recommended actions', () => {
    const manager = new AdaptiveOptimizationManager();
    const plan = createMockPlan({ recommendedActions: [], deferredActions: [createMockAction()] });
    const result = manager.adaptPlan(plan, createMockState({ cpuUsage: 85 }));
    expect(result).toBeDefined();
  });
  it('handles null battery level', () => {
    const manager = new AdaptiveOptimizationManager();
    const conditions = manager.evaluateConditions(createMockState({ batteryLevel: null }));
    expect(conditions.some((c) => c.type === 'battery_level')).toBe(false);
  });
  it('handles multiple simultaneous conditions', () => {
    const manager = new AdaptiveOptimizationManager();
    const conditions = manager.evaluateConditions(createMockState({
      cpuUsage: 85, memoryUsage: 90, gamingMode: true, fullScreenApp: true,
    }));
    expect(conditions.length).toBeGreaterThan(1);
  });
  it('handles unknown thermal state', () => {
    const manager = new AdaptiveOptimizationManager();
    const conditions = manager.evaluateConditions(createMockState({ thermalState: 'unknown' }));
    expect(conditions.some((c) => c.type === 'thermal_state')).toBe(false);
  });
  it('handles user preferences filtering', () => {
    const planner = new AdaptivePlanner(createDefaultAdaptiveConfiguration());
    const result = planner.adapt(createMockPlan(), createMockState({ fullScreenApp: true }), {
      userPreferences: {
        allowBackgroundOptimization: true,
        pauseOnFullScreen: false,
        pauseOnGaming: true,
        deferOnBattery: true,
        thermalThrottle: true,
      },
    });
    // Full screen should not trigger pause since user pref disabled it
    expect(result.conditions.some((c) => c.type === 'full_screen_app')).toBe(false);
  });
  it('handles empty plan with no actions at all', () => {
    const validator = new AdaptiveValidator();
    const plan = createMockPlan({ recommendedActions: [], deferredActions: [], excludedActions: [] });
    const result = validator.validate(plan, []);
    expect(result.valid).toBe(false);
  });
  it('handles resume plan with no deferred actions', () => {
    const modifier = new AdaptivePlanModifier();
    const plan = createMockPlan({ recommendedActions: [], deferredActions: [] });
    const decisions = [{
      id: 'd1', condition: 'Idle', conditionType: 'user_activity' as ConditionType,
      decision: 'resume_plan' as AdaptationAction, reason: 'Idle',
      confidence: 0.7, priority: 'low' as RecommendationPriority,
      estimatedImpact: 0.3, estimatedDelay: 0, rollbackAvailable: true,
      affectedActionIds: [], futureMetadata: {},
    }];
    const result = modifier.modify(plan, decisions);
    expect(result.recommendedActions.length).toBe(0);
  });
});
