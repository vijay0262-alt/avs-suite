/**
 * Startup Validation (Part 5) — Production Readiness Framework.
 *
 * During application startup, validates:
 *   - Configuration
 *   - Module Registry
 *   - Health Engine
 *   - Licensing initialization
 *   - Required services
 *   - Event subscriptions
 *
 * If one component fails, provides a meaningful error and continues
 * loading unaffected components whenever possible.
 */

import { errorHandler, type ErrorCategory } from './ErrorHandler';
import { logger } from './Logger';
import { configManager } from './AppConfig';
import { moduleRegistry } from '../module-registry/ModuleRegistry';
import { healthScoreService } from '../health/HealthScoreService';
import { FeatureGate } from '../licensing/FeatureGate';
import { moduleEventBus } from '../module-registry/ModuleEventBus';

// ── Validation Result Types ─────────────────────────────────────────

export type ValidationStatus = 'pass' | 'fail' | 'warning' | 'skipped';

export interface ValidationResult {
  component: string;
  status: ValidationStatus;
  message: string;
  durationMs: number;
  error?: string;
}

export interface StartupValidationReport {
  results: ValidationResult[];
  overallStatus: ValidationStatus;
  passedCount: number;
  failedCount: number;
  warningCount: number;
  skippedCount: number;
  totalDurationMs: number;
  timestamp: string;
}

type ValidationStep = {
  component: string;
  validate: () => Promise<void> | void;
  /** If true, failure stops subsequent validations. */
  critical?: boolean;
  /** If true, skip this step (e.g., when not in Electron). */
  skipCondition?: () => boolean;
};

// ── Startup Validator ───────────────────────────────────────────────

class StartupValidatorImpl {
  private results: ValidationResult[] = [];

  /**
   * Run all startup validations.
   * Continues loading unaffected components even if some fail.
   */
  async validate(): Promise<StartupValidationReport> {
    this.results = [];
    const startTime = Date.now();
    logger.info('StartupValidator', 'validate', 'Starting startup validation');

    const steps: ValidationStep[] = [
      { component: 'Configuration', validate: () => this.validateConfiguration(), critical: true },
      { component: 'ModuleRegistry', validate: () => this.validateModuleRegistry() },
      { component: 'HealthEngine', validate: () => this.validateHealthEngine() },
      { component: 'Licensing', validate: () => this.validateLicensing() },
      { component: 'EventSubscriptions', validate: () => this.validateEventSubscriptions() },
      { component: 'RequiredServices', validate: () => this.validateRequiredServices() },
    ];

    for (const step of steps) {
      // Check skip condition
      if (step.skipCondition?.()) {
        this.recordResult(step.component, 'skipped', 'Skipped (condition not met)', 0);
        continue;
      }

      const stepStart = Date.now();
      try {
        await step.validate();
        const duration = Date.now() - stepStart;
        this.recordResult(step.component, 'pass', 'OK', duration);
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.recordResult(step.component, 'fail', 'Validation failed', duration, errorMsg);

        // Report to error handler
        const category: ErrorCategory = step.critical ? 'critical' : 'recoverable';
        errorHandler.reportException(category, `startup:${step.component}`, err);

        // If critical, stop further validation
        if (step.critical) {
          logger.error('StartupValidator', 'validate', `Critical component ${step.component} failed — stopping validation`, {
            errorDetails: errorMsg,
          });
          break;
        }

        logger.warning('StartupValidator', 'validate', `Component ${step.component} failed — continuing with remaining components`, {
          errorDetails: errorMsg,
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const report = this.buildReport(totalDuration);

    logger.info('StartupValidator', 'validate', `Validation complete: ${report.passedCount} passed, ${report.failedCount} failed, ${report.warningCount} warnings`, {
      durationMs: totalDuration,
      result: report.overallStatus === 'pass' ? 'success' : report.failedCount > 0 ? 'failure' : 'partial',
    });

    return report;
  }

  // ── Individual Validations ────────────────────────────────────────

  private validateConfiguration(): void {
    const config = configManager.getConfig();
    if (!config) throw new Error('Configuration is null');
    if (!config.healthEngine) throw new Error('Health engine config missing');
    if (!config.logging) throw new Error('Logging config missing');
    if (!config.timeouts) throw new Error('Timeouts config missing');
    if (!config.retry) throw new Error('Retry config missing');
    if (config.retry.maxAttempts < 1) throw new Error('Retry maxAttempts must be >= 1');
    if (config.timeouts.moduleInit < 1000) throw new Error('Module init timeout too low');
  }

  private validateModuleRegistry(): void {
    const modules = moduleRegistry.getAllModules();
    const lazyIds = moduleRegistry.getLazyModuleIds();
    if (modules.length === 0 && lazyIds.length === 0) {
      throw new Error('No modules registered');
    }
    // Check for modules in error state
    const errorModules = moduleRegistry.getModulesInError();
    if (errorModules.length > 0) {
      logger.warning('StartupValidator', 'validateModuleRegistry',
        `${errorModules.length} module(s) in error state: ${errorModules.join(', ')}`);
    }
  }

  private validateHealthEngine(): void {
    const weights = healthScoreService.getModuleWeights();
    if (weights.length === 0) {
      throw new Error('No module weights registered with Health Engine');
    }
  }

  private validateLicensing(): void {
    const edition = FeatureGate.currentEdition();
    if (!edition) throw new Error('FeatureGate edition not set');
    // Free edition is valid — just means no license activated
    const validEditions = ['free', 'professional', 'ultimate'];
    if (!validEditions.includes(edition)) {
      throw new Error(`Invalid edition: ${edition}`);
    }
  }

  private validateEventSubscriptions(): void {
    // Verify the event bus is functional by subscribing and unsubscribing
    let received = false;
    const unsub = moduleEventBus.subscribe(() => { received = true; });
    // We can't easily emit a test event without a registered module,
    // so just verify subscribe/unsubscribe works
    unsub();
    if (received) throw new Error('Event bus should not have fired without emission');
  }

  private validateRequiredServices(): void {
    // Verify required services are accessible
    if (!errorHandler) throw new Error('ErrorHandler not available');
    if (!logger) throw new Error('Logger not available');
    if (!configManager) throw new Error('ConfigManager not available');
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private recordResult(
    component: string,
    status: ValidationStatus,
    message: string,
    durationMs: number,
    error?: string,
  ): void {
    this.results.push({ component, status, message, durationMs, error });
  }

  private buildReport(totalDurationMs: number): StartupValidationReport {
    const passedCount = this.results.filter((r) => r.status === 'pass').length;
    const failedCount = this.results.filter((r) => r.status === 'fail').length;
    const warningCount = this.results.filter((r) => r.status === 'warning').length;
    const skippedCount = this.results.filter((r) => r.status === 'skipped').length;

    let overallStatus: ValidationStatus = 'pass';
    if (failedCount > 0) overallStatus = 'fail';
    else if (warningCount > 0) overallStatus = 'warning';

    return {
      results: [...this.results],
      overallStatus,
      passedCount,
      failedCount,
      warningCount,
      skippedCount,
      totalDurationMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get the last validation report.
   */
  getLastReport(): StartupValidationReport | null {
    if (this.results.length === 0) return null;
    return this.buildReport(0);
  }

  /**
   * Clear results (for testing).
   */
  clear(): void {
    this.results = [];
  }
}

export const startupValidator = new StartupValidatorImpl();
