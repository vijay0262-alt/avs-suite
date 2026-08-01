/**
 * HardwareManager — top-level orchestrator for the Hardware Intelligence Center.
 *
 * Single entry point for the rest of the application. Manages the lifecycle
 * of the scanner, monitor, cache, history, and providers. Exposes a clean
 * API for scanning, polling, querying snapshots, and accessing diagnostics.
 */

import type {
  HardwareSnapshot,
  HardwareConfiguration,
  HardwareHealthStatus,
  HardwareDashboardData,
  HardwareDiagnosticsResult,
  HardwareCapabilities,
  HardwareCategory,
  HardwareProvider,
} from './types';
import { DEFAULT_HARDWARE_CONFIG } from './types';
import { HardwareScanner } from './HardwareScanner';
import { HardwareMonitor } from './HardwareMonitor';
import { HardwareCache } from './HardwareCache';
import { HardwareHistory } from './HardwareHistory';
import { HardwareHealthEvaluator } from './HardwareHealth';
import { HardwareCapabilitiesDetector } from './HardwareCapabilities';
import { HardwareDiagnosticsRunner } from './HardwareDiagnostics';
import { HardwareDashboardProvider } from './HardwareDashboardProvider';
import { hardwareRegistry } from './HardwareRegistry';
import { hardwareEventBus } from './HardwareEvents';
import { InMemoryHardwareRepository } from './HardwareRepository';
import type { HardwareRepository } from './HardwareRepository';

export class HardwareManager {
  readonly config: HardwareConfiguration;
  private readonly scanner: HardwareScanner;
  private readonly monitor: HardwareMonitor;
  private readonly cache: HardwareCache;
  private readonly history: HardwareHistory;
  private readonly healthEvaluator: HardwareHealthEvaluator;
  private readonly capabilitiesDetector: HardwareCapabilitiesDetector;
  private readonly diagnosticsRunner: HardwareDiagnosticsRunner;
  private readonly dashboardProvider: HardwareDashboardProvider;
  private readonly repository: HardwareRepository;
  private initialized = false;

  constructor(
    config?: Partial<HardwareConfiguration>,
    repository?: HardwareRepository,
  ) {
    this.config = { ...DEFAULT_HARDWARE_CONFIG, ...config };
    this.cache = new HardwareCache(this.config.cacheTtlMs);
    this.history = new HardwareHistory(this.config.maxSnapshots, this.config.historyRetentionMs);
    this.scanner = new HardwareScanner(this.config);
    this.monitor = new HardwareMonitor(this.config);
    this.healthEvaluator = new HardwareHealthEvaluator();
    this.capabilitiesDetector = new HardwareCapabilitiesDetector();
    this.diagnosticsRunner = new HardwareDiagnosticsRunner();
    this.dashboardProvider = new HardwareDashboardProvider();
    this.repository = repository ?? new InMemoryHardwareRepository();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  dispose(): void {
    this.monitor.stop();
    hardwareRegistry.clear();
    hardwareEventBus.clear();
    this.cache.invalidate();
    this.history.clear();
    this.initialized = false;
  }

  registerProvider(provider: HardwareProvider, priority?: number): void {
    hardwareRegistry.register(provider, priority);
  }

  unregisterProvider(providerId: string): void {
    hardwareRegistry.unregister(providerId);
  }

  async scan(): Promise<HardwareSnapshot> {
    const snapshot = await this.scanner.scan();
    this.cache.set(snapshot);
    this.history.add(snapshot);
    void this.repository.saveSnapshot(snapshot);
    return snapshot;
  }

  async startMonitoring(): Promise<HardwareSnapshot> {
    return this.monitor.start();
  }

  stopMonitoring(): void {
    this.monitor.stop();
  }

  getSnapshot(): HardwareSnapshot | null {
    return this.monitor.getSnapshot() ?? this.cache.get();
  }

  getHistory(limit?: number): HardwareSnapshot[] {
    if (limit !== undefined) return this.monitor.getRecentHistory(limit);
    return this.monitor.getHistory();
  }

  getHealth(): HardwareHealthStatus {
    const snapshot = this.getSnapshot();
    if (!snapshot) {
      return {
        overall: 'unknown',
        score: 0,
        components: {},
        lastUpdated: 0,
      };
    }
    return this.healthEvaluator.evaluate(snapshot.components);
  }

  getCapabilities(): HardwareCapabilities {
    const snapshot = this.getSnapshot();
    if (!snapshot) return this.capabilitiesDetector.detect([]);
    return this.capabilitiesDetector.detect(snapshot.components);
  }

  getDashboard(nextScanInMs?: number): HardwareDashboardData | null {
    const snapshot = this.getSnapshot();
    if (!snapshot) return null;
    return this.dashboardProvider.buildDashboard(snapshot, nextScanInMs);
  }

  async runDiagnostics(): Promise<HardwareDiagnosticsResult> {
    const snapshot = this.getSnapshot();
    return this.diagnosticsRunner.run(snapshot?.components);
  }

  getRegisteredCategories(): HardwareCategory[] {
    return hardwareRegistry.getRegisteredCategories();
  }

  isPolling(): boolean {
    return this.monitor.isPolling();
  }
}
