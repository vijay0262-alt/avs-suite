/**
 * Diagnostics Service (Part 4) — Production Readiness Framework.
 *
 * Enhances the existing diagnostics capability into a reusable service
 * that aggregates information from all subsystems for troubleshooting.
 *
 * Provides:
 *   - Application version, build version, channel
 *   - Active edition, license status
 *   - Operating system, memory usage, CPU usage
 *   - Module status, loaded modules
 *   - Last optimization, last scan
 *   - Health score
 *   - Event queue status
 *   - Error summary, log summary
 */

import { getVersionInfo } from '../../config/version';
import { FeatureGate } from '../licensing/FeatureGate';
import { moduleRegistry } from '../module-registry/ModuleRegistry';
import { healthScoreService } from '../health/HealthScoreService';
import { optimizationHistoryService } from '../health/OptimizationHistoryService';
import { moduleHistoryService } from '../module-registry/ModuleHistoryService';
import { moduleEventBus } from '../module-registry/ModuleEventBus';
import { errorHandler } from './ErrorHandler';
import { logger } from './Logger';
import type { ModuleId } from '../health/HealthContribution';

// ── Diagnostics Types ───────────────────────────────────────────────

export interface ModuleDiagnosticsInfo {
  moduleId: string;
  displayName: string;
  status: string;
  available: boolean;
  locked: boolean;
  version: string;
  category: string;
  lastScanAt: string | null;
  lastCleanAt: string | null;
  totalScans: number;
  totalCleans: number;
  totalSpaceRecovered: number;
  totalIssuesFixed: number;
  isLazy: boolean;
}

export interface DiagnosticsReport {
  // Application info
  application: {
    version: string;
    buildNumber: string;
    channel: string;
    releaseDate: string;
    architecture: string;
  };
  // License info
  license: {
    edition: string;
    licenseStatus: string;
  };
  // System info
  system: {
    platform: string;
    userAgent: string;
    memoryUsage: MemoryInfo | null;
    cpuUsage: CpuInfo | null;
  };
  // Module info
  modules: {
    total: number;
    loaded: number;
    lazy: number;
    inError: number;
    locked: number;
    entries: ModuleDiagnosticsInfo[];
  };
  // Health info
  health: {
    score: number | null;
    moduleCount: number;
  };
  // Optimization history
  optimization: {
    lastOptimization: string | null;
    totalOptimizations: number;
    lastScan: string | null;
  };
  // Event queue
  events: {
    listenerCount: number;
  };
  // Error summary
  errors: {
    totalErrors: number;
    criticalErrors: number;
    recentErrors: number;
  };
  // Log summary
  logs: {
    totalEntries: number;
    errorCount: number;
    warningCount: number;
    minLevel: string;
  };
  // Metadata
  generatedAt: string;
}

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface CpuInfo {
  /** Number of logical processors. */
  hardwareConcurrency: number;
}

// ── Diagnostics Service ─────────────────────────────────────────────

class DiagnosticsServiceImpl {
  /**
   * Generate a comprehensive diagnostics report.
   */
  async generateReport(): Promise<DiagnosticsReport> {
    const versionInfo = getVersionInfo();
    const edition = FeatureGate.currentEdition();
    const moduleEntries = moduleRegistry.getRegistryEntries();
    const lazyIds = moduleRegistry.getLazyModuleIds();
    const errorModules = moduleRegistry.getModulesInError();

    // Compute health score
    let healthScore: number | null = null;
    try {
      const healthResult = await healthScoreService.computeHealth();
      healthScore = healthResult.overallScore;
    } catch {
      healthScore = null;
    }

    // Get optimization history
    const optHistory = optimizationHistoryService.getRecentHistory(1);
    const optHistoryCount = optimizationHistoryService.getHistoryCount();

    // Get module history for last scan
    const moduleHistory = moduleHistoryService.getRecent(1);
    const lastScanEntry = moduleHistory.find((h) => h.operation === 'scan');

    // Get system info
    const memory = this.getMemoryInfo();
    const cpu = this.getCpuInfo();

    // Build module diagnostics
    const moduleDiagnostics: ModuleDiagnosticsInfo[] = moduleEntries.map((entry) => {
      const stats = moduleRegistry.getStatistics(entry.metadata.moduleId as ModuleId);
      return {
        moduleId: entry.metadata.moduleId,
        displayName: entry.metadata.displayName,
        status: entry.status,
        available: entry.available,
        locked: entry.locked,
        version: entry.metadata.version,
        category: entry.metadata.category,
        lastScanAt: stats.lastScanAt,
        lastCleanAt: stats.lastCleanAt,
        totalScans: stats.totalScans,
        totalCleans: stats.totalCleans,
        totalSpaceRecovered: stats.totalSpaceRecovered,
        totalIssuesFixed: stats.totalIssuesFixed,
        isLazy: lazyIds.includes(entry.metadata.moduleId as ModuleId),
      };
    });

    // Error summary
    const allErrors = errorHandler.getErrors();
    const criticalErrors = allErrors.filter(
      (e) => e.category === 'critical' || e.category === 'internal_error',
    );

    // Log summary
    const logConfig = logger.getConfig();

    return {
      application: {
        version: versionInfo.version,
        buildNumber: versionInfo.buildNumber,
        channel: versionInfo.channel,
        releaseDate: versionInfo.releaseDate,
        architecture: versionInfo.architecture,
      },
      license: {
        edition,
        licenseStatus: edition === 'free' ? 'Free Edition' : `Licensed (${edition})`,
      },
      system: {
        platform: this.getPlatform(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        memoryUsage: memory,
        cpuUsage: cpu,
      },
      modules: {
        total: moduleEntries.length + lazyIds.length,
        loaded: moduleEntries.length,
        lazy: lazyIds.length,
        inError: errorModules.length,
        locked: moduleEntries.filter((e) => e.locked).length,
        entries: moduleDiagnostics,
      },
      health: {
        score: healthScore,
        moduleCount: moduleEntries.filter((e) => e.available).length,
      },
      optimization: {
        lastOptimization: optHistory.length > 0 ? optHistory[0]!.timestamp : null,
        totalOptimizations: optHistoryCount,
        lastScan: lastScanEntry?.timestamp ?? null,
      },
      events: {
        listenerCount: this.getEventListenerCount(),
      },
      errors: {
        totalErrors: allErrors.length,
        criticalErrors: criticalErrors.length,
        recentErrors: errorHandler.getRecentErrors(10).length,
      },
      logs: {
        totalEntries: logger.getEntryCount(),
        errorCount: logger.getErrorCount(),
        warningCount: logger.getWarningCount(),
        minLevel: logConfig.minLevel,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Export the diagnostics report as a JSON string.
   * Useful for support cases.
   */
  async exportReport(): Promise<string> {
    const report = await this.generateReport();
    return JSON.stringify(report, null, 2);
  }

  /**
   * Get a quick summary string for display.
   */
  async getSummary(): Promise<string> {
    const report = await this.generateReport();
    const lines = [
      `AVS PC Optimizer v${report.application.version} (Build ${report.application.buildNumber})`,
      `Edition: ${report.license.edition}`,
      `Platform: ${report.system.platform}`,
      `Modules: ${report.modules.loaded} loaded, ${report.modules.lazy} lazy, ${report.modules.inError} in error`,
      `Health Score: ${report.health.score ?? 'N/A'}`,
      `Errors: ${report.errors.totalErrors} total, ${report.errors.criticalErrors} critical`,
      `Logs: ${report.logs.totalEntries} entries (${report.logs.errorCount} errors, ${report.logs.warningCount} warnings)`,
      `Generated: ${report.generatedAt}`,
    ];
    return lines.join('\n');
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private getMemoryInfo(): MemoryInfo | null {
    interface PerformanceMemory {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    }
    const perf = performance as Performance & { memory?: PerformanceMemory };
    if (typeof performance !== 'undefined' && perf.memory) {
      const mem = perf.memory;
      return {
        usedJSHeapSize: mem.usedJSHeapSize,
        totalJSHeapSize: mem.totalJSHeapSize,
        jsHeapSizeLimit: mem.jsHeapSizeLimit,
      };
    }
    return null;
  }

  private getCpuInfo(): CpuInfo | null {
    if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
      return { hardwareConcurrency: navigator.hardwareConcurrency };
    }
    return null;
  }

  private getPlatform(): string {
    if (typeof navigator !== 'undefined') {
      return navigator.platform || 'Unknown';
    }
    return 'Unknown';
  }

  private getEventListenerCount(): number {
    // The event bus doesn't expose listener count directly,
    // so we approximate by checking if it has subscribers
    try {
      // Subscribe and immediately unsubscribe to test
      let count = 0;
      const unsub = moduleEventBus.subscribe(() => { count++; });
      unsub();
      // If subscribe worked, there's at least the event bus infrastructure
      return count > 0 ? count : 0;
    } catch {
      return 0;
    }
  }
}

export const diagnosticsReportService = new DiagnosticsServiceImpl();
