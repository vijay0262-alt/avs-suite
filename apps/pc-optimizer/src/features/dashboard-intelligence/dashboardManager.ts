/**
 * Dashboard Manager — public API facade for the Intelligent Dashboard Platform.
 *
 * Public APIs:
 *   buildDashboard()
 *   refreshDashboard()
 *   getWidgets()
 *   getWidget()
 *   registerWidget()
 *   registerProvider()
 *   getDashboardState()
 *   getDashboardStatistics()
 */
import type {
  WidgetDefinition,
  WidgetInstance,
  DashboardDataProvider,
  DashboardDataBundle,
  DashboardConfiguration,
  DashboardState,
  DashboardStatistics,
  LayoutType,
} from './types';
import { DashboardEngine } from './dashboardEngine';

export class DashboardManager {
  private _engine: DashboardEngine;

  constructor(config?: DashboardConfiguration) {
    this._engine = new DashboardEngine(config);
  }

  buildDashboard(
    data: DashboardDataBundle,
    userPlan: string = 'FREE',
    userFeatures: string[] = [],
    hasQuota: boolean = true,
  ): WidgetInstance[] {
    return this._engine.buildDashboard(data, userPlan, userFeatures, hasQuota);
  }

  refreshDashboard(data: DashboardDataBundle, widgetTypes?: string[]): WidgetInstance[] {
    return this._engine.refreshDashboard(data, widgetTypes);
  }

  getWidgets(): WidgetInstance[] {
    return this._engine.getWidgets();
  }

  getWidget(id: string): WidgetInstance | undefined {
    return this._engine.getWidget(id);
  }

  registerWidget(def: WidgetDefinition): boolean {
    return this._engine.registerWidget(def);
  }

  unregisterWidget(type: WidgetDefinition['type']): boolean {
    return this._engine.unregisterWidget(type);
  }

  registerProvider(provider: DashboardDataProvider): boolean {
    return this._engine.registerProvider(provider);
  }

  unregisterProvider(name: string): boolean {
    return this._engine.unregisterProvider(name);
  }

  getDashboardState(): DashboardState {
    return this._engine.getDashboardState();
  }

  getDashboardStatistics(): DashboardStatistics {
    return this._engine.getStatistics();
  }

  setLayout(type: LayoutType): boolean {
    return this._engine.setLayout(type);
  }

  getLayout(): LayoutType {
    return this._engine.layoutManager.getCurrentLayout();
  }

  updateConfig(overrides: Partial<DashboardConfiguration>): void {
    this._engine.updateConfig(overrides);
  }

  get config(): DashboardConfiguration {
    return this._engine.config;
  }

  get events() {
    return this._engine.events;
  }

  get engine(): DashboardEngine {
    return this._engine;
  }

  clear(): void {
    this._engine.clear();
  }
}
