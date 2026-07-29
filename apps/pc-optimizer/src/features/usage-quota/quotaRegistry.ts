/**
 * Quota Registry — central store for quota definitions.
 *
 * Supports loading from configuration and registering individual
 * definitions at runtime. Future plans should require configuration
 * changes only — no code changes needed.
 */
import type { QuotaDefinition, QuotaConfig } from './types';
import { quotaEvents } from './quotaEvents';
import { DEFAULT_QUOTA_CONFIG } from './defaultQuotaDefinitions';

export class QuotaRegistry {
  private _quotas: Map<string, QuotaDefinition> = new Map();
  private _loaded: boolean = false;

  /**
   * Load quota definitions from a configuration object.
   * Replaces all existing definitions.
   */
  loadConfig(config: QuotaConfig): void {
    this._quotas.clear();
    for (const quota of config.quotas) {
      this._quotas.set(quota.id, { ...quota });
    }
    this._loaded = true;

    quotaEvents.emit('quota_initialized', {
      timestamp: new Date().toISOString(),
      quotaCount: this._quotas.size,
    });
  }

  /**
   * Load the default built-in definitions.
   */
  loadDefaults(): void {
    this.loadConfig(DEFAULT_QUOTA_CONFIG);
  }

  /**
   * Register a single quota definition.
   */
  registerQuota(quota: QuotaDefinition): void {
    this._quotas.set(quota.id, { ...quota });
  }

  /**
   * Unregister a quota definition.
   */
  unregisterQuota(id: string): boolean {
    return this._quotas.delete(id);
  }

  /**
   * Get a quota definition by ID.
   */
  getQuota(id: string): QuotaDefinition | null {
    return this._quotas.get(id) ?? null;
  }

  /**
   * Get all quota definitions.
   */
  getAllQuotas(): QuotaDefinition[] {
    return Array.from(this._quotas.values());
  }

  /**
   * Get quotas by category.
   */
  getQuotasByCategory(category: string): QuotaDefinition[] {
    return this.getAllQuotas().filter((q) => q.category === category);
  }

  /**
   * Check if a quota is registered.
   */
  hasQuota(id: string): boolean {
    return this._quotas.has(id);
  }

  /**
   * Check if the registry has been loaded.
   */
  isLoaded(): boolean {
    return this._loaded;
  }

  /**
   * Get all quota IDs.
   */
  getQuotaIds(): string[] {
    return Array.from(this._quotas.keys());
  }

  /**
   * Export the current configuration.
   */
  exportConfig(): QuotaConfig {
    return { quotas: this.getAllQuotas() };
  }

  /**
   * Clear all definitions.
   */
  clear(): void {
    this._quotas.clear();
    this._loaded = false;
  }
}

export const quotaRegistry = new QuotaRegistry();
