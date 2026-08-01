/**
 * HardwareRegistry — registry for hardware providers.
 *
 * Providers register themselves at initialization. The scanner
 * queries the registry to find providers for each hardware category.
 * Supports multiple providers per category with priority fallback.
 */

import type { HardwareProvider, HardwareCategory, ProviderHealthStatus } from './types';

interface RegistryEntry {
  provider: HardwareProvider;
  priority: number;
}

class HardwareRegistryImpl {
  private entries = new Map<HardwareCategory, RegistryEntry[]>();
  private providers = new Map<string, HardwareProvider>();

  register(provider: HardwareProvider, priority: number = 0): void {
    this.providers.set(provider.id, provider);
    for (const category of provider.categories) {
      const list = this.entries.get(category) ?? [];
      list.push({ provider, priority });
      list.sort((a, b) => b.priority - a.priority);
      this.entries.set(category, list);
    }
  }

  unregister(providerId: string): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;
    this.providers.delete(providerId);
    for (const category of provider.categories) {
      const list = this.entries.get(category);
      if (list) {
        const filtered = list.filter((e) => e.provider.id !== providerId);
        if (filtered.length === 0) {
          this.entries.delete(category);
        } else {
          this.entries.set(category, filtered);
        }
      }
    }
  }

  getProvidersForCategory(category: HardwareCategory): HardwareProvider[] {
    const list = this.entries.get(category);
    return list ? list.map((e) => e.provider) : [];
  }

  getProviderForCategory(category: HardwareCategory): HardwareProvider | undefined {
    return this.getProvidersForCategory(category)[0];
  }

  getAllProviders(): HardwareProvider[] {
    return Array.from(this.providers.values());
  }

  getProvider(id: string): HardwareProvider | undefined {
    return this.providers.get(id);
  }

  getRegisteredCategories(): HardwareCategory[] {
    return Array.from(this.entries.keys());
  }

  getAllHealth(): Record<string, ProviderHealthStatus> {
    const result: Record<string, ProviderHealthStatus> = {};
    for (const [id, provider] of this.providers) {
      result[id] = provider.getHealth();
    }
    return result;
  }

  clear(): void {
    this.entries.clear();
    this.providers.clear();
  }
}

export const hardwareRegistry = new HardwareRegistryImpl();
