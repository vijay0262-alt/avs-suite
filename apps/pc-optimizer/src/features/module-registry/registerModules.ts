/**
 * Module Registration — registers all modules with the Module Registry
 * and their health providers with the Health Score Service.
 *
 * Called at app startup. Adding a new module = add metadata to
 * moduleDefinitions.ts + create an adapter + register here.
 */

import { moduleRegistry } from './ModuleRegistry';
import { healthScoreService } from '../health/HealthScoreService';
import { registerAllHealthProviders } from '../health/healthProviders';
import { ALL_MODULE_DEFINITIONS } from './moduleDefinitions';
import type { OptimizerModule, ModuleMetadata, ModuleLifecycleState, ModuleStatistics } from './moduleRegistry.types';
import type { HealthContribution } from '../health/HealthContribution';
import type { Recommendation } from '../dashboard/dashboard.types';

// ── Stub adapters for modules that don't have a full adapter yet ────
// These exist so the registry knows about all modules. As each module
// gets a full adapter, replace the stub with the real implementation.

class StubModuleAdapter implements OptimizerModule {
  constructor(readonly metadata: ModuleMetadata) {}

  async initialize(): Promise<void> {}
  dispose(): void {}

  async scan(): Promise<unknown> { return null; }
  async clean(): Promise<unknown> { return null; }
  async optimize(): Promise<unknown> { return null; }
  cancel(): void {}

  async refresh(): Promise<void> {}

  getStatus(): ModuleLifecycleState {
    return 'ready';
  }

  async getHealthContribution(): Promise<HealthContribution> {
    return {
      moduleId: this.metadata.moduleId,
      moduleName: this.metadata.displayName,
      currentPenalty: 0,
      maxPenalty: this.metadata.maxHealthPenalty,
      resolvedPenalty: 0,
      detail: 'Not yet implemented',
      canAutoFix: this.metadata.capabilities.canClean,
      actionPath: this.metadata.routePath,
    };
  }

  getRecommendations(): Recommendation[] {
    return [];
  }

  getStatistics(): ModuleStatistics {
    return {
      lastScanAt: null,
      lastCleanAt: null,
      totalScans: 0,
      totalCleans: 0,
      totalSpaceRecovered: 0,
      totalIssuesFixed: 0,
    };
  }
}

/**
 * Register all modules with the Module Registry.
 * Also registers health providers with the Health Score Service.
 * Also registers module weights with the Health Score Service.
 *
 * This is the single entry point for module registration.
 * Adding a module here automatically integrates it with:
 *   - Dashboard (via registry entries)
 *   - Health Engine (via health providers + weights)
 *   - FeatureGate (via feature permissions in metadata)
 *   - Recommendations (via getRecommendations())
 */
export function registerAllModules(): void {
  // Register health providers (existing pattern)
  registerAllHealthProviders();

  // Register all module weights with the Health Score Service
  for (const def of ALL_MODULE_DEFINITIONS) {
    healthScoreService.registerModuleWeight(
      def.moduleId,
      def.maxHealthPenalty,
      def.displayName,
    );
  }

  // Register all modules with the Module Registry
  for (const def of ALL_MODULE_DEFINITIONS) {
    // For now, use stub adapters. As real adapters are created,
    // replace with the actual implementation.
    const module = new StubModuleAdapter(def);
    moduleRegistry.register(module);
  }
}

/**
 * Initialize all registered modules.
 * Called after registration at app startup.
 */
export async function initializeAllModules(): Promise<void> {
  await moduleRegistry.initializeAll();
}

/**
 * Dispose all registered modules.
 * Called at app shutdown.
 */
export function disposeAllModules(): void {
  moduleRegistry.disposeAll();
}

/**
 * Clear the registry (for testing).
 */
export function clearModuleRegistry(): void {
  moduleRegistry.clear();
}
