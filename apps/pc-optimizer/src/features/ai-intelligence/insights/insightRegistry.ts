/**
 * Insight Registry — manages insight provider plugins.
 *
 * Future modules register insight providers without modifying existing code.
 */
import type { InsightProviderPlugin } from './types';

export class InsightRegistry {
  private _plugins: Map<string, InsightProviderPlugin> = new Map();

  registerPlugin(plugin: InsightProviderPlugin): boolean {
    const name = plugin.getPluginName();
    if (!name) return false;
    if (this._plugins.has(name)) return false;
    this._plugins.set(name, plugin);
    return true;
  }

  unregisterPlugin(name: string): boolean {
    return this._plugins.delete(name);
  }

  getPlugin(name: string): InsightProviderPlugin | undefined {
    return this._plugins.get(name);
  }

  getPlugins(): InsightProviderPlugin[] {
    return Array.from(this._plugins.values()).sort((a, b) => a.getPriority() - b.getPriority());
  }

  getAvailablePlugins(): InsightProviderPlugin[] {
    return this.getPlugins().filter((p) => p.isAvailable());
  }

  getPluginNames(): string[] {
    return Array.from(this._plugins.keys());
  }

  get count(): number {
    return this._plugins.size;
  }

  clear(): void {
    this._plugins.clear();
  }
}
