/**
 * Module Registry — central registry for all optimizer modules.
 *
 * Modules register at app startup. The Dashboard, Health Engine,
 * FeatureGate, and Recommendations all consume from this registry
 * rather than hardcoded module lists.
 *
 * Adding a new module = register here + implement OptimizerModule.
 * No Dashboard, Health Engine, or FeatureGate code changes needed.
 */

import type { ModuleId } from '../health/HealthContribution';
import { FeatureGate } from '../licensing/FeatureGate';
import type {
  OptimizerModule,
  ModuleMetadata,
  ModuleRegistryEntry,
  ModuleLifecycleState,
  ModuleStatistics,
} from './moduleRegistry.types';

type StatusListener = (entries: ModuleRegistryEntry[]) => void;

class ModuleRegistryImpl {
  private modules = new Map<ModuleId, OptimizerModule>();
  private statuses = new Map<ModuleId, ModuleLifecycleState>();
  private statistics = new Map<ModuleId, ModuleStatistics>();
  private listeners = new Set<StatusListener>();
  private moduleErrors = new Map<ModuleId, string>();
  private lazyFactories = new Map<ModuleId, () => OptimizerModule>();
  private initialized = new Set<ModuleId>();

  // ── Registration ──────────────────────────────────────────────────

  register(module: OptimizerModule): void {
    const id = module.metadata.moduleId;
    if (this.modules.has(id)) {
      console.warn(`[ModuleRegistry] Module "${id}" is already registered — overwriting.`);
    }
    this.modules.set(id, module);
    if (!this.statuses.has(id)) {
      this.statuses.set(id, 'ready');
    }
    if (!this.statistics.has(id)) {
      this.statistics.set(id, {
        lastScanAt: null,
        lastCleanAt: null,
        totalScans: 0,
        totalCleans: 0,
        totalSpaceRecovered: 0,
        totalIssuesFixed: 0,
      });
    }
    this.notifyListeners();
  }

  unregister(moduleId: ModuleId): void {
    this.modules.delete(moduleId);
    this.statuses.delete(moduleId);
    this.statistics.delete(moduleId);
    this.lazyFactories.delete(moduleId);
    this.initialized.delete(moduleId);
    this.notifyListeners();
  }

  /**
   * Register a module lazily (Part 14). The factory is called only when
   * the module is first accessed or explicitly initialized.
   * This avoids eagerly loading heavy modules at startup.
   */
  registerLazy(moduleId: ModuleId, factory: () => OptimizerModule): void {
    this.lazyFactories.set(moduleId, factory);
    if (!this.statuses.has(moduleId)) {
      this.statuses.set(moduleId, 'ready');
    }
    if (!this.statistics.has(moduleId)) {
      this.statistics.set(moduleId, {
        lastScanAt: null,
        lastCleanAt: null,
        totalScans: 0,
        totalCleans: 0,
        totalSpaceRecovered: 0,
        totalIssuesFixed: 0,
      });
    }
    this.notifyListeners();
  }

  /**
   * Get module IDs that are registered lazily but not yet instantiated.
   */
  getLazyModuleIds(): ModuleId[] {
    return Array.from(this.lazyFactories.keys()).filter((id) => !this.modules.has(id));
  }

  /**
   * Initialize a single lazy module by ID (Part 14).
   * Creates the module instance from its factory and calls initialize().
   */
  async initializeModule(moduleId: ModuleId): Promise<OptimizerModule | undefined> {
    // If already instantiated, return it
    const existing = this.modules.get(moduleId);
    if (existing) {
      if (!this.initialized.has(moduleId)) {
        await this.safeExecute(moduleId, (m) => m.initialize());
        this.initialized.add(moduleId);
      }
      return existing;
    }

    // Try lazy factory
    const factory = this.lazyFactories.get(moduleId);
    if (!factory) {
      console.warn(`[ModuleRegistry] No module or factory for "${moduleId}".`);
      return undefined;
    }

    try {
      const module = factory();
      this.modules.set(moduleId, module);
      this.lazyFactories.delete(moduleId);
      await this.safeExecute(moduleId, (m) => m.initialize());
      this.initialized.add(moduleId);
      this.notifyListeners();
      return module;
    } catch (err) {
      console.error(`[ModuleRegistry] Failed to create lazy module ${moduleId}:`, err);
      this.setStatus(moduleId, 'error');
      this.moduleErrors.set(moduleId, err instanceof Error ? err.message : String(err));
      return undefined;
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  getModule(moduleId: ModuleId): OptimizerModule | undefined {
    return this.modules.get(moduleId);
  }

  /**
   * Get a module's metadata, even if it's lazily registered and not yet instantiated.
   */
  getModuleMetadata(moduleId: ModuleId): ModuleMetadata | undefined {
    const module = this.modules.get(moduleId);
    if (module) return module.metadata;
    // Lazy modules don't have metadata until instantiated — return undefined
    return undefined;
  }

  getAllModules(): OptimizerModule[] {
    return Array.from(this.modules.values());
  }

  getAllMetadata(): ModuleMetadata[] {
    return this.getAllModules().map((m) => m.metadata);
  }

  getRegistryEntries(): ModuleRegistryEntry[] {
    return this.getAllModules().map((module) => {
      const id = module.metadata.moduleId;
      const status = this.statuses.get(id) ?? 'ready';
      const perms = module.metadata.featurePermissions;
      const locked = !!perms.scan && !FeatureGate.canUse(perms.scan);
      return {
        metadata: module.metadata,
        status: locked ? 'locked' : status,
        statistics: this.statistics.get(id) ?? {
          lastScanAt: null,
          lastCleanAt: null,
          totalScans: 0,
          totalCleans: 0,
          totalSpaceRecovered: 0,
          totalIssuesFixed: 0,
        },
        available: !locked,
        locked,
      };
    });
  }

  getAvailableModules(): ModuleRegistryEntry[] {
    return this.getRegistryEntries().filter((e) => e.available);
  }

  // ── Status Management ─────────────────────────────────────────────

  setStatus(moduleId: ModuleId, status: ModuleLifecycleState): void {
    this.statuses.set(moduleId, status);
    this.notifyListeners();
  }

  getStatus(moduleId: ModuleId): ModuleLifecycleState {
    return this.statuses.get(moduleId) ?? 'ready';
  }

  // ── Statistics ────────────────────────────────────────────────────

  updateStatistics(moduleId: ModuleId, update: Partial<ModuleStatistics>): void {
    const current = this.statistics.get(moduleId) ?? {
      lastScanAt: null,
      lastCleanAt: null,
      totalScans: 0,
      totalCleans: 0,
      totalSpaceRecovered: 0,
      totalIssuesFixed: 0,
    };
    this.statistics.set(moduleId, { ...current, ...update });
  }

  getStatistics(moduleId: ModuleId): ModuleStatistics {
    return this.statistics.get(moduleId) ?? {
      lastScanAt: null,
      lastCleanAt: null,
      totalScans: 0,
      totalCleans: 0,
      totalSpaceRecovered: 0,
      totalIssuesFixed: 0,
    };
  }

  // ── FeatureGate Integration (Part 6) ──────────────────────────────

  canScan(moduleId: ModuleId): boolean {
    const module = this.modules.get(moduleId);
    if (!module) return false;
    const perm = module.metadata.featurePermissions.scan;
    if (!perm) return true;
    return FeatureGate.canUse(perm);
  }

  canClean(moduleId: ModuleId): boolean {
    const module = this.modules.get(moduleId);
    if (!module) return false;
    const perm = module.metadata.featurePermissions.clean;
    if (!perm) return true;
    return FeatureGate.canUse(perm);
  }

  canOptimize(moduleId: ModuleId): boolean {
    const module = this.modules.get(moduleId);
    if (!module) return false;
    const perm = module.metadata.featurePermissions.optimize;
    if (!perm) return true;
    return FeatureGate.canUse(perm);
  }

  canRunInBackground(moduleId: ModuleId): boolean {
    const module = this.modules.get(moduleId);
    if (!module) return false;
    const perm = module.metadata.featurePermissions.background;
    if (!perm) return true;
    return FeatureGate.canUse(perm);
  }

  // ── Subscription ──────────────────────────────────────────────────

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const entries = this.getRegistryEntries();
    for (const listener of this.listeners) {
      listener(entries);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  async initializeAll(): Promise<void> {
    const entries = this.getRegistryEntries();
    const results = await Promise.allSettled(
      entries
        .filter((e) => e.available && e.status !== 'locked')
        .map(async (e) => {
          const module = this.modules.get(e.metadata.moduleId);
          if (!module) return;
          try {
            await module.initialize();
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[ModuleRegistry] Failed to initialize ${e.metadata.moduleId}:`, err);
            this.setStatus(e.metadata.moduleId, 'error');
            this.moduleErrors.set(e.metadata.moduleId, errorMsg);
          }
        }),
    );
    // If any module failed, others still initialized — error is isolated
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      console.warn(`[ModuleRegistry] ${failures.length} module(s) failed during initialization — others remain operational.`);
    }
  }

  disposeAll(): void {
    for (const [id, module] of this.modules) {
      try {
        module.dispose();
      } catch (err) {
        console.error(`[ModuleRegistry] Failed to dispose ${id}:`, err);
        // Continue disposing other modules — error is isolated
      }
    }
  }

  // ── Error Isolation (Part 12) ─────────────────────────────────────

  /**
   * Get the last error message for a module, if any.
   */
  getModuleError(moduleId: ModuleId): string | undefined {
    return this.moduleErrors.get(moduleId);
  }

  /**
   * Get all modules currently in error state.
   */
  getModulesInError(): ModuleId[] {
    const errorModules: ModuleId[] = [];
    for (const [id, status] of this.statuses) {
      if (status === 'error') errorModules.push(id);
    }
    return errorModules;
  }

  /**
   * Clear the error state for a module, allowing retry.
   */
  clearModuleError(moduleId: ModuleId): void {
    this.moduleErrors.delete(moduleId);
    if (this.statuses.get(moduleId) === 'error') {
      this.setStatus(moduleId, 'ready');
    }
  }

  /**
   * Safely execute an operation on a single module.
   * If the module throws, the error is captured and the module is
   * marked as 'error' — other modules remain unaffected.
   */
  async safeExecute<T>(
    moduleId: ModuleId,
    operation: (module: OptimizerModule) => Promise<T>,
  ): Promise<T | undefined> {
    const module = this.modules.get(moduleId);
    if (!module) {
      console.warn(`[ModuleRegistry] Module "${moduleId}" not found.`);
      return undefined;
    }
    try {
      return await operation(module);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ModuleRegistry] Operation failed for ${moduleId}:`, err);
      this.setStatus(moduleId, 'error');
      this.moduleErrors.set(moduleId, errorMsg);
      return undefined;
    }
  }

  // ── Clear (for testing) ───────────────────────────────────────────

  clear(): void {
    this.modules.clear();
    this.statuses.clear();
    this.statistics.clear();
    this.moduleErrors.clear();
    this.lazyFactories.clear();
    this.initialized.clear();
    this.listeners.clear();
  }
}

export const moduleRegistry = new ModuleRegistryImpl();
export { ModuleRegistryImpl };
