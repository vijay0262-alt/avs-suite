/**
 * Tests for the Dashboard Widget Framework.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  WidgetDefinitionEx,
  WidgetProvider,
  WidgetActionContext,
} from '../types';
import {
  generateWidgetInstanceId,
  getLifecycleStateLabel,
  getRuntimeStateLabel,
  getRefreshStrategyLabel,
  createAction,
  createTelemetryData,
} from '../types';
import { WidgetEventEmitter } from '../widgetEvents';
import {
  DEFAULT_WIDGET_FRAMEWORK_CONFIG,
  createWidgetFrameworkConfig,
} from '../widgetConfiguration';
import { WidgetRegistry } from '../widgetRegistry';
import { WidgetActionRegistry } from '../widgetActionRegistry';
import { WidgetPermissionManager } from '../widgetPermissionManager';
import { WidgetTelemetry } from '../widgetTelemetry';
import { WidgetStateManager } from '../widgetStateManager';
import { WidgetLifecycleManager } from '../widgetLifecycleManager';
import { WidgetValidator } from '../widgetValidator';
import { BaseWidget } from '../baseWidget';
import { GenericWidget } from '../widgetFactory';
import { WidgetManager } from '../widgetManager';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockProvider(data: unknown = { score: 85 }): WidgetProvider {
  return {
    initialize: async () => {},
    load: async () => data,
    refresh: async () => Object.assign({}, data, { refreshed: true }),
    dispose: async () => {},
    validate: () => true,
  };
}

function createErrorProvider(errorMsg: string = 'load failed'): WidgetProvider {
  return {
    initialize: async () => {},
    load: async () => { throw new Error(errorMsg); },
    refresh: async () => { throw new Error(errorMsg); },
    dispose: async () => {},
    validate: () => true,
  };
}

function createMockWidgetDef(overrides: Partial<WidgetDefinitionEx> = {}): WidgetDefinitionEx {
  return {
    type: 'health_score',
    title: 'Health Score',
    subtitle: 'PC health at a glance',
    description: 'Shows overall PC health score',
    icon: 'heart',
    category: 'health',
    size: 'medium',
    priority: 'critical',
    visibility: 'visible',
    refreshStrategy: 'on_visibility',
    refreshIntervalMs: 30000,
    providerFactory: () => createMockProvider(),
    permissions: { minPlan: 'FREE', requiredFeatures: [], requiresQuota: false, futurePolicies: {} },
    capabilities: [],
    actions: [],
    futureMetadata: {},
    ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateWidgetInstanceId returns unique IDs', () => {
    const a = generateWidgetInstanceId('health_score');
    const b = generateWidgetInstanceId('health_score');
    expect(a).not.toBe(b);
    expect(a).toContain('wi_');
  });
  it('getLifecycleStateLabel returns correct labels', () => {
    expect(getLifecycleStateLabel('registered')).toBe('Registered');
    expect(getLifecycleStateLabel('initialized')).toBe('Initialized');
    expect(getLifecycleStateLabel('loading')).toBe('Loading');
    expect(getLifecycleStateLabel('loaded')).toBe('Loaded');
    expect(getLifecycleStateLabel('disposed')).toBe('Disposed');
    expect(getLifecycleStateLabel('error')).toBe('Error');
  });
  it('getRuntimeStateLabel returns correct labels', () => {
    expect(getRuntimeStateLabel('idle')).toBe('Idle');
    expect(getRuntimeStateLabel('loading')).toBe('Loading');
    expect(getRuntimeStateLabel('ready')).toBe('Ready');
    expect(getRuntimeStateLabel('error')).toBe('Error');
    expect(getRuntimeStateLabel('permission_denied')).toBe('Permission Denied');
  });
  it('getRefreshStrategyLabel returns correct labels', () => {
    expect(getRefreshStrategyLabel('manual')).toBe('Manual');
    expect(getRefreshStrategyLabel('automatic')).toBe('Automatic');
    expect(getRefreshStrategyLabel('real_time')).toBe('Real-time');
    expect(getRefreshStrategyLabel('on_visibility')).toBe('On Visibility');
  });
  it('createAction creates action with defaults', () => {
    const action = createAction('act1', 'refresh', 'Refresh');
    expect(action.id).toBe('act1');
    expect(action.type).toBe('refresh');
    expect(action.label).toBe('Refresh');
    expect(action.enabled).toBe(true);
  });
  it('createAction creates action with handler', () => {
    const handler = vi.fn();
    const action = createAction('act1', 'open_details', 'Details', 'icon', handler);
    expect(action.handler).toBe(handler);
  });
  it('createTelemetryData returns zeroed data', () => {
    const data = createTelemetryData();
    expect(data.loadTimeMs).toBe(0);
    expect(data.errorCount).toBe(0);
    expect(data.interactionCount).toBe(0);
    expect(data.actionUsage).toEqual({});
  });
});

// ── Events ───────────────────────────────────────────────────

describe('WidgetEventEmitter', () => {
  let e: WidgetEventEmitter;
  beforeEach(() => { e = new WidgetEventEmitter(); });

  it('emits events', () => {
    let received = false;
    e.on('widget_loaded', () => { received = true; });
    e.emit('widget_loaded', {
      widgetId: 'w1', widgetType: 'health_score', eventType: 'widget_loaded', timestamp: new Date().toISOString(),
    });
    expect(received).toBe(true);
  });
  it('supports unsubscribe', () => {
    let count = 0;
    const unsub = e.on('widget_initialized', () => { count++; });
    e.emit('widget_initialized', { widgetId: 'w1', widgetType: 'health_score', eventType: 'widget_initialized', timestamp: new Date().toISOString() });
    unsub();
    e.emit('widget_initialized', { widgetId: 'w1', widgetType: 'health_score', eventType: 'widget_initialized', timestamp: new Date().toISOString() });
    expect(count).toBe(1);
  });
  it('tracks listener count', () => {
    e.on('widget_loaded', () => {});
    expect(e.listenerCount('widget_loaded')).toBe(1);
    expect(e.listenerCount('widget_error')).toBe(0);
  });
  it('clear removes all', () => {
    e.on('widget_loaded', () => {});
    e.clear();
    expect(e.listenerCount('widget_loaded')).toBe(0);
  });
  it('does not crash on listener error', () => {
    e.on('widget_loaded', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.emit('widget_loaded', { widgetId: 'w1', widgetType: 'health_score', eventType: 'widget_loaded', timestamp: new Date().toISOString() });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('supports all 8 event types', () => {
    const events = [
      'widget_registered', 'widget_initialized', 'widget_loaded',
      'widget_refreshed', 'widget_action_invoked', 'widget_hidden',
      'widget_disposed', 'widget_error',
    ] as const;
    for (const evt of events) {
      let received = false;
      e.on(evt, () => { received = true; });
      e.emit(evt, { widgetId: 'w1', widgetType: 'health_score', eventType: evt, timestamp: new Date().toISOString() });
      expect(received).toBe(true);
      e.clear();
    }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('WidgetConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_WIDGET_FRAMEWORK_CONFIG.frameworkVersion).toBe('1.0.0');
    expect(DEFAULT_WIDGET_FRAMEWORK_CONFIG.lifecycleRules.autoInitialize).toBe(true);
    expect(DEFAULT_WIDGET_FRAMEWORK_CONFIG.telemetryRules.enabled).toBe(true);
  });
  it('createWidgetFrameworkConfig accepts overrides', () => {
    const cfg = createWidgetFrameworkConfig({ frameworkVersion: '2.0.0' });
    expect(cfg.frameworkVersion).toBe('2.0.0');
  });
  it('merges nested lifecycleRules', () => {
    const cfg = createWidgetFrameworkConfig({ lifecycleRules: { maxRetries: 5 } });
    expect(cfg.lifecycleRules.maxRetries).toBe(5);
    expect(cfg.lifecycleRules.autoInitialize).toBe(true);
  });
  it('merges nested refreshRules', () => {
    const cfg = createWidgetFrameworkConfig({ refreshRules: { defaultIntervalMs: 60000 } });
    expect(cfg.refreshRules.defaultIntervalMs).toBe(60000);
  });
  it('merges nested telemetryRules', () => {
    const cfg = createWidgetFrameworkConfig({ telemetryRules: { enabled: false } });
    expect(cfg.telemetryRules.enabled).toBe(false);
  });
  it('merges nested permissionRules', () => {
    const cfg = createWidgetFrameworkConfig({ permissionRules: { strictMode: true } });
    expect(cfg.permissionRules.strictMode).toBe(true);
  });
  it('merges featureFlags', () => {
    const cfg = createWidgetFrameworkConfig({ featureFlags: { custom_flag: true } });
    expect(cfg.featureFlags['custom_flag']).toBe(true);
  });
});

// ── Widget Registry ──────────────────────────────────────────

describe('WidgetRegistry', () => {
  let r: WidgetRegistry;
  beforeEach(() => { r = new WidgetRegistry(); });

  it('registers widget definition', () => {
    expect(r.register(createMockWidgetDef())).toBe(true);
    expect(r.count).toBe(1);
  });
  it('rejects duplicate type', () => {
    r.register(createMockWidgetDef());
    expect(r.register(createMockWidgetDef())).toBe(false);
  });
  it('unregisters widget', () => {
    r.register(createMockWidgetDef());
    expect(r.unregister('health_score')).toBe(true);
    expect(r.count).toBe(0);
  });
  it('gets widget definition', () => {
    r.register(createMockWidgetDef());
    expect(r.get('health_score')).toBeDefined();
  });
  it('has checks existence', () => {
    r.register(createMockWidgetDef());
    expect(r.has('health_score')).toBe(true);
    expect(r.has('storage_summary')).toBe(false);
  });
  it('getAll returns all', () => {
    r.register(createMockWidgetDef({ type: 'health_score' }));
    r.register(createMockWidgetDef({ type: 'storage_summary' }));
    expect(r.getAll().length).toBe(2);
  });
  it('filters by category', () => {
    r.register(createMockWidgetDef({ type: 'health_score', category: 'health' }));
    r.register(createMockWidgetDef({ type: 'storage_summary', category: 'system' }));
    expect(r.getByCategory('health').length).toBe(1);
  });
  it('filters by priority', () => {
    r.register(createMockWidgetDef({ type: 'health_score', priority: 'critical' }));
    r.register(createMockWidgetDef({ type: 'storage_summary', priority: 'low' }));
    expect(r.getByPriority('critical').length).toBe(1);
  });
  it('clear removes all', () => {
    r.register(createMockWidgetDef());
    r.clear();
    expect(r.count).toBe(0);
  });
});

// ── Action Registry ──────────────────────────────────────────

describe('WidgetActionRegistry', () => {
  let r: WidgetActionRegistry;
  beforeEach(() => { r = new WidgetActionRegistry(); });

  it('registers action', () => {
    expect(r.registerAction(createAction('act1', 'refresh', 'Refresh'))).toBe(true);
    expect(r.count).toBe(1);
  });
  it('rejects duplicate id', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    expect(r.registerAction(createAction('act1', 'refresh', 'Refresh'))).toBe(false);
  });
  it('unregisters action', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    expect(r.unregisterAction('act1')).toBe(true);
    expect(r.count).toBe(0);
  });
  it('gets action', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    expect(r.getAction('act1')).toBeDefined();
  });
  it('gets actions by type', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    r.registerAction(createAction('act2', 'open_details', 'Details'));
    expect(r.getActionsByType('refresh').length).toBe(1);
  });
  it('invokes action with handler', () => {
    const handler = vi.fn();
    r.registerAction(createAction('act1', 'refresh', 'Refresh', '', handler));
    const ctx: WidgetActionContext = { widgetId: 'w1', widgetType: 'health_score', data: null, options: {} };
    expect(r.invokeAction('act1', ctx)).toBe(true);
    expect(handler).toHaveBeenCalledWith(ctx);
  });
  it('invoke fails for disabled action', () => {
    const handler = vi.fn();
    const action = createAction('act1', 'refresh', 'Refresh', '', handler);
    action.enabled = false;
    r.registerAction(action);
    const ctx: WidgetActionContext = { widgetId: 'w1', widgetType: 'health_score', data: null, options: {} };
    expect(r.invokeAction('act1', ctx)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
  it('invoke fails for missing handler', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    const ctx: WidgetActionContext = { widgetId: 'w1', widgetType: 'health_score', data: null, options: {} };
    expect(r.invokeAction('act1', ctx)).toBe(false);
  });
  it('enable/disable action', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    r.disableAction('act1');
    expect(r.getAction('act1')!.enabled).toBe(false);
    r.enableAction('act1');
    expect(r.getAction('act1')!.enabled).toBe(true);
  });
  it('clear removes all', () => {
    r.registerAction(createAction('act1', 'refresh', 'Refresh'));
    r.clear();
    expect(r.count).toBe(0);
  });
});

// ── Permission Manager ───────────────────────────────────────

describe('WidgetPermissionManager', () => {
  let pm: WidgetPermissionManager;
  beforeEach(() => { pm = new WidgetPermissionManager(DEFAULT_WIDGET_FRAMEWORK_CONFIG); });

  it('allows FREE widget for FREE user', () => {
    const result = pm.checkPermissions(createMockWidgetDef(), 'FREE', [], true);
    expect(result.valid).toBe(true);
  });
  it('denies ENTERPRISE widget for FREE user', () => {
    const def = createMockWidgetDef({
      permissions: { minPlan: 'ENTERPRISE', requiredFeatures: [], requiresQuota: false, futurePolicies: {} },
    });
    const result = pm.checkPermissions(def, 'FREE', [], true);
    expect(result.valid).toBe(false);
  });
  it('denies missing capability', () => {
    const def = createMockWidgetDef({ capabilities: ['ai_insights'] });
    const result = pm.checkPermissions(def, 'FREE', [], true);
    expect(result.valid).toBe(false);
  });
  it('allows with correct capabilities', () => {
    const def = createMockWidgetDef({ capabilities: ['ai_insights'] });
    const result = pm.checkPermissions(def, 'FREE', ['ai_insights'], true);
    expect(result.valid).toBe(true);
  });
  it('denies no quota when required', () => {
    const def = createMockWidgetDef({
      permissions: { minPlan: 'FREE', requiredFeatures: [], requiresQuota: true, futurePolicies: {} },
    });
    const result = pm.checkPermissions(def, 'FREE', [], false);
    expect(result.valid).toBe(false);
  });
  it('allows with quota', () => {
    const def = createMockWidgetDef({
      permissions: { minPlan: 'FREE', requiredFeatures: [], requiresQuota: true, futurePolicies: {} },
    });
    const result = pm.checkPermissions(def, 'FREE', [], true);
    expect(result.valid).toBe(true);
  });
  it('denies disabled feature flag', () => {
    const cfg = createWidgetFrameworkConfig({ featureFlags: { ai_insights: false } });
    pm.updateConfig(cfg);
    const def = createMockWidgetDef({
      permissions: { minPlan: 'FREE', requiredFeatures: ['ai_insights'], requiresQuota: false, futurePolicies: {} },
    });
    const result = pm.checkPermissions(def, 'FREE', ['ai_insights'], true);
    expect(result.valid).toBe(false);
  });
  it('canAccess returns boolean', () => {
    expect(pm.canAccess(createMockWidgetDef(), 'FREE', [], true)).toBe(true);
  });
});

// ── Telemetry ────────────────────────────────────────────────

describe('WidgetTelemetry', () => {
  let t: WidgetTelemetry;
  beforeEach(() => { t = new WidgetTelemetry(DEFAULT_WIDGET_FRAMEWORK_CONFIG); });

  it('initWidget creates telemetry data', () => {
    t.initWidget('w1');
    expect(t.getWidgetTelemetry('w1')).toBeDefined();
  });
  it('records load time', () => {
    t.initWidget('w1');
    t.recordLoad('w1', 150);
    expect(t.getWidgetTelemetry('w1')!.loadTimeMs).toBe(150);
  });
  it('records refresh time', () => {
    t.initWidget('w1');
    t.recordRefresh('w1', 50);
    expect(t.getWidgetTelemetry('w1')!.refreshTimeMs).toBe(50);
  });
  it('records errors', () => {
    t.initWidget('w1');
    t.recordError('w1');
    t.recordError('w1');
    expect(t.getWidgetTelemetry('w1')!.errorCount).toBe(2);
  });
  it('records interactions', () => {
    t.initWidget('w1');
    t.recordInteraction('w1');
    expect(t.getWidgetTelemetry('w1')!.interactionCount).toBe(1);
  });
  it('records action usage', () => {
    t.initWidget('w1');
    t.recordActionUsage('w1', 'refresh');
    t.recordActionUsage('w1', 'refresh');
    expect(t.getWidgetTelemetry('w1')!.actionUsage['refresh']).toBe(2);
  });
  it('records visibility changes', () => {
    t.initWidget('w1');
    t.recordVisibilityChange('w1', true);
    expect(t.getWidgetTelemetry('w1')!.visibilityChanges).toBe(1);
    expect(t.getWidgetTelemetry('w1')!.lastVisibleAt).not.toBeNull();
  });
  it('records performance metrics', () => {
    t.initWidget('w1');
    t.recordPerformance('w1', 'renderTime', 16);
    expect(t.getWidgetTelemetry('w1')!.performanceMetrics['renderTime']).toBe(16);
  });
  it('tracks aggregate averages', () => {
    t.initWidget('w1');
    t.initWidget('w2');
    t.recordLoad('w1', 100);
    t.recordLoad('w2', 200);
    expect(t.averageLoadTimeMs).toBe(150);
  });
  it('tracks total errors', () => {
    t.initWidget('w1');
    t.initWidget('w2');
    t.recordError('w1');
    t.recordError('w2');
    expect(t.totalErrors).toBe(2);
  });
  it('respects disabled telemetry', () => {
    const cfg = createWidgetFrameworkConfig({ telemetryRules: { enabled: false } } as never);
    const t2 = new WidgetTelemetry(cfg);
    t2.initWidget('w1');
    t2.recordLoad('w1', 100);
    expect(t2.getWidgetTelemetry('w1')).toBeUndefined();
  });
  it('removeWidget removes telemetry', () => {
    t.initWidget('w1');
    t.removeWidget('w1');
    expect(t.getWidgetTelemetry('w1')).toBeUndefined();
  });
  it('clear resets all', () => {
    t.initWidget('w1');
    t.recordLoad('w1', 100);
    t.clear();
    expect(t.getWidgetTelemetry('w1')).toBeUndefined();
    expect(t.averageLoadTimeMs).toBe(0);
  });
});

// ── State Manager ────────────────────────────────────────────

describe('WidgetStateManager', () => {
  let sm: WidgetStateManager;
  beforeEach(() => { sm = new WidgetStateManager(); });

  it('initWidget creates idle state', () => {
    sm.initWidget('w1');
    expect(sm.getState('w1')).toBe('idle');
  });
  it('setState transitions state', () => {
    sm.initWidget('w1');
    sm.setState('w1', 'loading');
    expect(sm.getState('w1')).toBe('loading');
  });
  it('setState with message', () => {
    sm.initWidget('w1');
    sm.setState('w1', 'error', 'Something went wrong');
    expect(sm.getEntry('w1')!.message).toBe('Something went wrong');
  });
  it('incrementRetry', () => {
    sm.initWidget('w1');
    sm.incrementRetry('w1');
    sm.incrementRetry('w1');
    expect(sm.getEntry('w1')!.retryCount).toBe(2);
  });
  it('resetRetry', () => {
    sm.initWidget('w1');
    sm.incrementRetry('w1');
    sm.resetRetry('w1');
    expect(sm.getEntry('w1')!.retryCount).toBe(0);
  });
  it('getWidgetsByState', () => {
    sm.initWidget('w1');
    sm.initWidget('w2');
    sm.setState('w1', 'ready');
    sm.setState('w2', 'error');
    expect(sm.getWidgetsByState('ready')).toEqual(['w1']);
    expect(sm.getWidgetsByState('error')).toEqual(['w2']);
  });
  it('removeWidget', () => {
    sm.initWidget('w1');
    sm.removeWidget('w1');
    expect(sm.getState('w1')).toBeUndefined();
  });
  it('clear', () => {
    sm.initWidget('w1');
    sm.clear();
    expect(sm.count).toBe(0);
  });
});

// ── Lifecycle Manager ────────────────────────────────────────

describe('WidgetLifecycleManager', () => {
  let lm: WidgetLifecycleManager;
  beforeEach(() => { lm = new WidgetLifecycleManager(); });

  it('initWidget creates registered state', () => {
    lm.initWidget('w1');
    expect(lm.getLifecycle('w1')).toBe('registered');
  });
  it('valid transition registered→initialized', () => {
    lm.initWidget('w1');
    expect(lm.transition('w1', 'initialized')).toBe(true);
    expect(lm.getLifecycle('w1')).toBe('initialized');
  });
  it('valid transition initialized→loading', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'initialized');
    expect(lm.transition('w1', 'loading')).toBe(true);
  });
  it('valid transition loading→loaded', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'initialized');
    lm.transition('w1', 'loading');
    expect(lm.transition('w1', 'loaded')).toBe(true);
  });
  it('valid transition loaded→refreshing', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'initialized');
    lm.transition('w1', 'loading');
    lm.transition('w1', 'loaded');
    expect(lm.transition('w1', 'refreshing')).toBe(true);
  });
  it('valid transition to disposed from multiple states', () => {
    lm.initWidget('w1');
    expect(lm.transition('w1', 'disposed')).toBe(true);
  });
  it('invalid transition disposed→loading', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'disposed');
    expect(lm.transition('w1', 'loading')).toBe(false);
  });
  it('tracks history', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'initialized');
    lm.transition('w1', 'loading');
    expect(lm.getHistory('w1')).toEqual(['registered', 'initialized', 'loading']);
  });
  it('isAlive returns true for non-disposed', () => {
    lm.initWidget('w1');
    expect(lm.isAlive('w1')).toBe(true);
  });
  it('isAlive returns false for disposed', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'disposed');
    expect(lm.isAlive('w1')).toBe(false);
  });
  it('isDisposed', () => {
    lm.initWidget('w1');
    lm.transition('w1', 'disposed');
    expect(lm.isDisposed('w1')).toBe(true);
  });
  it('removeWidget', () => {
    lm.initWidget('w1');
    lm.removeWidget('w1');
    expect(lm.getLifecycle('w1')).toBeUndefined();
  });
  it('clear', () => {
    lm.initWidget('w1');
    lm.clear();
    expect(lm.count).toBe(0);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('WidgetValidator', () => {
  let v: WidgetValidator;
  beforeEach(() => { v = new WidgetValidator(DEFAULT_WIDGET_FRAMEWORK_CONFIG); });

  it('validates valid definition', () => {
    expect(v.validateDefinition(createMockWidgetDef()).valid).toBe(true);
  });
  it('fails for missing type', () => {
    const def = createMockWidgetDef();
    def.type = '' as never;
    expect(v.validateDefinition(def).valid).toBe(false);
  });
  it('fails for missing title', () => {
    const def = createMockWidgetDef();
    def.title = '';
    expect(v.validateDefinition(def).valid).toBe(false);
  });
  it('fails for missing provider factory', () => {
    const def = createMockWidgetDef();
    def.providerFactory = undefined as never;
    expect(v.validateDefinition(def).valid).toBe(false);
  });
  it('fails for negative refresh interval', () => {
    const def = createMockWidgetDef({ refreshIntervalMs: -1 });
    expect(v.validateDefinition(def).valid).toBe(false);
  });
  it('warns for action without label', () => {
    const def = createMockWidgetDef({
      actions: [createAction('a1', 'refresh', '')],
    });
    const result = v.validateDefinition(def);
    expect(result.issues.some((i) => i.code === 'ACTION_NO_LABEL')).toBe(true);
  });
  it('validates config', () => {
    expect(v.validateConfig().valid).toBe(true);
  });
  it('fails for invalid max concurrent', () => {
    const cfg = createWidgetFrameworkConfig({ lifecycleRules: { maxConcurrentLoads: 0 } });
    v.updateConfig(cfg);
    expect(v.validateConfig().valid).toBe(false);
  });
  it('validates provider', () => {
    const provider = createMockProvider();
    expect(v.validateProvider(provider).valid).toBe(true);
  });
  it('fails for invalid provider', () => {
    const provider = { validate: () => false };
    expect(v.validateProvider(provider).valid).toBe(false);
  });
});

// ── BaseWidget ───────────────────────────────────────────────

describe('BaseWidget (via GenericWidget)', () => {
  let mgr: WidgetManager;

  beforeEach(() => { mgr = new WidgetManager(); });

  it('initializes and loads data', async () => {
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createMockProvider({ score: 90 }),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(widget.getLifecycle()).toBe('loaded');
    expect(widget.getState()).toBe('ready');
    const instance = widget.getInstance();
    expect(instance.data).toEqual({ score: 90 });
  });
  it('handles load errors', async () => {
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createErrorProvider('boom'),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(widget.getLifecycle()).toBe('error');
    expect(widget.getState()).toBe('error');
    expect(widget.getInstance().error).toBe('boom');
  });
  it('refreshes data', async () => {
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createMockProvider({ score: 90 }),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    await widget.refresh();
    expect(widget.getLifecycle()).toBe('loaded');
    expect(widget.getState()).toBe('ready');
  });
  it('handles refresh errors', async () => {
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createErrorProvider('refresh failed'),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    await widget.refresh();
    expect(widget.getState()).toBe('error');
  });
  it('invokes actions', async () => {
    const handler = vi.fn();
    const action = createAction('act1', 'refresh', 'Refresh', '', handler);
    mgr.registerWidget(createMockWidgetDef({
      actions: [action],
      providerFactory: () => createMockProvider({ score: 90 }),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(widget.invokeAction('act1')).toBe(true);
    expect(handler).toHaveBeenCalled();
  });
  it('invokeAction fails for missing action', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    expect(widget.invokeAction('nonexistent')).toBe(false);
  });
  it('hide and show track visibility', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    widget.show();
    widget.hide();
    const telemetry = widget.getTelemetry();
    expect(telemetry!.visibilityChanges).toBe(2);
  });
  it('dispose transitions to disposed', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.dispose();
    expect(widget.getLifecycle()).toBe('disposed');
  });
  it('getInstance returns full instance', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    const instance = widget.getInstance();
    expect(instance.id).toBeDefined();
    expect(instance.definition.type).toBe('health_score');
    expect(instance.lifecycle).toBe('registered');
    expect(instance.state).toBe('idle');
  });
  it('empty data shows empty state', async () => {
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createMockProvider({}),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(widget.getState()).toBe('empty');
  });
  it('null data shows empty state', async () => {
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createMockProvider(null),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(widget.getState()).toBe('empty');
  });
  it('emits widget_initialized event', async () => {
    let initialized = false;
    mgr.events.on('widget_initialized', () => { initialized = true; });
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    expect(initialized).toBe(true);
  });
  it('emits widget_loaded event', async () => {
    let loaded = false;
    mgr.events.on('widget_loaded', () => { loaded = true; });
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(loaded).toBe(true);
  });
  it('emits widget_refreshed event', async () => {
    let refreshed = false;
    mgr.events.on('widget_refreshed', () => { refreshed = true; });
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    await widget.refresh();
    expect(refreshed).toBe(true);
  });
  it('emits widget_disposed event', async () => {
    let disposed = false;
    mgr.events.on('widget_disposed', () => { disposed = true; });
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.dispose();
    expect(disposed).toBe(true);
  });
  it('emits widget_error event on load error', async () => {
    let errored = false;
    mgr.events.on('widget_error', () => { errored = true; });
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createErrorProvider('fail'),
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    await widget.load();
    expect(errored).toBe(true);
  });
  it('emits widget_action_invoked event', async () => {
    let invoked = false;
    mgr.events.on('widget_action_invoked', () => { invoked = true; });
    const handler = vi.fn();
    mgr.registerWidget(createMockWidgetDef({
      actions: [createAction('act1', 'refresh', 'Refresh', '', handler)],
    }));
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    widget.invokeAction('act1');
    expect(invoked).toBe(true);
  });
});

// ── Widget Factory ───────────────────────────────────────────

describe('WidgetFactory', () => {
  let mgr: WidgetManager;

  beforeEach(() => { mgr = new WidgetManager(); });

  it('creates widget from registered definition', () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score');
    expect(widget).not.toBeNull();
    expect(widget!.definition.type).toBe('health_score');
  });
  it('returns null for unregistered type', () => {
    expect(mgr.createWidget('health_score')).toBeNull();
  });
  it('creates multiple widgets', () => {
    mgr.registerWidget(createMockWidgetDef({ type: 'health_score' }));
    mgr.registerWidget(createMockWidgetDef({ type: 'storage_summary' }));
    const w1 = mgr.createWidget('health_score');
    const w2 = mgr.createWidget('storage_summary');
    expect(w1).not.toBeNull();
    expect(w2).not.toBeNull();
  });
  it('uses custom constructor when registered', () => {
    class CustomWidget extends GenericWidget {
      readonly customProp = 'custom';
    }
    mgr.registerWidget(createMockWidgetDef());
    mgr.registerConstructor('health_score', CustomWidget);
    const widget = mgr.createWidget('health_score')! as CustomWidget;
    expect(widget.customProp).toBe('custom');
  });
});

// ── Widget Manager (Public API) ──────────────────────────────

describe('WidgetManager (Public API)', () => {
  let mgr: WidgetManager;

  beforeEach(() => { mgr = new WidgetManager(); });

  it('registerWidget', () => {
    expect(mgr.registerWidget(createMockWidgetDef())).toBe(true);
  });
  it('createWidget', () => {
    mgr.registerWidget(createMockWidgetDef());
    expect(mgr.createWidget('health_score')).not.toBeNull();
  });
  it('initializeWidget', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    expect(await mgr.initializeWidget(widget.id)).toBe(true);
  });
  it('refreshWidget', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await mgr.initializeWidget(widget.id);
    await mgr.refreshWidget(widget.id);
    expect(mgr.getWidgetState(widget.id)).toBe('ready');
  });
  it('disposeWidget', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await mgr.initializeWidget(widget.id);
    expect(await mgr.disposeWidget(widget.id)).toBe(true);
    expect(mgr.getWidget(widget.id)).toBeUndefined();
  });
  it('getWidgetState', () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    expect(mgr.getWidgetState(widget.id)).toBe('idle');
  });
  it('getWidgetStatistics', async () => {
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await mgr.initializeWidget(widget.id);
    await mgr.refreshWidget(widget.id);
    const stats = mgr.getWidgetStatistics();
    expect(stats.totalWidgets).toBe(1);
    expect(stats.totalRefreshes).toBeGreaterThan(0);
  });
  it('checkPermissions', () => {
    mgr.registerWidget(createMockWidgetDef());
    expect(mgr.checkPermissions('health_score', 'FREE', [], true).valid).toBe(true);
  });
  it('validateWidget', () => {
    expect(mgr.validateWidget(createMockWidgetDef()).valid).toBe(true);
  });
  it('updateConfig', () => {
    mgr.updateConfig({ frameworkVersion: '2.0.0' });
    expect(mgr.config.frameworkVersion).toBe('2.0.0');
  });
  it('emits widget_registered event', () => {
    let registered = false;
    mgr.events.on('widget_registered', () => { registered = true; });
    mgr.registerWidget(createMockWidgetDef());
    expect(registered).toBe(true);
  });
  it('clear', () => {
    mgr.registerWidget(createMockWidgetDef());
    mgr.createWidget('health_score');
    mgr.clear();
    expect(mgr.getWidgets().length).toBe(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.WidgetManager).toBeDefined();
    expect(module.WidgetFactory).toBeDefined();
    expect(module.WidgetRegistry).toBeDefined();
    expect(module.WidgetLifecycleManager).toBeDefined();
    expect(module.WidgetStateManager).toBeDefined();
    expect(module.WidgetActionRegistry).toBeDefined();
    expect(module.WidgetPermissionManager).toBeDefined();
    expect(module.WidgetTelemetry).toBeDefined();
    expect(module.WidgetValidator).toBeDefined();
    expect(module.WidgetEventEmitter).toBeDefined();
    expect(module.BaseWidget).toBeDefined();
    expect(module.GenericWidget).toBeDefined();
    expect(module.DEFAULT_WIDGET_FRAMEWORK_CONFIG).toBeDefined();
    expect(module.createWidgetFrameworkConfig).toBeDefined();
  });
  it('full lifecycle: register → create → init → load → refresh → dispose', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef({
      providerFactory: () => createMockProvider({ score: 85 }),
    }));
    const widget = mgr.createWidget('health_score')!;
    expect(widget.getLifecycle()).toBe('registered');
    await mgr.initializeWidget(widget.id);
    expect(widget.getLifecycle()).toBe('initialized');
    await widget.load();
    expect(widget.getLifecycle()).toBe('loaded');
    expect(widget.getState()).toBe('ready');
    await widget.refresh();
    expect(widget.getLifecycle()).toBe('loaded');
    await mgr.disposeWidget(widget.id);
    // After dispose, the manager removes the widget from lifecycle tracking
    // but the widget's last lifecycle state was 'disposed'
    expect(widget.getLifecycle()).toBe('disposed');
  });
  it('multiple widgets operate independently', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef({ type: 'health_score', providerFactory: () => createMockProvider({ score: 90 }) }));
    mgr.registerWidget(createMockWidgetDef({ type: 'storage_summary', providerFactory: () => createMockProvider({ used: 50 }) }));
    const w1 = mgr.createWidget('health_score')!;
    const w2 = mgr.createWidget('storage_summary')!;
    await w1.initialize();
    await w2.initialize();
    await w1.load();
    await w2.load();
    expect(w1.getInstance().data).toEqual({ score: 90 });
    expect(w2.getInstance().data).toEqual({ used: 50 });
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('widget initialization under 50ms', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    const start = performance.now();
    await widget.initialize();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('load without initialize sets error', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.load();
    expect(widget.getState()).toBe('error');
  });
  it('refresh without provider does nothing', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.refresh();
    // No provider, so refresh returns without error
    expect(widget.getState()).toBe('idle');
  });
  it('dispose without initialize works', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.dispose();
    expect(widget.getLifecycle()).toBe('disposed');
  });
  it('initializeWidget fails for missing widget', async () => {
    const mgr = new WidgetManager();
    expect(await mgr.initializeWidget('nonexistent')).toBe(false);
  });
  it('refreshWidget fails for missing widget', async () => {
    const mgr = new WidgetManager();
    expect(await mgr.refreshWidget('nonexistent')).toBe(false);
  });
  it('disposeWidget fails for missing widget', async () => {
    const mgr = new WidgetManager();
    expect(await mgr.disposeWidget('nonexistent')).toBe(false);
  });
  it('checkPermissions for unregistered widget fails', () => {
    const mgr = new WidgetManager();
    const result = mgr.checkPermissions('health_score', 'FREE', [], true);
    expect(result.valid).toBe(false);
  });
  it('suspend transitions lifecycle', async () => {
    const mgr = new WidgetManager();
    mgr.registerWidget(createMockWidgetDef());
    const widget = mgr.createWidget('health_score')!;
    await widget.initialize();
    widget.suspend();
    expect(widget.getLifecycle()).toBe('suspended');
  });
  it('custom widget extends BaseWidget', () => {
    class MyWidget extends BaseWidget {
      readonly customField = 'custom';
    }
    expect(MyWidget).toBeDefined();
  });
});
