/**
 * Unified Timeline & Activity Center — Collector
 *
 * Collects events from platform modules and event provider plugins.
 * Transforms raw events into TimelineEventInput objects.
 */
import type {
  TimelineEventInput,
  TimelineEventProviderPlugin,
  TimelineConfiguration,
} from './types';

export class TimelineCollector {
  private _config: TimelineConfiguration;
  private _providers: TimelineEventProviderPlugin[] = [];

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  registerProvider(plugin: TimelineEventProviderPlugin): boolean {
    if (this._providers.some((p) => p.getPluginName() === plugin.getPluginName())) {
      return false;
    }
    this._providers.push(plugin);
    this._providers.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  unregisterProvider(pluginName: string): boolean {
    const idx = this._providers.findIndex((p) => p.getPluginName() === pluginName);
    if (idx === -1) return false;
    this._providers.splice(idx, 1);
    return true;
  }

  getProviders(): TimelineEventProviderPlugin[] {
    return [...this._providers];
  }

  collect(since: string | null): TimelineEventInput[] {
    const all: TimelineEventInput[] = [];
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      try {
        const events = provider.collectEvents(since);
        all.push(...events);
      } catch {
        // provider error should not crash collector
      }
    }
    return all;
  }

  collectFromCategory(category: string, since: string | null): TimelineEventInput[] {
    const all: TimelineEventInput[] = [];
    for (const provider of this._providers) {
      if (!provider.isAvailable()) continue;
      if (provider.getCategory() !== category) continue;
      try {
        const events = provider.collectEvents(since);
        all.push(...events);
      } catch {
        // provider error should not crash collector
      }
    }
    return all;
  }

  clear(): void {
    this._providers = [];
  }
}
