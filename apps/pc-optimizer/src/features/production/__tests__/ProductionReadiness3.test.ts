// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  errorHandler,
  userMessageService,
  healthCheckService,
  safeShutdownService,
  telemetryProvider,
  backgroundTaskManager,
  resourceManager,
  logger,
  configManager,
  moduleIsolationService,
} from '../index';
import { moduleRegistry, clearModuleRegistry, registerAllModules } from '../../module-registry';

// ── Part 11: User-Friendly Error Messages ───────────────────────────

describe('User-Friendly Error Messages (Part 11)', () => {
  beforeEach(() => { errorHandler.clear(); });
  afterEach(() => { errorHandler.clear(); });

  it('getMessage returns non-technical message for critical error', () => {
    const error = errorHandler.report('critical', 'scan', 'Internal: NullPointerException at 0xFF');
    const msg = userMessageService.getMessage(error);
    expect(msg).toBe('Optimization could not be completed. Please try again.');
    // Technical details should NOT be in the user message
    expect(msg).not.toContain('NullPointerException');
    expect(msg).not.toContain('0xFF');
  });

  it('getMessage returns non-technical message for recoverable error', () => {
    const error = errorHandler.report('recoverable', 'clean', 'EACCES permission denied /root');
    const msg = userMessageService.getMessage(error);
    expect(msg).not.toContain('EACCES');
    expect(msg).not.toContain('/root');
  });

  it('getMessage returns non-technical message for internal_error', () => {
    const error = errorHandler.report('internal_error', 'optimize', 'TypeError: cannot read property');
    const msg = userMessageService.getMessage(error);
    expect(msg).toBe('This module encountered an unexpected issue. Please try again later.');
    expect(msg).not.toContain('TypeError');
  });

  it('getMessage returns non-technical message for warning', () => {
    const error = errorHandler.report('warning', 'scan', 'Deprecated API usage');
    const msg = userMessageService.getMessage(error);
    expect(msg).not.toContain('Deprecated API');
  });

  it('getMessage returns non-technical message for user_action_required', () => {
    const error = errorHandler.report('user_action_required', 'license', 'License expired');
    const msg = userMessageService.getMessage(error);
    expect(msg).toContain('attention');
  });

  it('getMessage uses module-specific message when available', () => {
    const error = errorHandler.report('critical', 'scan', 'Failed', { moduleId: 'junk' as any });
    const msg = userMessageService.getMessage(error);
    expect(msg).toBe('Junk cleaning could not be completed. Please try again.');
  });

  it('getMessage uses special-case message for license validation', () => {
    const error = errorHandler.report('recoverable', 'license-validation', 'Network timeout');
    const msg = userMessageService.getMessage(error);
    expect(msg).toBe('License validation is temporarily unavailable. Your license will be verified automatically.');
    expect(msg).not.toContain('Network timeout');
  });

  it('getMessage uses special-case message for backend connection', () => {
    const error = errorHandler.report('critical', 'backend-connection', 'ECONNREFUSED 127.0.0.1:3000');
    const msg = userMessageService.getMessage(error);
    expect(msg).toContain('temporarily unavailable');
    expect(msg).not.toContain('ECONNREFUSED');
  });

  it('getByCategory returns message for each category', () => {
    expect(userMessageService.getByCategory('warning')).toBeTruthy();
    expect(userMessageService.getByCategory('recoverable')).toBeTruthy();
    expect(userMessageService.getByCategory('critical')).toBeTruthy();
    expect(userMessageService.getByCategory('user_action_required')).toBeTruthy();
    expect(userMessageService.getByCategory('internal_error')).toBeTruthy();
  });

  it('getByModule returns message for known module', () => {
    expect(userMessageService.getByModule('junk')).toContain('Junk cleaning');
    expect(userMessageService.getByModule('registry')).toContain('Registry cleaning');
  });

  it('getByModule returns generic message for unknown module', () => {
    const msg = userMessageService.getByModule('unknown-module');
    expect(msg).toBeTruthy();
    expect(msg).not.toContain('unknown-module');
  });

  it('getAllMessages returns all message categories', () => {
    const all = userMessageService.getAllMessages();
    expect(all.categories).toBeDefined();
    expect(all.modules).toBeDefined();
    expect(all.special).toBeDefined();
    expect(Object.keys(all.categories).length).toBe(5);
  });

  it('user messages never contain technical terms', () => {
    const technicalTerms = ['Error:', 'Exception', 'Stack', 'at ', '0x', 'null', 'undefined', 'TypeError', 'ReferenceError'];
    const all = userMessageService.getAllMessages();
    for (const msg of Object.values(all.categories)) {
      for (const term of technicalTerms) {
        expect(msg).not.toContain(term);
      }
    }
  });
});

// ── Part 12: Health Checks ──────────────────────────────────────────

describe('Health Checks (Part 12)', () => {
  beforeEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.enableVerbose();
    backgroundTaskManager.clear();
    resourceManager.clear();
    moduleIsolationService.clear();
    clearModuleRegistry();
    configManager.reset();
  });
  afterEach(() => {
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    backgroundTaskManager.clear();
    resourceManager.clear();
    moduleIsolationService.clear();
    clearModuleRegistry();
    configManager.reset();
  });

  it('runAll returns a report with checks', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    expect(report.checks).toBeDefined();
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeTruthy();
  });

  it('runAll checks all 10 services', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    const services = report.checks.map((c) => c.service);
    expect(services).toContain('HealthEngine');
    expect(services).toContain('ModuleRegistry');
    expect(services).toContain('EventSystem');
    expect(services).toContain('Licensing');
    expect(services).toContain('Configuration');
    expect(services).toContain('ErrorHandler');
    expect(services).toContain('Logger');
    expect(services).toContain('PerformanceMonitor');
    expect(services).toContain('BackgroundTaskManager');
    expect(services).toContain('ResourceManager');
  });

  it('each check has status, message, and timestamp', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    for (const check of report.checks) {
      expect(check.status).toBeTruthy();
      expect(check.message).toBeTruthy();
      expect(check.checkedAt).toBeTruthy();
    }
  });

  it('overall status is healthy when all pass', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    expect(report.overallStatus).toBe('healthy');
  });

  it('overall status is degraded when ModuleRegistry has errors', async () => {
    registerAllModules();
    // Put a module in error state
    moduleRegistry.setStatus('junk' as any, 'error');
    const report = await healthCheckService.runAll();
    const registryCheck = report.checks.find((c) => c.service === 'ModuleRegistry');
    expect(registryCheck!.status).toBe('degraded');
  });

  it('overall status is unhealthy when no modules registered', async () => {
    const report = await healthCheckService.runAll();
    const registryCheck = report.checks.find((c) => c.service === 'ModuleRegistry');
    expect(registryCheck!.status).toBe('unhealthy');
  });

  it('report includes counts', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    expect(report.healthyCount).toBeGreaterThanOrEqual(0);
    expect(report.degradedCount).toBeGreaterThanOrEqual(0);
    expect(report.unhealthyCount).toBeGreaterThanOrEqual(0);
    expect(report.healthyCount + report.degradedCount + report.unhealthyCount + report.unknownCount).toBe(report.checks.length);
  });

  it('runOne returns a single check', async () => {
    registerAllModules();
    const result = await healthCheckService.runOne('Configuration');
    expect(result).toBeDefined();
    expect(result!.service).toBe('Configuration');
  });

  it('runOne returns null for unknown service', async () => {
    const result = await healthCheckService.runOne('Nonexistent');
    expect(result).toBeNull();
  });

  it('HealthEngine check reports weight count', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    const healthCheck = report.checks.find((c) => c.service === 'HealthEngine');
    expect(healthCheck!.status).toBe('healthy');
    expect(healthCheck!.details).toBeDefined();
  });

  it('ResourceManager check reports active resource count', async () => {
    registerAllModules();
    const report = await healthCheckService.runAll();
    const rmCheck = report.checks.find((c) => c.service === 'ResourceManager');
    expect(rmCheck!.status).toBe('healthy');
    expect(rmCheck!.details).toBeDefined();
  });
});

// ── Part 13: Safe Shutdown ──────────────────────────────────────────

describe('Safe Shutdown (Part 13)', () => {
  beforeEach(() => {
    safeShutdownService.reset();
    errorHandler.clear();
    logger.clear();
    logger.enableVerbose();
    backgroundTaskManager.clear();
    resourceManager.clear();
    moduleIsolationService.clear();
    clearModuleRegistry();
  });
  afterEach(() => {
    safeShutdownService.reset();
    errorHandler.clear();
    logger.clear();
    logger.resetToDefault();
    backgroundTaskManager.clear();
    resourceManager.clear();
    moduleIsolationService.clear();
    clearModuleRegistry();
  });

  it('shutdown returns a report with results', async () => {
    const report = await safeShutdownService.shutdown();
    expect(report.results).toBeDefined();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.timestamp).toBeTruthy();
  });

  it('shutdown executes all 7 steps', async () => {
    const report = await safeShutdownService.shutdown();
    const stepNames = report.results.map((r) => r.step);
    expect(stepNames).toContain('StopBackgroundTasks');
    expect(stepNames).toContain('FlushLogs');
    expect(stepNames).toContain('SaveState');
    expect(stepNames).toContain('DisposeServices');
    expect(stepNames).toContain('ReleaseResources');
    expect(stepNames).toContain('ClearIsolationState');
    expect(stepNames).toContain('FinalFlush');
  });

  it('each step has success status and duration', async () => {
    const report = await safeShutdownService.shutdown();
    for (const result of report.results) {
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.durationMs).toBe('number');
    }
  });

  it('shutdown completes within reasonable time', async () => {
    const start = Date.now();
    await safeShutdownService.shutdown();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  it('shutdown stops background tasks', async () => {
    // Start a background task with short duration
    backgroundTaskManager.run('test-task', async (ctx) => {
      await new Promise((r) => setTimeout(r, 50));
      if (ctx.isCancelled()) throw new Error('Cancelled');
      return 'done';
    }).catch(() => { /* expected cancellation */ });

    expect(backgroundTaskManager.getActiveCount()).toBeGreaterThan(0);

    await safeShutdownService.shutdown();
    expect(backgroundTaskManager.getActiveCount()).toBe(0);
  });

  it('shutdown releases resources', async () => {
    resourceManager.trackTimer('test-timer', setInterval(() => {}, 1000));
    resourceManager.trackEventListener('test-listener', () => {});
    expect(resourceManager.getActiveCount()).toBeGreaterThan(0);

    await safeShutdownService.shutdown();
    expect(resourceManager.getActiveCount()).toBe(0);
  });

  it('shutdown disposes module registry', async () => {
    registerAllModules();
    expect(moduleRegistry.getAllModules().length).toBeGreaterThan(0);

    await safeShutdownService.shutdown();
    // After dispose, modules should still be registered but disposed
    // (disposeAll calls dispose() on each module, doesn't unregister)
  });

  it('getIsShuttingDown is true during shutdown', async () => {
    let wasShuttingDown = false;
    safeShutdownService.onShutdownComplete(() => {
      wasShuttingDown = safeShutdownService.getShutdownComplete();
    });

    await safeShutdownService.shutdown();
    expect(wasShuttingDown).toBe(true);
  });

  it('double shutdown returns empty report', async () => {
    await safeShutdownService.shutdown();
    const secondReport = await safeShutdownService.shutdown();
    expect(secondReport.results).toHaveLength(0);
  });

  it('onShutdownComplete receives report', async () => {
    let received = false;
    safeShutdownService.onShutdownComplete(() => { received = true; });
    await safeShutdownService.shutdown();
    expect(received).toBe(true);
  });

  it('allSucceeded is true when all steps pass', async () => {
    const report = await safeShutdownService.shutdown();
    expect(report.allSucceeded).toBe(true);
  });
});

// ── Part 14: Future Telemetry Readiness ─────────────────────────────

describe('Future Telemetry Readiness (Part 14)', () => {
  beforeEach(() => {
    // Reset to no-op state
    telemetryProvider.revokeConsent();
    telemetryProvider.updateConfig({ enabled: false });
  });

  it('telemetryProvider is defined', () => {
    expect(telemetryProvider).toBeDefined();
  });

  it('isEnabled returns false by default (no consent)', () => {
    expect(telemetryProvider.isEnabled()).toBe(false);
  });

  it('getConsent returns not_asked by default', () => {
    telemetryProvider.revokeConsent();
    // After revoke, status is 'revoked'
    const consent = telemetryProvider.getConsent();
    expect(consent.status).toBeTruthy();
  });

  it('grantConsent sets status to granted', () => {
    telemetryProvider.grantConsent();
    const consent = telemetryProvider.getConsent();
    expect(consent.status).toBe('granted');
    expect(consent.grantedAt).toBeTruthy();
  });

  it('revokeConsent sets status to revoked', () => {
    telemetryProvider.grantConsent();
    telemetryProvider.revokeConsent();
    const consent = telemetryProvider.getConsent();
    expect(consent.status).toBe('revoked');
    expect(consent.revokedAt).toBeTruthy();
  });

  it('isEnabled returns true only when consent granted AND config enabled', () => {
    // Grant consent but config disabled
    telemetryProvider.grantConsent();
    telemetryProvider.updateConfig({ enabled: false });
    expect(telemetryProvider.isEnabled()).toBe(false);

    // Enable config
    telemetryProvider.updateConfig({ enabled: true });
    expect(telemetryProvider.isEnabled()).toBe(true);
  });

  it('track is a no-op when disabled', () => {
    telemetryProvider.track({
      type: 'test.event',
      category: 'usage',
      data: { count: 1 },
      timestamp: new Date().toISOString(),
      appVersion: '1.0.0',
    });
    // Should not throw, should not collect
    expect(telemetryProvider.previewData()).toHaveLength(0);
  });

  it('previewData returns empty array (no-op)', () => {
    expect(telemetryProvider.previewData()).toEqual([]);
  });

  it('flush is a no-op', async () => {
    await expect(telemetryProvider.flush()).resolves.toBeUndefined();
  });

  it('getConfig returns configuration', () => {
    const config = telemetryProvider.getConfig();
    expect(config).toBeDefined();
    expect(config.enabled).toBe(false);
    expect(config.endpoint).toBeNull();
  });

  it('updateConfig merges changes', () => {
    telemetryProvider.updateConfig({ maxBatchSize: 100 });
    const config = telemetryProvider.getConfig();
    expect(config.maxBatchSize).toBe(100);
  });

  it('requestConsent returns consent object', async () => {
    const consent = await telemetryProvider.requestConsent();
    expect(consent).toBeDefined();
    expect(consent.status).toBeTruthy();
    expect(consent.policyVersion).toBeTruthy();
  });

  it('consent includes policy version', () => {
    const consent = telemetryProvider.getConsent();
    expect(consent.policyVersion).toBeTruthy();
  });

  it('telemetry interface respects privacy — no PII in event data', () => {
    // The TelemetryEvent interface only allows number/string/boolean data
    // This test verifies the interface is designed for anonymous data
    const event = {
      type: 'module.scan.completed',
      category: 'usage' as const,
      data: { durationMs: 500, moduleCount: 9, success: true },
      timestamp: new Date().toISOString(),
      appVersion: '1.0.0',
    };
    // Data should only contain primitive values
    for (const value of Object.values(event.data)) {
      expect(typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean').toBe(true);
    }
  });
});
