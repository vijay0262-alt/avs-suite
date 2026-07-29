/**
 * Recommendation Registry — manages recommendation builder plugins.
 *
 * Future modules register recommendation builders without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
import type { RecommendationBuilderPlugin } from './types';

export class RecommendationRegistry {
  private _plugins: Map<string, RecommendationBuilderPlugin> = new Map();

  registerPlugin(plugin: RecommendationBuilderPlugin): boolean {
    const name = plugin.getPluginName();
    if (!name) return false;
    this._plugins.set(name, plugin);
    return true;
  }

  unregisterPlugin(name: string): boolean {
    return this._plugins.delete(name);
  }

  getPlugin(name: string): RecommendationBuilderPlugin | undefined {
    return this._plugins.get(name);
  }

  getPlugins(): RecommendationBuilderPlugin[] {
    return Array.from(this._plugins.values()).sort(
      (a, b) => a.getPriority() - b.getPriority(),
    );
  }

  getAvailablePlugins(): RecommendationBuilderPlugin[] {
    return this.getPlugins().filter((p) => p.isAvailable());
  }

  hasPlugin(name: string): boolean {
    return this._plugins.has(name);
  }

  get count(): number {
    return this._plugins.size;
  }

  getPluginNames(): string[] {
    return Array.from(this._plugins.keys());
  }

  clear(): void {
    this._plugins.clear();
  }
}
