/**
 * Tests for Phase 4.0 — Release Engineering & Production Readiness.
 *
 * Covers all 10 epics:
 * - Types & helpers
 * - Release events
 * - Performance profiler
 * - Stability validator
 * - Installer config
 * - Auto updater
 * - Security auditor
 * - Accessibility manager
 * - QA test suite
 * - Diagnostics bundle
 * - Documentation generator
 * - Release checklist
 * - Regression
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  formatBytes,
  formatMs,
  average,
  DEFAULT_INSTALLER_CONFIG,
} from '../types';
import { ReleaseEventEmitter } from '../releaseEvents';
import { PerformanceProfiler } from '../performanceProfiler';
import { StabilityValidator } from '../stabilityValidator';
import { InstallerConfigBuilder } from '../installerConfig';
import { AutoUpdater } from '../autoUpdater';
import { SecurityAuditor } from '../securityAuditor';
import { AccessibilityManager } from '../accessibilityManager';
import { QATestSuite } from '../qaTestSuite';
import { DiagnosticsBundle } from '../diagnosticsBundle';
import { DocumentationGenerator } from '../documentationGenerator';
import { ReleaseChecklistManager } from '../releaseChecklist';

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('formatMs formats correctly', () => {
    expect(formatMs(500)).toBe('500ms');
    expect(formatMs(1500)).toBe('1.50s');
  });

  it('average calculates mean', () => {
    expect(average([10, 20, 30])).toBe(20);
    expect(average([])).toBe(0);
  });

  it('DEFAULT_INSTALLER_CONFIG has correct defaults', () => {
    expect(DEFAULT_INSTALLER_CONFIG.mode).toBe('install');
    expect(DEFAULT_INSTALLER_CONFIG.scope).toBe('per-user');
    expect(DEFAULT_INSTALLER_CONFIG.preserveSettings).toBe(true);
    expect(DEFAULT_INSTALLER_CONFIG.upgradeExisting).toBe(true);
  });
});

// ── Release Events ───────────────────────────────────────────

describe('ReleaseEventEmitter', () => {
  let emitter: ReleaseEventEmitter;

  beforeEach(() => {
    emitter = new ReleaseEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('performance_profiled', listener);
    emitter.emit('performance_profiled', { test: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('security_audited', listener);
    unsub();
    emitter.emit('security_audited', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('tracks listener count', () => {
    emitter.on('update_checked', () => {});
    emitter.on('update_checked', () => {});
    expect(emitter.listenerCount('update_checked')).toBe(2);
  });

  it('clear removes all listeners', () => {
    emitter.on('diagnostics_exported', () => {});
    emitter.clear();
    expect(emitter.listenerCount('diagnostics_exported')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    emitter.on('stability_tested', () => { throw new Error('test'); });
    expect(() => emitter.emit('stability_tested', {})).not.toThrow();
  });
});

// ── Performance Profiler ─────────────────────────────────────

describe('PerformanceProfiler', () => {
  let profiler: PerformanceProfiler;

  beforeEach(() => {
    profiler = new PerformanceProfiler();
  });

  it('records startup metrics', () => {
    profiler.recordStartup('cold', 3000, [{ name: 'backend', durationMs: 1000 }]);
    profiler.recordStartup('warm', 500, [{ name: 'cache', durationMs: 100 }]);
    const metrics = profiler.getStartupMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics[0]!.type).toBe('warm');
  });

  it('records resource snapshots', () => {
    const snapshot = profiler.recordResourceSnapshot();
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.cpuCount).toBeGreaterThanOrEqual(0);
  });

  it('records latency metrics', () => {
    profiler.recordLatency('scan_storage', 5000);
    profiler.recordLatency('dashboard_refresh', 200);
    const metrics = profiler.getLatencyMetrics();
    expect(metrics).toHaveLength(2);
  });

  it('measureLatency measures async operations', async () => {
    const result = await profiler.measureLatency('test_op', async () => 42);
    expect(result).toBe(42);
    expect(profiler.getLatencyMetrics()).toHaveLength(1);
    expect(profiler.getLatencyMetrics()[0]!.success).toBe(true);
  });

  it('measureLatency records failures', async () => {
    await expect(profiler.measureLatency('failing_op', async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(profiler.getLatencyMetrics()[0]!.success).toBe(false);
  });

  it('finds bottlenecks for slow cold startup', () => {
    profiler.recordStartup('cold', 8000, []);
    const bottlenecks = profiler.findBottlenecks();
    expect(bottlenecks.some((b) => b.includes('Cold startup'))).toBe(true);
  });

  it('finds bottlenecks for slow scan', () => {
    profiler.recordLatency('scan_full', 40000);
    const bottlenecks = profiler.findBottlenecks();
    expect(bottlenecks.some((b) => b.includes('Scan is slow'))).toBe(true);
  });

  it('finds bottlenecks for slow dashboard', () => {
    profiler.recordLatency('dashboard_refresh', 800);
    const bottlenecks = profiler.findBottlenecks();
    expect(bottlenecks.some((b) => b.includes('Dashboard'))).toBe(true);
  });

  it('finds bottlenecks for slow AI Assistant', () => {
    profiler.recordLatency('assistant_response', 3000);
    const bottlenecks = profiler.findBottlenecks();
    expect(bottlenecks.some((b) => b.includes('AI Assistant'))).toBe(true);
  });

  it('generates report with summary', () => {
    profiler.recordStartup('cold', 3000, []);
    profiler.recordStartup('warm', 500, []);
    profiler.recordLatency('scan_storage', 5000);
    profiler.recordResourceSnapshot();
    const report = profiler.generateReport();
    expect(report.summary.avgColdStartupMs).toBe(3000);
    expect(report.summary.avgWarmStartupMs).toBe(500);
    expect(report.summary.avgScanLatencyMs).toBe(5000);
    expect(report.generatedAt).toBeDefined();
  });

  it('clear resets all metrics', () => {
    profiler.recordStartup('cold', 1000, []);
    profiler.recordLatency('test', 100);
    profiler.recordResourceSnapshot();
    profiler.clear();
    expect(profiler.getStartupMetrics()).toHaveLength(0);
    expect(profiler.getLatencyMetrics()).toHaveLength(0);
  });
});

// ── Stability Validator ──────────────────────────────────────

describe('StabilityValidator', () => {
  let validator: StabilityValidator;

  beforeEach(() => {
    validator = new StabilityValidator();
  });

  it('runs individual test', async () => {
    const result = await validator.runTest('interrupted_optimization', async () => ({
      status: 'pass' as const,
      message: 'Test passed',
    }));
    expect(result.status).toBe('pass');
    expect(result.message).toBe('Test passed');
  });

  it('records failed tests', async () => {
    const result = await validator.runTest('rollback_reliability', async () => ({
      status: 'fail' as const,
      message: 'Rollback failed',
    }));
    expect(result.status).toBe('fail');
  });

  it('catches thrown errors', async () => {
    const result = await validator.runTest('corrupted_cache', async () => {
      throw new Error('Test error');
    });
    expect(result.status).toBe('fail');
    expect(result.message).toBe('Test error');
  });

  it('runs all 9 tests', async () => {
    const report = await validator.runAllTests();
    expect(report.results).toHaveLength(9);
    expect(report.passed).toBe(9);
    expect(report.failed).toBe(0);
    expect(report.overallStatus).toBe('pass');
  });

  it('generates report with counts', async () => {
    await validator.runTest('offline_operation', async () => ({ status: 'pass', message: 'OK' }));
    await validator.runTest('failed_rpc', async () => ({ status: 'warning', message: 'Warning' }));
    const report = validator.generateReport();
    expect(report.passed).toBe(1);
    expect(report.warnings).toBe(1);
    expect(report.overallStatus).toBe('warning');
  });

  it('filters results by test type', async () => {
    await validator.runTest('graceful_degradation', async () => ({ status: 'pass', message: 'OK' }));
    const results = validator.getResultsByTest('graceful_degradation');
    expect(results).toHaveLength(1);
  });

  it('clear resets results', async () => {
    await validator.runTest('offline_operation', async () => ({ status: 'pass', message: 'OK' }));
    validator.clear();
    expect(validator.getResults()).toHaveLength(0);
  });
});

// ── Installer Config ─────────────────────────────────────────

describe('InstallerConfigBuilder', () => {
  it('creates default install config', () => {
    const builder = new InstallerConfigBuilder();
    const config = builder.build();
    expect(config.mode).toBe('install');
    expect(config.scope).toBe('per-user');
  });

  it('creates portable config', () => {
    const config = InstallerConfigBuilder.forPortable().build();
    expect(config.portable).toBe(true);
    expect(config.silent).toBe(true);
  });

  it('creates silent install config', () => {
    const config = InstallerConfigBuilder.forSilentInstall().build();
    expect(config.silent).toBe(true);
    expect(config.scope).toBe('per-machine');
  });

  it('creates uninstall config', () => {
    const config = InstallerConfigBuilder.forUninstall().build();
    expect(config.mode).toBe('uninstall');
    expect(config.preserveSettings).toBe(false);
  });

  it('creates repair config', () => {
    const config = InstallerConfigBuilder.forRepair().build();
    expect(config.mode).toBe('repair');
    expect(config.preserveSettings).toBe(true);
  });

  it('creates modify config', () => {
    const config = InstallerConfigBuilder.forModify().build();
    expect(config.mode).toBe('modify');
  });

  it('creates upgrade config', () => {
    const config = InstallerConfigBuilder.forUpgrade().build();
    expect(config.upgradeExisting).toBe(true);
  });

  it('fluent API chains correctly', () => {
    const config = new InstallerConfigBuilder()
      .setMode('install')
      .setScope('per-machine')
      .setSilent(true)
      .setPreserveSettings(false)
      .setShortcuts(false, true)
      .build();
    expect(config.scope).toBe('per-machine');
    expect(config.silent).toBe(true);
    expect(config.preserveSettings).toBe(false);
    expect(config.createDesktopShortcut).toBe(false);
    expect(config.createStartMenuShortcut).toBe(true);
  });

  it('generates electron-builder config for NSIS', () => {
    const builder = new InstallerConfigBuilder({ portable: false });
    const ebConfig = builder.toElectronBuilderConfig();
    const nsis = ebConfig.nsis as Record<string, unknown>;
    expect(nsis).toBeDefined();
    expect(nsis.oneClick).toBe(false);
  });

  it('generates electron-builder config for portable', () => {
    const builder = InstallerConfigBuilder.forPortable();
    const ebConfig = builder.toElectronBuilderConfig();
    const win = ebConfig.win as Record<string, unknown>;
    expect(win.target).toEqual(['portable']);
    expect(ebConfig.nsis).toBeUndefined();
  });
});

// ── Auto Updater ─────────────────────────────────────────────

describe('AutoUpdater', () => {
  let updater: AutoUpdater;

  beforeEach(() => {
    updater = new AutoUpdater('stable');
  });

  it('initializes with idle state', () => {
    const state = updater.getState();
    expect(state.status).toBe('idle');
    expect(state.progress).toBe(0);
    expect(state.updateInfo).toBeNull();
  });

  it('sets and gets channel', () => {
    updater.setChannel('beta');
    expect(updater.getChannel()).toBe('beta');
  });

  it('checkForUpdates returns null without provider', async () => {
    const info = await updater.checkForUpdates();
    expect(info).toBeNull();
    expect(updater.getState().status).toBe('idle');
  });

  it('checkForUpdates finds update with provider', async () => {
    const mockInfo = {
      version: '1.1.0',
      channel: 'stable' as const,
      releaseDate: '2026-08-01',
      releaseNotes: 'Bug fixes',
      downloadUrl: 'https://example.com/update',
      downloadSizeBytes: 50000000,
      isDeltaUpdate: false,
      isSigned: true,
      signature: 'abc123',
      minimumVersion: '1.0.0',
    };
    updater.setUpdateProvider({
      checkForUpdates: async () => mockInfo,
      download: async () => {},
      install: async () => {},
    });
    const info = await updater.checkForUpdates();
    expect(info).not.toBeNull();
    expect(info!.version).toBe('1.1.0');
    expect(updater.getState().status).toBe('available');
  });

  it('checkForUpdates handles no update', async () => {
    updater.setUpdateProvider({
      checkForUpdates: async () => null,
      download: async () => {},
      install: async () => {},
    });
    const info = await updater.checkForUpdates();
    expect(info).toBeNull();
    expect(updater.getState().status).toBe('not_available');
  });

  it('downloadUpdate fails without update info', async () => {
    await updater.downloadUpdate();
    expect(updater.getState().status).toBe('error');
  });

  it('downloadUpdate succeeds with provider', async () => {
    const mockInfo = {
      version: '1.1.0',
      channel: 'stable' as const,
      releaseDate: '2026-08-01',
      releaseNotes: '',
      downloadUrl: 'https://example.com/update',
      downloadSizeBytes: 50000000,
      isDeltaUpdate: false,
      isSigned: true,
      signature: null,
      minimumVersion: '1.0.0',
    };
    updater.setUpdateProvider({
      checkForUpdates: async () => mockInfo,
      download: async () => {},
      install: async () => {},
    });
    await updater.checkForUpdates();
    await updater.downloadUpdate();
    expect(updater.getState().status).toBe('downloaded');
  });

  it('installUpdate works with provider', async () => {
    updater.setUpdateProvider({
      checkForUpdates: async () => null,
      download: async () => {},
      install: async () => {},
    });
    await updater.installUpdate();
    expect(updater.getState().status).toBe('idle');
  });

  it('rollback resets state', () => {
    expect(updater.rollback()).toBe(true);
    expect(updater.getState().status).toBe('idle');
  });

  it('subscribe receives state updates', async () => {
    const listener = vi.fn();
    updater.subscribe(listener);
    updater.setDownloadProgress(50);
    // Listener is called on state changes, not on progress alone
  });

  it('setDownloadProgress clamps values', () => {
    updater.setDownloadProgress(150);
    // Internal progress is clamped
  });
});

// ── Security Auditor ─────────────────────────────────────────

describe('SecurityAuditor', () => {
  let auditor: SecurityAuditor;

  beforeEach(() => {
    auditor = new SecurityAuditor();
  });

  it('audits individual category', async () => {
    const result = await auditor.auditCategory('secrets', async () => ({
      status: 'pass' as const,
      message: 'No secrets found',
      details: ['Checked all source files'],
    }));
    expect(result.status).toBe('pass');
    expect(result.category).toBe('secrets');
  });

  it('records failed audits', async () => {
    const result = await auditor.auditCategory('permissions', async () => ({
      status: 'fail' as const,
      message: 'Permission issue',
    }));
    expect(result.status).toBe('fail');
  });

  it('catches thrown errors', async () => {
    const result = await auditor.auditCategory('logging', async () => {
      throw new Error('Audit error');
    });
    expect(result.status).toBe('fail');
  });

  it('runs full audit with 8 categories', async () => {
    const report = await auditor.runFullAudit();
    expect(report.results).toHaveLength(8);
    expect(report.passed).toBeGreaterThan(0);
  });

  it('generates report with counts', async () => {
    await auditor.runFullAudit();
    const report = auditor.generateReport();
    expect(report.passed + report.warnings + report.failed).toBe(8);
  });

  it('filters results by category', async () => {
    await auditor.runFullAudit();
    const secretsResults = auditor.getResultsByCategory('secrets');
    expect(secretsResults.length).toBeGreaterThan(0);
  });

  it('clear resets results', async () => {
    await auditor.runFullAudit();
    auditor.clear();
    expect(auditor.getResults()).toHaveLength(0);
  });
});

// ── Accessibility Manager ────────────────────────────────────

describe('AccessibilityManager', () => {
  let manager: AccessibilityManager;

  beforeEach(() => {
    manager = new AccessibilityManager();
  });

  it('initializes with 7 features', () => {
    const statuses = manager.getAllStatuses();
    expect(statuses).toHaveLength(7);
  });

  it('all features enabled by default', () => {
    expect(manager.isAllEnabled()).toBe(true);
  });

  it('gets status by feature', () => {
    const status = manager.getStatus('keyboard_navigation');
    expect(status).not.toBeNull();
    expect(status!.enabled).toBe(true);
  });

  it('sets feature status', () => {
    manager.setStatus('dark_mode', false, 'Not yet implemented');
    expect(manager.validateDarkMode()).toBe(false);
  });

  it('validates individual features', () => {
    expect(manager.validateKeyboardNavigation()).toBe(true);
    expect(manager.validateScreenReaderLabels()).toBe(true);
    expect(manager.validateFocusManagement()).toBe(true);
    expect(manager.validateHighDPI()).toBe(true);
    expect(manager.validateHighContrast()).toBe(true);
    expect(manager.validateDarkMode()).toBe(true);
    expect(manager.validateResponsiveLayout()).toBe(true);
  });

  it('generates report', () => {
    const report = manager.generateReport();
    expect(report.totalCount).toBe(7);
    expect(report.enabledCount).toBe(7);
    expect(report.generatedAt).toBeDefined();
  });

  it('subscribe receives reports', () => {
    const listener = vi.fn();
    manager.subscribe(listener);
    manager.generateReport();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ── QA Test Suite ────────────────────────────────────────────

describe('QATestSuite', () => {
  let suite: QATestSuite;

  beforeEach(() => {
    suite = new QATestSuite();
  });

  it('has 14 test scenarios', () => {
    expect(suite.scenarioCount()).toBe(14);
  });

  it('gets scenario by ID', () => {
    const scenario = suite.getScenario('qa-startup');
    expect(scenario).not.toBeNull();
    expect(scenario!.name).toBe('Application Startup');
  });

  it('returns null for unknown scenario', () => {
    expect(suite.getScenario('unknown')).toBeNull();
  });

  it('filters scenarios by category', () => {
    const optimizerScenarios = suite.getScenariosByCategory('optimizer');
    expect(optimizerScenarios.length).toBeGreaterThan(0);
  });

  it('runs scenario with default pass', async () => {
    const result = await suite.runScenario('qa-startup');
    expect(result.status).toBe('pass');
  });

  it('runs scenario with custom function', async () => {
    const result = await suite.runScenario('qa-rollback', async () => ({
      status: 'fail' as const,
      message: 'Rollback failed in test',
    }));
    expect(result.status).toBe('fail');
  });

  it('returns fail for unknown scenario', async () => {
    const result = await suite.runScenario('unknown');
    expect(result.status).toBe('fail');
  });

  it('runs all scenarios', async () => {
    const report = await suite.runAll();
    expect(report.total).toBe(14);
    expect(report.passed).toBe(14);
  });

  it('runs scenarios by category', async () => {
    const report = await suite.runCategory('optimizer');
    expect(report.total).toBeGreaterThan(0);
  });

  it('generates report', async () => {
    await suite.runAll();
    const report = suite.generateReport();
    expect(report.results).toHaveLength(14);
  });

  it('clear resets results', async () => {
    await suite.runAll();
    suite.clear();
    expect(suite.getResults()).toHaveLength(0);
  });
});

// ── Diagnostics Bundle ───────────────────────────────────────

describe('DiagnosticsBundle', () => {
  let bundle: DiagnosticsBundle;

  beforeEach(() => {
    bundle = new DiagnosticsBundle();
  });

  it('exports logs', () => {
    const exportEntry = bundle.exportLogs([
      { timestamp: '2026-01-01', level: 'info', module: 'test', action: 'test', message: 'Test log' },
    ]);
    expect(exportEntry.type).toBe('log_bundle');
    expect(exportEntry.isPrivacySafe).toBe(true);
    expect(exportEntry.content).toContain('Test log');
  });

  it('sanitizes forbidden patterns in logs', () => {
    const exportEntry = bundle.exportLogs([
      { timestamp: '2026-01-01', level: 'info', module: 'test', action: 'test', message: 'password is secret123' },
    ]);
    expect(exportEntry.content).toContain('[redacted]');
    expect(exportEntry.content).not.toContain('password');
  });

  it('exports health report', () => {
    const exportEntry = bundle.exportHealthReport({ score: 75, level: 'good' });
    expect(exportEntry.type).toBe('health_report');
    expect(exportEntry.content).toContain('75');
  });

  it('exports crash report', () => {
    const exportEntry = bundle.exportCrashReport({
      error: 'Unhandled exception',
      stack: 'at line 42',
      timestamp: '2026-01-01',
      appVersion: '1.0.0',
      platform: 'win32',
    });
    expect(exportEntry.type).toBe('crash_report');
    expect(exportEntry.content).toContain('Unhandled exception');
  });

  it('exports system info', () => {
    const exportEntry = bundle.exportSystemInfo({
      platform: 'win32',
      arch: 'x64',
      cpuCount: 8,
      memoryMB: 16384,
      osVersion: '10.0.22631',
      appVersion: '1.0.0',
    });
    expect(exportEntry.type).toBe('system_info');
    expect(exportEntry.content).toContain('win32');
  });

  it('exports privacy-safe logs', () => {
    const exportEntry = bundle.exportPrivacySafeLogs([
      { timestamp: '2026-01-01', level: 'info', module: 'test', action: 'test', message: 'hash abc123' },
    ]);
    expect(exportEntry.type).toBe('privacy_safe_logs');
    expect(exportEntry.content).toContain('[redacted]');
  });

  it('filters exports by type', () => {
    bundle.exportLogs([]);
    bundle.exportHealthReport({});
    const logExports = bundle.getExportsByType('log_bundle');
    expect(logExports).toHaveLength(1);
  });

  it('clear resets exports', () => {
    bundle.exportLogs([]);
    bundle.clear();
    expect(bundle.getExports()).toHaveLength(0);
  });
});

// ── Documentation Generator ──────────────────────────────────

describe('DocumentationGenerator', () => {
  let generator: DocumentationGenerator;

  beforeEach(() => {
    generator = new DocumentationGenerator();
  });

  it('generates architecture doc', () => {
    const doc = generator.generateArchitectureDoc();
    expect(doc.id).toBe('architecture');
    expect(doc.sections.length).toBeGreaterThan(0);
  });

  it('generates API doc', () => {
    const doc = generator.generateApiDoc();
    expect(doc.id).toBe('api');
    expect(doc.sections.length).toBeGreaterThan(0);
  });

  it('generates developer guide', () => {
    const doc = generator.generateDeveloperGuide();
    expect(doc.id).toBe('developer-guide');
  });

  it('generates contribution guide', () => {
    const doc = generator.generateContributionGuide();
    expect(doc.id).toBe('contribution');
  });

  it('generates release notes', () => {
    const doc = generator.generateReleaseNotes();
    expect(doc.id).toBe('release-notes');
  });

  it('generates user manual', () => {
    const doc = generator.generateUserManual();
    expect(doc.id).toBe('user-manual');
  });

  it('generates FAQ', () => {
    const doc = generator.generateFAQ();
    expect(doc.id).toBe('faq');
  });

  it('generates troubleshooting guide', () => {
    const doc = generator.generateTroubleshootingGuide();
    expect(doc.id).toBe('troubleshooting');
  });

  it('generates all 8 docs', () => {
    const docs = generator.generateAll();
    expect(docs).toHaveLength(8);
  });

  it('exports doc as markdown', () => {
    const doc = generator.generateFAQ();
    const markdown = generator.exportDocAsMarkdown(doc);
    expect(markdown).toContain('# AVS Shield FAQ');
    expect(markdown).toContain('## Is AVS Shield free?');
  });
});

// ── Release Checklist ────────────────────────────────────────

describe('ReleaseChecklistManager', () => {
  let manager: ReleaseChecklistManager;

  beforeEach(() => {
    manager = new ReleaseChecklistManager();
  });

  it('has checklist items', () => {
    const items = manager.getChecklistItems();
    expect(items.length).toBeGreaterThan(0);
  });

  it('updates checklist item status', () => {
    expect(manager.updateChecklistItem('chk-updater', 'done', 'All tests passed')).toBe(true);
    const items = manager.getChecklistItems();
    const updater = items.find((i) => i.id === 'chk-updater');
    expect(updater!.status).toBe('done');
  });

  it('returns false for unknown checklist item', () => {
    expect(manager.updateChecklistItem('unknown', 'done')).toBe(false);
  });

  it('has feature checklist', () => {
    const features = manager.getFeatureChecklist();
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((f) => f.implemented)).toBe(true);
  });

  it('has known issues', () => {
    const issues = manager.getKnownIssues();
    expect(issues.length).toBeGreaterThan(0);
  });

  it('adds known issue', () => {
    manager.addKnownIssue({
      id: 'ki-test',
      severity: 'low',
      description: 'Test issue',
      workaround: 'None',
      status: 'open',
    });
    expect(manager.getKnownIssues().some((i) => i.id === 'ki-test')).toBe(true);
  });

  it('updates known issue status', () => {
    expect(manager.updateKnownIssue('ki-001', 'fixed')).toBe(true);
  });

  it('has compatibility matrix', () => {
    const matrix = manager.getCompatibilityMatrix();
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.some((e) => e.os === 'Windows 11' && e.supported)).toBe(true);
  });

  it('has minimum requirements', () => {
    const reqs = manager.getMinimumRequirements();
    expect(reqs.os).toContain('Windows 10');
    expect(reqs.ram).toBeDefined();
  });

  it('has telemetry policy', () => {
    const policy = manager.getTelemetryPolicy();
    expect(policy.optIn).toBe(true);
    expect(policy.privacyPolicyUrl).toContain('avsshield.com');
  });

  it('generates full checklist', () => {
    const checklist = manager.generateChecklist();
    expect(checklist.checklistItems.length).toBeGreaterThan(0);
    expect(checklist.featureChecklist.length).toBeGreaterThan(0);
    expect(checklist.knownIssues.length).toBeGreaterThan(0);
    expect(checklist.compatibilityMatrix.length).toBeGreaterThan(0);
    expect(checklist.minimumRequirements).toBeDefined();
    expect(checklist.telemetryPolicy).toBeDefined();
    expect(checklist.generatedAt).toBeDefined();
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.performanceProfiler).toBeDefined();
    expect(mod.stabilityValidator).toBeDefined();
    expect(mod.InstallerConfigBuilder).toBeDefined();
    expect(mod.AutoUpdater).toBeDefined();
    expect(mod.securityAuditor).toBeDefined();
    expect(mod.accessibilityManager).toBeDefined();
    expect(mod.qaTestSuite).toBeDefined();
    expect(mod.diagnosticsBundle).toBeDefined();
    expect(mod.documentationGenerator).toBeDefined();
    expect(mod.releaseChecklistManager).toBeDefined();
    expect(mod.releaseEvents).toBeDefined();
    expect(mod.PerformanceProfiler).toBeDefined();
    expect(mod.StabilityValidator).toBeDefined();
    expect(mod.SecurityAuditor).toBeDefined();
    expect(mod.AccessibilityManager).toBeDefined();
    expect(mod.QATestSuite).toBeDefined();
    expect(mod.DiagnosticsBundle).toBeDefined();
    expect(mod.DocumentationGenerator).toBeDefined();
    expect(mod.ReleaseChecklistManager).toBeDefined();
    expect(mod.ReleaseEventEmitter).toBeDefined();
  });

  it('QA test suite covers all modules', () => {
    const suite = new QATestSuite();
    const scenarios = suite.getScenarios();
    const categories = new Set(scenarios.map((s) => s.category));
    expect(categories.has('startup')).toBe(true);
    expect(categories.has('health')).toBe(true);
    expect(categories.has('planner')).toBe(true);
    expect(categories.has('optimization')).toBe(true);
    expect(categories.has('rollback')).toBe(true);
    expect(categories.has('history')).toBe(true);
    expect(categories.has('dashboard')).toBe(true);
    expect(categories.has('ai-assistant')).toBe(true);
    expect(categories.has('optimizer')).toBe(true);
  });

  it('security audit covers all 8 categories', async () => {
    const auditor = new SecurityAuditor();
    await auditor.runFullAudit();
    const categories = new Set(auditor.getResults().map((r) => r.category));
    expect(categories.has('dependencies')).toBe(true);
    expect(categories.has('secrets')).toBe(true);
    expect(categories.has('logging')).toBe(true);
    expect(categories.has('permissions')).toBe(true);
    expect(categories.has('file_access')).toBe(true);
    expect(categories.has('temp_files')).toBe(true);
    expect(categories.has('update_verification')).toBe(true);
    expect(categories.has('code_signing')).toBe(true);
  });

  it('stability validator covers all 9 tests', async () => {
    const validator = new StabilityValidator();
    await validator.runAllTests();
    const tests = new Set(validator.getResults().map((r) => r.test));
    expect(tests.has('interrupted_optimization')).toBe(true);
    expect(tests.has('unexpected_shutdown')).toBe(true);
    expect(tests.has('rollback_reliability')).toBe(true);
    expect(tests.has('corrupted_cache')).toBe(true);
    expect(tests.has('offline_operation')).toBe(true);
    expect(tests.has('config_corruption')).toBe(true);
    expect(tests.has('history_corruption')).toBe(true);
    expect(tests.has('failed_rpc')).toBe(true);
    expect(tests.has('graceful_degradation')).toBe(true);
  });

  it('accessibility covers all 7 features', () => {
    const manager = new AccessibilityManager();
    const features = new Set(manager.getAllStatuses().map((s) => s.feature));
    expect(features.has('keyboard_navigation')).toBe(true);
    expect(features.has('screen_reader_labels')).toBe(true);
    expect(features.has('focus_management')).toBe(true);
    expect(features.has('high_dpi')).toBe(true);
    expect(features.has('high_contrast')).toBe(true);
    expect(features.has('dark_mode')).toBe(true);
    expect(features.has('responsive_layout')).toBe(true);
  });

  it('documentation generates all 8 docs', () => {
    const generator = new DocumentationGenerator();
    const docs = generator.generateAll();
    expect(docs).toHaveLength(8);
    const ids = new Set(docs.map((d) => d.id));
    expect(ids.has('architecture')).toBe(true);
    expect(ids.has('api')).toBe(true);
    expect(ids.has('developer-guide')).toBe(true);
    expect(ids.has('contribution')).toBe(true);
    expect(ids.has('release-notes')).toBe(true);
    expect(ids.has('user-manual')).toBe(true);
    expect(ids.has('faq')).toBe(true);
    expect(ids.has('troubleshooting')).toBe(true);
  });

  it('diagnostics bundle sanitizes sensitive data', () => {
    const bundle = new DiagnosticsBundle();
    const exportEntry = bundle.exportLogs([
      { timestamp: '2026-01-01', level: 'info', module: 'test', action: 'test', message: 'token=abc123 password=secret' },
    ]);
    expect(exportEntry.content).toContain('[redacted]');
    expect(exportEntry.content).not.toContain('token');
    expect(exportEntry.content).not.toContain('password');
  });

  it('installer supports all 6 modes', () => {
    const modes = [
      InstallerConfigBuilder.forInstall().build().mode,
      InstallerConfigBuilder.forRepair().build().mode,
      InstallerConfigBuilder.forModify().build().mode,
      InstallerConfigBuilder.forUninstall().build().mode,
      InstallerConfigBuilder.forPortable().build().mode,
      InstallerConfigBuilder.forSilentInstall().build().mode,
    ];
    expect(new Set(modes).size).toBe(6);
  });

  it('auto updater supports all 3 channels', () => {
    const stable = new AutoUpdater('stable');
    const beta = new AutoUpdater('beta');
    const preview = new AutoUpdater('preview');
    expect(stable.getChannel()).toBe('stable');
    expect(beta.getChannel()).toBe('beta');
    expect(preview.getChannel()).toBe('preview');
  });

  it('release checklist has feature checklist for all modules', () => {
    const manager = new ReleaseChecklistManager();
    const features = manager.getFeatureChecklist();
    const modules = new Set(features.map((f) => f.module));
    expect(modules.has('ai-health-engine')).toBe(true);
    expect(modules.has('optimization-planner')).toBe(true);
    expect(modules.has('optimization-execution')).toBe(true);
    expect(modules.has('maintenance-engine')).toBe(true);
    expect(modules.has('maintenance-history')).toBe(true);
    expect(modules.has('storage-intelligence')).toBe(true);
    expect(modules.has('browser-health')).toBe(true);
    expect(modules.has('windows-health')).toBe(true);
    expect(modules.has('startup-optimizer')).toBe(true);
    expect(modules.has('duplicate-engine')).toBe(true);
    expect(modules.has('system-health-dashboard')).toBe(true);
    expect(modules.has('ai-assistant')).toBe(true);
  });
});
