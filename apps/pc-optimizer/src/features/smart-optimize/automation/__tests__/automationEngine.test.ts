/**
 * Tests for EPIC 4 PHASE A PART 5 — Policy-Based Automation Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SystemState,
  AutomationRule,
  AutomationTrigger,
  AutomationCondition,
  AutomationAction,
  ExecutionPolicy,
  RiskLevel,
  RecommendationPriority,
  SafetyPolicy,
  AutomationTriggerPlugin,
  AutomationConditionPlugin,
  AutomationActionPlugin,
  EnterpriseApprovalInfo,
} from '../types';
import {
  createDefaultAutomationConfiguration,
  createDefaultApprovalPolicy,
  createDefaultCooldownConfig,
  createDefaultExecutionPolicy,
  generateAutomationId,
  generateRuleId,
  generateTriggerId,
  generateActionId,
  generatePlanId,
  generateHistoryId,
  generateConditionId,
  riskToScore,
  priorityToScore,
  cooldownToMs,
} from '../types';
import {
  DEFAULT_AUTOMATION_CONFIGURATION,
  createAutomationConfiguration,
} from '../automationConfiguration';
import { AutomationEvents } from '../automationEvents';
import { AutomationTriggerRegistry } from '../automationTriggerRegistry';
import { AutomationConditionEngine } from '../automationConditionEngine';
import { AutomationPolicyRegistry } from '../automationPolicyRegistry';
import { AutomationRuleRegistry } from '../automationRuleRegistry';
import { AutomationActionPlanner } from '../automationActionPlanner';
import { AutomationApprovalEngine } from '../automationApprovalEngine';
import { AutomationCooldownManager } from '../automationCooldownManager';
import { AutomationHistory } from '../automationHistory';
import { AutomationValidator } from '../automationValidator';
import { AutomationEngine } from '../automationEngine';
import { AutomationManager } from '../automationManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    cpuUsage: 10,
    memoryUsage: 20,
    diskActivity: 5,
    batteryLevel: 80,
    powerSource: 'ac',
    userActive: false,
    fullScreenApp: false,
    gamingMode: false,
    windowsUpdateActive: false,
    networkActivity: 5,
    thermalState: 'normal',
    storagePressure: 20,
    isIdle: true,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createBusyState(overrides: Partial<SystemState> = {}): SystemState {
  return createMockState({
    cpuUsage: 85,
    memoryUsage: 80,
    diskActivity: 70,
    powerSource: 'battery',
    batteryLevel: 15,
    userActive: true,
    fullScreenApp: true,
    gamingMode: true,
    networkActivity: 80,
    isIdle: false,
    ...overrides,
  });
}

function createMockTrigger(overrides: Partial<AutomationTrigger> = {}): AutomationTrigger {
  return {
    id: 'trigger_1',
    type: 'system_idle',
    name: 'Test Trigger',
    description: 'Test trigger',
    enabled: true,
    priority: 1,
    evaluate: () => true,
    futureMetadata: {},
    ...overrides,
  };
}

function createMockCondition(overrides: Partial<AutomationCondition> = {}): AutomationCondition {
  return {
    id: 'cond_1',
    type: 'confidence_threshold',
    enabled: true,
    threshold: 0.5,
    futureMetadata: {},
    ...overrides,
  };
}

function createMockAction(overrides: Partial<AutomationAction> = {}): AutomationAction {
  return {
    id: 'action_1',
    type: 'notify_user',
    name: 'Test Action',
    description: 'Test action',
    enabled: true,
    parameters: {},
    futureMetadata: {},
    ...overrides,
  };
}

function createMockRule(overrides: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: 'rule_1',
    name: 'Test Rule',
    description: 'Test automation rule',
    enabled: true,
    priority: 1,
    trigger: createMockTrigger(),
    conditions: [createMockCondition()],
    actions: [createMockAction()],
    approvalPolicy: createDefaultApprovalPolicy(),
    cooldown: createDefaultCooldownConfig(),
    executionPolicy: 'immediate' as ExecutionPolicy,
    riskLevel: 'low' as RiskLevel,
    futureMetadata: {},
    ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

function createTestConfig() {
  const cfg = createDefaultAutomationConfiguration();
  cfg.safetyPolicies = cfg.safetyPolicies.map((p) =>
    p.type === 'business_hours_only' ? { ...p, enabled: false } : p,
  );
  return cfg;
}

describe('Types & Helpers', () => {
  it('createDefaultAutomationConfiguration has all sections', () => {
    const cfg = createDefaultAutomationConfiguration();
    expect(cfg.configVersion).toBe('1.0.0');
    expect(cfg.triggerDefinitions.length).toBeGreaterThan(0);
    expect(cfg.conditionDefinitions.length).toBeGreaterThan(0);
    expect(cfg.actionDefinitions.length).toBeGreaterThan(0);
    expect(cfg.approvalPolicies.length).toBeGreaterThan(0);
    expect(cfg.safetyPolicies.length).toBeGreaterThan(0);
    expect(cfg.featureFlags).toBeDefined();
  });
  it('createDefaultApprovalPolicy returns risk_based', () => {
    const policy = createDefaultApprovalPolicy();
    expect(policy.type).toBe('risk_based');
    expect(policy.autoApprove).toBe(true);
  });
  it('createDefaultCooldownConfig returns disabled', () => {
    const cd = createDefaultCooldownConfig();
    expect(cd.enabled).toBe(false);
    expect(cd.unit).toBe('minutes');
  });
  it('createDefaultExecutionPolicy returns immediate', () => {
    expect(createDefaultExecutionPolicy()).toBe('immediate');
  });
  it('generateAutomationId produces unique ids', () => {
    expect(generateAutomationId()).not.toBe(generateAutomationId());
    expect(generateAutomationId()).toContain('auto_');
  });
  it('generateRuleId produces unique ids', () => {
    expect(generateRuleId()).toContain('rule_');
  });
  it('generateTriggerId produces unique ids', () => {
    expect(generateTriggerId()).toContain('trigger_');
  });
  it('generateActionId produces unique ids', () => {
    expect(generateActionId()).toContain('action_');
  });
  it('generatePlanId produces unique ids', () => {
    expect(generatePlanId()).toContain('autoplan_');
  });
  it('generateHistoryId produces unique ids', () => {
    expect(generateHistoryId()).toContain('autohist_');
  });
  it('generateConditionId produces unique ids', () => {
    expect(generateConditionId()).toContain('cond_');
  });
  it('riskToScore converts correctly', () => {
    expect(riskToScore('none')).toBe(0);
    expect(riskToScore('low')).toBe(0.2);
    expect(riskToScore('medium')).toBe(0.5);
    expect(riskToScore('high')).toBe(0.8);
    expect(riskToScore('critical')).toBe(1.0);
  });
  it('priorityToScore converts correctly', () => {
    expect(priorityToScore('critical')).toBe(1.0);
    expect(priorityToScore('high')).toBe(0.8);
    expect(priorityToScore('medium')).toBe(0.5);
    expect(priorityToScore('low')).toBe(0.2);
    expect(priorityToScore('informational')).toBe(0.1);
  });
  it('cooldownToMs converts minutes', () => {
    expect(cooldownToMs(1, 'minutes')).toBe(60000);
  });
  it('cooldownToMs converts hours', () => {
    expect(cooldownToMs(1, 'hours')).toBe(3600000);
  });
  it('cooldownToMs converts days', () => {
    expect(cooldownToMs(1, 'days')).toBe(86400000);
  });
  it('cooldownToMs converts custom', () => {
    expect(cooldownToMs(5000, 'custom')).toBe(5000);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('AutomationConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_AUTOMATION_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_AUTOMATION_CONFIGURATION.evaluationIntervalMs).toBe(5000);
  });
  it('createAutomationConfiguration accepts overrides', () => {
    const cfg = createAutomationConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges featureFlags', () => {
    const cfg = createAutomationConfiguration({ featureFlags: { enableTriggers: false } });
    expect(cfg.featureFlags.enableTriggers).toBe(false);
    expect(cfg.featureFlags.enableConditions).toBe(true);
  });
  it('merges triggerDefinitions array', () => {
    const cfg = createAutomationConfiguration({ triggerDefinitions: [] });
    expect(cfg.triggerDefinitions.length).toBe(0);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('AutomationEvents', () => {
  let events: AutomationEvents;
  beforeEach(() => { events = new AutomationEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('automation_triggered', () => { received = true; });
    events.emitTriggered('rule_1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('automation_deferred', listener);
    events.off('automation_deferred', listener);
    events.emitDeferred('rule_1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('automation_approved', () => { received = true; });
    unsub();
    events.emitApproved('rule_1');
    expect(received).toBe(false);
  });
  it('emitRuleMatched works', () => {
    let received = false;
    events.on('automation_rule_matched', () => { received = true; });
    events.emitRuleMatched('rule_1');
    expect(received).toBe(true);
  });
  it('emitRejected works', () => {
    let received = false;
    events.on('automation_rejected', () => { received = true; });
    events.emitRejected('rule_1');
    expect(received).toBe(true);
  });
  it('emitCancelled works', () => {
    let received = false;
    events.on('automation_cancelled', () => { received = true; });
    events.emitCancelled('rule_1');
    expect(received).toBe(true);
  });
  it('emitCompleted works', () => {
    let received = false;
    events.on('automation_completed', () => { received = true; });
    events.emitCompleted('rule_1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('automation_triggered', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('automation_triggered', () => {});
    events.on('automation_deferred', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('automation_triggered')).toBe(1);
  });
  it('does not crash on listener error', () => {
    events.on('automation_triggered', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitTriggered('rule_1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Trigger Registry ─────────────────────────────────────────

describe('AutomationTriggerRegistry', () => {
  let registry: AutomationTriggerRegistry;
  beforeEach(() => { registry = new AutomationTriggerRegistry(createDefaultAutomationConfiguration()); });

  it('registers a trigger', () => {
    expect(registry.register(createMockTrigger())).toBe(true);
    expect(registry.count()).toBe(1);
  });
  it('rejects duplicate trigger', () => {
    const trigger = createMockTrigger();
    registry.register(trigger);
    expect(registry.register(trigger)).toBe(false);
  });
  it('unregisters a trigger', () => {
    registry.register(createMockTrigger({ id: 't1' }));
    expect(registry.unregister('t1')).toBe(true);
    expect(registry.unregister('t1')).toBe(false);
  });
  it('get returns trigger by id', () => {
    registry.register(createMockTrigger({ id: 't1' }));
    expect(registry.get('t1')).toBeDefined();
  });
  it('getAll returns all triggers', () => {
    registry.register(createMockTrigger({ id: 't1' }));
    registry.register(createMockTrigger({ id: 't2' }));
    expect(registry.getAll().length).toBe(2);
  });
  it('getEnabled returns only enabled triggers', () => {
    registry.register(createMockTrigger({ id: 't1', enabled: true }));
    registry.register(createMockTrigger({ id: 't2', enabled: false }));
    expect(registry.getEnabled().length).toBe(1);
  });
  it('getByType filters by type', () => {
    registry.register(createMockTrigger({ id: 't1', type: 'system_idle' }));
    registry.register(createMockTrigger({ id: 't2', type: 'power_connected' }));
    expect(registry.getByType('system_idle').length).toBe(1);
  });
  it('evaluates system_idle trigger', () => {
    const result = registry.evaluate('system_idle', {
      systemState: createMockState({ isIdle: true }),
      eventData: {},
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });
  it('evaluates system_idle trigger (not idle)', () => {
    const result = registry.evaluate('system_idle', {
      systemState: createMockState({ isIdle: false }),
      eventData: {},
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    expect(result).toBe(false);
  });
  it('evaluates power_connected trigger', () => {
    const result = registry.evaluate('power_connected', {
      systemState: createMockState({ powerSource: 'ac' }),
      eventData: {},
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });
  it('evaluates storage_threshold_reached trigger', () => {
    const result = registry.evaluate('storage_threshold_reached', {
      systemState: createMockState({ storagePressure: 90 }),
      eventData: {},
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });
  it('evaluates custom trigger from event data', () => {
    const result = registry.evaluate('custom_trigger', {
      systemState: createMockState(),
      eventData: { customTriggerMatched: true },
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });
  it('registers and uses plugins', () => {
    const plugin: AutomationTriggerPlugin = {
      getPluginName: () => 'test',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getTriggerType: () => 'custom_trigger',
      evaluate: () => true,
    };
    registry.registerPlugin(plugin);
    const result = registry.evaluate('custom_trigger', {
      systemState: createMockState(),
      eventData: {},
      timestamp: new Date().toISOString(),
      futureMetadata: {},
    });
    expect(result).toBe(true);
  });
  it('getDefinitions returns config definitions', () => {
    expect(registry.getDefinitions().length).toBeGreaterThan(0);
  });
  it('clear removes all triggers', () => {
    registry.register(createMockTrigger({ id: 't1' }));
    registry.clear();
    expect(registry.count()).toBe(0);
  });
});

// ── Condition Engine ─────────────────────────────────────────

describe('AutomationConditionEngine', () => {
  let engine: AutomationConditionEngine;
  beforeEach(() => { engine = new AutomationConditionEngine(); });

  function createCondCtx(overrides: Record<string, unknown> = {}) {
    return {
      systemState: createMockState(),
      rule: createMockRule(),
      trigger: createMockTrigger(),
      eventData: {},
      timestamp: new Date().toISOString(),
      availableCapabilities: [] as string[],
      quotaRemaining: 100,
      subscriptionTier: 'premium' as string | null,
      confidence: 0.8,
      priority: 'high' as RecommendationPriority,
      futureMetadata: {},
      ...overrides,
    };
  }

  it('evaluates confidence_threshold (passing)', () => {
    const cond = createMockCondition({ type: 'confidence_threshold', threshold: 0.5 });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.8 }));
    expect(result.passed).toBe(true);
  });
  it('evaluates confidence_threshold (failing)', () => {
    const cond = createMockCondition({ type: 'confidence_threshold', threshold: 0.9 });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.3 }));
    expect(result.passed).toBe(false);
  });
  it('evaluates priority_threshold (passing)', () => {
    const cond = createMockCondition({ type: 'priority_threshold', threshold: 0.5 });
    const result = engine.evaluate(cond, createCondCtx({ priority: 'high' }));
    expect(result.passed).toBe(true);
  });
  it('evaluates priority_threshold (failing)', () => {
    const cond = createMockCondition({ type: 'priority_threshold', threshold: 0.9 });
    const result = engine.evaluate(cond, createCondCtx({ priority: 'low' }));
    expect(result.passed).toBe(false);
  });
  it('evaluates capability_check (passing)', () => {
    const cond = createMockCondition({ type: 'capability_check', requiredCapabilities: ['cap1', 'cap2'] });
    const result = engine.evaluate(cond, createCondCtx({ availableCapabilities: ['cap1', 'cap2', 'cap3'] }));
    expect(result.passed).toBe(true);
  });
  it('evaluates capability_check (failing)', () => {
    const cond = createMockCondition({ type: 'capability_check', requiredCapabilities: ['cap1'] });
    const result = engine.evaluate(cond, createCondCtx({ availableCapabilities: [] }));
    expect(result.passed).toBe(false);
  });
  it('evaluates quota_check (passing)', () => {
    const cond = createMockCondition({ type: 'quota_check', requiredQuota: 50 });
    const result = engine.evaluate(cond, createCondCtx({ quotaRemaining: 100 }));
    expect(result.passed).toBe(true);
  });
  it('evaluates quota_check (failing)', () => {
    const cond = createMockCondition({ type: 'quota_check', requiredQuota: 200 });
    const result = engine.evaluate(cond, createCondCtx({ quotaRemaining: 100 }));
    expect(result.passed).toBe(false);
  });
  it('evaluates subscription_check (passing)', () => {
    const cond = createMockCondition({ type: 'subscription_check', requiredSubscription: 'premium' });
    const result = engine.evaluate(cond, createCondCtx({ subscriptionTier: 'premium' }));
    expect(result.passed).toBe(true);
  });
  it('evaluates subscription_check (failing)', () => {
    const cond = createMockCondition({ type: 'subscription_check', requiredSubscription: 'premium' });
    const result = engine.evaluate(cond, createCondCtx({ subscriptionTier: 'free' }));
    expect(result.passed).toBe(false);
  });
  it('evaluates AND condition (all pass)', () => {
    const cond = createMockCondition({
      type: 'and',
      children: [
        createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.5 }),
        createMockCondition({ id: 'c2', type: 'confidence_threshold', threshold: 0.7 }),
      ],
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.8 }));
    expect(result.passed).toBe(true);
  });
  it('evaluates AND condition (one fails)', () => {
    const cond = createMockCondition({
      type: 'and',
      children: [
        createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.5 }),
        createMockCondition({ id: 'c2', type: 'confidence_threshold', threshold: 0.9 }),
      ],
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.8 }));
    expect(result.passed).toBe(false);
  });
  it('evaluates OR condition (one passes)', () => {
    const cond = createMockCondition({
      type: 'or',
      children: [
        createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.9 }),
        createMockCondition({ id: 'c2', type: 'confidence_threshold', threshold: 0.5 }),
      ],
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.8 }));
    expect(result.passed).toBe(true);
  });
  it('evaluates NOT condition', () => {
    const cond = createMockCondition({
      type: 'not',
      children: [createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.9 })],
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.3 }));
    expect(result.passed).toBe(true);
  });
  it('evaluates nested_group with AND operator', () => {
    const cond = createMockCondition({
      type: 'nested_group',
      operator: 'AND',
      children: [
        createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.5 }),
        createMockCondition({ id: 'c2', type: 'priority_threshold', threshold: 0.5 }),
      ],
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.8, priority: 'high' }));
    expect(result.passed).toBe(true);
  });
  it('evaluates nested_group with OR operator', () => {
    const cond = createMockCondition({
      type: 'nested_group',
      operator: 'OR',
      children: [
        createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.9 }),
        createMockCondition({ id: 'c2', type: 'priority_threshold', threshold: 0.5 }),
      ],
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.3, priority: 'high' }));
    expect(result.passed).toBe(true);
  });
  it('evaluates time_window (within)', () => {
    const now = new Date();
    const cond = createMockCondition({
      type: 'time_window',
      timeWindowStart: new Date(now.getTime() - 3600000).toISOString(),
      timeWindowEnd: new Date(now.getTime() + 3600000).toISOString(),
    });
    const result = engine.evaluate(cond, createCondCtx());
    expect(result.passed).toBe(true);
  });
  it('evaluates time_window (outside)', () => {
    const now = new Date();
    const cond = createMockCondition({
      type: 'time_window',
      timeWindowStart: new Date(now.getTime() - 7200000).toISOString(),
      timeWindowEnd: new Date(now.getTime() - 3600000).toISOString(),
    });
    const result = engine.evaluate(cond, createCondCtx());
    expect(result.passed).toBe(false);
  });
  it('evaluates custom_condition', () => {
    const cond = createMockCondition({
      type: 'custom_condition',
      customEvaluator: (ctx) => ctx.confidence > 0.5,
    });
    const result = engine.evaluate(cond, createCondCtx({ confidence: 0.8 }));
    expect(result.passed).toBe(true);
  });
  it('disabled condition returns false', () => {
    const cond = createMockCondition({ enabled: false });
    const result = engine.evaluate(cond, createCondCtx());
    expect(result.passed).toBe(false);
  });
  it('evaluateGroup returns true for empty conditions', () => {
    expect(engine.evaluateGroup([], createCondCtx())).toBe(true);
  });
  it('evaluateGroup returns true when all pass', () => {
    const conds = [createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.5 })];
    expect(engine.evaluateGroup(conds, createCondCtx({ confidence: 0.8 }))).toBe(true);
  });
  it('evaluateGroup returns false when one fails', () => {
    const conds = [
      createMockCondition({ id: 'c1', type: 'confidence_threshold', threshold: 0.5 }),
      createMockCondition({ id: 'c2', type: 'confidence_threshold', threshold: 0.9 }),
    ];
    expect(engine.evaluateGroup(conds, createCondCtx({ confidence: 0.8 }))).toBe(false);
  });
  it('registers and uses condition plugins', () => {
    const plugin: AutomationConditionPlugin = {
      getPluginName: () => 'test',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getConditionType: () => 'custom_condition',
      evaluate: () => ({ conditionId: 'test', passed: true, reason: 'plugin', details: {} }),
    };
    engine.registerPlugin(plugin);
    const cond = createMockCondition({ type: 'custom_condition' });
    const result = engine.evaluate(cond, createCondCtx());
    expect(result.passed).toBe(true);
    expect(result.reason).toBe('plugin');
  });
});

// ── Policy Registry ──────────────────────────────────────────

describe('AutomationPolicyRegistry', () => {
  let registry: AutomationPolicyRegistry;
  beforeEach(() => { registry = new AutomationPolicyRegistry(createTestConfig()); });

  it('isSafe returns true for idle system', () => {
    const result = registry.isSafe({ systemState: createMockState(), rule: createMockRule(), timestamp: new Date().toISOString(), futureMetadata: {} });
    expect(result).toBe(true);
  });
  it('isSafe returns false for full screen', () => {
    const result = registry.isSafe({ systemState: createMockState({ fullScreenApp: true }), rule: createMockRule(), timestamp: new Date().toISOString(), futureMetadata: {} });
    expect(result).toBe(false);
  });
  it('isSafe returns false for gaming', () => {
    const result = registry.isSafe({ systemState: createMockState({ gamingMode: true }), rule: createMockRule(), timestamp: new Date().toISOString(), futureMetadata: {} });
    expect(result).toBe(false);
  });
  it('isSafe returns false for battery', () => {
    const result = registry.isSafe({ systemState: createMockState({ powerSource: 'battery' }), rule: createMockRule(), timestamp: new Date().toISOString(), futureMetadata: {} });
    expect(result).toBe(false);
  });
  it('registers custom safety policy', () => {
    const policy: SafetyPolicy = {
      id: 'custom_sp', type: 'custom_safety', name: 'Custom', description: 'Custom safety',
      enabled: true, priority: 10, evaluate: () => ({ safe: true, reason: 'OK', policyId: 'custom_sp', futureMetadata: {} }),
      futureMetadata: {},
    };
    expect(registry.register(policy)).toBe(true);
    expect(registry.register(policy)).toBe(false);
  });
  it('unregisters custom safety policy', () => {
    const policy: SafetyPolicy = {
      id: 'custom_sp', type: 'custom_safety', name: 'Custom', description: 'Custom safety',
      enabled: true, priority: 10, evaluate: () => ({ safe: true, reason: 'OK', policyId: 'custom_sp', futureMetadata: {} }),
      futureMetadata: {},
    };
    registry.register(policy);
    expect(registry.unregister('custom_sp')).toBe(true);
    expect(registry.unregister('custom_sp')).toBe(false);
  });
  it('getPolicy finds by id', () => {
    expect(registry.getPolicy('sp_fullscreen')).toBeDefined();
  });
  it('evaluateAll returns results', () => {
    const results = registry.evaluateAll({ systemState: createMockState(), rule: createMockRule(), timestamp: new Date().toISOString(), futureMetadata: {} });
    expect(results.length).toBeGreaterThan(0);
  });
});

// ── Rule Registry ────────────────────────────────────────────

describe('AutomationRuleRegistry', () => {
  let registry: AutomationRuleRegistry;
  beforeEach(() => { registry = new AutomationRuleRegistry(createDefaultAutomationConfiguration()); });

  it('registers a rule', () => {
    expect(registry.register(createMockRule())).toBe(true);
    expect(registry.count()).toBe(1);
  });
  it('rejects duplicate rule', () => {
    const rule = createMockRule();
    registry.register(rule);
    expect(registry.register(rule)).toBe(false);
  });
  it('unregisters a rule', () => {
    registry.register(createMockRule({ id: 'r1' }));
    expect(registry.unregister('r1')).toBe(true);
  });
  it('get returns rule by id', () => {
    registry.register(createMockRule({ id: 'r1' }));
    expect(registry.get('r1')).toBeDefined();
  });
  it('getAll returns all rules', () => {
    registry.register(createMockRule({ id: 'r1' }));
    registry.register(createMockRule({ id: 'r2' }));
    expect(registry.getAll().length).toBe(2);
  });
  it('getEnabled returns only enabled rules sorted by priority', () => {
    registry.register(createMockRule({ id: 'r1', priority: 5, enabled: true }));
    registry.register(createMockRule({ id: 'r2', priority: 1, enabled: true }));
    registry.register(createMockRule({ id: 'r3', enabled: false }));
    const enabled = registry.getEnabled();
    expect(enabled.length).toBe(2);
    expect(enabled[0]!.id).toBe('r2');
  });
  it('enable/disable updates rule', () => {
    registry.register(createMockRule({ id: 'r1', enabled: true }));
    registry.disable('r1');
    expect(registry.get('r1')!.enabled).toBe(false);
    registry.enable('r1');
    expect(registry.get('r1')!.enabled).toBe(true);
  });
  it('update modifies rule', () => {
    registry.register(createMockRule({ id: 'r1', name: 'Old' }));
    registry.update('r1', { name: 'New' });
    expect(registry.get('r1')!.name).toBe('New');
  });
  it('clear removes all', () => {
    registry.register(createMockRule({ id: 'r1' }));
    registry.clear();
    expect(registry.count()).toBe(0);
  });
});

// ── Action Planner ───────────────────────────────────────────

describe('AutomationActionPlanner', () => {
  let planner: AutomationActionPlanner;
  beforeEach(() => { planner = new AutomationActionPlanner(); });

  function createActionCtx() {
    return { systemState: createMockState(), rule: createMockRule(), timestamp: new Date().toISOString(), futureMetadata: {} };
  }

  it('plans notify_user action', () => {
    const action = createMockAction({ type: 'notify_user' });
    const results = planner.planActions([action], createActionCtx());
    expect(results.length).toBe(1);
    expect(results[0]!.executable).toBe(true);
    expect(results[0]!.requiresApproval).toBe(false);
  });
  it('plans generate_optimization_plan action', () => {
    const action = createMockAction({ type: 'generate_optimization_plan' });
    const results = planner.planActions([action], createActionCtx());
    expect(results[0]!.requiresApproval).toBe(true);
  });
  it('plans queue_maintenance action', () => {
    const action = createMockAction({ type: 'queue_maintenance' });
    const results = planner.planActions([action], createActionCtx());
    expect(results[0]!.requiresApproval).toBe(true);
  });
  it('plans schedule_execution action', () => {
    const action = createMockAction({ type: 'schedule_execution' });
    const results = planner.planActions([action], createActionCtx());
    expect(results[0]!.requiresApproval).toBe(true);
  });
  it('plans log_event action', () => {
    const action = createMockAction({ type: 'log_event' });
    const results = planner.planActions([action], createActionCtx());
    expect(results[0]!.requiresApproval).toBe(false);
  });
  it('filters disabled actions', () => {
    const action = createMockAction({ enabled: false });
    const results = planner.planActions([action], createActionCtx());
    expect(results.length).toBe(0);
  });
  it('getSupportedActionTypes returns all types', () => {
    const types = planner.getSupportedActionTypes();
    expect(types).toContain('generate_optimization_plan');
    expect(types).toContain('notify_user');
    expect(types).toContain('log_event');
  });
  it('registers and uses action plugins', () => {
    const plugin: AutomationActionPlugin = {
      getPluginName: () => 'test',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getActionType: () => 'notify_user',
      plan: (action) => ({ action, executable: true, requiresApproval: false, parameters: { plugin: true }, futureMetadata: {} }),
    };
    planner.registerPlugin(plugin);
    const action = createMockAction({ type: 'notify_user' });
    const results = planner.planActions([action], createActionCtx());
    expect(results[0]!.parameters['plugin']).toBe(true);
  });
});

// ── Approval Engine ──────────────────────────────────────────

describe('AutomationApprovalEngine', () => {
  let engine: AutomationApprovalEngine;
  beforeEach(() => { engine = new AutomationApprovalEngine(); });

  function createApprovalCtx(overrides: Record<string, unknown> = {}) {
    return {
      rule: createMockRule(),
      systemState: createMockState(),
      riskLevel: 'low' as RiskLevel,
      confidence: 0.8,
      userId: null as string | null,
      enterprisePolicy: null as EnterpriseApprovalInfo | null,
      futureMetadata: {},
      ...overrides,
    };
  }

  it('always_ask returns not approved', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'always_ask', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, futureMetadata: {} } });
    const result = engine.evaluate(rule, createApprovalCtx());
    expect(result.approved).toBe(false);
    expect(result.requiresUserInput).toBe(true);
  });
  it('never_ask returns approved', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'never_ask', autoApprove: true, riskThreshold: 1.0, requireEnterpriseApproval: false, futureMetadata: {} } });
    const result = engine.evaluate(rule, createApprovalCtx());
    expect(result.approved).toBe(true);
    expect(result.requiresUserInput).toBe(false);
  });
  it('risk_based auto-approves low risk', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'risk_based', autoApprove: true, riskThreshold: 0.5, requireEnterpriseApproval: false, futureMetadata: {} }, riskLevel: 'low' });
    const result = engine.evaluate(rule, createApprovalCtx({ riskLevel: 'low' }));
    expect(result.approved).toBe(true);
  });
  it('risk_based requires approval for high risk', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'risk_based', autoApprove: true, riskThreshold: 0.5, requireEnterpriseApproval: false, futureMetadata: {} }, riskLevel: 'high' });
    const result = engine.evaluate(rule, createApprovalCtx({ riskLevel: 'high' }));
    expect(result.approved).toBe(false);
    expect(result.requiresUserInput).toBe(true);
  });
  it('enterprise_approval with auto-approve low risk', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'enterprise_approval', autoApprove: false, riskThreshold: 0.5, requireEnterpriseApproval: true, futureMetadata: {} }, riskLevel: 'low' });
    const ent: EnterpriseApprovalInfo = { autoApproveLowRisk: true, requireApprovalForHighRisk: true, blockedActions: [], futureMetadata: {} };
    const result = engine.evaluate(rule, createApprovalCtx({ riskLevel: 'low', enterprisePolicy: ent }));
    expect(result.approved).toBe(true);
  });
  it('enterprise_approval requires approval for high risk', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'enterprise_approval', autoApprove: false, riskThreshold: 0.5, requireEnterpriseApproval: true, futureMetadata: {} }, riskLevel: 'high' });
    const ent: EnterpriseApprovalInfo = { autoApproveLowRisk: false, requireApprovalForHighRisk: true, blockedActions: [], futureMetadata: {} };
    const result = engine.evaluate(rule, createApprovalCtx({ riskLevel: 'high', enterprisePolicy: ent }));
    expect(result.approved).toBe(false);
  });
  it('enterprise_approval without enterprise policy', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'enterprise_approval', autoApprove: false, riskThreshold: 0.5, requireEnterpriseApproval: true, futureMetadata: {} } });
    const result = engine.evaluate(rule, createApprovalCtx({ enterprisePolicy: null }));
    expect(result.approved).toBe(false);
  });
  it('ask_once remembers approval', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'ask_once', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, futureMetadata: {} } });
    engine.rememberApproval(rule.id, { approved: true, reason: 'User approved', requiresUserInput: false, expiresAt: null, futureMetadata: {} });
    const result = engine.evaluate(rule, createApprovalCtx());
    expect(result.approved).toBe(true);
  });
  it('forgetApproval removes memory', () => {
    const rule = createMockRule({ id: 'r1', approvalPolicy: { type: 'ask_once', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, futureMetadata: {} } });
    engine.rememberApproval('r1', { approved: true, reason: 'OK', requiresUserInput: false, expiresAt: null, futureMetadata: {} });
    engine.forgetApproval('r1');
    const result = engine.evaluate(rule, createApprovalCtx());
    expect(result.approved).toBe(false);
  });
  it('clearMemory removes all', () => {
    engine.rememberApproval('r1', { approved: true, reason: 'OK', requiresUserInput: false, expiresAt: null, futureMetadata: {} });
    engine.clearMemory();
    expect(engine.evaluate(createMockRule({ id: 'r1', approvalPolicy: { type: 'ask_once', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, futureMetadata: {} } }), createApprovalCtx()).approved).toBe(false);
  });
  it('custom evaluator is used', () => {
    const rule = createMockRule({ approvalPolicy: { type: 'custom_approval', autoApprove: false, riskThreshold: 0, requireEnterpriseApproval: false, customEvaluator: () => ({ approved: true, reason: 'custom', requiresUserInput: false, expiresAt: null, futureMetadata: {} }), futureMetadata: {} } });
    const result = engine.evaluate(rule, createApprovalCtx());
    expect(result.approved).toBe(true);
    expect(result.reason).toBe('custom');
  });
});

// ── Cooldown Manager ─────────────────────────────────────────

describe('AutomationCooldownManager', () => {
  let manager: AutomationCooldownManager;
  beforeEach(() => { manager = new AutomationCooldownManager(); });

  it('isInCooldown returns false initially', () => {
    expect(manager.isInCooldown('r1', null, 'per_rule')).toBe(false);
  });
  it('applies per_rule cooldown', () => {
    manager.applyCooldown('r1', null, { enabled: true, duration: 60, unit: 'minutes', scope: 'per_rule', futureMetadata: {} });
    expect(manager.isInCooldown('r1', null, 'per_rule')).toBe(true);
  });
  it('applies per_action cooldown', () => {
    manager.applyCooldown('r1', 'a1', { enabled: true, duration: 30, unit: 'minutes', scope: 'per_action', futureMetadata: {} });
    expect(manager.isInCooldown('r1', 'a1', 'per_action')).toBe(true);
    expect(manager.isInCooldown('r1', 'a2', 'per_action')).toBe(false);
  });
  it('applies global cooldown', () => {
    manager.applyCooldown('r1', null, { enabled: true, duration: 60, unit: 'minutes', scope: 'global', futureMetadata: {} });
    expect(manager.isInCooldown('r2', null, 'global')).toBe(true);
  });
  it('disabled cooldown does not apply', () => {
    manager.applyCooldown('r1', null, { enabled: false, duration: 60, unit: 'minutes', scope: 'per_rule', futureMetadata: {} });
    expect(manager.isInCooldown('r1', null, 'per_rule')).toBe(false);
  });
  it('getRemainingCooldown returns 0 when not in cooldown', () => {
    expect(manager.getRemainingCooldown('r1', null, 'per_rule')).toBe(0);
  });
  it('getRemainingCooldown returns positive when in cooldown', () => {
    manager.applyCooldown('r1', null, { enabled: true, duration: 60, unit: 'minutes', scope: 'per_rule', futureMetadata: {} });
    expect(manager.getRemainingCooldown('r1', null, 'per_rule')).toBeGreaterThan(0);
  });
  it('clearExpired removes expired entries', () => {
    manager.applyCooldown('r1', null, { enabled: true, duration: 1, unit: 'custom', scope: 'per_rule', futureMetadata: {} });
    // Wait a tiny bit then clear
    manager['_states'][0]!.expiresAt = new Date(Date.now() - 1000).toISOString();
    const removed = manager.clearExpired();
    expect(removed).toBe(1);
  });
  it('clear removes all', () => {
    manager.applyCooldown('r1', null, { enabled: true, duration: 60, unit: 'minutes', scope: 'per_rule', futureMetadata: {} });
    manager.clear();
    expect(manager.isInCooldown('r1', null, 'per_rule')).toBe(false);
  });
  it('getStates returns current states', () => {
    manager.applyCooldown('r1', null, { enabled: true, duration: 60, unit: 'minutes', scope: 'per_rule', futureMetadata: {} });
    expect(manager.getStates().length).toBe(1);
  });
});

// ── History ──────────────────────────────────────────────────

describe('AutomationHistory', () => {
  let history: AutomationHistory;
  beforeEach(() => { history = new AutomationHistory(100); });

  it('records entries', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    expect(history.count).toBe(1);
  });
  it('getAll returns all entries', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    history.record('r2', 'power_connected', 'executed', 0.9, 'low');
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    history.record('r2', 'power_connected', 'executed', 0.9, 'low');
    expect(history.getRecent(1).length).toBe(1);
    expect(history.getRecent(1)[0]!.ruleId).toBe('r2');
  });
  it('getByRule filters', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    history.record('r2', 'power_connected', 'executed', 0.9, 'low');
    expect(history.getByRule('r1').length).toBe(1);
  });
  it('getByOutcome filters', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    history.record('r2', 'power_connected', 'executed', 0.9, 'low');
    expect(history.getByOutcome('executed').length).toBe(1);
  });
  it('getByTrigger filters', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    history.record('r2', 'power_connected', 'executed', 0.9, 'low');
    expect(history.getByTrigger('system_idle').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('r1', 'system_idle', 'triggered', 0.8, 'low');
    history.clear();
    expect(history.count).toBe(0);
  });
  it('setMaxEntries trims', () => {
    for (let i = 0; i < 10; i++) history.record(`r${i}`, 'system_idle', 'triggered', 0.8, 'low');
    history.setMaxEntries(5);
    expect(history.count).toBe(5);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('AutomationValidator', () => {
  let validator: AutomationValidator;
  beforeEach(() => { validator = new AutomationValidator(); });

  it('validates a correct rule', () => {
    const result = validator.validateRule(createMockRule());
    expect(result.valid).toBe(true);
  });
  it('detects missing id', () => {
    const result = validator.validateRule(createMockRule({ id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
  });
  it('detects missing name', () => {
    const result = validator.validateRule(createMockRule({ name: '' }));
    expect(result.valid).toBe(false);
  });
  it('warns on no actions', () => {
    const result = validator.validateRule(createMockRule({ actions: [] }));
    expect(result.warnings.some((w) => w.code === 'NO_ACTIONS')).toBe(true);
  });
  it('warns on no conditions', () => {
    const result = validator.validateRule(createMockRule({ conditions: [] }));
    expect(result.warnings.some((w) => w.code === 'NO_CONDITIONS')).toBe(true);
  });
  it('validates condition with missing time window', () => {
    const cond = createMockCondition({ id: 'c1', type: 'time_window' });
    const result = validator.validateCondition(cond);
    expect(result.valid).toBe(false);
  });
  it('validates custom condition without evaluator', () => {
    const cond = createMockCondition({ id: 'c1', type: 'custom_condition' });
    const result = validator.validateCondition(cond);
    expect(result.valid).toBe(false);
  });
  it('validates plan', () => {
    const plan = {
      id: 'plan_1', ruleId: 'r1', trigger: createMockTrigger(),
      actions: [createMockAction()], approvalDecision: null, safetyResults: [],
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confidence: 0.8, riskLevel: 'low' as RiskLevel, executionPolicy: 'immediate' as ExecutionPolicy,
      summary: 'test', futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(true);
  });
  it('detects empty plan', () => {
    const plan = {
      id: 'plan_1', ruleId: 'r1', trigger: createMockTrigger(),
      actions: [], approvalDecision: null, safetyResults: [],
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confidence: 0.8, riskLevel: 'low' as RiskLevel, executionPolicy: 'immediate' as ExecutionPolicy,
      summary: '', futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(false);
  });
  it('detects unsafe plan', () => {
    const plan = {
      id: 'plan_1', ruleId: 'r1', trigger: createMockTrigger(),
      actions: [createMockAction()], approvalDecision: null,
      safetyResults: [{ safe: false, reason: 'Gaming', policyId: 'sp_gaming', futureMetadata: {} }],
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
      confidence: 0.8, riskLevel: 'low' as RiskLevel, executionPolicy: 'immediate' as ExecutionPolicy,
      summary: '', futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNSAFE')).toBe(true);
  });
});

// ── Engine ───────────────────────────────────────────────────

describe('AutomationEngine', () => {
  let engine: AutomationEngine;
  beforeEach(() => { engine = new AutomationEngine(createTestConfig()); });

  it('registers a rule', () => {
    expect(engine.registerRule(createMockRule())).toBe(true);
  });
  it('evaluateRules returns results', () => {
    engine.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = engine.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results.length).toBe(1);
  });
  it('evaluateRules ignores non-matching trigger type', () => {
    engine.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = engine.evaluateRules(createMockState(), 'power_connected');
    expect(results.length).toBe(0);
  });
  it('evaluateRules defers on safety violation', () => {
    engine.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = engine.evaluateRules(createMockState({ isIdle: true, gamingMode: true }), 'system_idle');
    expect(results[0]!.safe).toBe(false);
    expect(results[0]!.reason).toContain('Safety');
  });
  it('evaluateRules defers on cooldown', () => {
    const rule = createMockRule({
      trigger: createMockTrigger({ type: 'system_idle' }),
      cooldown: { enabled: true, duration: 60, unit: 'minutes', scope: 'per_rule', futureMetadata: {} },
    });
    engine.registerRule(rule);
    engine.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    const results = engine.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results[0]!.inCooldown).toBe(true);
  });
  it('generateAutomationPlan returns plan', () => {
    const rule = createMockRule({
      approvalPolicy: { type: 'never_ask', autoApprove: true, riskThreshold: 1.0, requireEnterpriseApproval: false, futureMetadata: {} },
    });
    const plan = engine.generateAutomationPlan(createMockState(), rule);
    expect(plan).toBeDefined();
    expect(plan.actions.length).toBeGreaterThan(0);
  });
  it('generateAutomationPlan includes safety results', () => {
    const rule = createMockRule();
    const plan = engine.generateAutomationPlan(createMockState(), rule);
    expect(plan.safetyResults.length).toBeGreaterThan(0);
  });
  it('approveAutomation records history', () => {
    engine.registerRule(createMockRule({ id: 'r1' }));
    engine.approveAutomation('r1', 'User approved');
    expect(engine.getAutomationHistory().some((h) => h.outcome === 'approved')).toBe(true);
  });
  it('rejectAutomation records history', () => {
    engine.registerRule(createMockRule({ id: 'r1' }));
    engine.rejectAutomation('r1', 'User rejected');
    expect(engine.getAutomationHistory().some((h) => h.outcome === 'rejected')).toBe(true);
  });
  it('cancelAutomation records history', () => {
    engine.registerRule(createMockRule({ id: 'r1' }));
    engine.cancelAutomation('r1', 'Cancelled');
    expect(engine.getAutomationHistory().some((h) => h.outcome === 'cancelled')).toBe(true);
  });
  it('getAutomationStatistics returns stats', () => {
    engine.registerRule(createMockRule({ id: 'r1' }));
    engine.approveAutomation('r1');
    const stats = engine.getAutomationStatistics();
    expect(stats.totalEvaluations).toBeGreaterThan(0);
  });
  it('validateRule returns result', () => {
    const result = engine.validateRule(createMockRule());
    expect(result.valid).toBe(true);
  });
  it('emits triggered event', () => {
    let triggered = false;
    engine.on('automation_triggered', () => { triggered = true; });
    engine.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    engine.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(triggered).toBe(true);
  });
  it('emits rule_matched event', () => {
    let matched = false;
    engine.on('automation_rule_matched', () => { matched = true; });
    engine.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    engine.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(matched).toBe(true);
  });
  it('clear resets everything', () => {
    engine.registerRule(createMockRule({ id: 'r1' }));
    engine.approveAutomation('r1');
    engine.clear();
    expect(engine.getAutomationHistory().length).toBe(0);
  });
  it('config is accessible', () => {
    expect(engine.config.configVersion).toBe('1.0.0');
  });
});

// ── Manager ──────────────────────────────────────────────────

describe('AutomationManager', () => {
  let manager: AutomationManager;
  beforeEach(() => { manager = new AutomationManager(createTestConfig()); });

  it('registerRule adds rule', () => {
    expect(manager.registerRule(createMockRule())).toBe(true);
  });
  it('registerTrigger adds trigger', () => {
    expect(manager.registerTrigger(createMockTrigger())).toBe(true);
  });
  it('evaluateRules returns results', () => {
    manager.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results.length).toBe(1);
  });
  it('generateAutomationPlan returns plan', () => {
    const plan = manager.generateAutomationPlan(createMockState(), createMockRule());
    expect(plan).toBeDefined();
    expect(plan.actions.length).toBeGreaterThan(0);
  });
  it('approveAutomation works', () => {
    manager.registerRule(createMockRule({ id: 'r1' }));
    manager.approveAutomation('r1', 'OK');
    expect(manager.getAutomationHistory().some((h) => h.outcome === 'approved')).toBe(true);
  });
  it('rejectAutomation works', () => {
    manager.registerRule(createMockRule({ id: 'r1' }));
    manager.rejectAutomation('r1', 'No');
    expect(manager.getAutomationHistory().some((h) => h.outcome === 'rejected')).toBe(true);
  });
  it('getAutomationHistory returns entries', () => {
    manager.registerRule(createMockRule({ id: 'r1' }));
    manager.approveAutomation('r1');
    expect(manager.getAutomationHistory().length).toBeGreaterThan(0);
  });
  it('getAutomationStatistics returns stats', () => {
    const stats = manager.getAutomationStatistics();
    expect(stats).toBeDefined();
  });
  it('validateRule returns result', () => {
    expect(manager.validateRule(createMockRule()).valid).toBe(true);
  });
  it('on/off event subscription', () => {
    let received = false;
    const unsub = manager.on('automation_triggered', () => { received = true; });
    manager.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(received).toBe(true);
    unsub();
  });
  it('config is accessible', () => {
    expect(manager.config.configVersion).toBe('1.0.0');
  });
  it('updateConfig updates config', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('clear resets everything', () => {
    manager.registerRule(createMockRule({ id: 'r1' }));
    manager.approveAutomation('r1');
    manager.clear();
    expect(manager.getAutomationHistory().length).toBe(0);
  });
  it('registerSafetyPolicy adds policy', () => {
    const policy: SafetyPolicy = {
      id: 'custom_sp', type: 'custom_safety', name: 'Custom', description: 'Custom',
      enabled: true, priority: 10, evaluate: () => ({ safe: true, reason: 'OK', policyId: 'custom_sp', futureMetadata: {} }),
      futureMetadata: {},
    };
    expect(manager.registerSafetyPolicy(policy)).toBe(true);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.AutomationManager).toBeDefined();
    expect(module.AutomationEngine).toBeDefined();
    expect(module.AutomationTriggerRegistry).toBeDefined();
    expect(module.AutomationConditionEngine).toBeDefined();
    expect(module.AutomationPolicyRegistry).toBeDefined();
    expect(module.AutomationRuleRegistry).toBeDefined();
    expect(module.AutomationActionPlanner).toBeDefined();
    expect(module.AutomationApprovalEngine).toBeDefined();
    expect(module.AutomationCooldownManager).toBeDefined();
    expect(module.AutomationHistory).toBeDefined();
    expect(module.AutomationValidator).toBeDefined();
    expect(module.AutomationEvents).toBeDefined();
    expect(module.DEFAULT_AUTOMATION_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: register → evaluate → plan → approve → stats', () => {
    const manager = new AutomationManager();
    const rule = createMockRule({
      id: 'lifecycle_rule',
      trigger: createMockTrigger({ type: 'system_idle' }),
      approvalPolicy: { type: 'never_ask', autoApprove: true, riskThreshold: 1.0, requireEnterpriseApproval: false, futureMetadata: {} },
    });
    manager.registerRule(rule);
    const results = manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results[0]!.triggered).toBe(true);
    const plan = manager.generateAutomationPlan(createMockState(), rule);
    expect(plan.actions.length).toBeGreaterThan(0);
    manager.approveAutomation('lifecycle_rule', 'OK');
    const stats = manager.getAutomationStatistics();
    expect(stats.totalEvaluations).toBeGreaterThan(0);
  });
  it('built-in trigger definitions cover all specified types', () => {
    const cfg = createDefaultAutomationConfiguration();
    const types = cfg.triggerDefinitions.map((t) => t.type);
    expect(types).toContain('health_score_changed');
    expect(types).toContain('recommendation_generated');
    expect(types).toContain('prediction_updated');
    expect(types).toContain('maintenance_window_available');
    expect(types).toContain('system_idle');
    expect(types).toContain('user_inactive');
    expect(types).toContain('windows_update_completed');
    expect(types).toContain('storage_threshold_reached');
    expect(types).toContain('startup_growth');
    expect(types).toContain('battery_charging');
    expect(types).toContain('power_connected');
    expect(types).toContain('device_profile_changed');
  });
  it('built-in safety policies cover all specified types', () => {
    const cfg = createDefaultAutomationConfiguration();
    const types = cfg.safetyPolicies.map((p) => p.type);
    expect(types).toContain('never_full_screen');
    expect(types).toContain('never_on_battery');
    expect(types).toContain('never_during_gaming');
    expect(types).toContain('business_hours_only');
    expect(types).toContain('idle_only');
    expect(types).toContain('developer_safe');
    expect(types).toContain('enterprise_safe');
  });
  it('built-in approval policies cover all specified types', () => {
    const cfg = createDefaultAutomationConfiguration();
    const types = cfg.approvalPolicies.map((p) => p.type);
    expect(types).toContain('always_ask');
    expect(types).toContain('ask_once');
    expect(types).toContain('never_ask');
    expect(types).toContain('enterprise_approval');
    expect(types).toContain('risk_based');
    expect(types).toContain('profile_based');
  });
  it('built-in action definitions cover all specified types', () => {
    const cfg = createDefaultAutomationConfiguration();
    const types = cfg.actionDefinitions.map((a) => a.type);
    expect(types).toContain('generate_optimization_plan');
    expect(types).toContain('queue_maintenance');
    expect(types).toContain('notify_user');
    expect(types).toContain('request_approval');
    expect(types).toContain('regenerate_recommendations');
    expect(types).toContain('refresh_predictions');
    expect(types).toContain('refresh_dashboard');
    expect(types).toContain('schedule_execution');
    expect(types).toContain('dismiss_recommendation');
    expect(types).toContain('log_event');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('rule evaluation under 100ms', () => {
    const manager = new AutomationManager();
    for (let i = 0; i < 10; i++) {
      manager.registerRule(createMockRule({ id: `r${i}`, trigger: createMockTrigger({ type: 'system_idle' }) }));
    }
    const start = performance.now();
    manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
  it('plan generation under 100ms', () => {
    const manager = new AutomationManager();
    const start = performance.now();
    manager.generateAutomationPlan(createMockState(), createMockRule());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles no rules registered', () => {
    const manager = new AutomationManager();
    const results = manager.evaluateRules(createMockState(), 'system_idle');
    expect(results.length).toBe(0);
  });
  it('handles disabled rule', () => {
    const manager = new AutomationManager();
    manager.registerRule(createMockRule({ enabled: false, trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results.length).toBe(0);
  });
  it('handles rule with no conditions', () => {
    const manager = new AutomationManager();
    manager.registerRule(createMockRule({ conditions: [], trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results[0]!.conditionsPassed).toBe(true);
  });
  it('handles rule with no actions', () => {
    const manager = new AutomationManager();
    const rule = createMockRule({ actions: [], trigger: createMockTrigger({ type: 'system_idle' }) });
    manager.registerRule(rule);
    const plan = manager.generateAutomationPlan(createMockState(), rule);
    expect(plan.actions.length).toBe(0);
  });
  it('handles busy system with safety policies', () => {
    const manager = new AutomationManager();
    manager.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = manager.evaluateRules(createBusyState({ isIdle: true }), 'system_idle');
    expect(results[0]!.safe).toBe(false);
  });
  it('handles empty history for statistics', () => {
    const manager = new AutomationManager();
    const stats = manager.getAutomationStatistics();
    expect(stats.totalEvaluations).toBe(0);
    expect(stats.successRate).toBe(0);
  });
  it('handles multiple rules with same trigger', () => {
    const manager = new AutomationManager();
    manager.registerRule(createMockRule({ id: 'r1', trigger: createMockTrigger({ type: 'system_idle' }) }));
    manager.registerRule(createMockRule({ id: 'r2', trigger: createMockTrigger({ type: 'system_idle' }) }));
    const results = manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results.length).toBe(2);
  });
  it('handles custom trigger type', () => {
    const manager = new AutomationManager();
    manager.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'custom_trigger' }) }));
    const results = manager.evaluateRules(createMockState(), 'custom_trigger', { eventData: { customTriggerMatched: true } });
    expect(results[0]!.triggered).toBe(true);
  });
  it('handles events disabled', () => {
    const cfg = createAutomationConfiguration({ enableEvents: false });
    const manager = new AutomationManager(cfg);
    let emitted = false;
    manager.on('automation_triggered', () => { emitted = true; });
    manager.registerRule(createMockRule({ trigger: createMockTrigger({ type: 'system_idle' }) }));
    manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(emitted).toBe(false);
  });
  it('handles cooldown with global scope', () => {
    const manager = new AutomationManager(createTestConfig());
    const rule = createMockRule({
      id: 'r1',
      trigger: createMockTrigger({ type: 'system_idle' }),
      cooldown: { enabled: true, duration: 60, unit: 'minutes', scope: 'global', futureMetadata: {} },
    });
    manager.registerRule(rule);
    manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    const results = manager.evaluateRules(createMockState({ isIdle: true }), 'system_idle');
    expect(results[0]!.inCooldown).toBe(true);
  });
});
