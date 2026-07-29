/**
 * Tests for Dashboard Action Platform.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  DashboardActionDefinition,
  ActionContext,
  ActionResult,
} from '../types';
import {
  generateActionId,
  getActionTypeLabel,
  getActionStateLabel,
  getActionCategoryLabel,
  getActionRouteLabel,
  createActionDefinition,
  createDefaultActionConfiguration,
} from '../types';
import {
  DEFAULT_ACTION_CONFIGURATION,
  createActionConfiguration,
  shouldConfirmAction,
} from '../actionConfiguration';
import { ActionEvents } from '../actionEvents';
import { ActionRegistry } from '../actionRegistry';
import { ActionValidator } from '../actionValidator';
import { ActionPermissionManager } from '../actionPermissionManager';
import { ActionTelemetry } from '../actionTelemetry';
import { ActionHistory } from '../actionHistory';
import { ActionResolver } from '../actionResolver';
import { ActionDispatcher } from '../actionDispatcher';
import { ActionFactory } from '../actionFactory';
import { BaseAction } from '../baseAction';
import { ActionManager } from '../actionManager';

// ── Mock Data Builders ───────────────────────────────────────

function createMockDefinition(overrides: Partial<DashboardActionDefinition> = {}): DashboardActionDefinition {
  return createActionDefinition({
    id: overrides.id ?? 'test_action_1',
    title: overrides.title ?? 'Test Action',
    description: overrides.description ?? 'A test action',
    category: overrides.category ?? 'optimization',
    actionType: overrides.actionType ?? 'optimize_now',
    icon: overrides.icon ?? 'bolt',
    priority: overrides.priority ?? 'high',
    requiresConfirmation: overrides.requiresConfirmation ?? true,
    requiresPermission: overrides.requiresPermission ?? true,
    requiresCapability: overrides.requiresCapability ?? null,
    requiresSubscription: overrides.requiresSubscription ?? null,
    requiresQuota: overrides.requiresQuota ?? null,
    telemetryEnabled: overrides.telemetryEnabled ?? true,
    widgetId: overrides.widgetId ?? 'health_score',
    widgetType: overrides.widgetType ?? 'health_score',
    explanation: overrides.explanation,
    routing: overrides.routing,
    futureMetadata: overrides.futureMetadata ?? {},
  });
}

function createMockContext(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    actionId: overrides.actionId ?? 'test_action_1',
    widgetId: overrides.widgetId ?? 'health_score',
    widgetType: overrides.widgetType ?? 'health_score',
    userId: overrides.userId ?? 'user_1',
    userPlan: overrides.userPlan ?? 'FREE',
    userFeatures: overrides.userFeatures ?? [],
    userCapabilities: overrides.userCapabilities ?? [],
    hasQuota: overrides.hasQuota ?? true,
    options: overrides.options ?? {},
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateActionId produces unique ids', () => {
    const id1 = generateActionId('optimize_now', 'health');
    const id2 = generateActionId('optimize_now', 'health');
    expect(id1).not.toBe(id2);
    expect(id1).toContain('action_optimize_now_health');
  });
  it('getActionTypeLabel returns correct labels', () => {
    expect(getActionTypeLabel('optimize_now')).toBe('Optimize Now');
    expect(getActionTypeLabel('quick_optimize')).toBe('Quick Optimize');
    expect(getActionTypeLabel('explain')).toBe('Explain');
    expect(getActionTypeLabel('rollback')).toBe('Rollback');
  });
  it('getActionStateLabel returns correct labels', () => {
    expect(getActionStateLabel('available')).toBe('Available');
    expect(getActionStateLabel('executing')).toBe('Executing');
    expect(getActionStateLabel('completed')).toBe('Completed');
    expect(getActionStateLabel('failed')).toBe('Failed');
  });
  it('getActionCategoryLabel returns correct labels', () => {
    expect(getActionCategoryLabel('optimization')).toBe('Optimization');
    expect(getActionCategoryLabel('information')).toBe('Information');
    expect(getActionCategoryLabel('navigation')).toBe('Navigation');
  });
  it('getActionRouteLabel returns correct labels', () => {
    expect(getActionRouteLabel('execution_engine')).toBe('Execution Engine');
    expect(getActionRouteLabel('scheduler')).toBe('Scheduler');
    expect(getActionRouteLabel('ai_assistant')).toBe('AI Assistant');
  });
  it('createActionDefinition fills defaults', () => {
    const def = createActionDefinition({ id: 'x', actionType: 'refresh', widgetId: 'w', widgetType: 'health_score' });
    expect(def.title).toBe('Refresh');
    expect(def.category).toBe('system');
    expect(def.priority).toBe('medium');
    expect(def.requiresConfirmation).toBe(false);
  });
  it('createDefaultActionConfiguration has all sections', () => {
    const cfg = createDefaultActionConfiguration();
    expect(cfg.permissionRules).toBeDefined();
    expect(cfg.confirmationRules).toBeDefined();
    expect(cfg.telemetryRules).toBeDefined();
    expect(cfg.routingRules).toBeDefined();
    expect(cfg.featureFlags).toBeDefined();
    expect(cfg.enableEvents).toBe(true);
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ActionConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_ACTION_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_ACTION_CONFIGURATION.permissionRules.defaultMinPlan).toBe('FREE');
    expect(DEFAULT_ACTION_CONFIGURATION.routingRules.defaultRoute).toBe('internal_dashboard');
  });
  it('createActionConfiguration accepts overrides', () => {
    const cfg = createActionConfiguration({ enableEvents: false });
    expect(cfg.enableEvents).toBe(false);
    expect(cfg.configVersion).toBe('1.0.0');
  });
  it('createActionConfiguration merges permissionRules', () => {
    const cfg = createActionConfiguration({ permissionRules: { strictMode: true } });
    expect(cfg.permissionRules.strictMode).toBe(true);
    expect(cfg.permissionRules.defaultMinPlan).toBe('FREE');
  });
  it('createActionConfiguration merges confirmationRules', () => {
    const cfg = createActionConfiguration({ confirmationRules: { alwaysConfirm: true } });
    expect(cfg.confirmationRules.alwaysConfirm).toBe(true);
    expect(cfg.confirmationRules.skipForSafeActions).toBe(true);
  });
  it('createActionConfiguration merges telemetryRules', () => {
    const cfg = createActionConfiguration({ telemetryRules: { trackLatency: false } });
    expect(cfg.telemetryRules.trackLatency).toBe(false);
    expect(cfg.telemetryRules.enabled).toBe(true);
  });
  it('createActionConfiguration merges routingRules', () => {
    const cfg = createActionConfiguration({ routingRules: { defaultRoute: 'execution_engine' } });
    expect(cfg.routingRules.defaultRoute).toBe('execution_engine');
    expect(cfg.routingRules.timeoutMs).toBe(30000);
  });
  it('createActionConfiguration merges featureFlags', () => {
    const cfg = createActionConfiguration({ featureFlags: { enableOptimizeNow: false } });
    expect(cfg.featureFlags.enableOptimizeNow).toBe(false);
    expect(cfg.featureFlags.enableExplain).toBe(true);
  });
  it('shouldConfirmAction returns true for alwaysConfirm', () => {
    const cfg = createActionConfiguration({ confirmationRules: { alwaysConfirm: true } });
    expect(shouldConfirmAction(cfg, false, 0.1, false)).toBe(true);
  });
  it('shouldConfirmAction returns false for safe actions', () => {
    const cfg = createActionConfiguration({});
    expect(shouldConfirmAction(cfg, false, 0.1, false)).toBe(false);
  });
  it('shouldConfirmAction returns true for irreversible', () => {
    const cfg = createActionConfiguration({});
    expect(shouldConfirmAction(cfg, false, 0.1, true)).toBe(true);
  });
  it('shouldConfirmAction returns true for high impact', () => {
    const cfg = createActionConfiguration({});
    expect(shouldConfirmAction(cfg, false, 0.8, false)).toBe(true);
  });
});

// ── Action Events ────────────────────────────────────────────

describe('ActionEvents', () => {
  let events: ActionEvents;
  beforeEach(() => { events = new ActionEvents(); });

  it('on/emit receives events', () => {
    let received = false;
    events.on('action_registered', () => { received = true; });
    events.emitRegistered('a1', 'w1');
    expect(received).toBe(true);
  });
  it('off removes listener', () => {
    let received = false;
    const listener = () => { received = true; };
    events.on('action_selected', listener);
    events.off('action_selected', listener);
    events.emitSelected('a1', 'w1');
    expect(received).toBe(false);
  });
  it('on returns unsubscribe function', () => {
    let received = false;
    const unsub = events.on('action_completed', () => { received = true; });
    unsub();
    events.emitCompleted('a1', 'w1');
    expect(received).toBe(false);
  });
  it('emitDispatched works', () => {
    let received = false;
    events.on('action_dispatched', () => { received = true; });
    events.emitDispatched('a1', 'w1');
    expect(received).toBe(true);
  });
  it('emitCancelled works', () => {
    let received = false;
    events.on('action_cancelled', () => { received = true; });
    events.emitCancelled('a1', 'w1');
    expect(received).toBe(true);
  });
  it('emitFailed works', () => {
    let received = false;
    events.on('action_failed', () => { received = true; });
    events.emitFailed('a1', 'w1');
    expect(received).toBe(true);
  });
  it('emitValidated works', () => {
    let received = false;
    events.on('action_validated', () => { received = true; });
    events.emitValidated('a1', 'w1');
    expect(received).toBe(true);
  });
  it('clear removes all listeners', () => {
    events.on('action_registered', () => {});
    events.clear();
    expect(events.listenerCount()).toBe(0);
  });
  it('listenerCount returns correct count', () => {
    events.on('action_registered', () => {});
    events.on('action_registered', () => {});
    events.on('action_selected', () => {});
    expect(events.listenerCount('action_registered')).toBe(2);
    expect(events.listenerCount()).toBe(3);
  });
  it('does not crash on listener error', () => {
    events.on('action_registered', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    events.emitRegistered('a1', 'w1');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── Action Registry ──────────────────────────────────────────

describe('ActionRegistry', () => {
  let registry: ActionRegistry;
  beforeEach(() => { registry = new ActionRegistry(); });

  it('register adds action', () => {
    const def = createMockDefinition();
    expect(registry.register(def)).toBe(true);
    expect(registry.has(def.id)).toBe(true);
    expect(registry.count).toBe(1);
  });
  it('register returns false for duplicate', () => {
    const def = createMockDefinition();
    registry.register(def);
    expect(registry.register(def)).toBe(false);
  });
  it('unregister removes action', () => {
    const def = createMockDefinition();
    registry.register(def);
    expect(registry.unregister(def.id)).toBe(true);
    expect(registry.has(def.id)).toBe(false);
  });
  it('unregister returns false for unknown', () => {
    expect(registry.unregister('unknown')).toBe(false);
  });
  it('get returns definition', () => {
    const def = createMockDefinition();
    registry.register(def);
    expect(registry.get(def.id)).toBe(def);
  });
  it('getAll returns all definitions', () => {
    registry.register(createMockDefinition({ id: 'a1' }));
    registry.register(createMockDefinition({ id: 'a2' }));
    expect(registry.getAll().length).toBe(2);
  });
  it('getByWidget filters by widget', () => {
    registry.register(createMockDefinition({ id: 'a1', widgetId: 'w1' }));
    registry.register(createMockDefinition({ id: 'a2', widgetId: 'w2' }));
    expect(registry.getByWidget('w1').length).toBe(1);
  });
  it('getByType filters by action type', () => {
    registry.register(createMockDefinition({ id: 'a1', actionType: 'optimize_now' }));
    registry.register(createMockDefinition({ id: 'a2', actionType: 'refresh' }));
    expect(registry.getByType('optimize_now').length).toBe(1);
  });
  it('getByCategory filters by category', () => {
    registry.register(createMockDefinition({ id: 'a1', category: 'optimization' }));
    registry.register(createMockDefinition({ id: 'a2', category: 'information' }));
    expect(registry.getByCategory('optimization').length).toBe(1);
  });
  it('clear removes all', () => {
    registry.register(createMockDefinition());
    registry.clear();
    expect(registry.count).toBe(0);
  });
  it('getWidgetActionCount returns count per widget', () => {
    registry.register(createMockDefinition({ id: 'a1', widgetId: 'w1' }));
    registry.register(createMockDefinition({ id: 'a2', widgetId: 'w1' }));
    expect(registry.getWidgetActionCount('w1')).toBe(2);
  });
});

// ── Action Validator ─────────────────────────────────────────

describe('ActionValidator', () => {
  let validator: ActionValidator;
  beforeEach(() => { validator = new ActionValidator(createDefaultActionConfiguration()); });

  it('validates correct definition', () => {
    const result = validator.validateDefinition(createMockDefinition());
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
  it('fails for missing id', () => {
    const result = validator.validateDefinition(createMockDefinition({ id: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Action id is required');
  });
  it('fails for missing title', () => {
    const result = validator.validateDefinition(createMockDefinition({ title: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Action title is required');
  });
  it('fails for missing widgetId', () => {
    const result = validator.validateDefinition(createMockDefinition({ widgetId: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Widget id is required');
  });
  it('warns for empty description', () => {
    const result = validator.validateDefinition(createMockDefinition({ description: '' }));
    expect(result.warnings.length).toBeGreaterThan(0);
  });
  it('warns for invalid explanation confidence', () => {
    const result = validator.validateDefinition(createMockDefinition({
      explanation: {
        whyExists: 'test', expectedBenefits: 'test', estimatedTime: 10,
        estimatedImpact: 'high', confidence: 1.5, rollbackAvailable: false,
        relatedRecommendations: [], relatedPredictions: [],
      },
    }));
    expect(result.warnings.some((w) => w.includes('confidence'))).toBe(true);
  });
  it('validates context', () => {
    const result = validator.validateContext(createMockContext());
    expect(result.valid).toBe(true);
  });
  it('fails for missing actionId in context', () => {
    const result = validator.validateContext(createMockContext({ actionId: '' }));
    expect(result.valid).toBe(false);
  });
  it('validateForExecution checks widget match', () => {
    const def = createMockDefinition({ widgetId: 'w1' });
    const ctx = createMockContext({ widgetId: 'w2' });
    const result = validator.validateForExecution(def, ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('widget id'))).toBe(true);
  });
});

// ── Action Permission Manager ────────────────────────────────

describe('ActionPermissionManager', () => {
  let pm: ActionPermissionManager;
  beforeEach(() => { pm = new ActionPermissionManager(createDefaultActionConfiguration()); });

  it('allows action with no restrictions', () => {
    const result = pm.check(createMockDefinition(), createMockContext());
    expect(result.allowed).toBe(true);
  });
  it('blocks when feature flag disabled', () => {
    const cfg = createActionConfiguration({ featureFlags: { enableOptimizeNow: false, enableQuickOptimize: true, enableExplain: true, enableCompare: true, enableRollback: true, enableShareReport: true, enableExport: true, enableScheduling: true, futureFlags: {} } });
    pm.updateConfig(cfg);
    const result = pm.check(createMockDefinition({ actionType: 'optimize_now' }), createMockContext());
    expect(result.allowed).toBe(false);
    expect(result.missingFeatures).toContain('optimize_now');
  });
  it('blocks when subscription insufficient', () => {
    const result = pm.check(
      createMockDefinition({ requiresSubscription: 'PRO' }),
      createMockContext({ userPlan: 'FREE' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.planRequired).toBe('PRO');
  });
  it('allows when subscription sufficient', () => {
    const result = pm.check(
      createMockDefinition({ requiresSubscription: 'PRO' }),
      createMockContext({ userPlan: 'PRO' }),
    );
    expect(result.allowed).toBe(true);
  });
  it('allows ENTERPRISE for PRO user', () => {
    const result = pm.check(
      createMockDefinition({ requiresSubscription: 'PRO' }),
      createMockContext({ userPlan: 'ENTERPRISE' }),
    );
    expect(result.allowed).toBe(true);
  });
  it('blocks when capability missing', () => {
    const result = pm.check(
      createMockDefinition({ requiresCapability: 'advanced_optimize' }),
      createMockContext({ userCapabilities: ['basic'] }),
    );
    expect(result.allowed).toBe(false);
    expect(result.missingCapabilities).toContain('advanced_optimize');
  });
  it('allows when capability present', () => {
    const result = pm.check(
      createMockDefinition({ requiresCapability: 'advanced_optimize' }),
      createMockContext({ userCapabilities: ['advanced_optimize'] }),
    );
    expect(result.allowed).toBe(true);
  });
  it('blocks when quota exceeded', () => {
    const result = pm.check(
      createMockDefinition({ requiresQuota: 'daily_optimize' }),
      createMockContext({ hasQuota: false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.quotaExceeded).toBe(true);
  });
  it('blocks when device policy blocks', () => {
    const cfg = createActionConfiguration({ permissionRules: { devicePolicies: { optimize_now: false } } });
    pm.updateConfig(cfg);
    const result = pm.check(createMockDefinition({ actionType: 'optimize_now' }), createMockContext());
    expect(result.allowed).toBe(false);
  });
  it('blocks when enterprise policy blocks in strict mode', () => {
    const cfg = createActionConfiguration({ permissionRules: { strictMode: true, enterprisePolicies: { optimize_now: false } } });
    pm.updateConfig(cfg);
    const result = pm.check(createMockDefinition({ actionType: 'optimize_now', requiresPermission: true }), createMockContext());
    expect(result.allowed).toBe(false);
  });
});

// ── Action Telemetry ─────────────────────────────────────────

describe('ActionTelemetry', () => {
  let telemetry: ActionTelemetry;
  beforeEach(() => { telemetry = new ActionTelemetry(createDefaultActionConfiguration().telemetryRules); });

  it('records invocation', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    expect(telemetry.count).toBe(1);
  });
  it('records completion', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordCompletion('a1', 100, true, null, 'execution_engine');
    const stats = telemetry.getStatistics();
    expect(stats.totalCompletions).toBe(1);
    expect(stats.successRate).toBe(1);
  });
  it('tracks failures', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordCompletion('a1', 50, false, 'some error', 'execution_engine');
    const stats = telemetry.getStatistics();
    expect(stats.totalFailures).toBe(1);
    expect(stats.successRate).toBe(0);
  });
  it('calculates average duration', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordCompletion('a1', 100, true, null, null);
    telemetry.recordInvocation('a2', 'refresh', 'w1');
    telemetry.recordCompletion('a2', 200, true, null, null);
    const stats = telemetry.getStatistics();
    expect(stats.averageDurationMs).toBe(150);
  });
  it('tracks byActionType', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordInvocation('a2', 'refresh', 'w1');
    const stats = telemetry.getStatistics();
    expect(stats.byActionType['optimize_now']).toBe(1);
    expect(stats.byActionType['refresh']).toBe(1);
  });
  it('tracks byWidget', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordInvocation('a2', 'refresh', 'w2');
    const stats = telemetry.getStatistics();
    expect(stats.byWidget['w1']).toBe(1);
    expect(stats.byWidget['w2']).toBe(1);
  });
  it('tracks popularActions', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.recordInvocation('a2', 'refresh', 'w1');
    const stats = telemetry.getStatistics();
    expect(stats.popularActions[0]?.actionId).toBe('a1');
    expect(stats.popularActions[0]?.count).toBe(2);
  });
  it('clear resets all', () => {
    telemetry.recordInvocation('a1', 'optimize_now', 'w1');
    telemetry.clear();
    expect(telemetry.count).toBe(0);
  });
  it('does not record when disabled', () => {
    const rules = { ...createDefaultActionConfiguration().telemetryRules, enabled: false };
    const t = new ActionTelemetry(rules);
    t.recordInvocation('a1', 'optimize_now', 'w1');
    expect(t.count).toBe(0);
  });
});

// ── Action History ───────────────────────────────────────────

describe('ActionHistory', () => {
  let history: ActionHistory;
  beforeEach(() => { history = new ActionHistory(); });

  it('records entries', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 100, null, 'execution_engine', 'u1');
    expect(history.count).toBe(1);
  });
  it('getAll returns all entries', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 100, null, null, null);
    history.record('a2', 'refresh', 'w1', 'health_score', 'failed', 50, 'err', null, null);
    expect(history.getAll().length).toBe(2);
  });
  it('getRecent returns last N', () => {
    for (let i = 0; i < 5; i++) {
      history.record(`a${i}`, 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    }
    expect(history.getRecent(2).length).toBe(2);
  });
  it('getByAction filters by action id', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    history.record('a2', 'refresh', 'w1', 'health_score', 'completed', 10, null, null, null);
    expect(history.getByAction('a1').length).toBe(1);
  });
  it('getByWidget filters by widget', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    history.record('a2', 'refresh', 'w2', 'health_score', 'completed', 10, null, null, null);
    expect(history.getByWidget('w1').length).toBe(1);
  });
  it('getByState filters by state', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    history.record('a2', 'refresh', 'w1', 'health_score', 'failed', 10, 'err', null, null);
    expect(history.getByState('completed').length).toBe(1);
    expect(history.getByState('failed').length).toBe(1);
  });
  it('getFailed returns only failed', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    history.record('a2', 'refresh', 'w1', 'health_score', 'failed', 10, 'err', null, null);
    expect(history.getFailed().length).toBe(1);
  });
  it('getCompleted returns only completed', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    history.record('a2', 'refresh', 'w1', 'health_score', 'failed', 10, 'err', null, null);
    expect(history.getCompleted().length).toBe(1);
  });
  it('getByUser filters by user', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, 'u1');
    history.record('a2', 'refresh', 'w1', 'health_score', 'completed', 10, null, null, 'u2');
    expect(history.getByUser('u1').length).toBe(1);
  });
  it('clear removes all', () => {
    history.record('a1', 'optimize_now', 'w1', 'health_score', 'completed', 10, null, null, null);
    history.clear();
    expect(history.count).toBe(0);
  });
});

// ── Action Resolver ──────────────────────────────────────────

describe('ActionResolver', () => {
  let resolver: ActionResolver;
  beforeEach(() => { resolver = new ActionResolver(createDefaultActionConfiguration().routingRules); });

  it('resolves to definition routing if present', () => {
    const def = createMockDefinition({ routing: { route: 'execution_engine' } });
    expect(resolver.resolve(def, createMockContext())).toBe('execution_engine');
  });
  it('resolves to route override if present', () => {
    const cfg = createActionConfiguration({ routingRules: { routeOverrides: { optimize_now: 'scheduler' } } });
    resolver.updateRules(cfg.routingRules);
    const def = createMockDefinition({ actionType: 'optimize_now' });
    expect(resolver.resolve(def, createMockContext())).toBe('scheduler');
  });
  it('resolves to default route', () => {
    const def = createMockDefinition();
    expect(resolver.resolve(def, createMockContext())).toBe('internal_dashboard');
  });
  it('resolvePayload includes action data', () => {
    const def = createMockDefinition();
    const payload = resolver.resolvePayload(def, createMockContext());
    expect(payload.actionId).toBe(def.id);
    expect(payload.actionType).toBe(def.actionType);
    expect(payload.widgetId).toBe(def.widgetId);
  });
  it('resolveTarget returns target', () => {
    const def = createMockDefinition({ routing: { route: 'execution_engine', target: 'engine_v2' } });
    expect(resolver.resolveTarget(def)).toBe('engine_v2');
  });
});

// ── Action Dispatcher ────────────────────────────────────────

describe('ActionDispatcher', () => {
  let dispatcher: ActionDispatcher;
  beforeEach(() => { dispatcher = new ActionDispatcher(createDefaultActionConfiguration().routingRules); });

  it('dispatches to route handler', async () => {
    dispatcher.registerRouteHandler('execution_engine', async (def) => ({
      actionId: def.id,
      success: true,
      route: 'execution_engine',
      data: { result: 'done' },
      error: null,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    }));
    const def = createMockDefinition();
    const result = await dispatcher.dispatch(def, createMockContext(), 'execution_engine');
    expect(result.success).toBe(true);
    expect(result.route).toBe('execution_engine');
  });
  it('dispatches to action handler first', async () => {
    dispatcher.registerRouteHandler('execution_engine', async (def) => ({
      actionId: def.id, success: true, route: 'execution_engine', data: 'route', error: null, durationMs: 0, timestamp: new Date().toISOString(),
    }));
    dispatcher.registerActionHandler(def_id(), async () => ({
      actionId: def_id(), success: true, route: 'execution_engine', data: 'action', error: null, durationMs: 0, timestamp: new Date().toISOString(),
    }));
    const def = createMockDefinition({ id: def_id() });
    const result = await dispatcher.dispatch(def, createMockContext(), 'execution_engine');
    expect(result.data).toBe('action');
  });
  it('returns pending result when no handler', async () => {
    const def = createMockDefinition();
    const result = await dispatcher.dispatch(def, createMockContext(), 'reports');
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('message');
  });
  it('catches handler errors', async () => {
    dispatcher.registerRouteHandler('execution_engine', async () => { throw new Error('boom'); });
    const def = createMockDefinition();
    const result = await dispatcher.dispatch(def, createMockContext(), 'execution_engine');
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
  it('hasRouteHandler checks registration', () => {
    dispatcher.registerRouteHandler('execution_engine', async () => ({
      actionId: '', success: true, route: 'execution_engine', data: null, error: null, durationMs: 0, timestamp: '',
    }));
    expect(dispatcher.hasRouteHandler('execution_engine')).toBe(true);
    expect(dispatcher.hasRouteHandler('scheduler')).toBe(false);
  });
  it('unregisterRouteHandler removes handler', () => {
    dispatcher.registerRouteHandler('execution_engine', async () => ({
      actionId: '', success: true, route: 'execution_engine', data: null, error: null, durationMs: 0, timestamp: '',
    }));
    dispatcher.unregisterRouteHandler('execution_engine');
    expect(dispatcher.hasRouteHandler('execution_engine')).toBe(false);
  });
  it('clear removes all handlers', () => {
    dispatcher.registerRouteHandler('execution_engine', async () => ({
      actionId: '', success: true, route: 'execution_engine', data: null, error: null, durationMs: 0, timestamp: '',
    }));
    dispatcher.clear();
    expect(dispatcher.hasRouteHandler('execution_engine')).toBe(false);
  });

  function def_id() { return 'dispatch_test_1'; }
});

// ── Action Factory ───────────────────────────────────────────

describe('ActionFactory', () => {
  it('createDefinition generates id', () => {
    const def = ActionFactory.createDefinition('optimize_now', 'w1', 'health_score');
    expect(def.id).toContain('action_optimize_now_w1');
    expect(def.title).toBe('Optimize Now');
  });
  it('createDefinitionWithId uses provided id', () => {
    const def = ActionFactory.createDefinitionWithId('custom_id', 'refresh', 'w1', 'health_score');
    expect(def.id).toBe('custom_id');
  });
  it('createExplanation fills defaults', () => {
    const exp = ActionFactory.createExplanation({ whyExists: 'test' });
    expect(exp.whyExists).toBe('test');
    expect(exp.confidence).toBe(0);
    expect(exp.rollbackAvailable).toBe(false);
  });
  it('createRouting creates routing object', () => {
    const routing = ActionFactory.createRouting('execution_engine', 'engine_v2', { key: 'val' });
    expect(routing.route).toBe('execution_engine');
    expect(routing.target).toBe('engine_v2');
    expect(routing.payload?.key).toBe('val');
  });
});

// ── Base Action ──────────────────────────────────────────────

describe('BaseAction', () => {
  it('starts in available state', () => {
    class TestAction extends BaseAction {
      async execute(): Promise<ActionResult> {
        return { actionId: this.id, success: true, route: 'internal_dashboard', data: null, error: null, durationMs: 0, timestamp: new Date().toISOString() };
      }
    }
    const action = new TestAction(createMockDefinition());
    expect(action.state).toBe('available');
    expect(action.isAvailable).toBe(true);
  });
  it('cancel changes state from executing', () => {
    class TestAction extends BaseAction {
      async execute(): Promise<ActionResult> {
        return { actionId: this.id, success: true, route: 'internal_dashboard', data: null, error: null, durationMs: 0, timestamp: new Date().toISOString() };
      }
    }
    const action = new TestAction(createMockDefinition());
    action['setState']('executing');
    action.cancel();
    expect(action.state).toBe('cancelled');
  });
  it('reset returns to available', () => {
    class TestAction extends BaseAction {
      async execute(): Promise<ActionResult> {
        return { actionId: this.id, success: true, route: 'internal_dashboard', data: null, error: null, durationMs: 0, timestamp: new Date().toISOString() };
      }
    }
    const action = new TestAction(createMockDefinition());
    action['setState']('failed', 'some error');
    action.reset();
    expect(action.state).toBe('available');
    expect(action.error).toBeNull();
  });
  it('getExplanation returns definition explanation', () => {
    class TestAction extends BaseAction {
      async execute(): Promise<ActionResult> {
        return { actionId: this.id, success: true, route: 'internal_dashboard', data: null, error: null, durationMs: 0, timestamp: new Date().toISOString() };
      }
    }
    const exp = { whyExists: 'because', expectedBenefits: 'faster', estimatedTime: 30, estimatedImpact: 'high', confidence: 0.9, rollbackAvailable: true, relatedRecommendations: [], relatedPredictions: [] };
    const action = new TestAction(createMockDefinition({ explanation: exp }));
    expect(action.getExplanation()?.whyExists).toBe('because');
  });
});

// ── Action Manager ───────────────────────────────────────────

describe('ActionManager', () => {
  let manager: ActionManager;
  beforeEach(() => { manager = new ActionManager(); });

  it('registerAction adds to registry', () => {
    const def = createMockDefinition();
    expect(manager.registerAction(def)).toBe(true);
    expect(manager.getActionDefinition(def.id)).toBeDefined();
  });
  it('registerAction rejects invalid definition', () => {
    expect(manager.registerAction(createMockDefinition({ id: '' }))).toBe(false);
  });
  it('registerAction rejects duplicate', () => {
    const def = createMockDefinition();
    manager.registerAction(def);
    expect(manager.registerAction(def)).toBe(false);
  });
  it('unregisterAction removes', () => {
    const def = createMockDefinition();
    manager.registerAction(def);
    expect(manager.unregisterAction(def.id)).toBe(true);
    expect(manager.getActionDefinition(def.id)).toBeUndefined();
  });
  it('executeAction returns success for valid action', async () => {
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    const result = await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(result.success).toBe(true);
  });
  it('executeAction fails for unknown action', async () => {
    const result = await manager.executeAction('unknown', createMockContext());
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
  it('executeAction fails for permission denied', async () => {
    const def = createMockDefinition({ requiresSubscription: 'PRO' });
    manager.registerAction(def);
    const result = await manager.executeAction(def.id, createMockContext({ actionId: def.id, userPlan: 'FREE' }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });
  it('executeAction emits events', async () => {
    let registered = false, selected = false, validated = false, dispatched = false, completed = false;
    manager.on('action_registered', () => { registered = true; });
    manager.on('action_selected', () => { selected = true; });
    manager.on('action_validated', () => { validated = true; });
    manager.on('action_dispatched', () => { dispatched = true; });
    manager.on('action_completed', () => { completed = true; });
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(registered).toBe(true);
    expect(selected).toBe(true);
    expect(validated).toBe(true);
    expect(dispatched).toBe(true);
    expect(completed).toBe(true);
  });
  it('executeAction emits failed event on permission error', async () => {
    let failed = false;
    manager.on('action_failed', () => { failed = true; });
    const def = createMockDefinition({ requiresSubscription: 'PRO' });
    manager.registerAction(def);
    await manager.executeAction(def.id, createMockContext({ actionId: def.id, userPlan: 'FREE' }));
    expect(failed).toBe(true);
  });
  it('validateAction returns valid for correct action', () => {
    const def = createMockDefinition();
    manager.registerAction(def);
    const result = manager.validateAction(def.id, createMockContext({ actionId: def.id }));
    expect(result.valid).toBe(true);
  });
  it('validateAction fails for unknown action', () => {
    const result = manager.validateAction('unknown', createMockContext());
    expect(result.valid).toBe(false);
  });
  it('checkPermissions returns allowed', () => {
    const def = createMockDefinition();
    manager.registerAction(def);
    const result = manager.checkPermissions(def.id, createMockContext({ actionId: def.id }));
    expect(result.allowed).toBe(true);
  });
  it('getAvailableActions returns available', () => {
    manager.registerAction(createMockDefinition({ id: 'a1' }));
    manager.registerAction(createMockDefinition({ id: 'a2' }));
    expect(manager.getAvailableActions().length).toBe(2);
  });
  it('getAvailableActions filters by widget', () => {
    manager.registerAction(createMockDefinition({ id: 'a1', widgetId: 'w1' }));
    manager.registerAction(createMockDefinition({ id: 'a2', widgetId: 'w2' }));
    expect(manager.getAvailableActions('w1').length).toBe(1);
  });
  it('getActionHistory returns entries', async () => {
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(manager.getActionHistory().length).toBeGreaterThan(0);
  });
  it('getActionStatistics returns stats', () => {
    manager.registerAction(createMockDefinition({ id: 'a1' }));
    const stats = manager.getActionStatistics();
    expect(stats.totalActions).toBe(1);
  });
  it('getActionState returns current state', async () => {
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(manager.getActionState(def.id)).toBe('completed');
  });
  it('updateConfig updates rules', () => {
    manager.updateConfig({ enableEvents: false });
    expect(manager.config.enableEvents).toBe(false);
  });
  it('registerRouteHandler allows custom routing', async () => {
    manager.registerRouteHandler('execution_engine', async (def) => ({
      actionId: def.id, success: true, route: 'execution_engine', data: 'custom', error: null, durationMs: 0, timestamp: new Date().toISOString(),
    }));
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false, routing: { route: 'execution_engine' } });
    manager.registerAction(def);
    const result = await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(result.data).toBe('custom');
  });
  it('clear resets all', async () => {
    const def = createMockDefinition();
    manager.registerAction(def);
    manager.clear();
    expect(manager.getAvailableActions().length).toBe(0);
  });
  it('respects maxActionsPerWidget', () => {
    const cfg = createActionConfiguration({ maxActionsPerWidget: 2 });
    const m = new ActionManager(cfg);
    expect(m.registerAction(createMockDefinition({ id: 'a1' }))).toBe(true);
    expect(m.registerAction(createMockDefinition({ id: 'a2' }))).toBe(true);
    expect(m.registerAction(createMockDefinition({ id: 'a3' }))).toBe(false);
  });
  it('getTelemetryStatistics returns data', async () => {
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    const stats = manager.getTelemetryStatistics();
    expect(stats.totalInvocations).toBeGreaterThan(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.ActionManager).toBeDefined();
    expect(module.ActionRegistry).toBeDefined();
    expect(module.ActionFactory).toBeDefined();
    expect(module.ActionResolver).toBeDefined();
    expect(module.ActionDispatcher).toBeDefined();
    expect(module.ActionValidator).toBeDefined();
    expect(module.ActionPermissionManager).toBeDefined();
    expect(module.ActionTelemetry).toBeDefined();
    expect(module.ActionHistory).toBeDefined();
    expect(module.ActionEvents).toBeDefined();
    expect(module.BaseAction).toBeDefined();
    expect(module.DEFAULT_ACTION_CONFIGURATION).toBeDefined();
    expect(module.createActionConfiguration).toBeDefined();
  });
  it('full lifecycle: register → validate → execute → history', async () => {
    const manager = new ActionManager();
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    const ctx = createMockContext({ actionId: def.id });
    const valResult = manager.validateAction(def.id, ctx);
    expect(valResult.valid).toBe(true);
    const execResult = await manager.executeAction(def.id, ctx);
    expect(execResult.success).toBe(true);
    expect(manager.getActionHistory().length).toBeGreaterThan(0);
    expect(manager.getActionState(def.id)).toBe('completed');
  });
  it('widgets never execute business logic directly', async () => {
    const manager = new ActionManager();
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    const result = await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(result.route).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('action validation under 20ms', () => {
    const manager = new ActionManager();
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    const ctx = createMockContext({ actionId: def.id });
    const start = performance.now();
    manager.validateAction(def.id, ctx);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(20);
  });
  it('routing under 10ms', () => {
    const resolver = new ActionResolver(createDefaultActionConfiguration().routingRules);
    const def = createMockDefinition();
    const ctx = createMockContext();
    const start = performance.now();
    resolver.resolve(def, ctx);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('executeAction without register returns error', async () => {
    const manager = new ActionManager();
    const result = await manager.executeAction('unknown', createMockContext());
    expect(result.success).toBe(false);
  });
  it('registerAction with max reached returns false', () => {
    const cfg = createActionConfiguration({ maxActionsPerWidget: 1 });
    const manager = new ActionManager(cfg);
    manager.registerAction(createMockDefinition({ id: 'a1' }));
    expect(manager.registerAction(createMockDefinition({ id: 'a2' }))).toBe(false);
  });
  it('events disabled does not emit', async () => {
    let emitted = false;
    const cfg = createActionConfiguration({ enableEvents: false });
    const manager = new ActionManager(cfg);
    manager.on('action_registered', () => { emitted = true; });
    manager.registerAction(createMockDefinition());
    expect(emitted).toBe(false);
  });
  it('feature flag blocks action type', async () => {
    const cfg = createActionConfiguration({ featureFlags: { enableOptimizeNow: false, enableQuickOptimize: true, enableExplain: true, enableCompare: true, enableRollback: true, enableShareReport: true, enableExport: true, enableScheduling: true, futureFlags: {} } });
    const manager = new ActionManager(cfg);
    const def = createMockDefinition({ actionType: 'optimize_now', requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    const result = await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });
  it('action handler error is caught', async () => {
    const manager = new ActionManager();
    manager.registerRouteHandler('internal_dashboard', async () => { throw new Error('handler crash'); });
    const def = createMockDefinition({ requiresConfirmation: false, requiresPermission: false });
    manager.registerAction(def);
    const result = await manager.executeAction(def.id, createMockContext({ actionId: def.id }));
    expect(result.success).toBe(false);
    expect(result.error).toBe('handler crash');
    expect(manager.getActionState(def.id)).toBe('failed');
  });
  it('clear resets everything', () => {
    const manager = new ActionManager();
    manager.registerAction(createMockDefinition());
    manager.clear();
    expect(manager.getAvailableActions().length).toBe(0);
    expect(manager.getActionHistory().length).toBe(0);
  });
});
