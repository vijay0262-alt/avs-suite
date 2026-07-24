/**
 * Health Checks (Part 12) — Production Readiness Framework.
 *
 * Lightweight health checks for internal services.
 * Displayed in diagnostics, not in the main UI.
 *
 * Checks:
 *   - Health Engine operational
 *   - Module Registry initialized
 *   - Event System active
 *   - Licensing service available
 *   - Configuration loaded
 *   - Error Handler active
 *   - Logger active
 *   - Performance Monitor active
 *   - Background Task Manager healthy
 *   - Resource Manager healthy
 */

import { moduleRegistry } from '../module-registry/ModuleRegistry';
import { healthScoreService } from '../health/HealthScoreService';
import { moduleEventBus } from '../module-registry/ModuleEventBus';
import { FeatureGate } from '../licensing/FeatureGate';
import { configManager } from './AppConfig';
import { errorHandler } from './ErrorHandler';
import { logger } from './Logger';
import { performanceMonitor } from './PerformanceMonitor';
import { backgroundTaskManager } from './BackgroundTaskManager';
import { resourceManager } from './ResourceManager';

// ── Health Check Types ──────────────────────────────────────────────

export type HealthCheckStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckResult {
  service: string;
  status: HealthCheckStatus;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckReport {
  checks: HealthCheckResult[];
  overallStatus: HealthCheckStatus;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  unknownCount: number;
  timestamp: string;
}

type HealthCheck = {
  service: string;
  check: () => Promise<HealthCheckResult> | HealthCheckResult;
};

// ── Health Check Service ────────────────────────────────────────────

class HealthCheckServiceImpl {
  private checks: HealthCheck[] = [
    { service: 'HealthEngine', check: () => this.checkHealthEngine() },
    { service: 'ModuleRegistry', check: () => this.checkModuleRegistry() },
    { service: 'EventSystem', check: () => this.checkEventSystem() },
    { service: 'Licensing', check: () => this.checkLicensing() },
    { service: 'Configuration', check: () => this.checkConfiguration() },
    { service: 'ErrorHandler', check: () => this.checkErrorHandler() },
    { service: 'Logger', check: () => this.checkLogger() },
    { service: 'PerformanceMonitor', check: () => this.checkPerformanceMonitor() },
    { service: 'BackgroundTaskManager', check: () => this.checkBackgroundTaskManager() },
    { service: 'ResourceManager', check: () => this.checkResourceManager() },
  ];

  /**
   * Run all health checks.
   */
  async runAll(): Promise<HealthCheckReport> {
    const results: HealthCheckResult[] = [];

    for (const { service, check } of this.checks) {
      try {
        const result = await check();
        results.push(result);
      } catch (err) {
        results.push({
          service,
          status: 'unhealthy',
          message: `Health check failed: ${err instanceof Error ? err.message : String(err)}`,
          checkedAt: new Date().toISOString(),
        });
      }
    }

    const healthyCount = results.filter((r) => r.status === 'healthy').length;
    const degradedCount = results.filter((r) => r.status === 'degraded').length;
    const unhealthyCount = results.filter((r) => r.status === 'unhealthy').length;
    const unknownCount = results.filter((r) => r.status === 'unknown').length;

    let overallStatus: HealthCheckStatus = 'healthy';
    if (unhealthyCount > 0) overallStatus = 'unhealthy';
    else if (degradedCount > 0) overallStatus = 'degraded';

    return {
      checks: results,
      overallStatus,
      healthyCount,
      degradedCount,
      unhealthyCount,
      unknownCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run a single health check by service name.
   */
  async runOne(serviceName: string): Promise<HealthCheckResult | null> {
    const check = this.checks.find((c) => c.service === serviceName);
    if (!check) return null;
    try {
      return await check.check();
    } catch (err) {
      return {
        service: serviceName,
        status: 'unhealthy',
        message: `Health check failed: ${err instanceof Error ? err.message : String(err)}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  // ── Individual Checks ─────────────────────────────────────────────

  private checkHealthEngine(): HealthCheckResult {
    const weights = healthScoreService.getModuleWeights();
    if (weights.length === 0) {
      return {
        service: 'HealthEngine',
        status: 'degraded',
        message: 'No module weights registered',
        checkedAt: new Date().toISOString(),
        details: { weightCount: 0 },
      };
    }
    return {
      service: 'HealthEngine',
      status: 'healthy',
      message: `${weights.length} module weights registered`,
      checkedAt: new Date().toISOString(),
      details: { weightCount: weights.length },
    };
  }

  private checkModuleRegistry(): HealthCheckResult {
    const modules = moduleRegistry.getAllModules();
    const lazyIds = moduleRegistry.getLazyModuleIds();
    const errorModules = moduleRegistry.getModulesInError();
    const total = modules.length + lazyIds.length;

    if (total === 0) {
      return {
        service: 'ModuleRegistry',
        status: 'unhealthy',
        message: 'No modules registered',
        checkedAt: new Date().toISOString(),
      };
    }

    if (errorModules.length > 0) {
      return {
        service: 'ModuleRegistry',
        status: 'degraded',
        message: `${errorModules.length} module(s) in error state`,
        checkedAt: new Date().toISOString(),
        details: { total, loaded: modules.length, lazy: lazyIds.length, errors: errorModules.length },
      };
    }

    return {
      service: 'ModuleRegistry',
      status: 'healthy',
      message: `${modules.length} loaded, ${lazyIds.length} lazy`,
      checkedAt: new Date().toISOString(),
      details: { total, loaded: modules.length, lazy: lazyIds.length },
    };
  }

  private checkEventSystem(): HealthCheckResult {
    // Verify event bus is functional
    let busActive = false;
    try {
      const unsub = moduleEventBus.subscribe(() => { busActive = true; });
      unsub();
      busActive = true; // If subscribe/unsubscribe worked, bus is active
    } catch {
      busActive = false;
    }

    if (!busActive) {
      return {
        service: 'EventSystem',
        status: 'unhealthy',
        message: 'Event bus not responding',
        checkedAt: new Date().toISOString(),
      };
    }

    return {
      service: 'EventSystem',
      status: 'healthy',
      message: 'Event bus active',
      checkedAt: new Date().toISOString(),
    };
  }

  private checkLicensing(): HealthCheckResult {
    const edition = FeatureGate.currentEdition();
    const validEditions = ['free', 'professional', 'ultimate'];
    if (!validEditions.includes(edition)) {
      return {
        service: 'Licensing',
        status: 'unhealthy',
        message: `Invalid edition: ${edition}`,
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      service: 'Licensing',
      status: 'healthy',
      message: `Edition: ${edition}`,
      checkedAt: new Date().toISOString(),
      details: { edition },
    };
  }

  private checkConfiguration(): HealthCheckResult {
    try {
      const config = configManager.getConfig();
      if (!config.healthEngine || !config.logging || !config.timeouts) {
        return {
          service: 'Configuration',
          status: 'degraded',
          message: 'Configuration sections missing',
          checkedAt: new Date().toISOString(),
        };
      }
      return {
        service: 'Configuration',
        status: 'healthy',
        message: 'All config sections loaded',
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        service: 'Configuration',
        status: 'unhealthy',
        message: 'Failed to load configuration',
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private checkErrorHandler(): HealthCheckResult {
    const errorCount = errorHandler.getErrorCount();
    const hasCritical = errorHandler.hasCriticalErrors();
    if (hasCritical) {
      return {
        service: 'ErrorHandler',
        status: 'degraded',
        message: `${errorCount} errors recorded, critical errors present`,
        checkedAt: new Date().toISOString(),
        details: { errorCount, hasCritical: true },
      };
    }
    return {
      service: 'ErrorHandler',
      status: 'healthy',
      message: `${errorCount} errors recorded`,
      checkedAt: new Date().toISOString(),
      details: { errorCount },
    };
  }

  private checkLogger(): HealthCheckResult {
    const entryCount = logger.getEntryCount();
    return {
      service: 'Logger',
      status: 'healthy',
      message: `${entryCount} log entries`,
      checkedAt: new Date().toISOString(),
      details: { entryCount },
    };
  }

  private checkPerformanceMonitor(): HealthCheckResult {
    const metricCount = performanceMonitor.getMetricCount();
    return {
      service: 'PerformanceMonitor',
      status: 'healthy',
      message: `${metricCount} metrics recorded`,
      checkedAt: new Date().toISOString(),
      details: { metricCount },
    };
  }

  private checkBackgroundTaskManager(): HealthCheckResult {
    const runningCount = backgroundTaskManager.getActiveCount();
    return {
      service: 'BackgroundTaskManager',
      status: 'healthy',
      message: `${runningCount} active task(s)`,
      checkedAt: new Date().toISOString(),
      details: { runningCount },
    };
  }

  private checkResourceManager(): HealthCheckResult {
    const activeCount = resourceManager.getActiveCount();
    if (activeCount > 100) {
      return {
        service: 'ResourceManager',
        status: 'degraded',
        message: `${activeCount} active resources — potential leak`,
        checkedAt: new Date().toISOString(),
        details: { activeCount },
      };
    }
    return {
      service: 'ResourceManager',
      status: 'healthy',
      message: `${activeCount} active resources`,
      checkedAt: new Date().toISOString(),
      details: { activeCount },
    };
  }
}

export const healthCheckService = new HealthCheckServiceImpl();
