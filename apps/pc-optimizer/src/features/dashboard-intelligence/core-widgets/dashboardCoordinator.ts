/**
 * Dashboard Coordinator — top-level coordinator for core AI widgets.
 *
 * Responsible for:
 *   Widget ordering, priority resolution, refresh scheduling,
 *   Widget communication, shared state, global loading,
 *   Future dashboard actions.
 *
 * Public APIs:
 *   buildDashboard(), refreshWidgets(), getDashboardSummary(),
 *   getHealthWidget(), getRecommendationWidget(), getPredictionWidget(),
 *   getQuickWins(), getAchievements(), getDeviceProfile()
 */
import type {
  CoreWidgetDataBundle,
  CoreWidgetConfig,
  CoreWidgetId,
  DashboardSummary,
  WidgetLoadState,
  CoreWidgetEvent,
  CoreWidgetEventListener,
  HealthOverviewData,
  RecommendationData,
  QuickWinsData,
  PredictionData,
  AchievementData,
  OptimizationActivityData,
  DeviceProfileData,
} from './types';
import { createDefaultCoreWidgetConfig } from './types';
import { WidgetCoordinator } from './widgetCoordinator';
import { DashboardSummaryProvider } from './dashboardSummaryProvider';
import { HealthOverviewProvider } from './healthOverviewWidget';
import { RecommendationProvider } from './recommendationWidget';
import { QuickWinsProvider } from './quickWinsWidget';
import { PredictionProvider } from './predictionWidget';
import { AchievementProvider } from './achievementWidget';
import { OptimizationHistoryProvider } from './optimizationHistoryWidget';
import { DeviceProfileProvider } from './deviceProfileWidget';
import type { WidgetProvider } from '../widgets/types';

interface WidgetEntry {
  id: CoreWidgetId;
  provider: WidgetProvider;
  data: unknown | null;
  state: WidgetLoadState;
  lastUpdated: string | null;
  error: string | null;
}

export class DashboardCoordinator {
  private _config: CoreWidgetConfig;
  private _coordinator: WidgetCoordinator;
  private _summaryProvider: DashboardSummaryProvider;
  private _widgets: Map<CoreWidgetId, WidgetEntry> = new Map();
  private _lastSummary: DashboardSummary | null = null;
  private _lastBundle: CoreWidgetDataBundle | null = null;

  constructor(config?: CoreWidgetConfig) {
    this._config = config ?? createDefaultCoreWidgetConfig();
    this._coordinator = new WidgetCoordinator();
    this._summaryProvider = new DashboardSummaryProvider();
    this._registerProviders();
  }

  private _registerProviders(): void {
    const providers: [CoreWidgetId, WidgetProvider][] = [
      ['health_overview', new HealthOverviewProvider()],
      ['recommendations', new RecommendationProvider()],
      ['quick_wins', new QuickWinsProvider()],
      ['predictions', new PredictionProvider()],
      ['achievements', new AchievementProvider()],
      ['optimization_activity', new OptimizationHistoryProvider()],
      ['device_profile', new DeviceProfileProvider()],
    ];

    for (const [id, provider] of providers) {
      this._widgets.set(id, {
        id,
        provider,
        data: null,
        state: 'loading',
        lastUpdated: null,
        error: null,
      });
      this._coordinator.initWidget(id);
    }
  }

  async buildDashboard(
    bundle: CoreWidgetDataBundle,
    userPlan: string = 'FREE',
    userFeatures: string[] = [],
    hasQuota: boolean = true,
  ): Promise<void> {
    const startTime = performance.now();
    this._lastBundle = bundle;
    this._coordinator.startGlobalRefresh();

    const visibleWidgets = this._getVisibleWidgets();

    // Mark hidden widgets as unavailable
    for (const [id, entry] of this._widgets) {
      if (!visibleWidgets.includes(id)) {
        entry.state = 'unavailable';
        this._coordinator.setWidgetState(id, 'unavailable');
      }
    }

    // Parallel provider loading
    const loadPromises: Promise<void>[] = [];
    const orderedWidgets = this._orderWidgets(visibleWidgets);

    for (const widgetId of orderedWidgets) {
      const entry = this._widgets.get(widgetId);
      if (!entry) continue;

      // Check permissions
      if (!this._checkPermissions(widgetId, userPlan, userFeatures, hasQuota)) {
        entry.state = 'permission_denied';
        this._coordinator.setWidgetState(widgetId, 'permission_denied');
        continue;
      }

      // Check feature flags
      if (!this._isFeatureEnabled(widgetId)) {
        entry.state = 'unavailable';
        this._coordinator.setWidgetState(widgetId, 'unavailable');
        continue;
      }

      const promise = this._loadWidget(widgetId, bundle);
      if (this._config.parallelLoading) {
        loadPromises.push(promise);
      } else {
        await promise;
      }
    }

    if (this._config.parallelLoading) {
      await Promise.all(loadPromises);
    }

    this._coordinator.finishGlobalRefresh();
    this._lastSummary = this._summaryProvider.getSummary(bundle);
    this._coordinator.emitDashboardReady();

    const elapsed = performance.now() - startTime;
    void elapsed; // Performance tracking
  }

  async refreshWidgets(widgetIds?: CoreWidgetId[]): Promise<void> {
    if (!this._lastBundle) {
      this._coordinator.emitDashboardError('No data bundle available');
      return;
    }

    const ids = widgetIds ?? Array.from(this._widgets.keys());
    this._coordinator.startGlobalRefresh();

    const promises: Promise<void>[] = [];
    for (const id of ids) {
      const entry = this._widgets.get(id);
      if (!entry) continue;
      entry.state = 'refreshing';
      this._coordinator.setWidgetState(id, 'refreshing');
      const promise = this._loadWidget(id, this._lastBundle);
      if (this._config.parallelLoading) {
        promises.push(promise);
      } else {
        await promise;
      }
    }

    if (this._config.parallelLoading) {
      await Promise.all(promises);
    }

    this._coordinator.finishGlobalRefresh();
    this._lastSummary = this._summaryProvider.getSummary(this._lastBundle);
  }

  getDashboardSummary(): DashboardSummary | null {
    return this._lastSummary;
  }

  getHealthWidget(): HealthOverviewData | null {
    return this._widgets.get('health_overview')?.data as HealthOverviewData | null ?? null;
  }

  getRecommendationWidget(): RecommendationData | null {
    return this._widgets.get('recommendations')?.data as RecommendationData | null ?? null;
  }

  getPredictionWidget(): PredictionData | null {
    return this._widgets.get('predictions')?.data as PredictionData | null ?? null;
  }

  getQuickWins(): QuickWinsData | null {
    return this._widgets.get('quick_wins')?.data as QuickWinsData | null ?? null;
  }

  getAchievements(): AchievementData | null {
    return this._widgets.get('achievements')?.data as AchievementData | null ?? null;
  }

  getOptimizationActivity(): OptimizationActivityData | null {
    return this._widgets.get('optimization_activity')?.data as OptimizationActivityData | null ?? null;
  }

  getDeviceProfile(): DeviceProfileData | null {
    return this._widgets.get('device_profile')?.data as DeviceProfileData | null ?? null;
  }

  getWidgetState(id: CoreWidgetId): WidgetLoadState | undefined {
    return this._widgets.get(id)?.state;
  }

  getAllWidgetStates(): { id: CoreWidgetId; state: WidgetLoadState; lastUpdated: string | null; error: string | null }[] {
    return Array.from(this._widgets.values()).map((e) => ({
      id: e.id,
      state: e.state,
      lastUpdated: e.lastUpdated,
      error: e.error,
    }));
  }

  selectWidget(id: CoreWidgetId): void {
    this._coordinator.selectWidget(id);
  }

  getSelectedWidget(): CoreWidgetId | null {
    return this._coordinator.getSelectedWidget();
  }

  on(event: CoreWidgetEvent, listener: CoreWidgetEventListener): () => void {
    return this._coordinator.on(event, listener);
  }

  get coordinator(): WidgetCoordinator {
    return this._coordinator;
  }

  get config(): CoreWidgetConfig {
    return this._config;
  }

  updateConfig(overrides: Partial<CoreWidgetConfig>): void {
    this._config = { ...this._config, ...overrides };
  }

  clear(): void {
    this._coordinator.clear();
    this._lastSummary = null;
    this._lastBundle = null;
    for (const entry of this._widgets.values()) {
      entry.data = null;
      entry.state = 'loading';
      entry.lastUpdated = null;
      entry.error = null;
    }
  }

  // ── Private ────────────────────────────────────────────────

  private async _loadWidget(id: CoreWidgetId, bundle: CoreWidgetDataBundle): Promise<void> {
    const entry = this._widgets.get(id);
    if (!entry) return;

    try {
      await entry.provider.initialize();
      const ctx = { options: {}, cachedData: entry.data, dataBundle: bundle };
      const data = await entry.provider.load(ctx);
      entry.data = data;
      entry.state = this._isEmpty(data) ? 'empty' : 'ready';
      entry.lastUpdated = new Date().toISOString();
      entry.error = null;
      this._coordinator.setWidgetState(id, entry.state);
      this._coordinator.emitWidgetLoaded(id);
      this._coordinator.emitWidgetUpdated(id);
    } catch (err) {
      entry.state = 'error';
      entry.error = err instanceof Error ? err.message : String(err);
      this._coordinator.setWidgetState(id, 'error', entry.error ?? undefined);
      this._coordinator.emitDashboardError(entry.error ?? 'Unknown error');
    }
  }

  private _getVisibleWidgets(): CoreWidgetId[] {
    return this._config.widgetOrder.filter((id) => this._config.widgetVisibility[id] !== false);
  }

  private _orderWidgets(ids: CoreWidgetId[]): CoreWidgetId[] {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...ids].sort((a, b) => {
      const pa = priorityOrder[this._config.priorityRules[a] ?? 'low'] ?? 4;
      const pb = priorityOrder[this._config.priorityRules[b] ?? 'low'] ?? 4;
      return pa - pb;
    });
  }

  private _checkPermissions(
    _widgetId: CoreWidgetId,
    _userPlan: string,
    _userFeatures: string[],
    _hasQuota: boolean,
  ): boolean {
    // Core widgets are available to all plans by default.
    // Future: check widget-specific permissions.
    return true;
  }

  private _isFeatureEnabled(widgetId: CoreWidgetId): boolean {
    const flags = this._config.featureFlags;
    switch (widgetId) {
      case 'health_overview': return flags.enableHealthOverview;
      case 'recommendations': return flags.enableRecommendations;
      case 'quick_wins': return flags.enableQuickWins;
      case 'predictions': return flags.enablePredictions;
      case 'achievements': return flags.enableAchievements;
      case 'optimization_activity': return flags.enableOptimizationActivity;
      case 'device_profile': return flags.enableDeviceProfile;
      default: return true;
    }
  }

  private _isEmpty(data: unknown): boolean {
    if (data === null || data === undefined) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if ('recommendations' in obj && Array.isArray(obj['recommendations'])) return (obj['recommendations'] as unknown[]).length === 0;
      if ('quickWins' in obj && Array.isArray(obj['quickWins'])) return (obj['quickWins'] as unknown[]).length === 0;
      if ('predictions' in obj && Array.isArray(obj['predictions'])) return (obj['predictions'] as unknown[]).length === 0;
      if ('achievements' in obj && Array.isArray(obj['achievements'])) return (obj['achievements'] as unknown[]).length === 0;
      if ('recentOptimizations' in obj && Array.isArray(obj['recentOptimizations'])) return (obj['recentOptimizations'] as unknown[]).length === 0;
      if ('overallScore' in obj && obj['overallScore'] === 0) return true;
      if ('deviceName' in obj && obj['deviceName'] === 'Unknown') return true;
      return Object.keys(obj).length === 0;
    }
    return false;
  }
}
