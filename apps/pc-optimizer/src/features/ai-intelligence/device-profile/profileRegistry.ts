/**
 * Profile Registry — manages profile provider plugins.
 *
 * Future modules register profile providers without modifying existing code.
 */
import type { ProfileProviderPlugin } from './types';

export class ProfileRegistry {
  private _plugins: Map<string, ProfileProviderPlugin> = new Map();

  registerPlugin(plugin: ProfileProviderPlugin): boolean {
    const name = plugin.getPluginName();
    if (!name) return false;
    if (this._plugins.has(name)) return false;
    this._plugins.set(name, plugin);
    return true;
  }

  unregisterPlugin(name: string): boolean {
    return this._plugins.delete(name);
  }

  getPlugin(name: string): ProfileProviderPlugin | undefined {
    return this._plugins.get(name);
  }

  getPlugins(): ProfileProviderPlugin[] {
    return Array.from(this._plugins.values()).sort((a, b) => a.getPriority() - b.getPriority());
  }

  getAvailablePlugins(): ProfileProviderPlugin[] {
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
