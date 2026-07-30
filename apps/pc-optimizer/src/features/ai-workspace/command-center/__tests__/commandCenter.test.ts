/**
 * Tests for the AI Command Center.
 *
 * Covers: dashboard loading, widget registration, layouts, refresh,
 * analytics, events, view model, search, state management,
 * regression, performance, edge cases.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CommandCenterManager } from '../commandCenterManager';
import { CommandCenterWidgetRegistry } from '../commandCenterWidgetRegistry';
import { CommandCenterWidgetManager } from '../commandCenterWidgetManager';
import { CommandCenterDataAggregator } from '../commandCenterDataAggregator';
import { CommandCenterViewModelEngine } from '../commandCenterViewModel';
import { CommandCenterLayoutEngine } from '../commandCenterLayoutEngine';
import { CommandCenterRefreshEngine } from '../commandCenterRefreshEngine';
import { CommandCenterStateManager } from '../commandCenterStateManager';
import { CommandCenterAnalytics } from '../commandCenterAnalytics';
import { CommandCenterEvents } from '../commandCenterEvents';
import { DEFAULT_COMMAND_CENTER_CONFIGURATION, createCommandCenterConfiguration, validateCommandCenterConfiguration } from '../commandCenterConfiguration';
import {
  generateWidgetId,
  generateLayoutId,
  getWidgetCategoryLabel,
  getWidgetPriorityLabel,
  createDefaultWidgetDefinitions,
  createDefaultDashboardLayout,
  createDefaultCommandCenterConfiguration,
} from '../types';
import type { CopilotContext, WidgetDefinition, WidgetDataProvider, WidgetCategory, WidgetData, DashboardLayout, SearchQuery } from '../types';

function createMockContext(): CopilotContext {
  return {
    sources: [
      { type: 'health_score', available: true, data: 75, confidence: 0.9, evidence: [], futureMetadata: {} },
      { type: 'recommendations', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'predictions', available: true, data: [], confidence: 0.75, evidence: [], futureMetadata: {} },
      { type: 'timeline', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'goals', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'recovery_history', available: true, data: [], confidence: 0.85, evidence: [], futureMetadata: {} },
      { type: 'maintenance', available: true, data: [], confidence: 0.8, evidence: [], futureMetadata: {} },
      { type: 'automation', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
      { type: 'user_preferences', available: true, data: {}, confidence: 1.0, evidence: [], futureMetadata: {} },
    ],
    healthScore: 75,
    deviceProfile: { profileType: 'gaming', performanceTier: 'high', confidence: 0.9, futureMetadata: {} },
    activeGoals: [
      { id: 'g1', name: 'Improve Performance', status: 'in_progress', priority: 'high', progress: 0.5, futureMetadata: {} },
      { id: 'g2', name: 'Clean Storage', status: 'completed', priority: 'medium', progress: 1.0, futureMetadata: {} },
    ],
    recentTimelineEvents: [
      { id: 't1', title: 'Optimization completed', timestamp: new Date().toISOString(), category: 'optimization', severity: 'low', futureMetadata: {} },
    ],
    activeRecommendations: [
      { id: 'r1', title: 'Clean temp files', category: 'storage', priority: 'high', confidence: 0.85, futureMetadata: {} },
      { id: 'r2', title: 'Disable startup apps', category: 'performance', priority: 'medium', confidence: 0.75, futureMetadata: {} },
    ],
    activePredictions: [
      { id: 'p1', title: 'Disk space warning', category: 'storage', riskLevel: 'medium', confidence: 0.7, futureMetadata: {} },
    ],
    maintenanceHistory: [{ id: 'm1', type: 'routine', timestamp: new Date().toISOString(), success: true, futureMetadata: {} }],
    optimizationHistory: [{ id: 'o1', timestamp: new Date().toISOString(), goal: 'quick_boost', success: true, healthDelta: 5, futureMetadata: {} }],
    recoveryHistory: [{ id: 'rc1', timestamp: new Date().toISOString(), type: 'rollback', success: true, futureMetadata: {} }],
    userPreferences: { theme: 'dark' },
    futureMetadata: {},
  } as CopilotContext;
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Command Center Types & Helpers', () => {
  it('should generate unique widget IDs', () => {
    const id1 = generateWidgetId();
    const id2 = generateWidgetId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^widget_/);
  });

  it('should generate unique layout IDs', () => {
    const id1 = generateLayoutId();
    const id2 = generateLayoutId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^layout_/);
  });

  it('should return category labels', () => {
    expect(getWidgetCategoryLabel('health')).toBe('Health Overview');
    expect(getWidgetCategoryLabel('recommendations')).toBe('AI Recommendations');
  });

  it('should return priority labels', () => {
    expect(getWidgetPriorityLabel('critical')).toBe('Critical');
    expect(getWidgetPriorityLabel('high')).toBe('High');
  });

  it('should create default widget definitions', () => {
    const defs = createDefaultWidgetDefinitions();
    expect(defs.length).toBe(12);
    expect(defs.some((d) => d.category === 'health')).toBe(true);
    expect(defs.some((d) => d.category === 'quick_actions')).toBe(true);
  });

  it('should create default dashboard layout', () => {
    const layout = createDefaultDashboardLayout();
    expect(layout.widgets.length).toBe(12);
    expect(layout.type).toBe('grid');
  });
});

// ── Configuration ────────────────────────────────────────────

describe('Command Center Configuration', () => {
  it('should provide default configuration', () => {
    expect(DEFAULT_COMMAND_CENTER_CONFIGURATION.configVersion).toBe('1.0.0');
    expect(DEFAULT_COMMAND_CENTER_CONFIGURATION.featureFlags.enableCommandCenter).toBe(true);
  });

  it('should create configuration with overrides', () => {
    const config = createCommandCenterConfiguration({ configVersion: '2.0.0' });
    expect(config.configVersion).toBe('2.0.0');
  });

  it('should validate configuration', () => {
    const result = validateCommandCenterConfiguration(DEFAULT_COMMAND_CENTER_CONFIGURATION);
    expect(result.valid).toBe(true);
  });

  it('should detect invalid configuration', () => {
    const config = createCommandCenterConfiguration({ configVersion: '' });
    const result = validateCommandCenterConfiguration(config);
    expect(result.valid).toBe(false);
  });
});

// ── Events ───────────────────────────────────────────────────

describe('Command Center Events', () => {
  let events: CommandCenterEvents;

  beforeEach(() => {
    events = new CommandCenterEvents();
  });

  it('should register and emit events', () => {
    let received = false;
    events.on('dashboard_loaded', () => { received = true; });
    events.emit({ type: 'dashboard_loaded', timestamp: new Date().toISOString(), data: null });
    expect(received).toBe(true);
  });

  it('should unregister listeners', () => {
    let count = 0;
    const listener = () => { count++; };
    events.on('widget_refreshed', listener);
    events.emit({ type: 'widget_refreshed', timestamp: new Date().toISOString(), data: null });
    events.off('widget_refreshed', listener);
    events.emit({ type: 'widget_refreshed', timestamp: new Date().toISOString(), data: null });
    expect(count).toBe(1);
  });
});

// ── Widget Registry ──────────────────────────────────────────

describe('Widget Registry', () => {
  let registry: CommandCenterWidgetRegistry;

  beforeEach(() => {
    registry = new CommandCenterWidgetRegistry();
  });

  it('should register widget definitions', () => {
    const defs = createDefaultWidgetDefinitions();
    for (const def of defs) expect(registry.register(def)).toBe(true);
    expect(registry.count()).toBe(12);
  });

  it('should not register duplicates', () => {
    const def = createDefaultWidgetDefinitions()[0]!;
    expect(registry.register(def)).toBe(true);
    expect(registry.register(def)).toBe(false);
  });

  it('should unregister widgets', () => {
    const def = createDefaultWidgetDefinitions()[0]!;
    registry.register(def);
    expect(registry.unregister(def.id)).toBe(true);
    expect(registry.hasWidget(def.id)).toBe(false);
  });

  it('should search widgets', () => {
    for (const def of createDefaultWidgetDefinitions()) registry.register(def);
    const results = registry.search('health');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should get by category', () => {
    for (const def of createDefaultWidgetDefinitions()) registry.register(def);
    const results = registry.getByCategory('goals');
    expect(results.length).toBe(1);
  });

  it('should register providers', () => {
    const def = createDefaultWidgetDefinitions()[0]!;
    registry.register(def);
    const provider: WidgetDataProvider = {
      getProviderName: () => 'test',
      getCategory: () => 'health' as WidgetCategory,
      fetchData: async () => ({ widgetId: def.id, category: 'health', content: {}, evidence: [], confidence: 1, timestamp: new Date().toISOString(), futureMetadata: {} }),
    };
    registry.registerProvider(def.id, provider);
    expect(registry.getProvider(def.id)).not.toBeNull();
  });
});

// ── Widget Manager ───────────────────────────────────────────

describe('Widget Manager', () => {
  let registry: CommandCenterWidgetRegistry;
  let manager: CommandCenterWidgetManager;

  beforeEach(() => {
    registry = new CommandCenterWidgetRegistry();
    manager = new CommandCenterWidgetManager(registry);
    const defs = createDefaultWidgetDefinitions();
    for (const def of defs) registry.register(def);
    manager.initializeWidgets(defs);
  });

  it('should initialize widget instances', () => {
    expect(manager.getAllInstances().length).toBe(12);
  });

  it('should get instance by id', () => {
    const instance = manager.getInstance('widget_health');
    expect(instance).not.toBeNull();
    expect(instance!.definition.category).toBe('health');
  });

  it('should set widget status', () => {
    expect(manager.setWidgetStatus('widget_health', 'collapsed')).toBe(true);
    expect(manager.getInstance('widget_health')!.status).toBe('collapsed');
  });

  it('should refresh widget with provider', async () => {
    const def = registry.getDefinition('widget_health')!;
    registry.registerProvider(def.id, {
      getProviderName: () => 'health_provider',
      getCategory: () => 'health',
      fetchData: async () => ({
        widgetId: 'widget_health', category: 'health', content: { score: 75 },
        evidence: [], confidence: 0.9, timestamp: new Date().toISOString(), futureMetadata: {},
      }),
    });
    const data = await manager.refreshWidget('widget_health', createMockContext());
    expect(data).not.toBeNull();
    expect(data!.content.score).toBe(75);
  });

  it('should handle missing provider', async () => {
    const data = await manager.refreshWidget('widget_goals', createMockContext());
    expect(data).toBeNull();
    expect(manager.getInstance('widget_goals')!.status).toBe('error');
  });

  it('should get visible widgets', () => {
    manager.setWidgetStatus('widget_health', 'hidden');
    const visible = manager.getVisibleWidgets();
    expect(visible.length).toBe(11);
  });
});

// ── Data Aggregator ──────────────────────────────────────────

describe('Data Aggregator', () => {
  let aggregator: CommandCenterDataAggregator;

  beforeEach(() => {
    aggregator = new CommandCenterDataAggregator();
  });

  it('should aggregate all data sources', () => {
    const vm = aggregator.aggregate(createMockContext());
    expect(vm.health).not.toBeNull();
    expect(vm.health!.score).toBe(75);
    expect(vm.goals).not.toBeNull();
    expect(vm.goals!.activeGoals.length).toBe(2);
    expect(vm.recommendations).not.toBeNull();
    expect(vm.recommendations!.total).toBe(2);
    expect(vm.predictions).not.toBeNull();
    expect(vm.predictions!.total).toBe(1);
    expect(vm.maintenance).not.toBeNull();
    expect(vm.timeline).not.toBeNull();
    expect(vm.recovery).not.toBeNull();
    expect(vm.deviceProfile).not.toBeNull();
    expect(vm.optimization).not.toBeNull();
  });

  it('should handle null health score', () => {
    const ctx = createMockContext();
    ctx.healthScore = null;
    const vm = aggregator.aggregate(ctx);
    expect(vm.health!.score).toBeNull();
    expect(vm.health!.level).toBe('unknown');
  });

  it('should compute health trend', () => {
    const vm = aggregator.aggregate(createMockContext());
    expect(['improving', 'declining', 'stable', 'unknown']).toContain(vm.health!.trend);
  });
});

// ── View Model Engine ────────────────────────────────────────

describe('View Model Engine', () => {
  let engine: CommandCenterViewModelEngine;

  beforeEach(() => {
    engine = new CommandCenterViewModelEngine();
  });

  it('should build view model', () => {
    const vm = engine.build(createMockContext());
    expect(vm.health).not.toBeNull();
    expect(vm.generatedAt).toBeDefined();
  });

  it('should cache view model', () => {
    const ctx = createMockContext();
    const vm1 = engine.build(ctx);
    const vm2 = engine.build(ctx);
    expect(vm1).toBe(vm2);
  });

  it('should clear cache', () => {
    engine.build(createMockContext());
    engine.clearCache();
    expect(engine.getCached()).toBeNull();
  });

  it('should get summary', () => {
    const vm = engine.build(createMockContext());
    const summary = engine.getSummary(vm);
    expect(summary.healthScore).toBe(75);
    expect(summary.activeGoals).toBe(2);
    expect(summary.activeRecommendations).toBe(2);
  });
});

// ── Layout Engine ────────────────────────────────────────────

describe('Layout Engine', () => {
  let engine: CommandCenterLayoutEngine;

  beforeEach(() => {
    engine = new CommandCenterLayoutEngine();
    engine.setDefaultLayout(createDefaultDashboardLayout());
  });

  it('should get current layout', () => {
    const layout = engine.getCurrentLayout();
    expect(layout).not.toBeNull();
    expect(layout!.widgets.length).toBe(12);
  });

  it('should save and load layouts', () => {
    const layout = engine.getCurrentLayout()!;
    const id = engine.saveLayout(layout);
    expect(id).toBeDefined();
    const loaded = engine.loadLayout(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe(layout.name);
  });

  it('should set widget status', () => {
    engine.setWidgetStatus('widget_health', 'hidden');
    const visible = engine.getVisibleWidgetIds();
    expect(visible).not.toContain('widget_health');
  });

  it('should reorder widgets', () => {
    const ids = engine.getVisibleWidgetIds();
    const reordered = [...ids].reverse();
    engine.reorderWidgets(reordered);
    const visible = engine.getVisibleWidgetIds();
    expect(visible[0]).toBe(reordered[0]);
  });

  it('should resize widgets', () => {
    expect(engine.resizeWidget('widget_health', 2, 3)).toBe(true);
  });

  it('should delete saved layouts', () => {
    const id = engine.saveLayout(engine.getCurrentLayout()!);
    expect(engine.deleteLayout(id)).toBe(true);
    expect(engine.loadLayout(id)).toBeNull();
  });
});

// ── Refresh Engine ───────────────────────────────────────────

describe('Refresh Engine', () => {
  let registry: CommandCenterWidgetRegistry;
  let widgetManager: CommandCenterWidgetManager;
  let refreshEngine: CommandCenterRefreshEngine;

  beforeEach(() => {
    registry = new CommandCenterWidgetRegistry();
    widgetManager = new CommandCenterWidgetManager(registry);
    refreshEngine = new CommandCenterRefreshEngine(widgetManager);
    const defs = createDefaultWidgetDefinitions();
    for (const def of defs) registry.register(def);
    widgetManager.initializeWidgets(defs);
    refreshEngine.setContextProvider(() => createMockContext());
  });

  it('should refresh a widget', async () => {
    const def = registry.getDefinition('widget_health')!;
    registry.registerProvider(def.id, {
      getProviderName: () => 'test',
      getCategory: () => 'health',
      fetchData: async () => ({ widgetId: 'widget_health', category: 'health', content: {}, evidence: [], confidence: 1, timestamp: new Date().toISOString(), futureMetadata: {} }),
    });
    await refreshEngine.refreshWidget('widget_health');
    expect(widgetManager.getInstance('widget_health')!.data).not.toBeNull();
  });

  it('should set and get policies', () => {
    refreshEngine.setPolicy('widget_health', { type: 'manual', intervalMs: 0, enabled: true, futureMetadata: {} });
    expect(refreshEngine.getPolicy('widget_health')).not.toBeNull();
  });
});

// ── State Manager ────────────────────────────────────────────

describe('State Manager', () => {
  let stateManager: CommandCenterStateManager;

  beforeEach(() => {
    const registry = new CommandCenterWidgetRegistry();
    const widgetManager = new CommandCenterWidgetManager(registry);
    const viewModelEngine = new CommandCenterViewModelEngine();
    const layoutEngine = new CommandCenterLayoutEngine();
    layoutEngine.setDefaultLayout(createDefaultDashboardLayout());
    for (const def of createDefaultWidgetDefinitions()) registry.register(def);
    widgetManager.initializeWidgets(createDefaultWidgetDefinitions());
    stateManager = new CommandCenterStateManager(layoutEngine, widgetManager, viewModelEngine, registry);
  });

  it('should get initial state', () => {
    const state = stateManager.getState();
    expect(state.isLoading).toBe(false);
    expect(state.viewModel).toBeNull();
  });

  it('should set loading', () => {
    stateManager.setLoading(true);
    expect(stateManager.getState().isLoading).toBe(true);
  });

  it('should update view model', () => {
    const vm = stateManager.updateViewModel(createMockContext());
    expect(vm.health).not.toBeNull();
    expect(stateManager.getState().viewModel).not.toBeNull();
  });

  it('should search', () => {
    stateManager.updateViewModel(createMockContext());
    const results = stateManager.search({ query: 'Performance' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('should reset', () => {
    stateManager.updateViewModel(createMockContext());
    stateManager.reset();
    expect(stateManager.getState().viewModel).toBeNull();
  });
});

// ── Analytics ────────────────────────────────────────────────

describe('Command Center Analytics', () => {
  let analytics: CommandCenterAnalytics;

  beforeEach(() => {
    analytics = new CommandCenterAnalytics();
  });

  it('should record dashboard loads', () => {
    analytics.recordDashboardLoad(250);
    analytics.recordDashboardLoad(350);
    const data = analytics.getAnalytics();
    expect(data.totalDashboardLoads).toBe(2);
    expect(data.averageLoadTimeMs).toBe(300);
  });

  it('should record widget refreshes', () => {
    analytics.recordWidgetRefresh('widget_health', 50);
    analytics.recordWidgetRefresh('widget_health', 70);
    const data = analytics.getAnalytics();
    expect(data.totalWidgetRefreshes).toBe(2);
    expect(data.byWidget['widget_health']).toBe(2);
  });

  it('should record layout saves and loads', () => {
    analytics.recordLayoutSave();
    analytics.recordLayoutLoad();
    const data = analytics.getAnalytics();
    expect(data.totalLayoutSaves).toBe(1);
    expect(data.totalLayoutLoads).toBe(1);
  });

  it('should reset', () => {
    analytics.recordDashboardLoad(100);
    analytics.reset();
    expect(analytics.getAnalytics().totalDashboardLoads).toBe(0);
  });
});

// ── CommandCenterManager (Integration) ───────────────────────

describe('CommandCenterManager', () => {
  let manager: CommandCenterManager;

  beforeEach(() => {
    manager = new CommandCenterManager();
    manager.setContextProvider(() => createMockContext());
  });

  it('should load dashboard', async () => {
    const state = await manager.loadDashboard();
    expect(state.isLoading).toBe(false);
    expect(state.lastLoadedAt).not.toBeNull();
    expect(state.viewModel).not.toBeNull();
    expect(state.widgets.length).toBe(12);
  });

  it('should refresh widget', async () => {
    await manager.loadDashboard();
    // No provider registered, so it will set error but not throw
    await manager.refreshWidget('widget_health');
    const instance = manager.getWidgetManager().getInstance('widget_health');
    expect(instance!.status === 'error' || instance!.status === 'visible').toBe(true);
  });

  it('should refresh all', async () => {
    await manager.loadDashboard();
    await manager.refreshAll();
    expect(manager.getDashboardState().lastUpdatedAt).not.toBeNull();
  });

  it('should save and load layout', () => {
    const id = manager.saveLayout();
    expect(id).toBeDefined();
    const loaded = manager.loadLayout(id);
    expect(loaded).not.toBeNull();
  });

  it('should register custom widget', () => {
    const customDef: WidgetDefinition = {
      id: 'widget_custom',
      title: 'Custom Widget',
      category: 'future_category',
      priority: 'low',
      layout: { type: 'grid', columns: 1, rows: 1, order: 99, resizable: true, futureMetadata: {} },
      refreshPolicy: { type: 'manual', intervalMs: 0, enabled: true, futureMetadata: {} },
      requiredCapabilities: [],
      requiredPermissions: 'free',
      supportedActions: [],
      dataProvider: 'custom_provider',
      futureMetadata: {},
    };
    expect(manager.registerWidget(customDef)).toBe(true);
    expect(manager.getRegistry().hasWidget('widget_custom')).toBe(true);
  });

  it('should get dashboard state', async () => {
    await manager.loadDashboard();
    const state = manager.getDashboardState();
    expect(state).toBeDefined();
    expect(state.widgets.length).toBe(12);
  });

  it('should get view model', async () => {
    await manager.loadDashboard();
    const vm = manager.getViewModel();
    expect(vm).not.toBeNull();
    expect(vm!.health!.score).toBe(75);
  });

  it('should search', async () => {
    await manager.loadDashboard();
    const results = manager.search({ query: 'Performance' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('should set widget status', async () => {
    await manager.loadDashboard();
    manager.setWidgetStatus('widget_health', 'hidden');
    await manager.refreshAll();
    const state = manager.getDashboardState();
    const widget = state.widgets.find((w) => w.definition.id === 'widget_health');
    expect(widget!.status).toBe('hidden');
  });

  it('should reorder widgets', () => {
    const ids = manager.getDashboardState().widgets.map((w) => w.definition.id);
    const reordered = [...ids].reverse();
    manager.reorderWidgets(reordered);
  });

  it('should get analytics', async () => {
    await manager.loadDashboard();
    const analytics = manager.getAnalytics();
    expect(analytics.totalDashboardLoads).toBe(1);
  });

  it('should throw when disabled', async () => {
    manager.updateConfig({ featureFlags: { ...DEFAULT_COMMAND_CENTER_CONFIGURATION.featureFlags, enableCommandCenter: false } });
    await expect(manager.loadDashboard()).rejects.toThrow();
  });

  it('should clear all', () => {
    manager.clearAll();
    expect(manager.getDashboardState().widgets.length).toBe(0);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Command Center Performance', () => {
  let manager: CommandCenterManager;

  beforeEach(() => {
    manager = new CommandCenterManager();
    manager.setContextProvider(() => createMockContext());
  });

  it('should load dashboard under 300ms', async () => {
    const start = Date.now();
    await manager.loadDashboard();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(300);
  });

  it('should search under 50ms', async () => {
    await manager.loadDashboard();
    const start = Date.now();
    manager.search({ query: 'health' });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Command Center Edge Cases', () => {
  it('should handle empty context', () => {
    const aggregator = new CommandCenterDataAggregator();
    const emptyCtx: CopilotContext = {
      sources: [], healthScore: null, deviceProfile: null, activeGoals: [],
      recentTimelineEvents: [], activeRecommendations: [], activePredictions: [],
      maintenanceHistory: [], optimizationHistory: [], recoveryHistory: [],
      userPreferences: {}, futureMetadata: {},
    } as CopilotContext;
    const vm = aggregator.aggregate(emptyCtx);
    expect(vm.health!.score).toBeNull();
    expect(vm.goals!.activeGoals.length).toBe(0);
    expect(vm.deviceProfile).toBeNull();
  });

  it('should handle dashboard load without context provider', async () => {
    const manager = new CommandCenterManager();
    const state = await manager.loadDashboard();
    expect(state.widgets.length).toBe(12);
    expect(state.viewModel).toBeNull();
  });

  it('should handle empty search query', async () => {
    const manager = new CommandCenterManager();
    manager.setContextProvider(() => createMockContext());
    await manager.loadDashboard();
    const results = manager.search({ query: '' });
    // Empty query matches all widgets
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle non-existent layout load', () => {
    const manager = new CommandCenterManager();
    expect(manager.loadLayout('nonexistent')).toBeNull();
  });

  it('should handle non-existent widget refresh', async () => {
    const manager = new CommandCenterManager();
    manager.setContextProvider(() => createMockContext());
    await manager.refreshWidget('nonexistent');
    // Should not throw
  });
});
