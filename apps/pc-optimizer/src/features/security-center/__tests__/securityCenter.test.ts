/**
 * AI Security Center — Comprehensive Tests
 *
 * Tests for:
 * - Provider registration and management
 * - Mock providers (behavior, signature, persistence, browser, reputation, threat intel)
 * - Mock detections and failures
 * - Mock unsupported providers
 * - Snapshot generation and structure
 * - Event publication
 * - Scoring (security, threat, risk, confidence, exposure)
 * - Dashboard data generation
 * - History recording
 * - Cache operations
 * - Configuration validation
 * - Health checks
 * - Capabilities reporting
 * - Diagnostics
 * - Full engine integration (end-to-end scan)
 * - Graceful degradation (provider failures, empty data)
 * - Security (evidence-based, no hallucinated threats)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecurityManager } from '../SecurityManager';
import { SecurityEngine } from '../SecurityEngine';
import { SecurityRegistry } from '../SecurityRegistry';
import { SecurityFactory } from '../SecurityFactory';
import { SecurityProvider } from '../SecurityProvider';
import { BehaviorProvider } from '../BehaviorProvider';
import { SignatureProvider } from '../SignatureProvider';
import { PersistenceProvider } from '../PersistenceProvider';
import { BrowserProtectionProvider } from '../BrowserProtectionProvider';
import { ReputationProvider } from '../ReputationProvider';
import { ThreatIntelligenceProvider } from '../ThreatIntelligenceProvider';
import { SecurityScanner } from '../SecurityScanner';
import { SecuritySnapshotBuilder } from '../SecuritySnapshot';
import { SecurityRepository } from '../SecurityRepository';
import { SecurityHistory } from '../SecurityHistory';
import { SecurityCache } from '../SecurityCache';
import { SecurityConfigurationManager } from '../SecurityConfiguration';
import { SecurityHealth } from '../SecurityHealth';
import { SecurityCapabilities } from '../SecurityCapabilities';
import { SecurityDiagnostics } from '../SecurityDiagnostics';
import { SecurityDashboardProvider } from '../SecurityDashboardProvider';
import { securityEventBus } from '../SecurityEvents';
import { DEFAULT_SECURITY_CONFIG } from '../types';
import type {
  SecurityEvent,
  SecurityConfiguration,
  ProviderScanContext,
  ProviderScanResult,
  Threat,
} from '../types';

// ── Mock Factories ───────────────────────────────────────────────────

function makeMockProvider(
  id: string,
  type: ProviderScanResult['providerType'],
  threats: Threat[] = [],
  shouldFail = false,
): SecurityProvider {
  return new (class extends SecurityProvider {
    async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
      const start = Date.now();
      if (shouldFail) {
        throw new Error(`Mock provider ${id} failed`);
      }
      const duration = Date.now() - start;
      return {
        providerId: id,
        providerType: type,
        threats,
        duration,
        success: true,
        error: null,
        itemsScanned: context.targets.length,
        metadata: { mock: true },
      };
    }
  })(id, `Mock ${id}`, type, '1.0.0', `Mock provider ${id}`, 0);
}

function makeMockThreat(overrides?: Partial<Threat>): Threat {
  return {
    id: `threat-mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Mock Threat',
    category: 'malware',
    severity: 'high',
    confidence: 0.85,
    confidenceLabel: 'high',
    risk: 'high',
    status: 'active',
    evidence: [{
      source: 'mock',
      type: 'test',
      value: 'test-value',
      description: 'Mock evidence',
      timestamp: Date.now(),
    }],
    detectionSource: 'mock-provider',
    detectionTime: Date.now(),
    recommendation: 'Review and monitor.',
    explanation: 'Mock threat for testing.',
    mitreAttack: null,
    affectedAssets: [],
    requiresRestart: false,
    reversible: true,
    canRemediate: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AI Security Center', () => {
  let manager: SecurityManager;

  beforeEach(() => {
    manager = new SecurityManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('SecurityRegistry', () => {
    it('registers providers', () => {
      const registry = new SecurityRegistry();
      const provider = new BehaviorProvider();
      registry.register(provider);
      expect(registry.count()).toBe(1);
      expect(registry.hasProvider('behavior-provider')).toBe(true);
    });

    it('prevents duplicate registration', () => {
      const registry = new SecurityRegistry();
      registry.register(new BehaviorProvider());
      expect(() => registry.register(new BehaviorProvider())).toThrow();
    });

    it('unregisters providers', () => {
      const registry = new SecurityRegistry();
      const provider = new BehaviorProvider();
      registry.register(provider);
      expect(registry.unregister('behavior-provider')).toBe(true);
      expect(registry.count()).toBe(0);
    });

    it('gets providers by type', () => {
      const registry = new SecurityRegistry();
      registry.register(new BehaviorProvider());
      registry.register(new SignatureProvider());
      const behavior = registry.getProvidersByType('behavior');
      expect(behavior.length).toBe(1);
      expect(behavior[0]!.getId()).toBe('behavior-provider');
    });

    it('enables and disables providers', () => {
      const registry = new SecurityRegistry();
      registry.register(new BehaviorProvider());
      expect(registry.getProvider('behavior-provider')!.isEnabled()).toBe(true);
      registry.disableProvider('behavior-provider');
      expect(registry.getProvider('behavior-provider')!.isEnabled()).toBe(false);
      registry.enableProvider('behavior-provider');
      expect(registry.getProvider('behavior-provider')!.isEnabled()).toBe(true);
    });

    it('returns all provider info', () => {
      const registry = new SecurityRegistry();
      registry.register(new BehaviorProvider());
      registry.register(new SignatureProvider());
      const infos = registry.getAllProviderInfo();
      expect(infos.length).toBe(2);
      expect(infos[0]!.id).toBe('behavior-provider');
    });
  });

  describe('SecurityFactory', () => {
    it('creates all default providers when enabled', () => {
      const providers = SecurityFactory.createDefaultProviders(DEFAULT_SECURITY_CONFIG);
      // 6 base + 21 detection = 27
      expect(providers.length).toBe(27);
    });

    it('respects configuration flags', () => {
      const config: Partial<SecurityConfiguration> = {
        enableBehaviorAnalysis: false,
        enableSignatureDetection: false,
      };
      const providers = SecurityFactory.createDefaultProviders({ ...DEFAULT_SECURITY_CONFIG, ...config });
      // No behavior (1 base + 13 detection) or signature (1 base) = 27 - 15 = 12
      expect(providers.length).toBe(12);
      expect(providers.find((p) => p.getType() === 'behavior')).toBeUndefined();
      expect(providers.find((p) => p.getType() === 'signature')).toBeUndefined();
    });

    it('creates and registers all providers', () => {
      const registry = new SecurityRegistry();
      SecurityFactory.createAndRegisterAll(registry, DEFAULT_SECURITY_CONFIG);
      expect(registry.count()).toBe(27);
    });
  });

  describe('SecurityConfiguration', () => {
    it('uses default configuration', () => {
      const config = new SecurityConfigurationManager();
      expect(config.get().enabled).toBe(true);
      expect(config.get().enableBehaviorAnalysis).toBe(true);
    });

    it('validates configuration values', () => {
      const config = new SecurityConfigurationManager({ maxConcurrentProviders: -1, scanTimeoutMs: 0 });
      expect(config.get().maxConcurrentProviders).toBe(1);
      expect(config.get().scanTimeoutMs).toBe(1000);
    });

    it('checks provider type enablement', () => {
      const config = new SecurityConfigurationManager({ enableBehaviorAnalysis: false });
      expect(config.isProviderTypeEnabled('behavior')).toBe(false);
      expect(config.isProviderTypeEnabled('signature')).toBe(true);
    });

    it('checks notification thresholds', () => {
      const config = new SecurityConfigurationManager({ notificationMinSeverity: 'high' });
      expect(config.shouldNotify('critical')).toBe(true);
      expect(config.shouldNotify('high')).toBe(true);
      expect(config.shouldNotify('medium')).toBe(false);
    });
  });

  describe('SecurityCache', () => {
    it('stores and retrieves values', () => {
      const cache = new SecurityCache();
      cache.set('key1', { data: 'test' });
      expect(cache.get('key1')).toEqual({ data: 'test' });
    });

    it('returns null for missing keys', () => {
      const cache = new SecurityCache();
      expect(cache.get('missing')).toBeNull();
    });

    it('respects TTL', () => {
      const cache = new SecurityCache();
      cache.set('key1', 'value', 1);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(cache.get('key1')).toBeNull();
          resolve();
        }, 10);
      });
    });

    it('cleans up expired entries', () => {
      const cache = new SecurityCache();
      cache.set('key1', 'value', 1);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          const removed = cache.cleanup();
          expect(removed).toBe(1);
          resolve();
        }, 10);
      });
    });
  });

  describe('SecuritySnapshot', () => {
    it('builds snapshot with no threats', () => {
      const builder = new SecuritySnapshotBuilder();
      const snapshot = builder.build([], [], [], null, '1.0.0', null, null);
      expect(snapshot.securityScore).toBe(100);
      expect(snapshot.threats).toEqual([]);
      expect(snapshot.protectionStatus.overallProtected).toBe(false);
    });

    it('builds snapshot with threats', () => {
      const builder = new SecuritySnapshotBuilder();
      const threats = [makeMockThreat(), makeMockThreat({ severity: 'critical' })];
      const snapshot = builder.build(threats, [], [], null, '1.0.0', null, null);
      expect(snapshot.securityScore).toBeLessThan(100);
      expect(snapshot.threatScore).toBeGreaterThan(0);
    });

    it('computes protection status from providers', () => {
      const builder = new SecuritySnapshotBuilder();
      const providers = [
        { id: 'p1', name: 'P1', type: 'behavior' as const, version: '1.0', status: 'active' as const, enabled: true, priority: 0, description: '', capabilities: [], lastError: null, lastRun: null },
        { id: 'p2', name: 'P2', type: 'signature' as const, version: '1.0', status: 'inactive' as const, enabled: true, priority: 0, description: '', capabilities: [], lastError: null, lastRun: null },
      ];
      const snapshot = builder.build([], providers, [], null, '1.0.0', null, null);
      expect(snapshot.protectionStatus.providersTotal).toBe(2);
      expect(snapshot.protectionStatus.overallProtected).toBe(true);
    });
  });

  describe('SecurityRepository', () => {
    it('stores and retrieves snapshots', () => {
      const repo = new SecurityRepository();
      const builder = new SecuritySnapshotBuilder();
      const snapshot = builder.build([], [], [], null, '1.0.0', null, null);
      repo.saveSnapshot(snapshot);
      expect(repo.snapshotCount()).toBe(1);
      expect(repo.getLatestSnapshot()?.id).toBe(snapshot.id);
    });

    it('stores and retrieves scan results', () => {
      const repo = new SecurityRepository();
      const result = { scanId: 'test-1', scanType: 'quick' as const, status: 'completed' as const, startedAt: Date.now(), completedAt: Date.now(), duration: 100, threats: [], providerResults: [], itemsScanned: 10, securityScore: 100, snapshot: null, error: null };
      repo.saveScanResult(result);
      expect(repo.scanResultCount()).toBe(1);
      expect(repo.getScanResult('test-1')?.scanId).toBe('test-1');
    });

    it('stores and retrieves threats', () => {
      const repo = new SecurityRepository();
      const threat = makeMockThreat();
      repo.saveThreat(threat);
      expect(repo.threatCount()).toBe(1);
      expect(repo.getThreat(threat.id)?.name).toBe('Mock Threat');
    });

    it('updates threat status', () => {
      const repo = new SecurityRepository();
      const threat = makeMockThreat();
      repo.saveThreat(threat);
      expect(repo.updateThreatStatus(threat.id, 'resolved')).toBe(true);
      expect(repo.getThreat(threat.id)?.status).toBe('resolved');
    });
  });

  describe('SecurityHistory', () => {
    it('records scan results', () => {
      const history = new SecurityHistory();
      const result = { scanId: 'test-1', scanType: 'quick' as const, status: 'completed' as const, startedAt: Date.now(), completedAt: Date.now(), duration: 100, threats: [makeMockThreat()], providerResults: [], itemsScanned: 10, securityScore: 80, snapshot: null, error: null };
      history.recordScan(result);
      expect(history.getEntryCount()).toBe(1);
    });

    it('computes history data', () => {
      const history = new SecurityHistory();
      const result = { scanId: 'test-1', scanType: 'quick' as const, status: 'completed' as const, startedAt: Date.now(), completedAt: Date.now(), duration: 100, threats: [makeMockThreat()], providerResults: [], itemsScanned: 10, securityScore: 80, snapshot: null, error: null };
      history.recordScan(result);
      const data = history.getHistoryData();
      expect(data.totalScans).toBe(1);
      expect(data.totalThreatsDetected).toBe(1);
    });

    it('generates history summary', () => {
      const history = new SecurityHistory();
      const summary = history.getHistorySummary();
      expect(summary.totalScans).toBe(0);
      expect(summary.lastScanDate).toBeNull();
    });

    it('provides score trend', () => {
      const history = new SecurityHistory();
      for (let i = 0; i < 5; i++) {
        history.recordScan({
          scanId: `scan-${i}`,
          scanType: 'quick',
          status: 'completed',
          startedAt: Date.now() - i * 1000,
          completedAt: Date.now() - i * 1000 + 100,
          duration: 100,
          threats: [],
          providerResults: [],
          itemsScanned: 10,
          securityScore: 90 - i * 5,
          snapshot: null,
          error: null,
        });
      }
      const trend = history.getScoreTrend();
      expect(trend.length).toBe(5);
      expect(trend[0]!.securityScore).toBe(90);
    });
  });

  describe('SecurityEvents', () => {
    it('emits and receives events', () => {
      const events: SecurityEvent[] = [];
      const unsub = securityEventBus.subscribe((e) => events.push(e));
      securityEventBus.emitScanStarted('scan-1', 'quick');
      expect(events.length).toBe(1);
      expect(events[0]!.type).toBe('security_scan_started');
      unsub();
    });

    it('emits threat detected events', () => {
      const events: SecurityEvent[] = [];
      const unsub = securityEventBus.subscribe((e) => events.push(e));
      securityEventBus.emitThreatDetected('threat-1', 'Test Threat');
      expect(events[0]!.type).toBe('threat_detected');
      expect(events[0]!.threatId).toBe('threat-1');
      unsub();
    });

    it('supports unsubscribe', () => {
      const events: SecurityEvent[] = [];
      const unsub = securityEventBus.subscribe((e) => events.push(e));
      unsub();
      securityEventBus.emitScanStarted('scan-1', 'quick');
      expect(events.length).toBe(0);
    });
  });

  describe('SecurityHealth', () => {
    it('returns unknown health for no snapshot', () => {
      const health = new SecurityHealth();
      const report = health.check(null);
      expect(report.overallHealth).toBe('unknown');
    });

    it('returns healthy for clean snapshot', () => {
      const health = new SecurityHealth();
      const builder = new SecuritySnapshotBuilder();
      const providers = [
        { id: 'p1', name: 'P1', type: 'behavior' as const, version: '1.0', status: 'active' as const, enabled: true, priority: 0, description: '', capabilities: [], lastError: null, lastRun: null },
      ];
      const snapshot = builder.build([], providers, [], null, '1.0.0', null, null);
      const report = health.check(snapshot);
      expect(report.overallHealth).toBe('healthy');
    });

    it('returns critical for low security score', () => {
      const health = new SecurityHealth();
      const builder = new SecuritySnapshotBuilder();
      const threats = [makeMockThreat({ severity: 'critical', confidence: 0.95 })];
      const snapshot = builder.build(threats, [], [], null, '1.0.0', null, null);
      const report = health.check(snapshot);
      expect(report.issues.length).toBeGreaterThan(0);
    });
  });

  describe('SecurityCapabilities', () => {
    it('reports available and enabled capabilities', () => {
      const caps = new SecurityCapabilities();
      const capabilities = [
        { name: 'behavior', available: true, enabled: true, description: 'Behavior' },
        { name: 'signature', available: true, enabled: false, description: 'Signature' },
        { name: 'custom', available: false, enabled: false, description: 'Custom' },
      ];
      const report = caps.report(capabilities);
      expect(report.totalCapabilities).toBe(3);
      expect(report.availableCount).toBe(2);
      expect(report.enabledCount).toBe(1);
      expect(report.unavailable).toEqual(['custom']);
    });
  });

  describe('SecurityDiagnostics', () => {
    it('runs diagnostics on engine', () => {
      const engine = new SecurityEngine();
      const diagnostics = new SecurityDiagnostics();
      const report = diagnostics.run(engine);
      expect(report.results.length).toBeGreaterThan(0);
      expect(report.overallStatus).toBeDefined();
      engine.dispose();
    });
  });

  describe('SecurityDashboardProvider', () => {
    it('builds dashboard with no snapshot', () => {
      const provider = new SecurityDashboardProvider();
      const history = new SecurityHistory();
      const dashboard = provider.build(null, history, [], []);
      expect(dashboard.summary.securityScore).toBe(0);
      expect(dashboard.activeThreats).toEqual([]);
    });

    it('builds dashboard with snapshot', () => {
      const provider = new SecurityDashboardProvider();
      const history = new SecurityHistory();
      const builder = new SecuritySnapshotBuilder();
      const threats = [makeMockThreat()];
      const snapshot = builder.build(threats, [], [], null, '1.0.0', null, null);
      const dashboard = provider.build(snapshot, history, [], []);
      expect(dashboard.summary.securityScore).toBeLessThan(100);
      expect(dashboard.activeThreats.length).toBe(1);
    });
  });

  describe('Providers', () => {
    it('BehaviorProvider detects suspicious behavior', async () => {
      const provider = new BehaviorProvider();
      const context: ProviderScanContext = {
        scanType: 'quick',
        scanId: 'test',
        targets: ['C:\\test.exe'],
        options: {
          'C:\\test.exe': {
            processName: 'test.exe',
            pid: 1234,
            behaviors: ['injection'],
            suspiciousIndicators: ['process_injection', 'hooking', 'suspicious_network'],
          },
        },
      };
      const result = await provider.scan(context);
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('malware');
    });

    it('SignatureProvider detects signature matches', async () => {
      const provider = new SignatureProvider();
      const context: ProviderScanContext = {
        scanType: 'quick',
        scanId: 'test',
        targets: ['C:\\malware.exe'],
        options: {
          signatureInput: {
            matches: [{
              file: 'C:\\malware.exe',
              hash: 'abc123',
              signatureName: 'Test.Malware',
              category: 'trojans',
              severity: 'high',
            }],
          },
        },
      };
      const result = await provider.scan(context);
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.name).toBe('Test.Malware');
    });

    it('PersistenceProvider detects suspicious entries', async () => {
      const provider = new PersistenceProvider();
      const context: ProviderScanContext = {
        scanType: 'quick',
        scanId: 'test',
        targets: [],
        options: {
          persistenceInput: {
            entries: [{
              type: 'scheduled_task',
              name: 'malicious_task',
              path: '\\Microsoft\\Windows\\malicious',
              command: 'C:\\malware.exe',
              suspicious: true,
              reasons: ['unverified publisher', 'suspicious command', 'hidden task'],
            }],
          },
        },
      };
      const result = await provider.scan(context);
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('suspicious_scheduled_task');
    });

    it('BrowserProtectionProvider detects suspicious extensions', async () => {
      const provider = new BrowserProtectionProvider();
      const context: ProviderScanContext = {
        scanType: 'quick',
        scanId: 'test',
        targets: [],
        options: {
          browserInput: {
            extensions: [{
              id: 'ext1',
              name: 'Suspicious Extension',
              browser: 'chrome',
              permissions: ['tabs', 'cookies', 'webRequest'],
              suspicious: true,
              reasons: ['excessive permissions', 'low rating', 'known hijacker'],
            }],
            settings: null,
          },
        },
      };
      const result = await provider.scan(context);
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('browser_hijacker');
    });

    it('ReputationProvider detects low reputation items', async () => {
      const provider = new ReputationProvider();
      const context: ProviderScanContext = {
        scanType: 'quick',
        scanId: 'test',
        targets: [],
        options: {
          reputationInput: {
            entries: [{
              target: 'C:\\unknown.exe',
              type: 'file',
              reputationScore: 15,
              knownGood: false,
              knownBad: true,
              reasons: ['not signed', 'low community trust'],
            }],
          },
        },
      };
      const result = await provider.scan(context);
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.category).toBe('malware');
    });

    it('ThreatIntelligenceProvider detects IOC matches', async () => {
      const provider = new ThreatIntelligenceProvider();
      const context: ProviderScanContext = {
        scanType: 'quick',
        scanId: 'test',
        targets: ['C:\\suspicious.exe'],
        options: {
          threatIntelInput: {
            entries: [{
              ioc: 'suspicious.exe',
              iocType: 'hash',
              threatName: 'APT.Test.Malware',
              category: 'backdoor',
              severity: 'critical',
              campaign: 'Operation Test',
              threatActor: 'TestGroup',
              firstSeen: Date.now() - 86400000,
              lastSeen: Date.now(),
            }],
            targets: ['C:\\suspicious.exe'],
          },
        },
      };
      const result = await provider.scan(context);
      expect(result.success).toBe(true);
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.name).toBe('APT.Test.Malware');
    });
  });

  describe('Full Engine Integration', () => {
    it('runs a quick scan with default providers', async () => {
      const engine = new SecurityEngine();
      const result = await engine.scan('quick', [], {});
      expect(result.status).toBe('completed');
      expect(result.snapshot).not.toBeNull();
      engine.dispose();
    });

    it('generates snapshot after scan', async () => {
      const engine = new SecurityEngine();
      await engine.scan('quick', [], {});
      const snapshot = engine.getSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.threats).toEqual([]);
      engine.dispose();
    });

    it('records history after scan', async () => {
      const engine = new SecurityEngine();
      await engine.scan('quick', [], {});
      expect(engine.getHistory().getEntryCount()).toBe(1);
      engine.dispose();
    });

    it('emits scan events', async () => {
      const engine = new SecurityEngine();
      const events: SecurityEvent[] = [];
      const unsub = securityEventBus.subscribe((e) => events.push(e));
      await engine.scan('quick', [], {});
      const types = events.map((e) => e.type);
      expect(types).toContain('security_scan_started');
      expect(types).toContain('security_scan_completed');
      expect(types).toContain('security_snapshot_updated');
      unsub();
      engine.dispose();
    });

    it('updates definitions version', () => {
      const engine = new SecurityEngine();
      engine.updateDefinitions('2.0.0');
      expect(engine.getDefinitionsVersion()).toBe('2.0.0');
      engine.dispose();
    });
  });

  describe('SecurityManager', () => {
    it('runs scan via manager', async () => {
      const result = await manager.scan('quick', [], {});
      expect(result.status).toBe('completed');
    });

    it('gets dashboard data', async () => {
      await manager.scan('quick', [], {});
      const dashboard = manager.getDashboard();
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.providerStatus.length).toBeGreaterThan(0);
    });

    it('gets health report', async () => {
      await manager.scan('quick', [], {});
      const health = manager.getHealth();
      expect(health.overallHealth).toBeDefined();
    });

    it('gets capabilities report', () => {
      const caps = manager.getCapabilities();
      expect(caps.totalCapabilities).toBeGreaterThan(0);
    });

    it('runs diagnostics', () => {
      const report = manager.runDiagnostics();
      expect(report.results.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases & Graceful Degradation', () => {
    it('handles empty scan targets', async () => {
      const engine = new SecurityEngine();
      const result = await engine.scan('quick', [], {});
      expect(result.status).toBe('completed');
      expect(result.threats).toEqual([]);
      engine.dispose();
    });

    it('handles provider failures gracefully', async () => {
      const registry = new SecurityRegistry();
      const failingProvider = makeMockProvider('failing', 'behavior', [], true);
      const goodProvider = makeMockProvider('good', 'signature', [makeMockThreat()]);
      registry.register(failingProvider);
      registry.register(goodProvider);
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', ['test'], {});
      expect(result.status).toBe('completed');
      expect(result.providerResults.length).toBe(2);
      const failing = result.providerResults.find((r) => r.providerId === 'failing');
      expect(failing!.success).toBe(false);
      const good = result.providerResults.find((r) => r.providerId === 'good');
      expect(good!.success).toBe(true);
      expect(good!.threats.length).toBe(1);
    });

    it('handles all providers failing', async () => {
      const registry = new SecurityRegistry();
      registry.register(makeMockProvider('fail1', 'behavior', [], true));
      registry.register(makeMockProvider('fail2', 'signature', [], true));
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', ['test'], {});
      expect(result.status).toBe('completed');
      expect(result.threats).toEqual([]);
      expect(result.providerResults.every((r) => !r.success)).toBe(true);
    });

    it('handles no providers registered', async () => {
      const registry = new SecurityRegistry();
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', [], {});
      expect(result.status).toBe('completed');
      expect(result.threats).toEqual([]);
    });

    it('handles unsupported provider types', () => {
      const registry = new SecurityRegistry();
      const provider = makeMockProvider('custom', 'behavior');
      registry.register(provider);
      expect(registry.getProvidersByType('threat_intelligence').length).toBe(0);
    });

    it('filters threats below confidence threshold', async () => {
      const registry = new SecurityRegistry();
      const lowConfidenceThreat = makeMockThreat({ confidence: 0.1, name: 'LowConfidence' });
      const highConfidenceThreat = makeMockThreat({ confidence: 0.9, name: 'HighConfidence' });
      registry.register(makeMockProvider('p1', 'behavior', [lowConfidenceThreat, highConfidenceThreat]));
      const config = { ...DEFAULT_SECURITY_CONFIG, minConfidenceThreshold: 0.5 };
      const scanner = new SecurityScanner(registry, config);
      const result = await scanner.scan('quick', ['test'], {});
      expect(result.threats.length).toBe(1);
      expect(result.threats[0]!.name).toBe('HighConfidence');
    });
  });

  describe('Safety & Evidence', () => {
    it('every threat has evidence', async () => {
      const registry = new SecurityRegistry();
      registry.register(makeMockProvider('p1', 'behavior', [makeMockThreat(), makeMockThreat()]));
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', ['test'], {});
      for (const threat of result.threats) {
        expect(threat.evidence.length).toBeGreaterThan(0);
      }
    });

    it('every threat has a detection source', async () => {
      const registry = new SecurityRegistry();
      registry.register(makeMockProvider('p1', 'signature', [makeMockThreat()]));
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', ['test'], {});
      for (const threat of result.threats) {
        expect(threat.detectionSource).toBeTruthy();
      }
    });

    it('every threat has a recommendation', async () => {
      const registry = new SecurityRegistry();
      registry.register(makeMockProvider('p1', 'behavior', [makeMockThreat()]));
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', ['test'], {});
      for (const threat of result.threats) {
        expect(threat.recommendation).toBeTruthy();
      }
    });

    it('every threat has an explanation', async () => {
      const registry = new SecurityRegistry();
      registry.register(makeMockProvider('p1', 'behavior', [makeMockThreat()]));
      const scanner = new SecurityScanner(registry, DEFAULT_SECURITY_CONFIG);
      const result = await scanner.scan('quick', ['test'], {});
      for (const threat of result.threats) {
        expect(threat.explanation).toBeTruthy();
      }
    });

    it('no real-time protection in foundation', async () => {
      const engine = new SecurityEngine();
      const snapshot = engine.getSnapshot();
      expect(snapshot?.protectionStatus.realTimeProtection).toBeFalsy();
      engine.dispose();
    });
  });
});
