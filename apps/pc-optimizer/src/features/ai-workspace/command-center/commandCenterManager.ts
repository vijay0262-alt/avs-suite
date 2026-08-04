/**
 * AI Command Center — Manager
 *
 * EPIC 5 PHASE A PART 3
 *
 * Main public API facade for the AI Command Center.
 * Public APIs: loadDashboard(), refreshWidget(), refreshAll(),
 * saveLayout(), loadLayout(), registerWidget(), getDashboardState()
 *
 * The Command Center consumes existing AI modules via AIAssistantContext.
 * It MUST NOT duplicate business logic or execute optimizations.
 */
import type {
  CommandCenterConfiguration,
  WidgetDefinition,
  WidgetDataProvider,
  WidgetPlugin,
  DashboardLayout,
  DashboardState,
  WidgetStatus,
  AIAssistantContext,
  SearchResult,
  SearchQuery,
  CommandCenterAnalytics as CommandCenterAnalyticsData,
  CommandCenterViewModel,
  RefreshPolicy,
} from './types';
import type { AIAssistantSuggestion, AIAssistantActionPlan } from '../AIAssistant/types';
import { DEFAULT_COMMAND_CENTER_CONFIGURATION, createCommandCenterConfiguration, validateCommandCenterConfiguration } from './commandCenterConfiguration';
import { CommandCenterEvents, commandCenterEvents } from './commandCenterEvents';
import { CommandCenterWidgetRegistry } from './commandCenterWidgetRegistry';
import { CommandCenterWidgetManager } from './commandCenterWidgetManager';
import { CommandCenterDataAggregator } from './commandCenterDataAggregator';
import { CommandCenterViewModelEngine } from './commandCenterViewModel';
import { CommandCenterLayoutEngine } from './commandCenterLayoutEngine';
import { CommandCenterRefreshEngine } from './commandCenterRefreshEngine';
import { CommandCenterStateManager } from './commandCenterStateManager';
import { CommandCenterAnalytics } from './commandCenterAnalytics';

export class CommandCenterManager {
  private _config: CommandCenterConfiguration;
  private _events: CommandCenterEvents;
  private _registry: CommandCenterWidgetRegistry;
  private _widgetManager: CommandCenterWidgetManager;
  private _aggregator: CommandCenterDataAggregator;
  private _viewModelEngine: CommandCenterViewModelEngine;
  private _layoutEngine: CommandCenterLayoutEngine;
  private _refreshEngine: CommandCenterRefreshEngine;
  private _stateManager: CommandCenterStateManager;
  private _analytics: CommandCenterAnalytics;
  private _contextProvider: (() => AIAssistantContext) | null = null;

  constructor(config?: Partial<CommandCenterConfiguration>) {
    this._config = config
      ? createCommandCenterConfiguration(config as never)
      : structuredClone(DEFAULT_COMMAND_CENTER_CONFIGURATION);

    const validation = validateCommandCenterConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid Command Center configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new CommandCenterEvents();
    this._registry = new CommandCenterWidgetRegistry();
    this._widgetManager = new CommandCenterWidgetManager(this._registry);
    this._aggregator = new CommandCenterDataAggregator();
    this._viewModelEngine = new CommandCenterViewModelEngine();
    this._layoutEngine = new CommandCenterLayoutEngine();
    this._layoutEngine.setDefaultLayout(this._config.defaultLayout);
    this._refreshEngine = new CommandCenterRefreshEngine(this._widgetManager);
    this._stateManager = new CommandCenterStateManager(
      this._layoutEngine,
      this._widgetManager,
      this._viewModelEngine,
      this._registry,
    );
    this._analytics = new CommandCenterAnalytics();

    // Register default widget definitions
    for (const def of this._config.widgetDefinitions) {
      this._registry.register(def);
    }
    this._widgetManager.initializeWidgets(this._config.widgetDefinitions);
  }

  // ── Public API ──────────────────────────────────────────────

  setContextProvider(provider: () => AIAssistantContext): void {
    this._contextProvider = provider;
    this._refreshEngine.setContextProvider(provider);
  }

  async loadDashboard(): Promise<DashboardState> {
    if (!this._config.featureFlags.enableCommandCenter) {
      throw new Error('Command Center is disabled');
    }

    const start = Date.now();
    this._stateManager.setLoading(true);

    // Build view model if context is available
    if (this._contextProvider) {
      const context = this._contextProvider();
      this._stateManager.updateViewModel(context);
    }

    // Update widget instances in state
    this._stateManager.updateWidgets(this._widgetManager.getAllInstances());

    this._stateManager.markLoaded();

    const loadTime = Date.now() - start;
    this._analytics.recordDashboardLoad(loadTime);

    this._events.emit({
      type: 'dashboard_loaded',
      timestamp: new Date().toISOString(),
      data: { loadTimeMs: loadTime },
    });

    return this._stateManager.getState();
  }

  async refreshWidget(widgetId: string): Promise<void> {
    if (!this._contextProvider) return;
    const start = Date.now();
    const context = this._contextProvider();
    await this._widgetManager.refreshWidget(widgetId, context);
    const refreshTime = Date.now() - start;
    this._analytics.recordWidgetRefresh(widgetId, refreshTime);

    this._events.emit({
      type: 'widget_refreshed',
      timestamp: new Date().toISOString(),
      data: { widgetId, refreshTimeMs: refreshTime },
    });
  }

  async refreshAll(): Promise<void> {
    if (!this._contextProvider) return;
    const context = this._contextProvider();
    await this._widgetManager.refreshAll(context);
    this._stateManager.updateWidgets(this._widgetManager.getAllInstances());

    this._events.emit({
      type: 'dashboard_updated',
      timestamp: new Date().toISOString(),
      data: null,
    });
  }

  saveLayout(layout?: DashboardLayout): string {
    const toSave = layout ?? this._layoutEngine.getCurrentLayout()!;
    const id = this._layoutEngine.saveLayout(toSave);
    this._analytics.recordLayoutSave();

    this._events.emit({
      type: 'layout_saved',
      timestamp: new Date().toISOString(),
      data: { layoutId: id },
    });

    return id;
  }

  loadLayout(layoutId: string): DashboardLayout | null {
    const layout = this._layoutEngine.loadLayout(layoutId);
    if (layout) {
      this._analytics.recordLayoutLoad();
      this._stateManager.setLayout(layout);

      this._events.emit({
        type: 'layout_loaded',
        timestamp: new Date().toISOString(),
        data: { layoutId },
      });
    }
    return layout;
  }

  registerWidget(definition: WidgetDefinition, provider?: WidgetDataProvider): boolean {
    if (!this._config.featureFlags.enableWidgets) {
      throw new Error('Widget registration is disabled');
    }

    const registered = this._registry.register(definition);
    if (registered) {
      this._widgetManager.initializeWidgets([definition]);
      if (provider) {
        this._registry.registerProvider(definition.id, provider);
      }

      this._events.emit({
        type: 'widget_registered',
        timestamp: new Date().toISOString(),
        data: definition,
      });
    }
    return registered;
  }

  getDashboardState(): DashboardState {
    return this._stateManager.getState();
  }

  // ── Widget Management ───────────────────────────────────────

  setWidgetStatus(widgetId: string, status: WidgetStatus): boolean {
    const ok1 = this._widgetManager.setWidgetStatus(widgetId, status);
    const ok2 = this._layoutEngine.setWidgetStatus(widgetId, status);
    return ok1 || ok2;
  }

  reorderWidgets(orderedIds: string[]): void {
    this._widgetManager.reorderWidgets(orderedIds);
    this._layoutEngine.reorderWidgets(orderedIds);
  }

  resizeWidget(widgetId: string, columns: number, rows: number): boolean {
    return this._layoutEngine.resizeWidget(widgetId, columns, rows);
  }

  // ── View Model ──────────────────────────────────────────────

  getViewModel(): CommandCenterViewModel | null {
    return this._stateManager.getState().viewModel;
  }

  updateViewModel(
    context: AIAssistantContext,
    suggestions: AIAssistantSuggestion[] = [],
    actions: AIAssistantActionPlan[] = [],
  ): CommandCenterViewModel {
    return this._stateManager.updateViewModel(context, suggestions, actions);
  }

  // ── Search ──────────────────────────────────────────────────

  search(query: SearchQuery): SearchResult[] {
    if (!this._config.featureFlags.enableSearch) return [];
    return this._stateManager.search(query);
  }

  // ── Refresh ─────────────────────────────────────────────────

  setRefreshPolicy(widgetId: string, policy: RefreshPolicy): void {
    this._refreshEngine.setPolicy(widgetId, policy);
  }

  startAutoRefresh(): void {
    this._refreshEngine.startAutoRefresh();
  }

  stopAutoRefresh(): void {
    this._refreshEngine.stopAutoRefresh();
  }

  // ── Analytics ───────────────────────────────────────────────

  getAnalytics(): CommandCenterAnalyticsData {
    return this._analytics.getAnalytics();
  }

  // ── Configuration ───────────────────────────────────────────

  getConfig(): CommandCenterConfiguration {
    return this._config;
  }

  updateConfig(config: Partial<CommandCenterConfiguration>): void {
    this._config = createCommandCenterConfiguration(config as never);
  }

  // ── Plugin Registration ─────────────────────────────────────

  registerPlugin(plugin: WidgetPlugin): boolean {
    if (!this._config.featureFlags.enableWidgets) return false;
    return this._registry.registerPlugin(plugin);
  }

  unregisterPlugin(pluginName: string): boolean {
    return this._registry.unregisterPlugin(pluginName);
  }

  // ── Events ──────────────────────────────────────────────────

  on(type: never, listener: never): void {
    this._events.on(type, listener);
  }

  off(type: never, listener: never): void {
    this._events.off(type, listener);
  }

  getEvents(): CommandCenterEvents {
    return this._events;
  }

  // ── Utility ─────────────────────────────────────────────────

  getRegistry(): CommandCenterWidgetRegistry {
    return this._registry;
  }

  getWidgetManager(): CommandCenterWidgetManager {
    return this._widgetManager;
  }

  getLayoutEngine(): CommandCenterLayoutEngine {
    return this._layoutEngine;
  }

  clearAll(): void {
    this._refreshEngine.clear();
    this._widgetManager.clear();
    this._registry.clear();
    this._layoutEngine.clearSavedLayouts();
    this._analytics.reset();
    this._events.removeAllListeners();
    this._stateManager.reset();
  }
}

export { commandCenterEvents };
