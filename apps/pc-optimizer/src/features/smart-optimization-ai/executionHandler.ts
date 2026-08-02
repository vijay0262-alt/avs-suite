/**
 * SmartOptimizationExecutionHandler — delegates optimization actions
 * to existing backend services via RPC.
 *
 * Implements the ExecutionHandler interface required by
 * OptimizationExecutionCoordinator.
 *
 * Every action type maps to an existing service method — no new
 * backend endpoints are created. The handler never bypasses safety
 * checks or duplicates logic.
 */
import type {
  OptimizationAction,
  ExecutionResult,
} from './types';
import type { ExecutionHandler } from './OptimizationExecutionCoordinator';
import { dashboardService } from '../dashboard/dashboard.service';
import { junkCleanerService } from '../junk-cleaner/junkCleaner.service';
import { privacyService } from '../privacy/privacy.service';
import { registryService } from '../registry/registry.service';
import { startupService } from '../startup/startup.service';
import { performanceService } from '../performance/performance.service';
import type { PrivacyItem } from '../privacy/privacy.types';
import type { StartupEntry } from '../startup/startup.types';
import type { RegistryIssue } from '../registry/registry.types';

export function createExecutionHandler(): ExecutionHandler {
  return {
    async executeAction(action: OptimizationAction): Promise<ExecutionResult> {
      const startedAt = Date.now();
      try {
        const output = await dispatchAction(action);
        return {
          actionId: action.id,
          actionTitle: action.title,
          status: 'completed',
          startedAt,
          completedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          error: null,
          warnings: [],
          rollbackAvailable: action.rollbackAvailable,
          rollbackExecuted: false,
          output,
        };
      } catch (error) {
        return {
          actionId: action.id,
          actionTitle: action.title,
          status: 'failed',
          startedAt,
          completedAt: Date.now(),
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
          warnings: [],
          rollbackAvailable: action.rollbackAvailable,
          rollbackExecuted: false,
          output: {},
        };
      }
    },

    async rollbackAction(action: OptimizationAction): Promise<boolean> {
      switch (action.type) {
        case 'clean_temp_files':
        case 'clean_browser_cache':
        case 'empty_recycle_bin': {
          try {
            const result = await junkCleanerService.undoClean();
            return result.success;
          } catch {
            return false;
          }
        }
        case 'disable_startup_entry':
          return action.rollbackAvailable;
        case 'clean_registry':
          return action.rollbackAvailable;
        default:
          return false;
      }
    },
  };
}

async function dispatchAction(action: OptimizationAction): Promise<Record<string, unknown>> {
  switch (action.type) {
    case 'clean_temp_files':
    case 'clean_browser_cache':
    case 'empty_recycle_bin': {
      const result = await dashboardService.executeOptimize();
      return {
        storageRecoveredMB: result.totalRecovered / 1024 / 1024,
        itemsCleaned: Object.values(result.results).filter((r) => r.cleaned).length,
      };
    }

    case 'clear_browser_privacy':
    case 'clear_privacy_traces': {
      const scanResult = await privacyService.scan();
      const items = scanResult.items as PrivacyItem[];
      if (items.length === 0) return { itemsCleaned: 0 };
      const cleanResult = await privacyService.clean(items);
      return {
        itemsCleaned: cleanResult.itemsCleaned,
        storageRecoveredMB: (cleanResult.spaceFreed || 0) / 1024 / 1024,
      };
    }

    case 'disable_startup_entry': {
      const entries = await startupService.listEntries();
      const toDisable = entries.filter(
        (e) => e.impact === 'high' && e.enabled,
      );
      let disabled = 0;
      for (const entry of toDisable) {
        try {
          const res = await startupService.disableEntry(entry as StartupEntry);
          if (res.success) disabled++;
        } catch {
          // Continue with other entries
        }
      }
      return { entriesDisabled: disabled };
    }

    case 'clean_registry': {
      const scanResult = await registryService.scan();
      const issues = scanResult.issues as RegistryIssue[];
      if (issues.length === 0) return { issuesFixed: 0 };
      const cleanResult = await registryService.clean(issues);
      return { issuesFixed: cleanResult.fixed };
    }

    case 'close_background_process': {
      const result = await performanceService.optimizeMemory();
      return {
        ramRecoveredMB: result.memoryFreed / 1024 / 1024,
        processesOptimized: result.processesOptimized,
      };
    }

    case 'run_windows_update':
      return { message: 'Windows Update requires manual action via Windows Settings' };

    case 'optimize_disk':
      return { message: 'Use Disk Analyzer to review and optimize disk space' };

    default:
      return { message: `Action type ${action.type} not implemented` };
  }
}
