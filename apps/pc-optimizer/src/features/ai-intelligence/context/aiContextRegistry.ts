/**
 * AI Context Registry — manages provider registration.
 *
 * Providers register themselves at runtime. The Context Engine
 * never hardcodes module dependencies — only provider registration.
 *
 * No switch statements. No module-specific logic. Only registration.
 */
import type { AIContextProvider } from './types';

export class AIContextRegistry {
  private _providers: Map<string, AIContextProvider> = new Map();

  /**
   * Register a provider. Overwrites if a provider with the same name exists.
   */
  registerProvider(provider: AIContextProvider): boolean {
    const name = provider.getProviderName();
    if (!name) return false;
    this._providers.set(name, provider);
    return true;
  }

  /**
   * Unregister a provider by name.
   */
  unregisterProvider(name: string): boolean {
    return this._providers.delete(name);
  }

  /**
   * Get a provider by name.
   */
  getProvider(name: string): AIContextProvider | undefined {
    return this._providers.get(name);
  }

  /**
   * Get all registered providers, sorted by priority (lower number = higher priority).
   */
  getProviders(): AIContextProvider[] {
    return Array.from(this._providers.values()).sort((a, b) => a.getPriority() - b.getPriority());
  }

  /**
   * Get all available providers (isAvailable() returns true).
   */
  getAvailableProviders(): AIContextProvider[] {
    return this.getProviders().filter((p) => p.isAvailable());
  }

  /**
   * Check if a provider is registered.
   */
  hasProvider(name: string): boolean {
    return this._providers.has(name);
  }

  /**
   * Get the number of registered providers.
   */
  get count(): number {
    return this._providers.size;
  }

  /**
   * Get all provider names.
   */
  getProviderNames(): string[] {
    return Array.from(this._providers.keys());
  }

  /**
   * Clear all providers.
   */
  clear(): void {
    this._providers.clear();
  }
}
