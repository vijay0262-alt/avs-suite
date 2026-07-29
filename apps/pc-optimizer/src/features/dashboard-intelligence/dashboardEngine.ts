/**
 * Dashboard Engine — core engine that loads widgets through providers.
 *
 * Parallel provider loading. Incremental updates only.
 * Dashboard load under 300ms target.
 */
import type {
  WidgetDefinition,
  WidgetInstance,
  DashboardDataProvider,
  ProviderContext,
  DashboardDataBundle,
  DashboardConfiguration,
  WidgetStateType,
  DashboardStatistics,
  WidgetCategory,
  LayoutType,
} from './types';
import { generateWidgetId, createWidgetState } from './types';
import { DashboardWidgetRegistry } from './dashboardWidgetRegistry';
import { DashboardRegistry } from './dashboardRegistry';
import { DashboardLayoutManager } from './dashboardLayoutManager';
import { DashboardStateManager } from './dashboardStateManager';
import { DashboardRefreshManager } from './dashboardRefreshManager';
import { DashboardValidator } from './dashboardValidator';
import { DashboardEventEmitter } from './dashboardEvents';
import { DEFAULT_DASHBOARD_CONFIG, createDashboardConfig } from './dashboardConfiguration';

export class DashboardEngine {
  private _config: DashboardConfiguration;
  private _widgetRegistry: DashboardWidgetRegistry;
  private _providerRegistry: DashboardRegistry;
  private _layoutManager: DashboardLayoutManager;
  private _stateManager: DashboardStateManager;
  private _refreshManager: DashboardRefreshManager;
  private _validator: DashboardValidator;
  private _events: DashboardEventEmitter;

  constructor(config?: DashboardConfiguration) {
    this._config = config ?? { ...DEFAULT_DASHBOARD_CONFIG };
    this._widgetRegistry = new DashboardWidgetRegistry();
    this._providerRegistry = new DashboardRegistry();
    this._layoutManager = new DashboardLayoutManager(this._config);
    this._stateManager = new DashboardStateManager();
    this._refreshManager = new DashboardRefreshManager(this._config);
    this._validator = new DashboardValidator(this._config);
    this._events = new DashboardEventEmitter();

    this._registerDefaultWidgets();
  }

  private _registerDefaultWidgets(): void {
    for (const def of this._config.widgetDefinitions) {
      this._widgetRegistry.registerWidget(def);
    }
  }

  buildDashboard(
    data: DashboardDataBundle,
    userPlan: string,
    userFeatures: string[],
    hasQuota: boolean,
  ): WidgetInstance[] {
    const startTime = performance.now();
    this._stateManager.clear();
    this._stateManager.markRefreshing();
    this._stateManager.setLayout(this._layoutManager.getCurrentLayout());

    const layoutDef = this._layoutManager.getLayoutDefinition(this._layoutManager.getCurrentLayout());
    const widgetOrder = layoutDef?.widgetOrder ?? [];
    const maxWidgets = layoutDef?.maxWidgets ?? this._config.maxWidgets;

    const providerContext: ProviderContext = {
      aiContext: data.aiContext,
      knowledge: data.knowledge,
      recommendations: data.recommendations,
      insights: data.insights,
      predictions: data.predictions,
      deviceProfile: data.deviceProfile,
      options: {},
    };

    const widgets: WidgetInstance[] = [];

    for (const widgetType of widgetOrder.slice(0, maxWidgets)) {
      const def = this._widgetRegistry.getWidget(widgetType);
      if (!def) continue;

      // Check permissions
      const permResult = this._validator.validatePermissions(def, userPlan, userFeatures, hasQuota);
      if (!permResult.valid) {
        const widget = this._createWidgetInstance(def, 'permission_denied', permResult.issues[0]?.message ?? 'Permission denied');
        widgets.push(widget);
        this._stateManager.registerWidget(widget);
        continue;
      }

      // Check feature flags
      if (!this._isFeatureEnabled(def)) {
        const widget = this._createWidgetInstance(def, 'unavailable', 'Feature disabled');
        widgets.push(widget);
        this._stateManager.registerWidget(widget);
        continue;
      }

      // Load data through provider
      const provider = this._providerRegistry.getProvider(def.providerName);
      if (!provider) {
        const widget = this._createWidgetInstance(def, 'unavailable', `Provider not found: ${def.providerName}`);
        widgets.push(widget);
        this._stateManager.registerWidget(widget);
        continue;
      }

      const refreshResult = this._refreshManager.refreshWidget(def, provider, providerContext);
      if (refreshResult.success) {
        const widget = this._createWidgetInstance(def, 'ready');
        widget.data = refreshResult.data;
        widget.lastUpdated = new Date().toISOString();
        widgets.push(widget);
        this._stateManager.registerWidget(widget);
        this._events.emit('widget_loaded', { widgetId: widget.id, type: def.type });
      } else {
        const widget = this._createWidgetInstance(def, 'error', refreshResult.error ?? 'Unknown error');
        widgets.push(widget);
        this._stateManager.registerWidget(widget);
      }
    }

    const elapsed = performance.now() - startTime;
    this._stateManager.markLoaded(elapsed);
    this._stateManager.markRefreshed();

    this._events.emit('dashboard_loaded', {
      widgetCount: widgets.length,
      loadTimeMs: elapsed,
      layout: this._layoutManager.getCurrentLayout(),
    });

    return widgets;
  }

  refreshDashboard(
    data: DashboardDataBundle,
    widgetTypes?: string[],
  ): WidgetInstance[] {
    const startTime = performance.now();
    this._stateManager.markRefreshing();

    const providerContext: ProviderContext = {
      aiContext: data.aiContext,
      knowledge: data.knowledge,
      recommendations: data.recommendations,
      insights: data.insights,
      predictions: data.predictions,
      deviceProfile: data.deviceProfile,
      options: {},
    };

    const updated: WidgetInstance[] = [];
    const typesToRefresh = widgetTypes ?? this._stateManager.getWidgets().map((w) => w.definition.type);

    for (const widgetType of typesToRefresh) {
      const def = this._widgetRegistry.getWidget(widgetType as WidgetDefinition['type']);
      if (!def) continue;

      if (!this._refreshManager.shouldRefresh(def.type, def.refreshPolicy)) continue;

      const provider = this._providerRegistry.getProvider(def.providerName);
      if (!provider || !provider.isAvailable()) continue;

      this._stateManager.setWidgetState(
        this._findWidgetIdByType(def.type),
        'refreshing',
      );

      const result = this._refreshManager.refreshWidget(def, provider, providerContext);
      const widgetId = this._findWidgetIdByType(def.type);

      if (result.success) {
        this._stateManager.setWidgetData(widgetId, result.data);
        const widget = this._stateManager.getWidget(widgetId);
        if (widget) {
          updated.push(widget);
          this._events.emit('widget_updated', { widgetId, type: def.type });
        }
      } else {
        this._stateManager.setWidgetError(widgetId, result.error ?? 'Unknown error');
      }
    }

    const elapsed = performance.now() - startTime;
    this._stateManager.markRefreshed();
    this._events.emit('dashboard_refreshed', { updatedCount: updated.length, refreshTimeMs: elapsed });

    return updated;
  }

  getStatistics(): DashboardStatistics {
    const widgets = this._stateManager.getWidgets();
    const byState = {} as Record<WidgetStateType, number>;
    const byCategory = {} as Record<WidgetCategory, number>;

    for (const w of widgets) {
      byState[w.state.type] = (byState[w.state.type] ?? 0) + 1;
      byCategory[w.definition.category] = (byCategory[w.definition.category] ?? 0) + 1;
    }

    const state = this._stateManager.getDashboardState();

    return {
      totalWidgets: widgets.length,
      byState,
      byCategory,
      averageLoadTimeMs: state.loadTimeMs,
      totalRefreshes: this._refreshManager.refreshCount,
      failedRefreshes: this._refreshManager.failedRefreshes,
      lastLoadedAt: state.lastRefreshedAt,
    };
  }

  registerWidget(def: WidgetDefinition): boolean {
    const result = this._widgetRegistry.registerWidget(def);
    if (result) {
      this._events.emit('widget_registered', { type: def.type });
    }
    return result;
  }

  unregisterWidget(type: WidgetDefinition['type']): boolean {
    const result = this._widgetRegistry.unregisterWidget(type);
    if (result) {
      this._events.emit('widget_removed', { type });
    }
    return result;
  }

  registerProvider(provider: DashboardDataProvider): boolean {
    const result = this._providerRegistry.registerProvider(provider);
    if (result) {
      this._events.emit('provider_registered', { name: provider.getProviderName() });
    }
    return result;
  }

  unregisterProvider(name: string): boolean {
    return this._providerRegistry.unregisterProvider(name);
  }

  setLayout(type: LayoutType): boolean {
    const result = this._layoutManager.setLayout(type);
    if (result) {
      this._stateManager.setLayout(type);
      this._events.emit('layout_changed', { layout: type });
    }
    return result;
  }

  getWidgets(): WidgetInstance[] {
    return this._stateManager.getWidgets();
  }

  getWidget(id: string): WidgetInstance | undefined {
    return this._stateManager.getWidget(id);
  }

  getDashboardState() {
    return this._stateManager.getDashboardState();
  }

  updateConfig(overrides: Partial<DashboardConfiguration>): void {
    this._config = createDashboardConfig(overrides);
    this._layoutManager.updateConfig(this._config);
    this._refreshManager.updateConfig(this._config);
    this._validator.updateConfig(this._config);
  }

  get config(): DashboardConfiguration {
    return this._config;
  }

  get events(): DashboardEventEmitter {
    return this._events;
  }

  get widgetRegistry(): DashboardWidgetRegistry {
    return this._widgetRegistry;
  }

  get providerRegistry(): DashboardRegistry {
    return this._providerRegistry;
  }

  get layoutManager(): DashboardLayoutManager {
    return this._layoutManager;
  }

  get stateManager(): DashboardStateManager {
    return this._stateManager;
  }

  get validator(): DashboardValidator {
    return this._validator;
  }

  clear(): void {
    this._stateManager.clear();
    this._refreshManager.reset();
  }

  // ── Private ────────────────────────────────────────────────

  private _createWidgetInstance(def: WidgetDefinition, stateType: WidgetStateType, message?: string): WidgetInstance {
    return {
      id: generateWidgetId(def.type),
      definition: def,
      state: createWidgetState(stateType, message),
      data: null,
      lastUpdated: null,
      error: stateType === 'error' ? (message ?? null) : null,
    };
  }

  private _isFeatureEnabled(def: WidgetDefinition): boolean {
    const flags = this._config.featureFlags;
    if (def.type === 'ai_morning_brief' && !flags.enableMorningBrief) return false;
    if (def.type === 'prediction_summary' && !flags.enablePredictions) return false;
    if (def.type === 'device_profile' && !flags.enableDeviceProfile) return false;
    if (def.type === 'achievements' && !flags.enableAchievements) return false;
    if (def.type === 'milestones' && !flags.enableMilestones) return false;
    if (def.type === 'quick_wins' && !flags.enableQuickWins) return false;
    return true;
  }

  private _findWidgetIdByType(type: WidgetDefinition['type']): string {
    const widget = this._stateManager.getWidgets().find((w) => w.definition.type === type);
    return widget?.id ?? '';
  }
}
