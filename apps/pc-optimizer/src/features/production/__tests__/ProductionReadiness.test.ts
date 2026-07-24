// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  errorHandler,
  moduleIsolationService,
  logger,
  createModuleLogger,
  diagnosticsReportService,
  ERROR_SEVERITY_CONFIG,
  LOG_LEVEL_PRIORITY,
  LOG_LEVEL_LABELS,
} from '../index';
import { moduleRegistry, clearModuleRegistry } from '../../module-registry';
import type { ModuleId } from '../../health/HealthContribution';

// ── Part 1: Centralized Error Handling ──────────────────────────────

describe('Centralized Error Handling (Part 1)', () => {
  beforeEach(() => { errorHandler.clear(); });
  afterEach(() => { errorHandler.clear(); });

  it('ERROR_SEVERITY_CONFIG defines all 5 categories', () => {
    expect(ERROR_SEVERITY_CONFIG.warning).toBeDefined();
    expect(ERROR_SEVERITY_CONFIG.recoverable).toBeDefined();
    expect(ERROR_SEVERITY_CONFIG.critical).toBeDefined();
    expect(ERROR_SEVERITY_CONFIG.user_action_required).toBeDefined();
    expect(ERROR_SEVERITY_CONFIG.internal_error).toBeDefined();
  });

  it('all categories have shouldContinue = true (app continues when safe)', () => {
    for (const config of Object.values(ERROR_SEVERITY_CONFIG)) {
      expect(config.shouldContinue).toBe(true);
    }
  });

  it('warning does not mark module as error', () => {
    expect(ERROR_SEVERITY_CONFIG.warning.shouldMarkModuleError).toBe(false);
  });

  it('critical marks module as error', () => {
    expect(ERROR_SEVERITY_CONFIG.critical.shouldMarkModuleError).toBe(true);
  });

  it('report creates an error record with all fields', () => {
    const error = errorHandler.report('warning', 'test-action', 'Test message', {
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      durationMs: 100,
    });

    expect(error.id).toBeTruthy();
    expect(error.timestamp).toBeTruthy();
    expect(error.category).toBe('warning');
    expect(error.action).toBe('test-action');
    expect(error.message).toBe('Test message');
    expect(error.moduleId).toBe('junk');
    expect(error.moduleName).toBe('Junk Cleaner');
    expect(error.durationMs).toBe(100);
    expect(error.continued).toBe(true);
  });

  it('reportException extracts message and stack from Error', () => {
    const err = new Error('Test error');
    const error = errorHandler.reportException('recoverable', 'test', err);

    expect(error.message).toBe('Test error');
    expect(error.stack).toBe(err.stack);
  });

  it('reportException handles non-Error objects', () => {
    const error = errorHandler.reportException('warning', 'test', 'string error');
    expect(error.message).toBe('string error');
    expect(error.stack).toBeUndefined();
  });

  it('getErrors returns all reported errors', () => {
    errorHandler.report('warning', 'a1', 'm1');
    errorHandler.report('critical', 'a2', 'm2');
    expect(errorHandler.getErrors()).toHaveLength(2);
  });

  it('getRecentErrors returns N most recent', () => {
    errorHandler.report('warning', 'a1', 'm1');
    errorHandler.report('warning', 'a2', 'm2');
    errorHandler.report('warning', 'a3', 'm3');
    const recent = errorHandler.getRecentErrors(2);
    expect(recent).toHaveLength(2);
  });

  it('getErrorsByModule filters by module', () => {
    errorHandler.report('warning', 'a1', 'm1', { moduleId: 'junk' as ModuleId });
    errorHandler.report('warning', 'a2', 'm2', { moduleId: 'registry' as ModuleId });
    const junkErrors = errorHandler.getErrorsByModule('junk' as ModuleId);
    expect(junkErrors).toHaveLength(1);
    expect(junkErrors[0]!.moduleId).toBe('junk');
  });

  it('getErrorsByCategory filters by category', () => {
    errorHandler.report('warning', 'a1', 'm1');
    errorHandler.report('critical', 'a2', 'm2');
    const critical = errorHandler.getErrorsByCategory('critical');
    expect(critical).toHaveLength(1);
  });

  it('hasCriticalErrors returns true when critical errors exist', () => {
    expect(errorHandler.hasCriticalErrors()).toBe(false);
    errorHandler.report('critical', 'a1', 'm1');
    expect(errorHandler.hasCriticalErrors()).toBe(true);
  });

  it('hasCriticalErrors returns true for internal_error', () => {
    errorHandler.report('internal_error', 'a1', 'm1');
    expect(errorHandler.hasCriticalErrors()).toBe(true);
  });

  it('safeAsync catches errors and returns undefined', async () => {
    const result = await errorHandler.safeAsync('test', async () => {
      throw new Error('Boom');
    });
    expect(result).toBeUndefined();
    expect(errorHandler.getErrorCount()).toBe(1);
  });

  it('safeAsync returns result on success', async () => {
    const result = await errorHandler.safeAsync('test', async () => 'success');
    expect(result).toBe('success');
    expect(errorHandler.getErrorCount()).toBe(0);
  });

  it('safe catches sync errors and returns undefined', () => {
    const result = errorHandler.safe('test', () => {
      throw new Error('Sync boom');
    });
    expect(result).toBeUndefined();
    expect(errorHandler.getErrorCount()).toBe(1);
  });

  it('safe returns result on success', () => {
    const result = errorHandler.safe('test', () => 42);
    expect(result).toBe(42);
  });

  it('subscribe receives error notifications', () => {
    let received = false;
    errorHandler.subscribe(() => { received = true; });
    errorHandler.report('warning', 'test', 'msg');
    expect(received).toBe(true);
  });

  it('exportErrors returns JSON string', () => {
    errorHandler.report('warning', 'test', 'msg');
    const exported = errorHandler.exportErrors();
    expect(() => JSON.parse(exported)).not.toThrow();
    const parsed = JSON.parse(exported);
    expect(parsed.errors).toHaveLength(1);
  });

  it('maxErrors limits stored errors', () => {
    for (let i = 0; i < 550; i++) {
      errorHandler.report('warning', `action-${i}`, `msg-${i}`);
    }
    expect(errorHandler.getErrorCount()).toBeLessThanOrEqual(500);
  });
});

// ── Part 2: Module Isolation ────────────────────────────────────────

describe('Module Isolation (Part 2)', () => {
  beforeEach(() => {
    errorHandler.clear();
    moduleIsolationService.clear();
    clearModuleRegistry();
  });
  afterEach(() => {
    errorHandler.clear();
    moduleIsolationService.clear();
    clearModuleRegistry();
  });

  it('executeModule returns result on success', async () => {
    const result = await moduleIsolationService.executeModule(
      'junk' as ModuleId, 'Junk Cleaner', 'scan',
      async () => 'scanned',
    );
    expect(result).toBe('scanned');
  });

  it('executeModule catches error and returns undefined', async () => {
    const result = await moduleIsolationService.executeModule(
      'junk' as ModuleId, 'Junk Cleaner', 'scan',
      async () => { throw new Error('Scan failed'); },
    );
    expect(result).toBeUndefined();
    expect(errorHandler.getErrorCount()).toBe(1);
  });

  it('executeModule marks module as error in registry', async () => {
    moduleRegistry.register({
      metadata: { moduleId: 'junk' as any, displayName: 'Junk', description: '', category: 'cleanup', icon: '', version: '1.0.0', routePath: '/junk', capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: false }, featurePermissions: {}, maxHealthPenalty: 10, supportedOS: [] },
      initialize: async () => {}, dispose: () => {}, scan: async () => null, clean: async () => null, optimize: async () => null, cancel: () => {}, refresh: async () => {}, getStatus: () => 'ready', getHealthContribution: async () => ({} as any), getRecommendations: () => [], getStatistics: () => ({} as any),
    });

    await moduleIsolationService.executeModule(
      'junk' as ModuleId, 'Junk Cleaner', 'scan',
      async () => { throw new Error('Failed'); },
    );
    expect(moduleRegistry.getStatus('junk')).toBe('error');
  });

  it('one module failure does not affect other modules', async () => {
    const result1 = await moduleIsolationService.executeModule(
      'junk' as ModuleId, 'Junk Cleaner', 'scan',
      async () => { throw new Error('Junk failed'); },
    );
    const result2 = await moduleIsolationService.executeModule(
      'registry' as ModuleId, 'Registry Cleaner', 'scan',
      async () => 'registry scanned',
    );

    expect(result1).toBeUndefined();
    expect(result2).toBe('registry scanned');
  });

  it('circuit breaker opens after threshold failures', async () => {
    const moduleId = 'junk' as ModuleId;
    for (let i = 0; i < 3; i++) {
      await moduleIsolationService.executeModule(
        moduleId, 'Junk Cleaner', 'scan',
        async () => { throw new Error('Always fails'); },
      );
    }

    const health = moduleIsolationService.getModuleHealth(moduleId);
    expect(health!.circuitOpen).toBe(true);
    expect(health!.consecutiveFailures).toBe(3);
  });

  it('circuit breaker skips operation when open', async () => {
    const moduleId = 'junk' as ModuleId;
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await moduleIsolationService.executeModule(
        moduleId, 'Junk Cleaner', 'scan',
        async () => { throw new Error('Always fails'); },
      );
    }

    // Now even a successful operation should be skipped
    const result = await moduleIsolationService.executeModule(
      moduleId, 'Junk Cleaner', 'scan',
      async () => 'should not reach',
    );
    expect(result).toBeUndefined();
  });

  it('resetModule clears circuit breaker', async () => {
    const moduleId = 'junk' as ModuleId;
    for (let i = 0; i < 3; i++) {
      await moduleIsolationService.executeModule(
        moduleId, 'Junk Cleaner', 'scan',
        async () => { throw new Error('Always fails'); },
      );
    }

    moduleIsolationService.resetModule(moduleId);
    const health = moduleIsolationService.getModuleHealth(moduleId);
    expect(health!.circuitOpen).toBe(false);
    expect(health!.consecutiveFailures).toBe(0);
  });

  it('executeModules runs all modules in parallel with isolation', async () => {
    const results = await moduleIsolationService.executeModules([
      { moduleId: 'junk' as ModuleId, moduleName: 'Junk', action: 'scan', operation: async () => 'junk-ok' },
      { moduleId: 'registry' as ModuleId, moduleName: 'Registry', action: 'scan', operation: async () => { throw new Error('reg-fail'); } },
      { moduleId: 'startup' as ModuleId, moduleName: 'Startup', action: 'scan', operation: async () => 'startup-ok' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]!.result).toBe('junk-ok');
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.result).toBeUndefined();
    expect(results[1]!.success).toBe(false);
    expect(results[2]!.result).toBe('startup-ok');
    expect(results[2]!.success).toBe(true);
  });

  it('getFailingModules returns modules with failures', async () => {
    await moduleIsolationService.executeModule(
      'junk' as ModuleId, 'Junk', 'scan',
      async () => { throw new Error('fail'); },
    );
    const failing = moduleIsolationService.getFailingModules();
    expect(failing).toContain('junk');
  });

  it('getModulesWithOpenCircuits returns circuit-broken modules', async () => {
    const moduleId = 'junk' as ModuleId;
    for (let i = 0; i < 3; i++) {
      await moduleIsolationService.executeModule(
        moduleId, 'Junk', 'scan',
        async () => { throw new Error('fail'); },
      );
    }
    const open = moduleIsolationService.getModulesWithOpenCircuits();
    expect(open).toContain('junk');
  });
});

// ── Part 3: Structured Logging ──────────────────────────────────────

describe('Structured Logging (Part 3)', () => {
  beforeEach(() => {
    logger.clear();
    logger.resetToDefault();
  });
  afterEach(() => {
    logger.clear();
    logger.resetToDefault();
  });

  it('LOG_LEVEL_PRIORITY defines 4 levels in correct order', () => {
    expect(LOG_LEVEL_PRIORITY.debug).toBe(0);
    expect(LOG_LEVEL_PRIORITY.info).toBe(1);
    expect(LOG_LEVEL_PRIORITY.warning).toBe(2);
    expect(LOG_LEVEL_PRIORITY.error).toBe(3);
  });

  it('LOG_LEVEL_LABELS defines labels for all levels', () => {
    expect(LOG_LEVEL_LABELS.debug).toBe('DEBUG');
    expect(LOG_LEVEL_LABELS.info).toBe('INFO');
    expect(LOG_LEVEL_LABELS.warning).toBe('WARN');
    expect(LOG_LEVEL_LABELS.error).toBe('ERROR');
  });

  it('info log creates an entry with all structured fields', () => {
    logger.info('JunkCleaner', 'scan', 'Scan completed', {
      durationMs: 500,
      result: 'success',
    });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.level).toBe('info');
    expect(entries[0]!.module).toBe('JunkCleaner');
    expect(entries[0]!.action).toBe('scan');
    expect(entries[0]!.message).toBe('Scan completed');
    expect(entries[0]!.durationMs).toBe(500);
    expect(entries[0]!.result).toBe('success');
    expect(entries[0]!.timestamp).toBeTruthy();
    expect(entries[0]!.id).toBeTruthy();
  });

  it('debug logs are filtered by default (minLevel = info)', () => {
    logger.debug('Test', 'action', 'debug message');
    expect(logger.getEntries()).toHaveLength(0);
  });

  it('enableVerbose allows debug logs', () => {
    logger.enableVerbose();
    logger.debug('Test', 'action', 'debug message');
    expect(logger.getEntries()).toHaveLength(1);
  });

  it('warning logs are recorded at default level', () => {
    logger.warning('Test', 'action', 'warning message');
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.level).toBe('warning');
  });

  it('error logs are recorded with errorDetails', () => {
    logger.error('Test', 'action', 'error message', {
      errorDetails: 'Stack trace here',
    });
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.errorDetails).toBe('Stack trace here');
  });

  it('logOperation logs success with duration', async () => {
    await logger.logOperation('Test', 'op', async () => 'result');
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.result).toBe('success');
    expect(entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logOperation logs failure with error details', async () => {
    try {
      await logger.logOperation('Test', 'op', async () => {
        throw new Error('Operation failed');
      });
    } catch {
      // expected
    }
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.result).toBe('failure');
    expect(entries[0]!.errorDetails).toBe('Operation failed');
  });

  it('getEntriesByLevel filters by level', () => {
    logger.info('Test', 'a1', 'm1');
    logger.warning('Test', 'a2', 'm2');
    logger.error('Test', 'a3', 'm3');
    expect(logger.getEntriesByLevel('error')).toHaveLength(1);
    expect(logger.getEntriesByLevel('warning')).toHaveLength(1);
  });

  it('getEntriesByModule filters by module', () => {
    logger.info('JunkCleaner', 'a1', 'm1');
    logger.info('RegistryCleaner', 'a2', 'm2');
    expect(logger.getEntriesByModule('JunkCleaner')).toHaveLength(1);
  });

  it('subscribe receives log entries', () => {
    let received = 0;
    logger.subscribe(() => { received++; });
    logger.info('Test', 'a1', 'm1');
    logger.info('Test', 'a2', 'm2');
    expect(received).toBe(2);
  });

  it('createModuleLogger scopes logs to a module', () => {
    const modLogger = createModuleLogger('JunkCleaner');
    modLogger.info('scan', 'Scan started');
    const entries = logger.getEntriesByModule('JunkCleaner');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe('scan');
  });

  it('exportLogs returns JSON string', () => {
    logger.info('Test', 'a1', 'm1');
    const exported = logger.exportLogs();
    expect(() => JSON.parse(exported)).not.toThrow();
    const parsed = JSON.parse(exported);
    expect(parsed.entries).toHaveLength(1);
  });

  it('configure can change minLevel', () => {
    logger.configure({ minLevel: 'error' });
    logger.info('Test', 'a1', 'm1');
    logger.warning('Test', 'a2', 'm2');
    expect(logger.getEntries()).toHaveLength(0);
    logger.error('Test', 'a3', 'm3');
    expect(logger.getEntries()).toHaveLength(1);
  });

  it('getErrorCount and getWarningCount work correctly', () => {
    logger.info('Test', 'a1', 'm1');
    logger.warning('Test', 'a2', 'm2');
    logger.error('Test', 'a3', 'm3');
    expect(logger.getErrorCount()).toBe(1);
    expect(logger.getWarningCount()).toBe(1);
  });
});

// ── Part 4: Diagnostics Service ─────────────────────────────────────

describe('Diagnostics Service (Part 4)', () => {
  beforeEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    clearModuleRegistry();
  });
  afterEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    clearModuleRegistry();
  });

  it('generateReport returns a comprehensive report', async () => {
    const report = await diagnosticsReportService.generateReport();

    expect(report.application).toBeDefined();
    expect(report.application.version).toBeTruthy();
    expect(report.application.buildNumber).toBeTruthy();
    expect(report.application.channel).toBeTruthy();
    expect(report.application.architecture).toBeTruthy();
  });

  it('report includes license info', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.license).toBeDefined();
    expect(report.license.edition).toBeTruthy();
    expect(report.license.licenseStatus).toBeTruthy();
  });

  it('report includes system info', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.system).toBeDefined();
    expect(report.system.platform).toBeTruthy();
  });

  it('report includes module info', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.modules).toBeDefined();
    expect(typeof report.modules.total).toBe('number');
    expect(typeof report.modules.loaded).toBe('number');
    expect(typeof report.modules.lazy).toBe('number');
    expect(typeof report.modules.inError).toBe('number');
    expect(Array.isArray(report.modules.entries)).toBe(true);
  });

  it('report includes health info', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.health).toBeDefined();
    expect(report.health.moduleCount).toBeGreaterThanOrEqual(0);
  });

  it('report includes optimization history', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.optimization).toBeDefined();
    expect(report.optimization.totalOptimizations).toBeGreaterThanOrEqual(0);
  });

  it('report includes event queue status', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.events).toBeDefined();
    expect(typeof report.events.listenerCount).toBe('number');
  });

  it('report includes error summary', async () => {
    errorHandler.report('critical', 'test', 'critical error');
    const report = await diagnosticsReportService.generateReport();
    expect(report.errors).toBeDefined();
    expect(report.errors.totalErrors).toBe(1);
    expect(report.errors.criticalErrors).toBe(1);
  });

  it('report includes log summary', async () => {
    logger.info('Test', 'a1', 'm1');
    logger.error('Test', 'a2', 'm2');
    const report = await diagnosticsReportService.generateReport();
    expect(report.logs).toBeDefined();
    expect(report.logs.totalEntries).toBe(2);
    expect(report.logs.errorCount).toBe(1);
    expect(report.logs.minLevel).toBe('info');
  });

  it('report includes generatedAt timestamp', async () => {
    const report = await diagnosticsReportService.generateReport();
    expect(report.generatedAt).toBeTruthy();
    expect(() => new Date(report.generatedAt)).not.toThrow();
  });

  it('exportReport returns JSON string', async () => {
    const exported = await diagnosticsReportService.exportReport();
    expect(() => JSON.parse(exported)).not.toThrow();
    const parsed = JSON.parse(exported);
    expect(parsed.application).toBeDefined();
  });

  it('getSummary returns readable summary string', async () => {
    const summary = await diagnosticsReportService.getSummary();
    expect(summary).toContain('AVS PC Optimizer');
    expect(summary).toContain('Edition:');
    expect(summary).toContain('Modules:');
    expect(summary).toContain('Health Score:');
    expect(summary).toContain('Generated:');
  });

  it('report reflects registered modules', async () => {
    clearModuleRegistry();
    // Register a test module
    moduleRegistry.register({
      metadata: { moduleId: 'junk' as any, displayName: 'Junk Cleaner', description: '', category: 'cleanup', icon: '', version: '1.0.0', routePath: '/junk', capabilities: { canScan: true, canClean: true, canOptimize: false, canRunInBackground: false }, featurePermissions: {}, maxHealthPenalty: 10, supportedOS: [] },
      initialize: async () => {}, dispose: () => {}, scan: async () => null, clean: async () => null, optimize: async () => null, cancel: () => {}, refresh: async () => {}, getStatus: () => 'ready', getHealthContribution: async () => ({} as any), getRecommendations: () => [], getStatistics: () => ({} as any),
    });

    const report = await diagnosticsReportService.generateReport();
    expect(report.modules.loaded).toBeGreaterThanOrEqual(1);
    const junkEntry = report.modules.entries.find((e) => e.moduleId === 'junk');
    expect(junkEntry).toBeDefined();
    expect(junkEntry!.displayName).toBe('Junk Cleaner');
  });
});
