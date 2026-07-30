/**
 * Goals & Objectives Engine — Registry
 *
 * Maintains the registry of goal provider plugins.
 * Future goal providers register through this registry.
 */
import type { GoalProviderPlugin, GoalType } from './types';

export class GoalRegistry {
  private _providers: GoalProviderPlugin[] = [];

  register(plugin: GoalProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) {
      return false;
    }
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  unregister(pluginName: string): boolean {
    const idx = this._providers.findIndex((p) => p.getPluginName() === pluginName);
    if (idx === -1) return false;
    this._providers.splice(idx, 1);
    return true;
  }

  getProviders(): GoalProviderPlugin[] {
    return [...this._providers];
  }

  getProviderForType(goalType: GoalType): GoalProviderPlugin | null {
    return this._providers.find((p) => p.isAvailable() && p.getGoalType() === goalType) ?? null;
  }

  getAvailableProviders(): GoalProviderPlugin[] {
    return this._providers.filter((p) => p.isAvailable());
  }

  clear(): void {
    this._providers = [];
  }
}
