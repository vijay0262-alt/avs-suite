/**
 * Knowledge Registry — manages knowledge builder plugins.
 *
 * Future modules register knowledge builders without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
import type { KnowledgeBuilderPlugin } from './types';

export class KnowledgeRegistry {
  private _plugins: Map<string, KnowledgeBuilderPlugin> = new Map();

  registerPlugin(plugin: KnowledgeBuilderPlugin): boolean {
    const name = plugin.getPluginName();
    if (!name) return false;
    this._plugins.set(name, plugin);
    return true;
  }

  unregisterPlugin(name: string): boolean {
    return this._plugins.delete(name);
  }

  getPlugin(name: string): KnowledgeBuilderPlugin | undefined {
    return this._plugins.get(name);
  }

  getPlugins(): KnowledgeBuilderPlugin[] {
    return Array.from(this._plugins.values()).sort(
      (a, b) => a.getPriority() - b.getPriority(),
    );
  }

  getAvailablePlugins(): KnowledgeBuilderPlugin[] {
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
