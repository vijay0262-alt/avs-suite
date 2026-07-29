/**
 * Prediction Registry — manages prediction provider plugins.
 *
 * Future modules register prediction providers without modifying existing code.
 */
import type { PredictionProviderPlugin } from './types';

export class PredictionRegistry {
  private _plugins: Map<string, PredictionProviderPlugin> = new Map();

  registerPlugin(plugin: PredictionProviderPlugin): boolean {
    const name = plugin.getPluginName();
    if (!name) return false;
    if (this._plugins.has(name)) return false;
    this._plugins.set(name, plugin);
    return true;
  }

  unregisterPlugin(name: string): boolean {
    return this._plugins.delete(name);
  }

  getPlugin(name: string): PredictionProviderPlugin | undefined {
    return this._plugins.get(name);
  }

  getPlugins(): PredictionProviderPlugin[] {
    return Array.from(this._plugins.values()).sort((a, b) => a.getPriority() - b.getPriority());
  }

  getAvailablePlugins(): PredictionProviderPlugin[] {
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
