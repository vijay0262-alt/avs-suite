/**
 * HardwareFactory — creates configured instances of all hardware center
 * components. Centralizes construction so the manager and consumers
 * don't need to know about concrete class wiring.
 */

import type { HardwareConfiguration } from './types';
import { DEFAULT_HARDWARE_CONFIG } from './types';
import { HardwareScanner } from './HardwareScanner';
import { HardwareMonitor } from './HardwareMonitor';
import { HardwareCache } from './HardwareCache';
import { HardwareHistory } from './HardwareHistory';
import { HardwareHealthEvaluator } from './HardwareHealth';
import { HardwareCapabilitiesDetector } from './HardwareCapabilities';
import { HardwareDiagnosticsRunner } from './HardwareDiagnostics';
import { HardwareDashboardProvider } from './HardwareDashboardProvider';
import { InMemoryHardwareRepository } from './HardwareRepository';
import type { HardwareRepository } from './HardwareRepository';

export interface HardwareFactoryInstances {
  scanner: HardwareScanner;
  monitor: HardwareMonitor;
  cache: HardwareCache;
  history: HardwareHistory;
  healthEvaluator: HardwareHealthEvaluator;
  capabilitiesDetector: HardwareCapabilitiesDetector;
  diagnosticsRunner: HardwareDiagnosticsRunner;
  dashboardProvider: HardwareDashboardProvider;
  repository: HardwareRepository;
}

export class HardwareFactory {
  create(config?: Partial<HardwareConfiguration>): HardwareFactoryInstances {
    const merged: HardwareConfiguration = {
      ...DEFAULT_HARDWARE_CONFIG,
      ...config,
    };

    const cache = new HardwareCache(merged.cacheTtlMs);
    const history = new HardwareHistory(merged.maxSnapshots, merged.historyRetentionMs);
    const repository = new InMemoryHardwareRepository();
    const scanner = new HardwareScanner(merged);
    const monitor = new HardwareMonitor(merged);
    const healthEvaluator = new HardwareHealthEvaluator();
    const capabilitiesDetector = new HardwareCapabilitiesDetector();
    const diagnosticsRunner = new HardwareDiagnosticsRunner();
    const dashboardProvider = new HardwareDashboardProvider();

    return {
      scanner,
      monitor,
      cache,
      history,
      healthEvaluator,
      capabilitiesDetector,
      diagnosticsRunner,
      dashboardProvider,
      repository,
    };
  }
}
