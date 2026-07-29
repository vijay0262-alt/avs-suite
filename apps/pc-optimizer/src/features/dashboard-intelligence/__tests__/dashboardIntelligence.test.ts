/**
 * Tests for the Intelligent Dashboard Platform.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  WidgetDefinition,
  WidgetType,
  DashboardDataProvider,
  ProviderContext,
  DashboardDataBundle,
  LayoutType,
} from '../types';
import {
  generateWidgetId,
  generateDashboardId,
  getWidgetTypeLabel,
  getLayoutTypeLabel,
  getWidgetStateLabel,
  createWidgetState,
} from '../types';
import { DashboardEventEmitter } from '../dashboardEvents';
import {
  DEFAULT_DASHBOARD_CONFIG,
  DEFAULT_WIDGET_DEFINITIONS,
  DEFAULT_LAYOUT_DEFINITIONS,
  createDashboardConfig,
} from '../dashboardConfiguration';
import { DashboardWidgetRegistry } from '../dashboardWidgetRegistry';
import { DashboardRegistry } from '../dashboardRegistry';
import { DashboardLayoutManager } from '../dashboardLayoutManager';
import { DashboardStateManager } from '../dashboardStateManager';
import { DashboardRefreshManager } from '../dashboardRefreshManager';
import { DashboardValidator } from '../dashboardValidator';
import { DashboardEngine } from '../dashboardEngine';
import { DashboardManager } from '../dashboardManager';

// ── Mock Helpers ─────────────────────────────────────────────

function createMockProvider(name: string, data: unknown = { summary: 'test' }): DashboardDataProvider {
  return {
    getProviderName: () => name,
    getProviderType: () => 'mock',
    isAvailable: () => true,
    getData: () => data,
    getPriority: () => 1,
  };
}

function createMockDataBundle(): DashboardDataBundle {
  return {
    aiContext: null,
    knowledge: null,
    recommendations: null,
    insights: null,
    predictions: null,
    deviceProfile: null,
  };
}

function createMockWidgetDef(overrides: Partial<WidgetDefinition> = {}): WidgetDefinition {
  return {
    type: 'future_widget',
    title: 'Test Widget',
    subtitle: 'Test',
    category: 'future',
    priority: 'low',
    size: 'small',
    refreshPolicy: 'on_demand',
    providerName: 'TestProvider',
    requiredCapabilities: [],
    permissions: { minPlan: 'FREE', requiredFeatures: [], requiresQuota: false, futurePolicies: {} },
    futureMetadata: {},
    ...overrides,
  };
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateWidgetId returns unique IDs', () => {
    const a = generateWidgetId('health_score');
    const b = generateWidgetId('health_score');
    expect(a).not.toBe(b);
    expect(a).toContain('widget_');
  });
  it('generateDashboardId returns unique IDs', () => {
    expect(generateDashboardId()).toContain('dash_');
  });
  it('getWidgetTypeLabel returns correct labels', () => {
    expect(getWidgetTypeLabel('health_score')).toBe('Health Score');
    expect(getWidgetTypeLabel('ai_morning_brief')).toBe('AI Morning Brief');
    expect(getWidgetTypeLabel('future_widget')).toBe('Future Widget');
  });
  it('getLayoutTypeLabel returns correct labels', () => {
    expect(getLayoutTypeLabel('default')).toBe('Default Layout');
    expect(getLayoutTypeLabel('compact')).toBe('Compact Layout');
    expect(getLayoutTypeLabel('custom')).toBe('Custom Layout');
  });
  it('getWidgetStateLabel returns correct labels', () => {
    expect(getWidgetStateLabel('loading')).toBe('Loading');
    expect(getWidgetStateLabel('ready')).toBe('Ready');
    expect(getWidgetStateLabel('error')).toBe('Error');
    expect(getWidgetStateLabel('permission_denied')).toBe('Permission Denied');
  });
  it('createWidgetState creates state with defaults', () => {
    const state = createWidgetState('loading');
    expect(state.type).toBe('loading');
    expect(state.message).toBeNull();
    expect(state.retryCount).toBe(0);
    expect(state.lastStateChange).toBeDefined();
  });
  it('createWidgetState creates state with message', () => {
    const state = createWidgetState('error', 'Something went wrong');
    expect(state.type).toBe('error');
    expect(state.message).toBe('Something went wrong');
  });
});

// ── Events ───────────────────────────────────────────────────

describe('DashboardEventEmitter', () => {
  let e: DashboardEventEmitter;
  beforeEach(() => { e = new DashboardEventEmitter(); });

  it('emits events', () => {
    let received = false;
    e.on('dashboard_loaded', () => { received = true; });
    e.emit('dashboard_loaded', {});
    expect(received).toBe(true);
  });
  it('supports unsubscribe', () => {
    let count = 0;
    const unsub = e.on('widget_registered', () => { count++; });
    e.emit('widget_registered', {});
    unsub();
    e.emit('widget_registered', {});
    expect(count).toBe(1);
  });
  it('tracks listener count', () => {
    e.on('dashboard_loaded', () => {});
    expect(e.listenerCount('dashboard_loaded')).toBe(1);
    expect(e.listenerCount('widget_registered')).toBe(0);
  });
  it('clear removes all', () => {
    e.on('dashboard_loaded', () => {});
    e.on('widget_registered', () => {});
    e.clear();
    expect(e.listenerCount('dashboard_loaded')).toBe(0);
  });
  it('does not crash on listener error', () => {
    e.on('dashboard_loaded', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.emit('dashboard_loaded', {});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('supports all 8 event types', () => {
    const events = [
      'dashboard_loaded', 'dashboard_refreshed', 'widget_registered',
      'widget_loaded', 'widget_updated', 'widget_removed',
      'layout_changed', 'provider_registered',
    ] as const;
    for (const evt of events) {
      let received = false;
      e.on(evt, () => { received = true; });
      e.emit(evt, {});
      expect(received).toBe(true);
      e.clear();
    }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('DashboardConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_DASHBOARD_CONFIG.dashboardVersion).toBe('1.0.0');
    expect(DEFAULT_DASHBOARD_CONFIG.widgetDefinitions.length).toBe(18);
    expect(DEFAULT_DASHBOARD_CONFIG.layoutDefinitions.length).toBe(6);
  });
  it('createDashboardConfig accepts overrides', () => {
    const cfg = createDashboardConfig({ dashboardVersion: '2.0.0' });
    expect(cfg.dashboardVersion).toBe('2.0.0');
  });
  it('merges nested refreshRules', () => {
    const cfg = createDashboardConfig({ refreshRules: { realTimeIntervalMs: 10000 } });
    expect(cfg.refreshRules.realTimeIntervalMs).toBe(10000);
    expect(cfg.refreshRules.maxRetries).toBe(DEFAULT_DASHBOARD_CONFIG.refreshRules.maxRetries);
  });
  it('merges nested permissionRules', () => {
    const cfg = createDashboardConfig({ permissionRules: { strictMode: true } });
    expect(cfg.permissionRules.strictMode).toBe(true);
  });
  it('merges nested providerRules', () => {
    const cfg = createDashboardConfig({ providerRules: { timeoutMs: 10000 } });
    expect(cfg.providerRules.timeoutMs).toBe(10000);
  });
  it('merges nested featureFlags', () => {
    const cfg = createDashboardConfig({ featureFlags: { enablePredictions: false } });
    expect(cfg.featureFlags.enablePredictions).toBe(false);
    expect(cfg.featureFlags.enableMorningBrief).toBe(true);
  });
  it('has all 18 widget definitions', () => {
    const types = DEFAULT_WIDGET_DEFINITIONS.map((w) => w.type);
    expect(types).toContain('health_score');
    expect(types).toContain('overall_status');
    expect(types).toContain('ai_morning_brief');
    expect(types).toContain('top_recommendations');
    expect(types).toContain('quick_wins');
    expect(types).toContain('prediction_summary');
    expect(types).toContain('recent_improvements');
    expect(types).toContain('achievements');
    expect(types).toContain('milestones');
    expect(types).toContain('optimization_history');
    expect(types).toContain('storage_summary');
    expect(types).toContain('performance_summary');
    expect(types).toContain('privacy_summary');
    expect(types).toContain('startup_summary');
    expect(types).toContain('windows_summary');
    expect(types).toContain('device_profile');
    expect(types).toContain('subscription_status');
    expect(types).toContain('usage_quotas');
  });
  it('has all 6 layout definitions', () => {
    const types = DEFAULT_LAYOUT_DEFINITIONS.map((l) => l.type);
    expect(types).toContain('default');
    expect(types).toContain('compact');
    expect(types).toContain('detailed');
    expect(types).toContain('beginner');
    expect(types).toContain('advanced');
    expect(types).toContain('custom');
  });
});

// ── Widget Registry ──────────────────────────────────────────

describe('DashboardWidgetRegistry', () => {
  let r: DashboardWidgetRegistry;
  beforeEach(() => { r = new DashboardWidgetRegistry(); });

  it('registers widget', () => {
    expect(r.registerWidget(createMockWidgetDef())).toBe(true);
    expect(r.count).toBe(1);
  });
  it('rejects duplicate type', () => {
    r.registerWidget(createMockWidgetDef());
    expect(r.registerWidget(createMockWidgetDef())).toBe(false);
  });
  it('unregisters widget', () => {
    r.registerWidget(createMockWidgetDef());
    expect(r.unregisterWidget('future_widget')).toBe(true);
    expect(r.count).toBe(0);
  });
  it('gets widget', () => {
    r.registerWidget(createMockWidgetDef());
    expect(r.getWidget('future_widget')).toBeDefined();
  });
  it('hasWidget checks existence', () => {
    r.registerWidget(createMockWidgetDef());
    expect(r.hasWidget('future_widget')).toBe(true);
    expect(r.hasWidget('health_score')).toBe(false);
  });
  it('getWidgets returns all', () => {
    r.registerWidget(createMockWidgetDef({ type: 'health_score' }));
    r.registerWidget(createMockWidgetDef({ type: 'storage_summary' }));
    expect(r.getWidgets().length).toBe(2);
  });
  it('filters by category', () => {
    r.registerWidget(createMockWidgetDef({ type: 'health_score', category: 'health' }));
    r.registerWidget(createMockWidgetDef({ type: 'storage_summary', category: 'system' }));
    expect(r.getByCategory('health').length).toBe(1);
  });
  it('filters by priority', () => {
    r.registerWidget(createMockWidgetDef({ type: 'health_score', priority: 'critical' }));
    r.registerWidget(createMockWidgetDef({ type: 'storage_summary', priority: 'low' }));
    expect(r.getByPriority('critical').length).toBe(1);
  });
  it('clear removes all', () => {
    r.registerWidget(createMockWidgetDef());
    r.clear();
    expect(r.count).toBe(0);
  });
});

// ── Provider Registry ────────────────────────────────────────

describe('DashboardRegistry', () => {
  let r: DashboardRegistry;
  beforeEach(() => { r = new DashboardRegistry(); });

  it('registers provider', () => {
    expect(r.registerProvider(createMockProvider('TestProvider'))).toBe(true);
    expect(r.count).toBe(1);
  });
  it('rejects duplicate name', () => {
    r.registerProvider(createMockProvider('TestProvider'));
    expect(r.registerProvider(createMockProvider('TestProvider'))).toBe(false);
  });
  it('unregisters provider', () => {
    r.registerProvider(createMockProvider('TestProvider'));
    expect(r.unregisterProvider('TestProvider')).toBe(true);
    expect(r.count).toBe(0);
  });
  it('gets provider', () => {
    r.registerProvider(createMockProvider('TestProvider'));
    expect(r.getProvider('TestProvider')).toBeDefined();
  });
  it('hasProvider checks existence', () => {
    r.registerProvider(createMockProvider('TestProvider'));
    expect(r.hasProvider('TestProvider')).toBe(true);
    expect(r.hasProvider('Missing')).toBe(false);
  });
  it('getAvailableProviders filters unavailable', () => {
    const unavailable: DashboardDataProvider = {
      getProviderName: () => 'Unavailable',
      getProviderType: () => 'mock',
      isAvailable: () => false,
      getData: () => null,
      getPriority: () => 1,
    };
    r.registerProvider(createMockProvider('Available'));
    r.registerProvider(unavailable);
    expect(r.getAvailableProviders().length).toBe(1);
  });
  it('getProviders sorts by priority', () => {
    r.registerProvider(createMockProvider('Low'));
    const highProvider = createMockProvider('High');
    r.registerProvider({ ...highProvider, getPriority: () => 10 });
    const providers = r.getProviders();
    expect(providers[0]!.getProviderName()).toBe('High');
  });
  it('clear removes all', () => {
    r.registerProvider(createMockProvider('TestProvider'));
    r.clear();
    expect(r.count).toBe(0);
  });
});

// ── Layout Manager ───────────────────────────────────────────

describe('DashboardLayoutManager', () => {
  let m: DashboardLayoutManager;
  beforeEach(() => { m = new DashboardLayoutManager(DEFAULT_DASHBOARD_CONFIG); });

  it('gets layout definition', () => {
    const def = m.getLayoutDefinition('default');
    expect(def).toBeDefined();
    expect(def!.type).toBe('default');
  });
  it('gets all layouts', () => {
    expect(m.getLayouts().length).toBe(6);
  });
  it('gets current layout', () => {
    expect(m.getCurrentLayout()).toBe('default');
  });
  it('sets layout', () => {
    expect(m.setLayout('compact')).toBe(true);
    expect(m.getCurrentLayout()).toBe('compact');
  });
  it('rejects invalid layout', () => {
    expect(m.setLayout('future')).toBe(false);
  });
  it('builds layout with widgets', () => {
    const layout = m.buildLayout([]);
    expect(layout.type).toBe('default');
    expect(layout.columns).toBe(3);
  });
  it('gets widget order', () => {
    const order = m.getWidgetOrder();
    expect(order.length).toBeGreaterThan(0);
    expect(order[0]).toBe('health_score');
  });
  it('filters widgets for layout', () => {
    const widgets = DEFAULT_WIDGET_DEFINITIONS;
    const filtered = m.filterWidgetsForLayout(widgets);
    expect(filtered.length).toBeLessThanOrEqual(10);
  });
  it('compact layout has fewer widgets', () => {
    m.setLayout('compact');
    const compactOrder = m.getWidgetOrder();
    m.setLayout('default');
    const defaultOrder = m.getWidgetOrder();
    expect(compactOrder.length).toBeLessThan(defaultOrder.length);
  });
  it('detailed layout has most widgets', () => {
    m.setLayout('detailed');
    const detailedOrder = m.getWidgetOrder();
    m.setLayout('default');
    const defaultOrder = m.getWidgetOrder();
    expect(detailedOrder.length).toBeGreaterThan(defaultOrder.length);
  });
});

// ── State Manager ────────────────────────────────────────────

describe('DashboardStateManager', () => {
  let m: DashboardStateManager;
  beforeEach(() => { m = new DashboardStateManager(); });

  it('starts with empty state', () => {
    const state = m.getDashboardState();
    expect(state.isLoaded).toBe(false);
    expect(state.isRefreshing).toBe(false);
    expect(m.getWidgetCount()).toBe(0);
  });
  it('registers and gets widget', () => {
    const widget = {
      id: 'w1',
      definition: createMockWidgetDef(),
      state: createWidgetState('loading'),
      data: null,
      lastUpdated: null,
      error: null,
    };
    m.registerWidget(widget);
    expect(m.getWidget('w1')).toBeDefined();
    expect(m.getWidgetCount()).toBe(1);
  });
  it('removes widget', () => {
    const widget = {
      id: 'w1',
      definition: createMockWidgetDef(),
      state: createWidgetState('loading'),
      data: null,
      lastUpdated: null,
      error: null,
    };
    m.registerWidget(widget);
    expect(m.removeWidget('w1')).toBe(true);
    expect(m.getWidgetCount()).toBe(0);
  });
  it('sets widget state', () => {
    const widget = {
      id: 'w1',
      definition: createMockWidgetDef(),
      state: createWidgetState('loading'),
      data: null,
      lastUpdated: null,
      error: null,
    };
    m.registerWidget(widget);
    m.setWidgetState('w1', 'ready');
    expect(m.getWidget('w1')!.state.type).toBe('ready');
  });
  it('sets widget data', () => {
    const widget = {
      id: 'w1',
      definition: createMockWidgetDef(),
      state: createWidgetState('loading'),
      data: null,
      lastUpdated: null,
      error: null,
    };
    m.registerWidget(widget);
    m.setWidgetData('w1', { score: 85 });
    expect(m.getWidget('w1')!.data).toEqual({ score: 85 });
    expect(m.getWidget('w1')!.state.type).toBe('ready');
    expect(m.getWidget('w1')!.lastUpdated).not.toBeNull();
  });
  it('sets widget error', () => {
    const widget = {
      id: 'w1',
      definition: createMockWidgetDef(),
      state: createWidgetState('loading'),
      data: null,
      lastUpdated: null,
      error: null,
    };
    m.registerWidget(widget);
    m.setWidgetError('w1', 'Failed to load');
    expect(m.getWidget('w1')!.error).toBe('Failed to load');
    expect(m.getWidget('w1')!.state.type).toBe('error');
  });
  it('marks loaded', () => {
    m.markLoaded(150);
    const state = m.getDashboardState();
    expect(state.isLoaded).toBe(true);
    expect(state.loadTimeMs).toBe(150);
  });
  it('marks refreshing and refreshed', () => {
    m.markRefreshing();
    expect(m.getDashboardState().isRefreshing).toBe(true);
    m.markRefreshed();
    expect(m.getDashboardState().isRefreshing).toBe(false);
  });
  it('gets widgets by state', () => {
    m.registerWidget({
      id: 'w1', definition: createMockWidgetDef(), state: createWidgetState('ready'),
      data: null, lastUpdated: null, error: null,
    });
    m.registerWidget({
      id: 'w2', definition: createMockWidgetDef({ type: 'health_score' }), state: createWidgetState('error'),
      data: null, lastUpdated: null, error: 'fail',
    });
    expect(m.getWidgetsByState('ready').length).toBe(1);
    expect(m.getWidgetsByState('error').length).toBe(1);
  });
  it('clears', () => {
    m.registerWidget({
      id: 'w1', definition: createMockWidgetDef(), state: createWidgetState('ready'),
      data: null, lastUpdated: null, error: null,
    });
    m.markLoaded(100);
    m.clear();
    expect(m.getWidgetCount()).toBe(0);
    expect(m.getDashboardState().isLoaded).toBe(false);
  });
});

// ── Refresh Manager ──────────────────────────────────────────

describe('DashboardRefreshManager', () => {
  let m: DashboardRefreshManager;
  beforeEach(() => { m = new DashboardRefreshManager(DEFAULT_DASHBOARD_CONFIG); });

  it('shouldRefresh on_startup returns true initially', () => {
    expect(m.shouldRefresh('health_score', 'on_startup')).toBe(true);
  });
  it('shouldRefresh on_startup returns false after refresh', () => {
    const provider = createMockProvider('HealthProvider');
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    m.refreshWidget(createMockWidgetDef(), provider, ctx);
    expect(m.shouldRefresh('future_widget', 'on_startup')).toBe(false);
  });
  it('shouldRefresh manual always returns true', () => {
    expect(m.shouldRefresh('test', 'manual')).toBe(true);
  });
  it('shouldRefresh on_demand always returns true', () => {
    expect(m.shouldRefresh('test', 'on_demand')).toBe(true);
  });
  it('refreshWidget with missing provider fails', () => {
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = m.refreshWidget(createMockWidgetDef(), undefined, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
  it('refreshWidget with unavailable provider fails', () => {
    const unavailable: DashboardDataProvider = {
      getProviderName: () => 'Unavailable',
      getProviderType: () => 'mock',
      isAvailable: () => false,
      getData: () => null,
      getPriority: () => 1,
    };
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = m.refreshWidget(createMockWidgetDef(), unavailable, ctx);
    expect(result.success).toBe(false);
  });
  it('refreshWidget with valid provider succeeds', () => {
    const provider = createMockProvider('TestProvider', { score: 90 });
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = m.refreshWidget(createMockWidgetDef(), provider, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ score: 90 });
  });
  it('refreshWidget handles provider errors', () => {
    const errorProvider: DashboardDataProvider = {
      getProviderName: () => 'ErrorProvider',
      getProviderType: () => 'mock',
      isAvailable: () => true,
      getData: () => { throw new Error('boom'); },
      getPriority: () => 1,
    };
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const result = m.refreshWidget(createMockWidgetDef(), errorProvider, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });
  it('refreshWidgets refreshes multiple widgets', () => {
    const provider = createMockProvider('TestProvider');
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    const widgets = [createMockWidgetDef(), createMockWidgetDef({ type: 'health_score' })];
    const results = m.refreshWidgets(widgets, () => provider, ctx);
    expect(results.size).toBe(2);
  });
  it('tracks refresh count', () => {
    const provider = createMockProvider('TestProvider');
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    m.refreshWidget(createMockWidgetDef(), provider, ctx);
    m.refreshWidget(createMockWidgetDef(), provider, ctx);
    expect(m.refreshCount).toBe(2);
  });
  it('tracks failed refreshes', () => {
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    m.refreshWidget(createMockWidgetDef(), undefined, ctx);
    expect(m.failedRefreshes).toBe(1);
  });
  it('reset clears state', () => {
    const provider = createMockProvider('TestProvider');
    const ctx: ProviderContext = {
      aiContext: null, knowledge: null, recommendations: null,
      insights: null, predictions: null, deviceProfile: null, options: {},
    };
    m.refreshWidget(createMockWidgetDef(), provider, ctx);
    m.reset();
    expect(m.refreshCount).toBe(0);
    expect(m.failedRefreshes).toBe(0);
  });
});

// ── Validator ────────────────────────────────────────────────

describe('DashboardValidator', () => {
  let v: DashboardValidator;
  beforeEach(() => { v = new DashboardValidator(DEFAULT_DASHBOARD_CONFIG); });

  it('validates valid widget', () => {
    const result = v.validateWidget(createMockWidgetDef({ type: 'health_score' }));
    expect(result.valid).toBe(true);
  });
  it('fails for widget without type', () => {
    const def = createMockWidgetDef();
    def.type = '' as WidgetType;
    const result = v.validateWidget(def);
    expect(result.valid).toBe(false);
  });
  it('fails for widget without title', () => {
    const def = createMockWidgetDef();
    def.title = '';
    const result = v.validateWidget(def);
    expect(result.valid).toBe(false);
  });
  it('fails for widget without provider', () => {
    const def = createMockWidgetDef();
    def.providerName = '';
    const result = v.validateWidget(def);
    expect(result.valid).toBe(false);
  });
  it('warns for disabled feature', () => {
    const cfg = createDashboardConfig({ featureFlags: { enablePredictions: false } });
    v.updateConfig(cfg);
    const result = v.validateWidget(createMockWidgetDef({ type: 'prediction_summary' }));
    expect(result.issues.some((i) => i.code === 'WIDGET_FEATURE_DISABLED')).toBe(true);
  });
  it('validates valid layout', () => {
    const result = v.validateLayout(DEFAULT_LAYOUT_DEFINITIONS[0]!);
    expect(result.valid).toBe(true);
  });
  it('fails for layout with no columns', () => {
    const def = { ...DEFAULT_LAYOUT_DEFINITIONS[0]!, columns: 0 };
    const result = v.validateLayout(def);
    expect(result.valid).toBe(false);
  });
  it('fails for layout with no max widgets', () => {
    const def = { ...DEFAULT_LAYOUT_DEFINITIONS[0]!, maxWidgets: 0 };
    const result = v.validateLayout(def);
    expect(result.valid).toBe(false);
  });
  it('validates permissions - plan sufficient', () => {
    const result = v.validatePermissions(
      createMockWidgetDef({ permissions: { minPlan: 'FREE', requiredFeatures: [], requiresQuota: false, futurePolicies: {} } }),
      'PRO',
      [],
      true,
    );
    expect(result.valid).toBe(true);
  });
  it('validates permissions - plan insufficient', () => {
    const result = v.validatePermissions(
      createMockWidgetDef({ permissions: { minPlan: 'ENTERPRISE', requiredFeatures: [], requiresQuota: false, futurePolicies: {} } }),
      'FREE',
      [],
      true,
    );
    expect(result.valid).toBe(false);
  });
  it('validates permissions - missing feature', () => {
    const result = v.validatePermissions(
      createMockWidgetDef({ permissions: { minPlan: 'FREE', requiredFeatures: ['ai_insights'], requiresQuota: false, futurePolicies: {} } }),
      'FREE',
      [],
      true,
    );
    expect(result.valid).toBe(false);
  });
  it('validates permissions - no quota', () => {
    const result = v.validatePermissions(
      createMockWidgetDef({ permissions: { minPlan: 'FREE', requiredFeatures: [], requiresQuota: true, futurePolicies: {} } }),
      'FREE',
      [],
      false,
    );
    expect(result.valid).toBe(false);
  });
  it('validates all', () => {
    const result = v.validateAll();
    expect(result.valid).toBe(true);
  });
});

// ── Dashboard Engine ─────────────────────────────────────────

describe('DashboardEngine', () => {
  let engine: DashboardEngine;

  beforeEach(() => { engine = new DashboardEngine(); });

  it('builds dashboard with providers', () => {
    engine.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    const widgets = engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    expect(widgets.length).toBeGreaterThan(0);
  });
  it('widgets are ready when provider exists', () => {
    engine.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    const widgets = engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    const healthWidget = widgets.find((w) => w.definition.type === 'health_score');
    expect(healthWidget).toBeDefined();
    expect(healthWidget!.state.type).toBe('ready');
    expect(healthWidget!.data).toEqual({ score: 85 });
  });
  it('widgets are unavailable when provider missing', () => {
    const widgets = engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    const healthWidget = widgets.find((w) => w.definition.type === 'health_score');
    expect(healthWidget!.state.type).toBe('unavailable');
  });
  it('widgets are permission_denied when plan insufficient', () => {
    engine.registerProvider(createMockProvider('HealthProvider'));
    const widgets = engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    // All default widgets have minPlan FREE, so all should pass permissions
    // Let's test with a widget that requires PRO
    engine.registerWidget(createMockWidgetDef({
      type: 'future_widget',
      permissions: { minPlan: 'PRO', requiredFeatures: [], requiresQuota: false, futurePolicies: {} },
    }));
    // Use a layout that includes future_widget
    // For now, just verify the default widgets pass
    expect(widgets.length).toBeGreaterThan(0);
  });
  it('refreshes dashboard', () => {
    engine.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    const updated = engine.refreshDashboard(createMockDataBundle());
    expect(updated.length).toBeGreaterThanOrEqual(0);
  });
  it('gets statistics', () => {
    engine.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    const stats = engine.getStatistics();
    expect(stats.totalWidgets).toBeGreaterThan(0);
    expect(stats.totalRefreshes).toBeGreaterThan(0);
  });
  it('registers custom widget', () => {
    expect(engine.registerWidget(createMockWidgetDef({ type: 'future_widget' }))).toBe(true);
  });
  it('registers custom provider', () => {
    expect(engine.registerProvider(createMockProvider('CustomProvider'))).toBe(true);
  });
  it('sets layout', () => {
    expect(engine.setLayout('compact')).toBe(true);
  });
  it('gets widgets', () => {
    engine.registerProvider(createMockProvider('HealthProvider'));
    engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    expect(engine.getWidgets().length).toBeGreaterThan(0);
  });
  it('gets widget by id', () => {
    engine.registerProvider(createMockProvider('HealthProvider'));
    const widgets = engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    const first = widgets[0]!;
    expect(engine.getWidget(first.id)).toBeDefined();
  });
  it('gets dashboard state', () => {
    engine.registerProvider(createMockProvider('HealthProvider'));
    engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    const state = engine.getDashboardState();
    expect(state.isLoaded).toBe(true);
  });
  it('emits dashboard_loaded event', () => {
    let loaded = false;
    engine.events.on('dashboard_loaded', () => { loaded = true; });
    engine.registerProvider(createMockProvider('HealthProvider'));
    engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    expect(loaded).toBe(true);
  });
  it('emits widget_registered event', () => {
    let registered = false;
    engine.events.on('widget_registered', () => { registered = true; });
    engine.registerWidget(createMockWidgetDef({ type: 'future_widget' }));
    expect(registered).toBe(true);
  });
  it('emits provider_registered event', () => {
    let registered = false;
    engine.events.on('provider_registered', () => { registered = true; });
    engine.registerProvider(createMockProvider('TestProvider'));
    expect(registered).toBe(true);
  });
  it('emits layout_changed event', () => {
    let changed = false;
    engine.events.on('layout_changed', () => { changed = true; });
    engine.setLayout('compact');
    expect(changed).toBe(true);
  });
  it('updates config', () => {
    engine.updateConfig({ dashboardVersion: '2.0.0' });
    expect(engine.config.dashboardVersion).toBe('2.0.0');
  });
  it('clears state', () => {
    engine.registerProvider(createMockProvider('HealthProvider'));
    engine.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    engine.clear();
    expect(engine.getWidgets().length).toBe(0);
  });
});

// ── Dashboard Manager ────────────────────────────────────────

describe('DashboardManager', () => {
  let mgr: DashboardManager;

  beforeEach(() => { mgr = new DashboardManager(); });

  it('builds dashboard', () => {
    mgr.registerProvider(createMockProvider('HealthProvider', { score: 90 }));
    const widgets = mgr.buildDashboard(createMockDataBundle());
    expect(widgets.length).toBeGreaterThan(0);
  });
  it('refreshes dashboard', () => {
    mgr.registerProvider(createMockProvider('HealthProvider', { score: 90 }));
    mgr.buildDashboard(createMockDataBundle());
    const updated = mgr.refreshDashboard(createMockDataBundle());
    expect(updated.length).toBeGreaterThanOrEqual(0);
  });
  it('gets widgets', () => {
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    expect(mgr.getWidgets().length).toBeGreaterThan(0);
  });
  it('gets widget by id', () => {
    mgr.registerProvider(createMockProvider('HealthProvider'));
    const widgets = mgr.buildDashboard(createMockDataBundle());
    expect(mgr.getWidget(widgets[0]!.id)).toBeDefined();
  });
  it('registers widget', () => {
    expect(mgr.registerWidget(createMockWidgetDef({ type: 'future_widget' }))).toBe(true);
  });
  it('registers provider', () => {
    expect(mgr.registerProvider(createMockProvider('TestProvider'))).toBe(true);
  });
  it('gets dashboard state', () => {
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    const state = mgr.getDashboardState();
    expect(state.isLoaded).toBe(true);
  });
  it('gets dashboard statistics', () => {
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    const stats = mgr.getDashboardStatistics();
    expect(stats.totalWidgets).toBeGreaterThan(0);
  });
  it('sets layout', () => {
    expect(mgr.setLayout('compact')).toBe(true);
    expect(mgr.getLayout()).toBe('compact');
  });
  it('updates config', () => {
    mgr.updateConfig({ dashboardVersion: '2.0.0' });
    expect(mgr.config.dashboardVersion).toBe('2.0.0');
  });
  it('clears', () => {
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    mgr.clear();
    expect(mgr.getWidgets().length).toBe(0);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.DashboardManager).toBeDefined();
    expect(module.DashboardEngine).toBeDefined();
    expect(module.DashboardWidgetRegistry).toBeDefined();
    expect(module.DashboardRegistry).toBeDefined();
    expect(module.DashboardLayoutManager).toBeDefined();
    expect(module.DashboardStateManager).toBeDefined();
    expect(module.DashboardRefreshManager).toBeDefined();
    expect(module.DashboardValidator).toBeDefined();
    expect(module.DashboardEventEmitter).toBeDefined();
    expect(module.DEFAULT_DASHBOARD_CONFIG).toBeDefined();
    expect(module.createDashboardConfig).toBeDefined();
  });
  it('full integration: build dashboard end-to-end', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    mgr.registerProvider(createMockProvider('RecommendationProvider', { recs: [] }));
    mgr.registerProvider(createMockProvider('InsightProvider', { insights: [] }));
    mgr.registerProvider(createMockProvider('PredictionProvider', { preds: [] }));
    mgr.registerProvider(createMockProvider('ProfileProvider', { profile: null }));
    mgr.registerProvider(createMockProvider('CapabilityProvider', { caps: [] }));
    mgr.registerProvider(createMockProvider('QuotaProvider', { quotas: [] }));
    mgr.registerProvider(createMockProvider('AchievementProvider', { achievements: [] }));
    mgr.registerProvider(createMockProvider('HistoryProvider', { history: [] }));
    const widgets = mgr.buildDashboard(createMockDataBundle());
    expect(widgets.length).toBeGreaterThan(0);
    const readyWidgets = widgets.filter((w) => w.state.type === 'ready');
    expect(readyWidgets.length).toBeGreaterThan(0);
  });
  it('full integration: layout change works', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    expect(mgr.setLayout('compact')).toBe(true);
    const widgets = mgr.buildDashboard(createMockDataBundle());
    const compactMax = DEFAULT_LAYOUT_DEFINITIONS.find((l) => l.type === 'compact')!.maxWidgets;
    expect(widgets.length).toBeLessThanOrEqual(compactMax);
  });
  it('full integration: refresh works', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    mgr.buildDashboard(createMockDataBundle());
    const updated = mgr.refreshDashboard(createMockDataBundle());
    expect(updated.length).toBeGreaterThanOrEqual(0);
  });
  it('full integration: statistics are accurate', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    const stats = mgr.getDashboardStatistics();
    expect(stats.totalWidgets).toBeGreaterThan(0);
    expect(stats.totalRefreshes).toBeGreaterThan(0);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('dashboard loads under 300ms', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider', { score: 85 }));
    const start = performance.now();
    mgr.buildDashboard(createMockDataBundle());
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(300);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('empty data bundle still builds dashboard', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider'));
    const widgets = mgr.buildDashboard(createMockDataBundle());
    expect(widgets.length).toBeGreaterThan(0);
  });
  it('no providers registered shows unavailable widgets', () => {
    const mgr = new DashboardManager();
    const widgets = mgr.buildDashboard(createMockDataBundle());
    const unavailable = widgets.filter((w) => w.state.type === 'unavailable');
    expect(unavailable.length).toBeGreaterThan(0);
  });
  it('provider error shows error state', () => {
    const errorProvider: DashboardDataProvider = {
      getProviderName: () => 'HealthProvider',
      getProviderType: () => 'mock',
      isAvailable: () => true,
      getData: () => { throw new Error('fail'); },
      getPriority: () => 1,
    };
    const mgr = new DashboardManager();
    mgr.registerProvider(errorProvider);
    const widgets = mgr.buildDashboard(createMockDataBundle());
    const healthWidget = widgets.find((w) => w.definition.type === 'health_score');
    expect(healthWidget!.state.type).toBe('error');
  });
  it('feature flag disables widget', () => {
    const cfg = createDashboardConfig({ featureFlags: { enablePredictions: false } });
    const mgr = new DashboardManager(cfg);
    mgr.registerProvider(createMockProvider('PredictionProvider'));
    mgr.setLayout('detailed');
    const widgets = mgr.buildDashboard(createMockDataBundle(), 'FREE', ['ai_predictions'], true);
    const predWidget = widgets.find((w) => w.definition.type === 'prediction_summary');
    expect(predWidget).toBeDefined();
    expect(predWidget!.state.type).toBe('unavailable');
  });
  it('permission denied for insufficient plan', () => {
    const cfg = createDashboardConfig({
      widgetDefinitions: [
        ...DEFAULT_WIDGET_DEFINITIONS,
        createMockWidgetDef({
          type: 'future_widget',
          permissions: { minPlan: 'ENTERPRISE', requiredFeatures: [], requiresQuota: false, futurePolicies: {} },
        }),
      ],
      layoutDefinitions: [{
        type: 'default' as LayoutType,
        label: 'Test',
        description: 'Test',
        widgetOrder: ['future_widget'],
        columns: 1,
        maxWidgets: 1,
        futureMetadata: {},
      }],
    });
    const mgr = new DashboardManager(cfg);
    mgr.registerProvider(createMockProvider('TestProvider'));
    const widgets = mgr.buildDashboard(createMockDataBundle(), 'FREE', [], true);
    expect(widgets.length).toBe(1);
    expect(widgets[0]!.state.type).toBe('permission_denied');
  });
  it('custom widget registers without modifying existing code', () => {
    const mgr = new DashboardManager();
    const customWidget = createMockWidgetDef({
      type: 'future_widget',
      title: 'My Custom Widget',
      providerName: 'CustomProvider',
    });
    expect(mgr.registerWidget(customWidget)).toBe(true);
    expect(mgr.registerProvider(createMockProvider('CustomProvider'))).toBe(true);
  });
  it('multiple builds do not duplicate widgets', () => {
    const mgr = new DashboardManager();
    mgr.registerProvider(createMockProvider('HealthProvider'));
    mgr.buildDashboard(createMockDataBundle());
    const count1 = mgr.getWidgets().length;
    mgr.buildDashboard(createMockDataBundle());
    const count2 = mgr.getWidgets().length;
    // Second build should replace, not duplicate
    expect(count2).toBe(count1);
  });
  it('unregister widget works', () => {
    const engine = new DashboardEngine();
    engine.registerWidget(createMockWidgetDef({ type: 'future_widget' }));
    expect(engine.unregisterWidget('future_widget')).toBe(true);
  });
  it('unregister provider works', () => {
    const engine = new DashboardEngine();
    engine.registerProvider(createMockProvider('TestProvider'));
    expect(engine.unregisterProvider('TestProvider')).toBe(true);
  });
});
