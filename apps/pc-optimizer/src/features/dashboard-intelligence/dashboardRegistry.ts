/**
 * Dashboard Registry — registers and manages data providers.
 *
 * Providers are independently replaceable.
 * Never exposes system modules directly.
 */
import type { DashboardDataProvider } from './types';

export class DashboardRegistry {
  private _providers: Map<string, DashboardDataProvider> = new Map();

  registerProvider(provider: DashboardDataProvider): boolean {
    const name = provider.getProviderName();
    if (!name) return false;
    if (this._providers.has(name)) return false;
    this._providers.set(name, provider);
    return true;
  }

  unregisterProvider(name: string): boolean {
    return this._providers.delete(name);
  }

  getProvider(name: string): DashboardDataProvider | undefined {
    return this._providers.get(name);
  }

  getProviders(): DashboardDataProvider[] {
    return Array.from(this._providers.values()).sort((a, b) => b.getPriority() - a.getPriority());
  }

  getAvailableProviders(): DashboardDataProvider[] {
    return this.getProviders().filter((p) => p.isAvailable());
  }

  hasProvider(name: string): boolean {
    return this._providers.has(name);
  }

  get count(): number {
    return this._providers.size;
  }

  clear(): void {
    this._providers.clear();
  }
}
