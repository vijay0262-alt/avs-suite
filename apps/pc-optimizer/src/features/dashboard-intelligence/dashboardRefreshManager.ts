/**
 * Dashboard Refresh Manager — manages widget refresh policies.
 *
 * Policies:
 *   Real-time, On Startup, Manual, Scheduled, Background, On Demand.
 */
import type {
  RefreshPolicyType,
  WidgetDefinition,
  DashboardConfiguration,
  ProviderContext,
  DashboardDataProvider,
} from './types';

export class DashboardRefreshManager {
  private _config: DashboardConfiguration;
  private _lastRefresh: Map<string, number> = new Map();
  private _refreshCount = 0;
  private _failedRefreshes = 0;

  constructor(config: DashboardConfiguration) {
    this._config = config;
  }

  updateConfig(config: DashboardConfiguration): void {
    this._config = config;
  }

  shouldRefresh(widgetType: string, policy: RefreshPolicyType): boolean {
    const now = Date.now();
    const last = this._lastRefresh.get(widgetType) ?? 0;
    const elapsed = now - last;

    switch (policy) {
      case 'real_time':
        return elapsed >= this._config.refreshRules.realTimeIntervalMs;
      case 'scheduled':
        return elapsed >= this._config.refreshRules.scheduledIntervalMs;
      case 'background':
        return elapsed >= this._config.refreshRules.backgroundIntervalMs;
      case 'on_startup':
        return last === 0;
      case 'manual':
      case 'on_demand':
        return true;
      default:
        return false;
    }
  }

  refreshWidget(
    widget: WidgetDefinition,
    provider: DashboardDataProvider | undefined,
    context: ProviderContext,
  ): { success: boolean; data: unknown; error: string | null } {
    if (!provider) {
      this._failedRefreshes++;
      return { success: false, data: null, error: `Provider not found: ${widget.providerName}` };
    }
    if (!provider.isAvailable()) {
      this._failedRefreshes++;
      return { success: false, data: null, error: `Provider not available: ${widget.providerName}` };
    }

    this._refreshCount++;
    try {
      const data = provider.getData(context);
      this._lastRefresh.set(widget.type, Date.now());
      return { success: true, data, error: null };
    } catch (err) {
      this._failedRefreshes++;
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, data: null, error: message };
    }
  }

  refreshWidgets(
    widgets: WidgetDefinition[],
    getProvider: (name: string) => DashboardDataProvider | undefined,
    context: ProviderContext,
  ): Map<string, { success: boolean; data: unknown; error: string | null }> {
    const results = new Map<string, { success: boolean; data: unknown; error: string | null }>();

    for (const widget of widgets) {
      const provider = getProvider(widget.providerName);
      const result = this.refreshWidget(widget, provider, context);
      results.set(widget.type, result);
    }

    return results;
  }

  get refreshCount(): number {
    return this._refreshCount;
  }

  get failedRefreshes(): number {
    return this._failedRefreshes;
  }

  getLastRefresh(widgetType: string): number {
    return this._lastRefresh.get(widgetType) ?? 0;
  }

  reset(): void {
    this._lastRefresh.clear();
    this._refreshCount = 0;
    this._failedRefreshes = 0;
  }
}
