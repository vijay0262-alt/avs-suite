/**
 * SecurityEngine — core security engine that coordinates all providers.
 *
 * The SecurityEngine is the central coordinator. It:
 *   - Manages the provider registry
 *   - Runs scans via SecurityScanner
 *   - Builds SecuritySnapshot after each scan
 *   - Stores results in SecurityRepository
 *   - Records history
 *   - Emits events
 *
 * Providers never communicate with each other directly.
 * The UI never scans directly — it consumes only SecuritySnapshot.
 */
import type {
  ScanResult,
  ScanType,
  SecuritySnapshot,
  SecurityConfiguration,
  Threat,
  SecurityCapabilityInfo,
} from './types';
import { SecurityRegistry } from './SecurityRegistry';
import { SecurityScanner } from './SecurityScanner';
import { SecuritySnapshotBuilder } from './SecuritySnapshot';
import { SecurityRepository } from './SecurityRepository';
import { SecurityHistory } from './SecurityHistory';
import { SecurityCache } from './SecurityCache';
import { SecurityFactory } from './SecurityFactory';
import { SecurityConfigurationManager } from './SecurityConfiguration';
import { securityEventBus } from './SecurityEvents';

export class SecurityEngine {
  private configManager: SecurityConfigurationManager;
  private registry: SecurityRegistry;
  private scanner: SecurityScanner;
  private snapshotBuilder: SecuritySnapshotBuilder;
  private repository: SecurityRepository;
  private history: SecurityHistory;
  private cache: SecurityCache;
  private lastSnapshot: SecuritySnapshot | null = null;
  private definitionsVersion = '1.0.0';
  private lastUpdate: number | null = null;

  constructor(config?: Partial<SecurityConfiguration>) {
    this.configManager = new SecurityConfigurationManager(config);
    const configObj = this.configManager.get();
    this.registry = new SecurityRegistry();
    this.snapshotBuilder = new SecuritySnapshotBuilder();
    this.repository = new SecurityRepository();
    this.history = new SecurityHistory(configObj.maxHistoryEntries);
    this.cache = new SecurityCache(configObj.cacheTtlMs);
    this.scanner = new SecurityScanner(this.registry, configObj);

    // Register default providers
    SecurityFactory.createAndRegisterAll(this.registry, configObj);
  }

  async scan(
    scanType?: ScanType,
    targets: string[] = [],
    options: Record<string, unknown> = {},
  ): Promise<ScanResult> {
    const type = scanType ?? this.configManager.get().defaultScanType;
    const result = await this.scanner.scan(type, targets, options);

    // Build snapshot from scan result
    const snapshot = this.buildSnapshot(result.threats);
    result.snapshot = snapshot;

    // Persist
    this.repository.saveScanResult(result);
    this.repository.saveSnapshot(snapshot);
    this.repository.saveThreats(result.threats);
    this.history.recordScan(result);
    this.lastSnapshot = snapshot;

    securityEventBus.emitSnapshotUpdated(snapshot.id);

    return result;
  }

  getSnapshot(): SecuritySnapshot | null {
    return this.lastSnapshot ?? this.repository.getLatestSnapshot();
  }

  getLatestSnapshot(): SecuritySnapshot | null {
    return this.repository.getLatestSnapshot();
  }

  getRegistry(): SecurityRegistry {
    return this.registry;
  }

  getRepository(): SecurityRepository {
    return this.repository;
  }

  getHistory(): SecurityHistory {
    return this.history;
  }

  getCache(): SecurityCache {
    return this.cache;
  }

  getConfiguration(): SecurityConfiguration {
    return this.configManager.get();
  }

  updateConfiguration(updates: Partial<SecurityConfiguration>): void {
    this.configManager.update(updates);
    this.scanner = new SecurityScanner(this.registry, this.configManager.get());
  }

  getDefinitionsVersion(): string {
    return this.definitionsVersion;
  }

  updateDefinitions(version: string): void {
    this.definitionsVersion = version;
    this.lastUpdate = Date.now();
    securityEventBus.emitDefinitionsUpdated(version);
  }

  getCapabilities(): SecurityCapabilityInfo[] {
    const config = this.configManager.get();
    return [
      { name: 'behavior_analysis', available: config.enableBehaviorAnalysis, enabled: config.enableBehaviorAnalysis, description: 'Process behavior analysis' },
      { name: 'signature_detection', available: config.enableSignatureDetection, enabled: config.enableSignatureDetection, description: 'Signature-based detection' },
      { name: 'persistence_detection', available: config.enablePersistenceDetection, enabled: config.enablePersistenceDetection, description: 'Persistence mechanism detection' },
      { name: 'browser_protection', available: config.enableBrowserProtection, enabled: config.enableBrowserProtection, description: 'Browser security analysis' },
      { name: 'reputation_analysis', available: config.enableReputationAnalysis, enabled: config.enableReputationAnalysis, description: 'Reputation analysis' },
      { name: 'threat_intelligence', available: config.enableThreatIntelligence, enabled: config.enableThreatIntelligence, description: 'Threat intelligence correlation' },
    ];
  }

  private buildSnapshot(threats: Threat[]): SecuritySnapshot {
    const providerInfos = this.registry.getAllProviderInfo();
    const capabilities = this.getCapabilities();
    const historySummary = this.history.getHistorySummary();

    return this.snapshotBuilder.build(
      threats,
      providerInfos,
      capabilities,
      historySummary,
      this.definitionsVersion,
      this.lastSnapshot?.lastScan ?? null,
      this.lastUpdate,
    );
  }

  dispose(): void {
    this.repository.clear();
    this.history.clear();
    this.cache.clear();
    this.registry.clear();
    this.lastSnapshot = null;
    securityEventBus.clear();
  }
}
