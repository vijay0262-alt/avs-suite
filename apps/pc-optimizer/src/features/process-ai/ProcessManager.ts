/**
 * ProcessManager — orchestrates process scanning, polling, and history.
 *
 * Manages the ProcessScanner and ProcessRepository lifecycle.
 * Provides polling with configurable interval and event emission.
 */
import type { ProcessSnapshot, ProcessConfiguration } from './types';
import { DEFAULT_PROCESS_CONFIG } from './types';
import { ProcessScanner } from './ProcessScanner';
import type { ProcessProvider } from './ProcessScanner';
import { ProcessRepository } from './ProcessRepository';
import { processEventBus } from './ProcessEvents';

export class ProcessManager {
  private config: ProcessConfiguration;
  private scanner: ProcessScanner;
  repository: ProcessRepository;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;

  constructor(config: ProcessConfiguration = DEFAULT_PROCESS_CONFIG) {
    this.config = config;
    this.scanner = new ProcessScanner();
    this.repository = new ProcessRepository(config.maxSnapshots);
  }

  registerProvider(provider: ProcessProvider): void {
    this.scanner.registerProvider(provider);
  }

  async initialize(): Promise<void> {
    await this.scanner.initialize();
  }

  async scan(): Promise<ProcessSnapshot> {
    processEventBus.emitScanStarted();
    const snapshot = await this.scanner.scan();
    this.repository.store(snapshot);
    processEventBus.emitScanCompleted(snapshot.id, snapshot.scanDurationMs, snapshot.processCount);
    return snapshot;
  }

  startPolling(intervalMs?: number): void {
    if (this.isPolling) return;
    this.isPolling = true;
    const interval = intervalMs ?? this.config.pollIntervalMs;
    this.pollTimer = setInterval(() => {
      this.scan().catch(() => {
        // polling errors are non-fatal
      });
    }, interval);
  }

  stopPolling(): void {
    this.isPolling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getIsPolling(): boolean {
    return this.isPolling;
  }

  getConfiguration(): ProcessConfiguration {
    return this.config;
  }

  updateConfiguration(updates: Partial<ProcessConfiguration>): void {
    this.config = { ...this.config, ...updates };
  }

  dispose(): void {
    this.stopPolling();
    this.scanner.dispose();
    this.repository.clear();
  }
}
