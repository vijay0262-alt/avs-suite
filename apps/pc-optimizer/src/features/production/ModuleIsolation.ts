/**
 * Module Isolation (Part 2) — Production Readiness Framework.
 *
 * Ensures that a failure in one module never crashes the application
 * or affects other modules. Integrates with the centralized ErrorHandler
 * and the Module Registry's existing error isolation.
 *
 * This service provides:
 *   - Safe execution wrappers that catch and report errors
 *   - Module health tracking (which modules are failing)
 *   - Automatic retry logic for recoverable errors
 *   - Circuit breaker pattern to stop retrying persistently failing modules
 */

import type { ModuleId } from '../health/HealthContribution';
import { errorHandler, type ErrorCategory } from './ErrorHandler';
import { moduleRegistry } from '../module-registry/ModuleRegistry';

interface ModuleHealthState {
  moduleId: ModuleId;
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  /** Circuit breaker: if true, skip operations for this module. */
  circuitOpen: boolean;
  /** When the circuit breaker opens, when to try again. */
  circuitResetAt: string | null;
}

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30_000; // 30 seconds

class ModuleIsolationServiceImpl {
  private moduleHealth = new Map<ModuleId, ModuleHealthState>();

  private getOrCreateHealth(moduleId: ModuleId): ModuleHealthState {
    let health = this.moduleHealth.get(moduleId);
    if (!health) {
      health = {
        moduleId,
        consecutiveFailures: 0,
        lastFailureAt: null,
        lastSuccessAt: null,
        circuitOpen: false,
        circuitResetAt: null,
      };
      this.moduleHealth.set(moduleId, health);
    }
    return health;
  }

  /**
   * Execute an async operation on a module with full isolation.
   * If the module fails, the error is reported and other modules
   * remain unaffected. The circuit breaker prevents repeated failures.
   */
  async executeModule<T>(
    moduleId: ModuleId,
    moduleName: string,
    action: string,
    operation: () => Promise<T>,
    options?: {
      category?: ErrorCategory;
      skipCircuitBreaker?: boolean;
    },
  ): Promise<T | undefined> {
    const health = this.getOrCreateHealth(moduleId);

    // Check circuit breaker
    if (!options?.skipCircuitBreaker && health.circuitOpen) {
      const resetAt = health.circuitResetAt ? new Date(health.circuitResetAt).getTime() : 0;
      if (Date.now() < resetAt) {
        console.warn(`[ModuleIsolation] Circuit breaker open for ${moduleId} — skipping ${action}`);
        return undefined;
      }
      // Half-open: try again
      health.circuitOpen = false;
      health.circuitResetAt = null;
    }

    const startedAt = Date.now();
    try {
      const result = await operation();
      // Success — reset failure count
      health.consecutiveFailures = 0;
      health.lastSuccessAt = new Date().toISOString();
      return result;
    } catch (err) {
      // Failure — track and report
      health.consecutiveFailures++;
      health.lastFailureAt = new Date().toISOString();

      const category = options?.category ?? 'recoverable';
      errorHandler.reportException(category, action, err, {
        moduleId,
        moduleName,
        durationMs: Date.now() - startedAt,
      });

      // Mark module as error in registry
      moduleRegistry.setStatus(moduleId, 'error');

      // Open circuit breaker if threshold reached
      if (health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        health.circuitOpen = true;
        health.circuitResetAt = new Date(Date.now() + CIRCUIT_BREAKER_RESET_MS).toISOString();
        console.warn(
          `[ModuleIsolation] Circuit breaker opened for ${moduleId} after ${health.consecutiveFailures} consecutive failures`,
        );
      }

      return undefined;
    }
  }

  /**
   * Execute operations on multiple modules in parallel with isolation.
   * One module's failure does not affect others.
   */
  async executeModules<T>(
    modules: Array<{
      moduleId: ModuleId;
      moduleName: string;
      action: string;
      operation: () => Promise<T>;
    }>,
  ): Promise<Array<{ moduleId: ModuleId; result: T | undefined; success: boolean }>> {
    const results = await Promise.allSettled(
      modules.map(async (m) => {
        const result = await this.executeModule(m.moduleId, m.moduleName, m.action, m.operation);
        return { moduleId: m.moduleId, result, success: result !== undefined };
      }),
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      // Should not happen since executeModule catches errors, but just in case
      return { moduleId: modules[i]!.moduleId, result: undefined, success: false };
    });
  }

  /**
   * Get the health state of a module.
   */
  getModuleHealth(moduleId: ModuleId): ModuleHealthState | undefined {
    return this.moduleHealth.get(moduleId);
  }

  /**
   * Get all modules with active circuit breakers.
   */
  getModulesWithOpenCircuits(): ModuleId[] {
    return Array.from(this.moduleHealth.values())
      .filter((h) => h.circuitOpen)
      .map((h) => h.moduleId);
  }

  /**
   * Get all modules that are currently failing.
   */
  getFailingModules(): ModuleId[] {
    return Array.from(this.moduleHealth.values())
      .filter((h) => h.consecutiveFailures > 0)
      .map((h) => h.moduleId);
  }

  /**
   * Reset the circuit breaker for a module, allowing retry.
   */
  resetModule(moduleId: ModuleId): void {
    const health = this.moduleHealth.get(moduleId);
    if (health) {
      health.circuitOpen = false;
      health.circuitResetAt = null;
      health.consecutiveFailures = 0;
    }
    moduleRegistry.clearModuleError(moduleId);
  }

  /**
   * Reset all module health states.
   */
  resetAll(): void {
    this.moduleHealth.clear();
  }

  /**
   * Clear all state (for testing).
   */
  clear(): void {
    this.moduleHealth.clear();
  }
}

export const moduleIsolationService = new ModuleIsolationServiceImpl();
