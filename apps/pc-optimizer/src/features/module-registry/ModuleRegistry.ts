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
    this.notifyListeners();
  }

  // ── Queries ───────────────────────────────────────────────────────

  getModule(moduleId: ModuleId): OptimizerModule | undefined {
    return this.modules.get(moduleId);
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
    await Promise.allSettled(
      entries
        .filter((e) => e.available && e.status !== 'locked')
        .map(async (e) => {
          const module = this.modules.get(e.metadata.moduleId);
          if (!module) return;
          try {
            await module.initialize();
          } catch (err) {
            console.error(`[ModuleRegistry] Failed to initialize ${e.metadata.moduleId}:`, err);
            this.setStatus(e.metadata.moduleId, 'error');
          }
        }),
    );
  }

  disposeAll(): void {
    for (const module of this.modules.values()) {
      try {
        module.dispose();
      } catch {
        // ignore
      }
    }
  }

  // ── Clear (for testing) ───────────────────────────────────────────

  clear(): void {
    this.modules.clear();
    this.statuses.clear();
    this.statistics.clear();
    this.listeners.clear();
  }
}

export const moduleRegistry = new ModuleRegistryImpl();
export { ModuleRegistryImpl };
