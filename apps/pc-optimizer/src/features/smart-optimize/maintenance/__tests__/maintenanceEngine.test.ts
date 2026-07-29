/**
 * Tests for EPIC 4 PHASE A PART 4 — Intelligent Maintenance Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SystemState,
  MaintenanceOpportunity,
  MaintenancePolicy,
  EligibilityRule,
  MaintenanceHistoryEntry,
  RiskLevel,
  RecommendationPriority,
  WindowSignal,
  WindowQuality,
  MaintenanceWindowProviderPlugin,
  MaintenanceTypeProviderPlugin,
} from '../types';
import {
  createDefaultMaintenanceConfiguration,
  createDefaultRequiredConditions,
  createDefaultEligibility,
  generateMaintenanceId,
  generateWindowId,
  generateOpportunityId,
  generatePlanId,
  generateHistoryId,
  riskToScore,
  priorityToScore,
  windowQualityToScore,
} from '../types';
import {
  DEFAULT_MAINTENANCE_CONFIGURATION,
  createMaintenanceConfiguration,
} from '../maintenanceConfiguration';
import { MaintenanceEvents } from '../maintenanceEvents';
import { MaintenanceWindowDetector } from '../maintenanceWindowDetector';
import { MaintenanceEligibilityEngine } from '../maintenanceEligibilityEngine';
import { MaintenancePolicyEngine } from '../maintenancePolicyEngine';
import { MaintenancePriorityEngine } from '../maintenancePriorityEngine';
import { MaintenanceCoordinator, type SchedulerAdapter } from '../maintenanceCoordinator';
import { MaintenanceHistory } from '../maintenanceHistory';
import { MaintenanceStatisticsCalculator } from '../maintenanceStatistics';
import { MaintenanceValidator } from '../maintenanceValidator';
import { MaintenancePlanner } from '../maintenancePlanner';
import { MaintenanceEngine } from '../maintenanceEngine';
import { MaintenanceManager } from '../maintenanceManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockState(overrides: Partial<SystemState> = {}): SystemState {
  return {
    cpuUsage: 0,
    memoryUsage: 0,
    diskActivity: 0,
    batteryLevel: null,
    powerSource: 'unknown',
    userActive: true,
    fullScreenApp: false,
    gamingMode: false,
    windowsUpdateActive: false,
    networkActivity: 0,
    thermalState: 'normal',
    storagePressure: 0,
    isIdle: false,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createIdleState(overrides: Partial<SystemState> = {}): SystemState {
  return createMockState({
    cpuUsage: 10,
    memoryUsage: 20,
    diskActivity: 5,
    powerSource: 'ac',
    userActive: false,
    isIdle: true,
    networkActivity: 5,
    ...overrides,
  });
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
    ...overrides,
  });
}

function createMockOpportunity(overrides: Partial<MaintenanceOpportunity> = {}): MaintenanceOpportunity {
  return {
    id: overrides.id ?? 'opp_1',
    type: overrides.type ?? 'quick_maintenance',
    recommendedStart: overrides.recommendedStart ?? new Date().toISOString(),
    estimatedDuration: overrides.estimatedDuration ?? 60_000,
    priority: overrides.priority ?? 'medium' as RecommendationPriority,
    confidence: overrides.confidence ?? 0.8,
    risk: overrides.risk ?? 'low' as RiskLevel,
    expectedBenefit: overrides.expectedBenefit ?? 0.5,
    requiredConditions: overrides.requiredConditions ?? createDefaultRequiredConditions(),
    currentEligibility: overrides.currentEligibility ?? createDefaultEligibility(),
    recommendedActions: overrides.recommendedActions ?? ['junk_cleaner'],
    deferredActions: overrides.deferredActions ?? [],
    futureMetadata: overrides.futureMetadata ?? {},
  };
}

function createMockScheduler(overrides: Partial<SchedulerAdapter> = {}): SchedulerAdapter {
  return {
    isAvailable: overrides.isAvailable ?? (() => true),
    isRunning: overrides.isRunning ?? (() => false),
    canSchedule: overrides.canSchedule ?? (() => true),
    scheduleMaintenance: overrides.scheduleMaintenance ?? (() => true),
    getNextSlot: overrides.getNextSlot ?? (() => null),
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('createDefaultMaintenanceConfiguration has all sections', () => {
    const cfg = createDefaultMaintenanceConfiguration();
    expect(cfg.configVersion).toBe('1.0.0');
    expect(cfg.windowRules.length).toBeGreaterThan(0);
    expect(cfg.policies.length).toBeGreaterThan(0);
    expect(cfg.priorityRules.length).toBeGreaterThan(0);
    expect(cfg.thresholds).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
  });
  it('createDefaultRequiredConditions has all fields', () => {
    const cond = createDefaultRequiredConditions();
    expect(cond.maxCpuUsage).toBe(30);
    expect(cond.blockOnGaming).toBe(true);
  });
  it('createDefaultEligibility has unknown status', () => {
    const elig = createDefaultEligibility();
    expect(elig.status).toBe('unknown');
    expect(elig.overallScore).toBe(0);
  });
  it('generateMaintenanceId produces unique ids', () => {
    expect(generateMaintenanceId()).not.toBe(generateMaintenanceId());
    expect(generateMaintenanceId()).toContain('maint_');
  });
  it('generateWindowId produces unique ids', () => {
    expect(generateWindowId()).toContain('window_');
  });
  it('generateOpportunityId produces unique ids', () => {
    expect(generateOpportunityId()).toContain('opp_');
  });
  it('generatePlanId produces unique ids', () => {
    expect(generatePlanId()).toContain('maintplan_');
  });
  it('generateHistoryId produces unique ids', () => {
    expect(generateHistoryId()).toContain('mainthist_');
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
  it('windowQualityToScore converts correctly', () => {
    expect(windowQualityToScore('optimal')).toBe(1.0);
    expect(windowQualityToScore('good')).toBe(0.8);
    expect(windowQualityToScore('fair')).toBe(0.5);
    expect(windowQualityToScore('poor')).toBe(0.2);
    expect(windowQualityToScore('unavailable')).toBe(0);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('MaintenanceConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_MAINTENANCE_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_MAINTENANCE_CONFIGURATION.evaluationIntervalMs).toBe(5000);
  });
  it('createMaintenanceConfiguration accepts overrides', () => {
    const cfg = createMaintenanceConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
  });
  it('merges thresholds', () => {
    const cfg = createMaintenanceConfiguration({ thresholds: { maxCpuForWindow: 50 } });
    expect(cfg.thresholds.maxCpuForWindow).toBe(50);
    expect(cfg.thresholds.maxMemoryForWindow).toBe(40);
  });
  it('merges featureFlags', () => {
    const cfg = createMaintenanceConfiguration({ featureFlags: { enableWindowDetection: false } });
    expect(cfg.featureFlags.enableWindowDetection).toBe(false);
    expect(cfg.featureFlags.enableEligibilityCheck).toBe(true);
  });
  it('merges windowRules array', () => {
    const cfg = createMaintenanceConfiguration({ windowRules: [] });
    expect(cfg.windowRules.length).toBe(0);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('MaintenanceEvents', () => {
  let events: MaintenanceEvents;
  beforeEach(() => { events = new MaintenanceEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('maintenance_generated', () => { received = true; });
    events.emitGenerated('opp_1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('maintenance_deferred', listener);
    events.off('maintenance_deferred', listener);
    events.emitDeferred('opp_1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('maintenance_accepted', () => { received = true; });
    unsub();
    events.emitAccepted('opp_1');
    expect(received).toBe(false);
  });
  it('emitWindowFound works', () => {
    let received = false;
    events.on('maintenance_window_found', () => { received = true; });
    events.emitWindowFound('opp_1');
    expect(received).toBe(true);
  });
  it('emitExpired works', () => {
    let received = false;
    events.on('maintenance_expired', () => { received = true; });
    events.emitExpired('opp_1');
    expect(received).toBe(true);
  });
  it('emitCompleted works', () => {
    let received = false;
    events.on('maintenance_completed', () => { received = true; });
    events.emitCompleted('opp_1');
    expect(received).toBe(true);
  });
  it('emitCancelled works', () => {
    let received = false;
    events.on('maintenance_cancelled', () => { received = true; });
    events.emitCancelled('opp_1');
    expect(received).toBe(true);
  });
  it('clear removes all', () => {
    events.on('maintenance_generated', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('maintenance_generated', () => {});
    events.on('maintenance_deferred', () => {});
    expect(events.listenerCount()).toBe(2);
    expect(events.listenerCount('maintenance_generated')).toBe(1);
  });
  it('does not crash on listener error', () => {
    events.on('maintenance_generated', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitGenerated('opp_1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Window Detector ──────────────────────────────────────────

describe('MaintenanceWindowDetector', () => {
  let detector: MaintenanceWindowDetector;
  beforeEach(() => { detector = new MaintenanceWindowDetector(createDefaultMaintenanceConfiguration()); });

  it('detects window on idle system', () => {
    const window = detector.detect(createIdleState());
    expect(window).not.toBeNull();
    expect(window!.availableSignals.length).toBeGreaterThan(0);
  });
  it('returns null on busy system', () => {
    const window = detector.detect(createBusyState());
    expect(window).toBeNull();
  });
  it('detects optimal quality on fully idle system', () => {
    const window = detector.detect(createIdleState());
    expect(window!.quality).toBe('optimal');
  });
  it('includes confidence score', () => {
    const window = detector.detect(createIdleState());
    expect(window!.confidence).toBeGreaterThan(0);
    expect(window!.confidence).toBeLessThanOrEqual(1);
  });
  it('includes detectedAt timestamp', () => {
    const window = detector.detect(createIdleState());
    expect(window!.detectedAt).toBeDefined();
  });
  it('includes windowStart and windowEnd', () => {
    const window = detector.detect(createIdleState());
    expect(window!.windowStart).toBeDefined();
    expect(window!.windowEnd).toBeDefined();
  });
  it('isWindowAvailable returns true for idle', () => {
    expect(detector.isWindowAvailable(createIdleState())).toBe(true);
  });
  it('isWindowAvailable returns false for busy', () => {
    expect(detector.isWindowAvailable(createBusyState())).toBe(false);
  });
  it('getWindowQuality returns quality', () => {
    expect(detector.getWindowQuality(createIdleState())).toBe('optimal');
  });
  it('getWindowQuality returns unavailable for busy', () => {
    expect(detector.getWindowQuality(createBusyState())).toBe('unavailable');
  });
  it('detects AC power as positive signal', () => {
    const window = detector.detect(createIdleState({ powerSource: 'ac' }));
    expect(window!.availableSignals).toContain('ac_power');
  });
  it('detects no full screen as positive signal', () => {
    const window = detector.detect(createIdleState({ fullScreenApp: false }));
    expect(window!.availableSignals).toContain('no_full_screen');
  });
  it('detects no gaming as positive signal', () => {
    const window = detector.detect(createIdleState({ gamingMode: false }));
    expect(window!.availableSignals).toContain('no_gaming');
  });
  it('detects no windows update as positive signal', () => {
    const window = detector.detect(createIdleState({ windowsUpdateActive: false }));
    expect(window!.availableSignals).toContain('no_windows_update');
  });
  it('registers and uses provider plugins', () => {
    const plugin: MaintenanceWindowProviderPlugin = {
      getPluginName: () => 'test_plugin',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      detectWindow: () => ({
        id: 'plugin_window',
        detectedAt: new Date().toISOString(),
        windowStart: new Date().toISOString(),
        windowEnd: new Date().toISOString(),
        estimatedDurationMs: 600000,
        availableSignals: ['idle_time'] as WindowSignal[],
        blockedSignals: [],
        confidence: 0.9,
        quality: 'optimal' as WindowQuality,
        futureMetadata: { plugin: true },
      }),
    };
    detector.registerPlugin(plugin);
    const window = detector.detect(createIdleState());
    expect(window!.id).toBe('plugin_window');
  });
  it('performance: window detection under 100ms', () => {
    const start = performance.now();
    detector.detect(createIdleState());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Eligibility Engine ───────────────────────────────────────

describe('MaintenanceEligibilityEngine', () => {
  let engine: MaintenanceEligibilityEngine;
  beforeEach(() => { engine = new MaintenanceEligibilityEngine(createDefaultMaintenanceConfiguration()); });

  it('returns eligible for idle system', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState());
    expect(result.status).toBe('eligible');
    expect(result.blockers.length).toBe(0);
  });
  it('returns ineligible for busy system', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createBusyState());
    expect(result.status).toBe('ineligible');
    expect(result.blockers.length).toBeGreaterThan(0);
  });
  it('checks device state CPU', () => {
    const opp = createMockOpportunity({ requiredConditions: { ...createDefaultRequiredConditions(), maxCpuUsage: 20 } });
    const result = engine.evaluate(opp, createIdleState({ cpuUsage: 50 }));
    expect(result.status).toBe('ineligible');
  });
  it('checks device state memory', () => {
    const opp = createMockOpportunity({ requiredConditions: { ...createDefaultRequiredConditions(), maxMemoryUsage: 20 } });
    const result = engine.evaluate(opp, createIdleState({ memoryUsage: 50 }));
    expect(result.status).toBe('ineligible');
  });
  it('checks full screen blocking', () => {
    const opp = createMockOpportunity({ requiredConditions: { ...createDefaultRequiredConditions(), blockOnFullScreen: true } });
    const result = engine.evaluate(opp, createIdleState({ fullScreenApp: true }));
    expect(result.status).toBe('ineligible');
  });
  it('checks gaming blocking', () => {
    const opp = createMockOpportunity({ requiredConditions: { ...createDefaultRequiredConditions(), blockOnGaming: true } });
    const result = engine.evaluate(opp, createIdleState({ gamingMode: true }));
    expect(result.status).toBe('ineligible');
  });
  it('checks AC power requirement', () => {
    const opp = createMockOpportunity({ requiredConditions: { ...createDefaultRequiredConditions(), requireAcPower: true } });
    const result = engine.evaluate(opp, createIdleState({ powerSource: 'battery' }));
    expect(result.status).toBe('ineligible');
  });
  it('checks idle requirement', () => {
    const opp = createMockOpportunity({ requiredConditions: { ...createDefaultRequiredConditions(), requireIdle: true } });
    const result = engine.evaluate(opp, createIdleState({ isIdle: false }));
    expect(result.status).toBe('ineligible');
  });
  it('checks subscription', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState(), {
      subscription: { active: false, tier: 'free', expiresAt: null },
    });
    expect(result.status).toBe('ineligible');
  });
  it('checks capabilities', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState(), {
      capabilities: { available: [], required: ['special_cap'] },
    });
    expect(result.status).toBe('ineligible');
  });
  it('checks quota', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState(), {
      quota: { used: 100, limit: 100, remaining: 0 },
    });
    expect(result.status).toBe('ineligible');
  });
  it('checks enterprise policy blocked type', () => {
    const opp = createMockOpportunity({ type: 'deep_maintenance' });
    const result = engine.evaluate(opp, createIdleState(), {
      enterprisePolicy: {
        maintenanceAllowed: true,
        allowedTypes: [],
        blockedTypes: ['deep_maintenance'],
        maxDuration: null,
      },
    });
    expect(result.status).toBe('ineligible');
  });
  it('checks enterprise policy maintenance not allowed', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState(), {
      enterprisePolicy: {
        maintenanceAllowed: false,
        allowedTypes: [],
        blockedTypes: [],
        maxDuration: null,
      },
    });
    expect(result.status).toBe('ineligible');
  });
  it('checks enterprise policy max duration', () => {
    const opp = createMockOpportunity({ estimatedDuration: 600000 });
    const result = engine.evaluate(opp, createIdleState(), {
      enterprisePolicy: {
        maintenanceAllowed: true,
        allowedTypes: [],
        blockedTypes: [],
        maxDuration: 300000,
      },
    });
    expect(result.status).toBe('ineligible');
  });
  it('registers custom rules', () => {
    const rule: EligibilityRule = {
      id: 'custom_rule',
      dimension: 'device_state',
      name: 'Custom Check',
      description: 'A custom check',
      enabled: true,
      required: false,
      evaluate: () => ({ id: 'custom_rule', name: 'Custom Check', passed: true, required: false, message: 'OK', details: {} }),
      futureMetadata: {},
    };
    expect(engine.registerRule(rule)).toBe(true);
    expect(engine.registerRule(rule)).toBe(false);
  });
  it('unregisters custom rules', () => {
    const rule: EligibilityRule = {
      id: 'custom_rule',
      dimension: 'device_state',
      name: 'Custom Check',
      description: 'A custom check',
      enabled: true,
      required: false,
      evaluate: () => ({ id: 'custom_rule', name: 'Custom Check', passed: true, required: false, message: 'OK', details: {} }),
      futureMetadata: {},
    };
    engine.registerRule(rule);
    expect(engine.unregisterRule('custom_rule')).toBe(true);
    expect(engine.unregisterRule('custom_rule')).toBe(false);
  });
  it('overallScore is between 0 and 1', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState());
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
  });
});

// ── Policy Engine ────────────────────────────────────────────

describe('MaintenancePolicyEngine', () => {
  let engine: MaintenancePolicyEngine;
  beforeEach(() => { engine = new MaintenancePolicyEngine(createDefaultMaintenanceConfiguration()); });

  it('returns allow for idle system', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState());
    expect(result.action).toBe('allow');
  });
  it('defers for active user', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState({ userActive: true, isIdle: false }));
    expect(result.action).toBe('defer');
  });
  it('defers for low battery', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState({ powerSource: 'battery', batteryLevel: 15 }));
    expect(result.action).toBe('defer');
  });
  it('blocks for gaming mode', () => {
    const opp = createMockOpportunity();
    const result = engine.evaluate(opp, createIdleState({ gamingMode: true }));
    expect(result.action).toBe('block');
  });
  it('require_confirmation for privacy maintenance', () => {
    const opp = createMockOpportunity({ type: 'privacy_maintenance' });
    const result = engine.evaluate(opp, createIdleState());
    expect(result.action).toBe('require_confirmation');
  });
  it('registers custom policy', () => {
    const policy: MaintenancePolicy = {
      id: 'custom_pol', type: 'custom_policy', name: 'Custom', description: 'Custom policy',
      priority: 10, enabled: true, rules: [], futureMetadata: {},
    };
    expect(engine.registerPolicy(policy)).toBe(true);
    expect(engine.registerPolicy(policy)).toBe(false);
  });
  it('unregisters custom policy', () => {
    const policy: MaintenancePolicy = {
      id: 'custom_pol', type: 'custom_policy', name: 'Custom', description: 'Custom policy',
      priority: 10, enabled: true, rules: [], futureMetadata: {},
    };
    engine.registerPolicy(policy);
    expect(engine.unregisterPolicy('custom_pol')).toBe(true);
    expect(engine.unregisterPolicy('custom_pol')).toBe(false);
  });
  it('getPolicy finds by id', () => {
    expect(engine.getPolicy('pol_never_interrupt')).toBeDefined();
  });
  it('getPoliciesByType filters correctly', () => {
    const policies = engine.getPoliciesByType('gaming_protection');
    expect(policies.length).toBe(1);
  });
});

// ── Priority Engine ──────────────────────────────────────────

describe('MaintenancePriorityEngine', () => {
  let engine: MaintenancePriorityEngine;
  beforeEach(() => { engine = new MaintenancePriorityEngine(createDefaultMaintenanceConfiguration()); });

  it('ranks single opportunity', () => {
    const opp = createMockOpportunity();
    const results = engine.rank([opp]);
    expect(results.length).toBe(1);
    expect(results[0]!.rank).toBe(1);
  });
  it('ranks multiple opportunities by score', () => {
    const opps = [
      createMockOpportunity({ id: 'opp_1', expectedBenefit: 0.3, priority: 'low' as RecommendationPriority }),
      createMockOpportunity({ id: 'opp_2', expectedBenefit: 0.9, priority: 'critical' as RecommendationPriority }),
      createMockOpportunity({ id: 'opp_3', expectedBenefit: 0.5, priority: 'medium' as RecommendationPriority }),
    ];
    const results = engine.rank(opps);
    expect(results[0]!.opportunityId).toBe('opp_2');
    expect(results[1]!.rank).toBe(2);
    expect(results[2]!.rank).toBe(3);
  });
  it('rankSingle returns score and factors', () => {
    const opp = createMockOpportunity({ expectedBenefit: 0.8, priority: 'high' as RecommendationPriority });
    const result = engine.rankSingle(opp);
    expect(result.score).toBeGreaterThan(0);
    expect(result.factors.expectedBenefit).toBe(0.8);
    expect(result.factors.urgency).toBe(0.8);
  });
  it('includes reason in result', () => {
    const opp = createMockOpportunity();
    const result = engine.rankSingle(opp);
    expect(result.reason).toContain('scored');
  });
  it('factors in historical success', () => {
    const opp = createMockOpportunity({ type: 'quick_maintenance' });
    const history: MaintenanceHistoryEntry[] = [
      { id: 'h1', opportunityId: 'old_1', type: 'quick_maintenance', outcome: 'completed', timestamp: new Date().toISOString(), confidence: 0.8, duration: 60000, expectedBenefit: 0.5, actualBenefit: 0.4, metadata: {} },
      { id: 'h2', opportunityId: 'old_2', type: 'quick_maintenance', outcome: 'completed', timestamp: new Date().toISOString(), confidence: 0.8, duration: 60000, expectedBenefit: 0.5, actualBenefit: 0.4, metadata: {} },
      { id: 'h3', opportunityId: 'old_3', type: 'quick_maintenance', outcome: 'cancelled', timestamp: new Date().toISOString(), confidence: 0.8, duration: 0, expectedBenefit: 0.5, actualBenefit: null, metadata: {} },
    ];
    const result = engine.rankSingle(opp, history);
    expect(result.factors.historicalSuccess).toBeCloseTo(2 / 3, 1);
  });
  it('handles empty opportunities', () => {
    const results = engine.rank([]);
    expect(results.length).toBe(0);
  });
});

// ── Coordinator ──────────────────────────────────────────────

describe('MaintenanceCoordinator', () => {
  let coordinator: MaintenanceCoordinator;
  beforeEach(() => { coordinator = new MaintenanceCoordinator(createDefaultMaintenanceConfiguration()); });

  it('coordinates with available scheduler', () => {
    coordinator.setScheduler(createMockScheduler());
    const opp = createMockOpportunity();
    const result = coordinator.coordinate(opp, null);
    expect(result.coordinated).toBe(true);
    expect(result.schedulerNotified).toBe(true);
  });
  it('fails when no scheduler configured', () => {
    const opp = createMockOpportunity();
    const result = coordinator.coordinate(opp, null);
    expect(result.coordinated).toBe(false);
    expect(result.reason).toContain('No scheduler');
  });
  it('fails when scheduler unavailable', () => {
    coordinator.setScheduler(createMockScheduler({ isAvailable: () => false }));
    const opp = createMockOpportunity();
    const result = coordinator.coordinate(opp, null);
    expect(result.coordinated).toBe(false);
  });
  it('fails when scheduler is running', () => {
    coordinator.setScheduler(createMockScheduler({ isRunning: () => true }));
    const opp = createMockOpportunity();
    const result = coordinator.coordinate(opp, null);
    expect(result.coordinated).toBe(false);
    expect(result.reason).toContain('running');
  });
  it('fails when scheduler cannot schedule', () => {
    coordinator.setScheduler(createMockScheduler({ canSchedule: () => false }));
    const opp = createMockOpportunity();
    const result = coordinator.coordinate(opp, null);
    expect(result.coordinated).toBe(false);
  });
  it('fails when scheduler rejects', () => {
    coordinator.setScheduler(createMockScheduler({ scheduleMaintenance: () => false }));
    const opp = createMockOpportunity();
    const result = coordinator.coordinate(opp, null);
    expect(result.coordinated).toBe(false);
    expect(result.reason).toContain('rejected');
  });
  it('isAlreadyNotified tracks opportunities', () => {
    coordinator.setScheduler(createMockScheduler());
    const opp = createMockOpportunity({ id: 'test_opp' });
    coordinator.coordinate(opp, null);
    expect(coordinator.isAlreadyNotified('test_opp')).toBe(true);
  });
  it('clearNotifications resets tracking', () => {
    coordinator.setScheduler(createMockScheduler());
    const opp = createMockOpportunity({ id: 'test_opp' });
    coordinator.coordinate(opp, null);
    coordinator.clearNotifications();
    expect(coordinator.isAlreadyNotified('test_opp')).toBe(false);
  });
  it('getSupportedTypes returns all types', () => {
    const types = coordinator.getSupportedTypes();
    expect(types).toContain('quick_maintenance');
    expect(types).toContain('deep_maintenance');
    expect(types).toContain('health_recovery');
  });
  it('respects disabled coordination flag', () => {
    const cfg = createMaintenanceConfiguration({ featureFlags: { enableCoordination: false } });
    const coord = new MaintenanceCoordinator(cfg);
    coord.setScheduler(createMockScheduler());
    const opp = createMockOpportunity();
    const result = coord.coordinate(opp, null);
    expect(result.coordinated).toBe(false);
    expect(result.reason).toContain('disabled');
  });
});

// ── History ──────────────────────────────────────────────────

describe('MaintenanceHistory', () => {
  let history: MaintenanceHistory;
  beforeEach(() => { history = new MaintenanceHistory(100); });

  it('records entries', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    expect(history.count).toBe(1);
  });
  it('getAll returns all entries', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    history.record('opp_2', 'deep_maintenance', 'accepted', 0.9);
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    history.record('opp_2', 'deep_maintenance', 'accepted', 0.9);
    expect(history.getRecent(1).length).toBe(1);
    expect(history.getRecent(1)[0]!.opportunityId).toBe('opp_2');
  });
  it('getByOpportunity filters', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    history.record('opp_2', 'deep_maintenance', 'accepted', 0.9);
    expect(history.getByOpportunity('opp_1').length).toBe(1);
  });
  it('getByType filters', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    history.record('opp_2', 'deep_maintenance', 'accepted', 0.9);
    expect(history.getByType('quick_maintenance').length).toBe(1);
  });
  it('getByOutcome filters', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    history.record('opp_2', 'deep_maintenance', 'accepted', 0.9);
    expect(history.getByOutcome('accepted').length).toBe(1);
  });
  it('getSuccessRate computes rate', () => {
    history.record('opp_1', 'quick_maintenance', 'completed', 0.8);
    history.record('opp_2', 'quick_maintenance', 'completed', 0.8);
    history.record('opp_3', 'quick_maintenance', 'cancelled', 0.8);
    expect(history.getSuccessRate()).toBeCloseTo(2 / 3, 1);
  });
  it('clear removes all', () => {
    history.record('opp_1', 'quick_maintenance', 'recommended', 0.8);
    history.clear();
    expect(history.count).toBe(0);
  });
  it('setMaxEntries trims', () => {
    for (let i = 0; i < 10; i++) history.record(`opp_${i}`, 'quick_maintenance', 'recommended', 0.8);
    history.setMaxEntries(5);
    expect(history.count).toBe(5);
  });
});

// ── Statistics ───────────────────────────────────────────────

describe('MaintenanceStatisticsCalculator', () => {
  let calc: MaintenanceStatisticsCalculator;
  beforeEach(() => { calc = new MaintenanceStatisticsCalculator(); });

  it('returns zeros for empty entries', () => {
    const stats = calc.compute([]);
    expect(stats.totalOpportunities).toBe(0);
    expect(stats.successRate).toBe(0);
  });
  it('computes correct stats', () => {
    const entries: MaintenanceHistoryEntry[] = [
      { id: 'h1', opportunityId: 'opp_1', type: 'quick_maintenance', outcome: 'completed', timestamp: new Date().toISOString(), confidence: 0.8, duration: 60000, expectedBenefit: 0.5, actualBenefit: 0.4, metadata: {} },
      { id: 'h2', opportunityId: 'opp_2', type: 'deep_maintenance', outcome: 'deferred', timestamp: new Date().toISOString(), confidence: 0.7, duration: 0, expectedBenefit: 0.8, actualBenefit: null, metadata: {} },
    ];
    const stats = calc.compute(entries);
    expect(stats.totalOpportunities).toBe(2);
    expect(stats.byType['quick_maintenance']).toBe(1);
    expect(stats.byType['deep_maintenance']).toBe(1);
    expect(stats.byOutcome['completed']).toBe(1);
    expect(stats.byOutcome['deferred']).toBe(1);
    expect(stats.deferredCount).toBe(1);
    expect(stats.averageConfidence).toBeCloseTo(0.75, 2);
  });
  it('computes success rate', () => {
    const entries: MaintenanceHistoryEntry[] = [
      { id: 'h1', opportunityId: 'opp_1', type: 'quick_maintenance', outcome: 'completed', timestamp: new Date().toISOString(), confidence: 0.8, duration: 60000, expectedBenefit: 0.5, actualBenefit: 0.4, metadata: {} },
      { id: 'h2', opportunityId: 'opp_2', type: 'deep_maintenance', outcome: 'cancelled', timestamp: new Date().toISOString(), confidence: 0.7, duration: 0, expectedBenefit: 0.8, actualBenefit: null, metadata: {} },
    ];
    const stats = calc.compute(entries);
    expect(stats.successRate).toBeCloseTo(0.5, 1);
  });
  it('computes average benefit from actual', () => {
    const entries: MaintenanceHistoryEntry[] = [
      { id: 'h1', opportunityId: 'opp_1', type: 'quick_maintenance', outcome: 'completed', timestamp: new Date().toISOString(), confidence: 0.8, duration: 60000, expectedBenefit: 0.5, actualBenefit: 0.4, metadata: {} },
      { id: 'h2', opportunityId: 'opp_2', type: 'deep_maintenance', outcome: 'completed', timestamp: new Date().toISOString(), confidence: 0.7, duration: 0, expectedBenefit: 0.8, actualBenefit: 0.6, metadata: {} },
    ];
    const stats = calc.compute(entries);
    expect(stats.averageBenefit).toBeCloseTo(0.5, 1);
  });
  it('tracks lastMaintenanceAt', () => {
    const ts = new Date().toISOString();
    const entries: MaintenanceHistoryEntry[] = [
      { id: 'h1', opportunityId: 'opp_1', type: 'quick_maintenance', outcome: 'completed', timestamp: ts, confidence: 0.8, duration: 60000, expectedBenefit: 0.5, actualBenefit: 0.4, metadata: {} },
    ];
    const stats = calc.compute(entries);
    expect(stats.lastMaintenanceAt).toBe(ts);
  });
});

// ── Validator ───────────────────────────────────────────────

describe('MaintenanceValidator', () => {
  let validator: MaintenanceValidator;
  beforeEach(() => { validator = new MaintenanceValidator(); });

  it('validates a correct plan', () => {
    const plan = {
      id: 'plan_1',
      opportunities: [createMockOpportunity()],
      window: null,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      summary: 'Test plan',
      totalEstimatedDuration: 60000,
      totalExpectedBenefit: 0.5,
      overallRisk: 'low' as RiskLevel,
      confidence: 0.8,
      futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(true);
  });
  it('detects empty plan', () => {
    const plan = {
      id: 'plan_1',
      opportunities: [],
      window: null,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      summary: '',
      totalEstimatedDuration: 0,
      totalExpectedBenefit: 0,
      overallRisk: 'low' as RiskLevel,
      confidence: 0.8,
      futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EMPTY_PLAN')).toBe(true);
  });
  it('detects invalid confidence', () => {
    const plan = {
      id: 'plan_1',
      opportunities: [createMockOpportunity()],
      window: null,
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      summary: '',
      totalEstimatedDuration: 60000,
      totalExpectedBenefit: 0.5,
      overallRisk: 'low' as RiskLevel,
      confidence: 1.5,
      futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_CONFIDENCE')).toBe(true);
  });
  it('warns on expired plan', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 7200000);
    const earlier = new Date(now.getTime() - 10800000);
    const plan = {
      id: 'plan_1',
      opportunities: [createMockOpportunity()],
      window: null,
      generatedAt: past.toISOString(),
      expiresAt: earlier.toISOString(),
      summary: '',
      totalEstimatedDuration: 60000,
      totalExpectedBenefit: 0.5,
      overallRisk: 'low' as RiskLevel,
      confidence: 0.8,
      futureMetadata: {},
    };
    const result = validator.validatePlan(plan);
    expect(result.warnings.some((w) => w.code === 'ALREADY_EXPIRED')).toBe(true);
  });
  it('validates opportunity', () => {
    const opp = createMockOpportunity();
    const result = validator.validateOpportunity(opp);
    expect(result.valid).toBe(true);
  });
  it('detects missing opportunity id', () => {
    const opp = createMockOpportunity({ id: '' });
    const result = validator.validateOpportunity(opp);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
  });
  it('warns on no actions', () => {
    const opp = createMockOpportunity({ recommendedActions: [], deferredActions: [] });
    const result = validator.validateOpportunity(opp);
    expect(result.warnings.some((w) => w.code === 'NO_ACTIONS')).toBe(true);
  });
  it('validates eligibility', () => {
    const elig = createDefaultEligibility();
    elig.status = 'eligible';
    const result = validator.validateEligibility(elig);
    expect(result.valid).toBe(true);
  });
  it('detects ineligible', () => {
    const elig = createDefaultEligibility();
    elig.status = 'ineligible';
    elig.blockers = ['Test blocker'];
    const result = validator.validateEligibility(elig);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'BLOCKED')).toBe(true);
  });
});

// ── Planner ─────────────────────────────────────────────────

describe('MaintenancePlanner', () => {
  let planner: MaintenancePlanner;
  beforeEach(() => { planner = new MaintenancePlanner(createDefaultMaintenanceConfiguration()); });

  it('generates plan for idle system', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan).toBeDefined();
    expect(plan.opportunities.length).toBeGreaterThan(0);
  });
  it('generates plan with window for idle system', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan.window).not.toBeNull();
  });
  it('generates plan without window for busy system', () => {
    const plan = planner.generatePlan(createBusyState());
    expect(plan.window).toBeNull();
  });
  it('findWindow returns window for idle', () => {
    expect(planner.findWindow(createIdleState())).not.toBeNull();
  });
  it('findWindow returns null for busy', () => {
    expect(planner.findWindow(createBusyState())).toBeNull();
  });
  it('evaluateEligibility returns eligibility', () => {
    const opp = createMockOpportunity();
    const result = planner.evaluateEligibility(opp, createIdleState());
    expect(result).toBeDefined();
    expect(result.status).toBe('eligible');
  });
  it('rankOpportunities returns rankings', () => {
    const opps = [createMockOpportunity({ id: 'a' }), createMockOpportunity({ id: 'b' })];
    const results = planner.rankOpportunities(opps);
    expect(results.length).toBe(2);
  });
  it('validatePlan returns result', () => {
    const plan = planner.generatePlan(createIdleState());
    const result = planner.validatePlan(plan);
    expect(result).toBeDefined();
  });
  it('plan includes summary', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan.summary).toBeDefined();
    expect(plan.summary.length).toBeGreaterThan(0);
  });
  it('plan includes totalEstimatedDuration', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan.totalEstimatedDuration).toBeGreaterThan(0);
  });
  it('plan includes confidence', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan.confidence).toBeGreaterThan(0);
  });
  it('plan includes overallRisk', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan.overallRisk).toBeDefined();
  });
  it('plan includes expiresAt', () => {
    const plan = planner.generatePlan(createIdleState());
    expect(plan.expiresAt).toBeDefined();
  });
  it('registers type plugin', () => {
    const plugin: MaintenanceTypeProviderPlugin = {
      getPluginName: () => 'test',
      getVersion: () => '1.0.0',
      getPriority: () => 1,
      isAvailable: () => true,
      getMaintenanceType: () => 'custom_maintenance',
      evaluate: () => createMockOpportunity({ id: 'plugin_opp', type: 'custom_maintenance' }),
    };
    planner.registerTypePlugin(plugin);
    const plan = planner.generatePlan(createIdleState());
    expect(plan.opportunities.some((o) => o.id === 'plugin_opp')).toBe(true);
  });
  it('filters out ineligible opportunities', () => {
    const plan = planner.generatePlan(createBusyState());
    for (const opp of plan.opportunities) {
      expect(opp.currentEligibility.status).not.toBe('ineligible');
    }
  });
});

// ── Engine ──────────────────────────────────────────────────

describe('MaintenanceEngine', () => {
  let engine: MaintenanceEngine;
  beforeEach(() => { engine = new MaintenanceEngine(createDefaultMaintenanceConfiguration()); });

  it('generatePlan returns plan', () => {
    const plan = engine.generatePlan(createIdleState());
    expect(plan).toBeDefined();
    expect(plan.opportunities.length).toBeGreaterThan(0);
  });
  it('generatePlan emits events', () => {
    let generated = false;
    engine.on('maintenance_generated', () => { generated = true; });
    engine.generatePlan(createIdleState());
    expect(generated).toBe(true);
  });
  it('generatePlan emits window_found', () => {
    let windowFound = false;
    engine.on('maintenance_window_found', () => { windowFound = true; });
    engine.generatePlan(createIdleState());
    expect(windowFound).toBe(true);
  });
  it('findWindow returns window', () => {
    expect(engine.findWindow(createIdleState())).not.toBeNull();
  });
  it('getMaintenancePlan returns current plan', () => {
    engine.generatePlan(createIdleState());
    expect(engine.getMaintenancePlan()).not.toBeNull();
  });
  it('getMaintenanceHistory returns entries', () => {
    engine.generatePlan(createIdleState());
    expect(engine.getMaintenanceHistory().length).toBeGreaterThan(0);
  });
  it('getMaintenanceStatistics returns stats', () => {
    engine.generatePlan(createIdleState());
    const stats = engine.getMaintenanceStatistics();
    expect(stats.totalOpportunities).toBeGreaterThan(0);
  });
  it('validatePlan returns result', () => {
    const plan = engine.generatePlan(createIdleState());
    const result = engine.validatePlan(plan);
    expect(result).toBeDefined();
  });
  it('coordinate returns coordination result', () => {
    engine.setScheduler(createMockScheduler());
    const plan = engine.generatePlan(createIdleState());
    const opp = plan.opportunities[0]!;
    const result = engine.coordinate(opp, plan.window);
    expect(result.coordinated).toBe(true);
  });
  it('deferOpportunity records history', () => {
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    const opp = plan.opportunities[0]!;
    engine.deferOpportunity(opp.id, 'test reason');
    const history = engine.getMaintenanceHistory();
    expect(history.some((h) => h.outcome === 'deferred')).toBe(true);
  });
  it('completeOpportunity records history', () => {
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    const opp = plan.opportunities[0]!;
    engine.completeOpportunity(opp.id, 0.5);
    const history = engine.getMaintenanceHistory();
    expect(history.some((h) => h.outcome === 'completed')).toBe(true);
  });
  it('cancelOpportunity records history', () => {
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    const opp = plan.opportunities[0]!;
    engine.cancelOpportunity(opp.id, 'test');
    const history = engine.getMaintenanceHistory();
    expect(history.some((h) => h.outcome === 'cancelled')).toBe(true);
  });
  it('expireOpportunity records history', () => {
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    const opp = plan.opportunities[0]!;
    engine.expireOpportunity(opp.id);
    const history = engine.getMaintenanceHistory();
    expect(history.some((h) => h.outcome === 'expired')).toBe(true);
  });
  it('deferOpportunity emits event', () => {
    let deferred = false;
    engine.on('maintenance_deferred', () => { deferred = true; });
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    engine.deferOpportunity(plan.opportunities[0]!.id, 'test');
    expect(deferred).toBe(true);
  });
  it('completeOpportunity emits event', () => {
    let completed = false;
    engine.on('maintenance_completed', () => { completed = true; });
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    engine.completeOpportunity(plan.opportunities[0]!.id);
    expect(completed).toBe(true);
  });
  it('cancelOpportunity emits event', () => {
    let cancelled = false;
    engine.on('maintenance_cancelled', () => { cancelled = true; });
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    engine.cancelOpportunity(plan.opportunities[0]!.id, 'test');
    expect(cancelled).toBe(true);
  });
  it('expireOpportunity emits event', () => {
    let expired = false;
    engine.on('maintenance_expired', () => { expired = true; });
    engine.generatePlan(createIdleState());
    const plan = engine.getMaintenancePlan()!;
    engine.expireOpportunity(plan.opportunities[0]!.id);
    expect(expired).toBe(true);
  });
  it('clear resets everything', () => {
    engine.generatePlan(createIdleState());
    engine.clear();
    expect(engine.getMaintenancePlan()).toBeNull();
    expect(engine.getMaintenanceHistory().length).toBe(0);
  });
  it('getSupportedTypes returns all types', () => {
    const types = engine.getSupportedTypes();
    expect(types.length).toBe(9);
  });
  it('config is accessible', () => {
    expect(engine.config.configVersion).toBe('1.0.0');
  });
});

// ── Manager ─────────────────────────────────────────────────

describe('MaintenanceManager', () => {
  let manager: MaintenanceManager;
  beforeEach(() => { manager = new MaintenanceManager(); });

  it('generateMaintenancePlan returns plan', () => {
    const plan = manager.generateMaintenancePlan(createIdleState());
    expect(plan).toBeDefined();
    expect(plan.opportunities.length).toBeGreaterThan(0);
  });
  it('findMaintenanceWindow returns window', () => {
    expect(manager.findMaintenanceWindow(createIdleState())).not.toBeNull();
  });
  it('findMaintenanceWindow returns null for busy', () => {
    expect(manager.findMaintenanceWindow(createBusyState())).toBeNull();
  });
  it('evaluateEligibility returns eligibility', () => {
    const opp = createMockOpportunity();
    const result = manager.evaluateEligibility(opp, createIdleState());
    expect(result).toBeDefined();
  });
  it('getMaintenancePlan returns current plan', () => {
    manager.generateMaintenancePlan(createIdleState());
    expect(manager.getMaintenancePlan()).not.toBeNull();
  });
  it('getMaintenanceHistory returns entries', () => {
    manager.generateMaintenancePlan(createIdleState());
    expect(manager.getMaintenanceHistory().length).toBeGreaterThan(0);
  });
  it('getMaintenanceStatistics returns stats', () => {
    manager.generateMaintenancePlan(createIdleState());
    const stats = manager.getMaintenanceStatistics();
    expect(stats.totalOpportunities).toBeGreaterThan(0);
  });
  it('getMaintenanceStatistics with no history returns zeros', () => {
    const stats = manager.getMaintenanceStatistics();
    expect(stats.totalOpportunities).toBe(0);
  });
  it('validateMaintenancePlan returns result', () => {
    const plan = manager.generateMaintenancePlan(createIdleState());
    const result = manager.validateMaintenancePlan(plan);
    expect(result).toBeDefined();
  });
  it('coordinateMaintenance returns result', () => {
    manager.setScheduler(createMockScheduler());
    const plan = manager.generateMaintenancePlan(createIdleState());
    const opp = plan.opportunities[0]!;
    const result = manager.coordinateMaintenance(opp, plan.window);
    expect(result.coordinated).toBe(true);
  });
  it('deferMaintenance records history', () => {
    manager.generateMaintenancePlan(createIdleState());
    const plan = manager.getMaintenancePlan()!;
    manager.deferMaintenance(plan.opportunities[0]!.id, 'test');
    expect(manager.getMaintenanceHistory().some((h) => h.outcome === 'deferred')).toBe(true);
  });
  it('completeMaintenance records history', () => {
    manager.generateMaintenancePlan(createIdleState());
    const plan = manager.getMaintenancePlan()!;
    manager.completeMaintenance(plan.opportunities[0]!.id, 0.5);
    expect(manager.getMaintenanceHistory().some((h) => h.outcome === 'completed')).toBe(true);
  });
  it('cancelMaintenance records history', () => {
    manager.generateMaintenancePlan(createIdleState());
    const plan = manager.getMaintenancePlan()!;
    manager.cancelMaintenance(plan.opportunities[0]!.id, 'test');
    expect(manager.getMaintenanceHistory().some((h) => h.outcome === 'cancelled')).toBe(true);
  });
  it('expireMaintenance records history', () => {
    manager.generateMaintenancePlan(createIdleState());
    const plan = manager.getMaintenancePlan()!;
    manager.expireMaintenance(plan.opportunities[0]!.id);
    expect(manager.getMaintenanceHistory().some((h) => h.outcome === 'expired')).toBe(true);
  });
  it('config is accessible', () => {
    expect(manager.config.configVersion).toBe('1.0.0');
  });
  it('updateConfig updates config', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('clear resets everything', () => {
    manager.generateMaintenancePlan(createIdleState());
    manager.clear();
    expect(manager.getMaintenancePlan()).toBeNull();
    expect(manager.getMaintenanceHistory().length).toBe(0);
  });
  it('on/off event subscription', () => {
    let received = false;
    const unsub = manager.on('maintenance_generated', () => { received = true; });
    manager.generateMaintenancePlan(createIdleState());
    expect(received).toBe(true);
    unsub();
  });
  it('events disabled does not emit', () => {
    const cfg = createMaintenanceConfiguration({ enableEvents: false });
    const m = new MaintenanceManager(cfg);
    let emitted = false;
    m.on('maintenance_generated', () => { emitted = true; });
    m.generateMaintenancePlan(createIdleState());
    expect(emitted).toBe(false);
  });
  it('registerEligibilityRule adds rule', () => {
    const rule: EligibilityRule = {
      id: 'test_rule',
      dimension: 'device_state',
      name: 'Test',
      description: 'Test rule',
      enabled: true,
      required: false,
      evaluate: () => ({ id: 'test_rule', name: 'Test', passed: true, required: false, message: 'OK', details: {} }),
      futureMetadata: {},
    };
    expect(manager.registerEligibilityRule(rule)).toBe(true);
  });
  it('registerPolicy adds policy', () => {
    const policy: MaintenancePolicy = {
      id: 'test_pol', type: 'custom_policy', name: 'Test', description: 'Test',
      priority: 10, enabled: true, rules: [], futureMetadata: {},
    };
    expect(manager.registerPolicy(policy)).toBe(true);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.MaintenanceManager).toBeDefined();
    expect(module.MaintenanceEngine).toBeDefined();
    expect(module.MaintenancePlanner).toBeDefined();
    expect(module.MaintenanceWindowDetector).toBeDefined();
    expect(module.MaintenanceEligibilityEngine).toBeDefined();
    expect(module.MaintenancePolicyEngine).toBeDefined();
    expect(module.MaintenancePriorityEngine).toBeDefined();
    expect(module.MaintenanceCoordinator).toBeDefined();
    expect(module.MaintenanceHistory).toBeDefined();
    expect(module.MaintenanceStatisticsCalculator).toBeDefined();
    expect(module.MaintenanceValidator).toBeDefined();
    expect(module.MaintenanceEvents).toBeDefined();
    expect(module.DEFAULT_MAINTENANCE_CONFIGURATION).toBeDefined();
  });
  it('full lifecycle: generate → coordinate → complete → stats', () => {
    const manager = new MaintenanceManager();
    manager.setScheduler(createMockScheduler());
    const plan = manager.generateMaintenancePlan(createIdleState());
    expect(plan.opportunities.length).toBeGreaterThan(0);
    const opp = plan.opportunities[0]!;
    const coordResult = manager.coordinateMaintenance(opp, plan.window);
    expect(coordResult.coordinated).toBe(true);
    manager.completeMaintenance(opp.id, 0.5);
    const stats = manager.getMaintenanceStatistics();
    expect(stats.totalOpportunities).toBeGreaterThan(0);
  });
  it('built-in window rules cover all specified signals', () => {
    const cfg = createDefaultMaintenanceConfiguration();
    const signals = cfg.windowRules.map((r) => r.signal);
    expect(signals).toContain('idle_time');
    expect(signals).toContain('low_cpu');
    expect(signals).toContain('low_memory');
    expect(signals).toContain('low_disk');
    expect(signals).toContain('ac_power');
    expect(signals).toContain('sufficient_battery');
    expect(signals).toContain('low_network');
    expect(signals).toContain('no_windows_update');
    expect(signals).toContain('no_full_screen');
    expect(signals).toContain('no_gaming');
  });
  it('built-in policies cover all specified types', () => {
    const cfg = createDefaultMaintenanceConfiguration();
    const types = cfg.policies.map((p) => p.type);
    expect(types).toContain('never_interrupt_user');
    expect(types).toContain('battery_protection');
    expect(types).toContain('gaming_protection');
    expect(types).toContain('business_hours');
    expect(types).toContain('developer_mode');
    expect(types).toContain('privacy_mode');
    expect(types).toContain('enterprise_rules');
  });
  it('priority rules cover all specified factors', () => {
    const cfg = createDefaultMaintenanceConfiguration();
    const factors = cfg.priorityRules.map((r) => r.factor);
    expect(factors).toContain('expectedBenefit');
    expect(factors).toContain('risk');
    expect(factors).toContain('urgency');
    expect(factors).toContain('predictionScore');
    expect(factors).toContain('healthScore');
    expect(factors).toContain('historicalSuccess');
    expect(factors).toContain('executionTime');
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('window detection under 100ms', () => {
    const detector = new MaintenanceWindowDetector(createDefaultMaintenanceConfiguration());
    const start = performance.now();
    detector.detect(createIdleState());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
  it('plan generation under 100ms', () => {
    const manager = new MaintenanceManager();
    const start = performance.now();
    manager.generateMaintenancePlan(createIdleState());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles busy system with no window', () => {
    const manager = new MaintenanceManager();
    const plan = manager.generateMaintenancePlan(createBusyState());
    expect(plan.window).toBeNull();
  });
  it('handles null battery level', () => {
    const detector = new MaintenanceWindowDetector(createDefaultMaintenanceConfiguration());
    const window = detector.detect(createIdleState({ batteryLevel: null }));
    expect(window).not.toBeNull();
  });
  it('handles unknown thermal state', () => {
    const detector = new MaintenanceWindowDetector(createDefaultMaintenanceConfiguration());
    const window = detector.detect(createIdleState({ thermalState: 'unknown' }));
    expect(window).not.toBeNull();
  });
  it('handles empty opportunity list in priority ranking', () => {
    const engine = new MaintenancePriorityEngine(createDefaultMaintenanceConfiguration());
    const results = engine.rank([]);
    expect(results.length).toBe(0);
  });
  it('handles coordinator with no scheduler', () => {
    const coord = new MaintenanceCoordinator(createDefaultMaintenanceConfiguration());
    const result = coord.coordinate(createMockOpportunity(), null);
    expect(result.coordinated).toBe(false);
  });
  it('handles history with no entries for success rate', () => {
    const history = new MaintenanceHistory();
    expect(history.getSuccessRate()).toBe(0);
  });
  it('handles statistics with all cancelled entries', () => {
    const calc = new MaintenanceStatisticsCalculator();
    const entries: MaintenanceHistoryEntry[] = [
      { id: 'h1', opportunityId: 'opp_1', type: 'quick_maintenance', outcome: 'cancelled', timestamp: new Date().toISOString(), confidence: 0.8, duration: 0, expectedBenefit: 0.5, actualBenefit: null, metadata: {} },
    ];
    const stats = calc.compute(entries);
    expect(stats.successRate).toBe(0);
    expect(stats.cancelledCount).toBe(1);
  });
  it('handles plan with all opportunities filtered out', () => {
    const manager = new MaintenanceManager();
    const plan = manager.generateMaintenancePlan(createBusyState());
    // Busy state should filter out most or all opportunities
    expect(plan.opportunities.length).toBeLessThanOrEqual(6);
  });
  it('handles multiple maintenance types', () => {
    const manager = new MaintenanceManager();
    const plan = manager.generateMaintenancePlan(createIdleState(), {
      types: ['quick_maintenance', 'deep_maintenance', 'privacy_maintenance'],
    });
    expect(plan.opportunities.length).toBeGreaterThan(0);
  });
  it('handles custom maintenance type', () => {
    const manager = new MaintenanceManager();
    const plan = manager.generateMaintenancePlan(createIdleState(), {
      types: ['custom_maintenance'],
    });
    expect(plan.opportunities.length).toBe(1);
  });
  it('handles health recovery type', () => {
    const manager = new MaintenanceManager();
    const plan = manager.generateMaintenancePlan(createIdleState(), {
      types: ['health_recovery'],
    });
    expect(plan.opportunities.length).toBe(1);
    expect(plan.opportunities[0]!.type).toBe('health_recovery');
  });
});
