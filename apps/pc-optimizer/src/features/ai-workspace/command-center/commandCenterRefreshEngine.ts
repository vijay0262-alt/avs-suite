/**
 * AI Command Center — Refresh Engine
 *
 * EPIC 5 PHASE A PART 3
 *
 * Manages widget refresh: manual, interval, event-driven,
 * on focus, on demand.
 */
import type { RefreshPolicy, RefreshPolicyType, CopilotContext } from './types';
import type { CommandCenterWidgetManager } from './commandCenterWidgetManager';

export class CommandCenterRefreshEngine {
  private _policies: Map<string, RefreshPolicy> = new Map();
  private _intervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private _widgetManager: CommandCenterWidgetManager;
  private _contextProvider: (() => CopilotContext) | null = null;

  constructor(widgetManager: CommandCenterWidgetManager) {
    this._widgetManager = widgetManager;
  }

  setContextProvider(provider: () => CopilotContext): void {
    this._contextProvider = provider;
  }

  setPolicy(widgetId: string, policy: RefreshPolicy): void {
    this._policies.set(widgetId, policy);
    this._applyPolicy(widgetId, policy);
  }

  getPolicy(widgetId: string): RefreshPolicy | null {
    return this._policies.get(widgetId) ?? null;
  }

  async refreshWidget(widgetId: string): Promise<void> {
    if (!this._contextProvider) return;
    const context = this._contextProvider();
    await this._widgetManager.refreshWidget(widgetId, context);
  }

  async refreshAll(): Promise<void> {
    if (!this._contextProvider) return;
    const context = this._contextProvider();
    await this._widgetManager.refreshAll(context);
  }

  startAutoRefresh(): void {
    for (const [widgetId, policy] of this._policies) {
      if (policy.type === 'interval' && policy.enabled) {
        this._startInterval(widgetId, policy.intervalMs);
      }
    }
  }

  stopAutoRefresh(): void {
    for (const [widgetId, interval] of this._intervals) {
      clearInterval(interval);
      this._intervals.delete(widgetId);
    }
  }

  stopWidgetRefresh(widgetId: string): void {
    const interval = this._intervals.get(widgetId);
    if (interval) {
      clearInterval(interval);
      this._intervals.delete(widgetId);
    }
  }

  private _applyPolicy(widgetId: string, policy: RefreshPolicy): void {
    this.stopWidgetRefresh(widgetId);
    if (policy.type === 'interval' && policy.enabled) {
      this._startInterval(widgetId, policy.intervalMs);
    }
  }

  private _startInterval(widgetId: string, intervalMs: number): void {
    const interval = setInterval(async () => {
      await this.refreshWidget(widgetId);
    }, intervalMs);
    this._intervals.set(widgetId, interval);
  }

  clear(): void {
    this.stopAutoRefresh();
    this._policies.clear();
  }
}
