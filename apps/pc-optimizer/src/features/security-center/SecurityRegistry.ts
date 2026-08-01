/**
 * SecurityRegistry — provider registration and management.
 *
 * Maintains the registry of all security providers. New providers
 * can be added without modifying the core engine. The registry
 * validates uniqueness and provides lookup by ID or type.
 */
import type { SecurityProviderInfo, ProviderType } from './types';
import type { SecurityProvider } from './SecurityProvider';

export class SecurityRegistry {
  private providers = new Map<string, SecurityProvider>();
  private registrationOrder: string[] = [];

  register(provider: SecurityProvider): void {
    const id = provider.getId();
    if (this.providers.has(id)) {
      throw new Error(`Provider already registered: ${id}`);
    }
    this.providers.set(id, provider);
    this.registrationOrder.push(id);
  }

  unregister(providerId: string): boolean {
    if (!this.providers.has(providerId)) return false;
    this.providers.delete(providerId);
    this.registrationOrder = this.registrationOrder.filter((id) => id !== providerId);
    return true;
  }

  getProvider(providerId: string): SecurityProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  getProvidersByType(type: ProviderType): SecurityProvider[] {
    return this.getAllProviders().filter((p) => p.getType() === type);
  }

  getAllProviders(): SecurityProvider[] {
    return this.registrationOrder
      .map((id) => this.providers.get(id)!)
      .filter(Boolean);
  }

  getEnabledProviders(): SecurityProvider[] {
    return this.getAllProviders().filter((p) => p.isEnabled());
  }

  getAllProviderInfo(): SecurityProviderInfo[] {
    return this.getAllProviders().map((p) => p.getInfo());
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  count(): number {
    return this.providers.size;
  }

  enableProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    provider.enable();
    return true;
  }

  disableProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;
    provider.disable();
    return true;
  }

  clear(): void {
    this.providers.clear();
    this.registrationOrder = [];
  }
}
