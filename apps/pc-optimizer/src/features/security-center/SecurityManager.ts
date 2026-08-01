/**
 * SecurityManager — top-level facade for the AI Security Center.
 *
 * This is the public API that the UI and other modules interact with.
 * It wraps SecurityEngine and provides a simplified interface.
 *
 * The UI never scans directly — it consumes only SecuritySnapshot
 * obtained via SecurityManager.
 */
import type {
  ScanResult,
  ScanType,
  SecuritySnapshot,
  SecurityConfiguration,
  SecurityDashboardData,
  SecurityHealthReport,
  SecurityDiagnosticsReport,
  SecurityCapabilitiesReport,
} from './types';
import { SecurityEngine } from './SecurityEngine';
import { SecurityDashboardProvider } from './SecurityDashboardProvider';
import { SecurityHealth } from './SecurityHealth';
import { SecurityCapabilities } from './SecurityCapabilities';
import { SecurityDiagnostics } from './SecurityDiagnostics';

export class SecurityManager {
  private engine: SecurityEngine;
  private dashboardProvider: SecurityDashboardProvider;
  private healthChecker: SecurityHealth;
  private capabilitiesChecker: SecurityCapabilities;
  private diagnostics: SecurityDiagnostics;

  constructor(config?: Partial<SecurityConfiguration>) {
    this.engine = new SecurityEngine(config);
    this.dashboardProvider = new SecurityDashboardProvider();
    this.healthChecker = new SecurityHealth();
    this.capabilitiesChecker = new SecurityCapabilities();
    this.diagnostics = new SecurityDiagnostics();
  }

  async scan(
    scanType?: ScanType,
    targets?: string[],
    options?: Record<string, unknown>,
  ): Promise<ScanResult> {
    return this.engine.scan(scanType, targets, options);
  }

  getSnapshot(): SecuritySnapshot | null {
    return this.engine.getSnapshot();
  }

  getDashboard(): SecurityDashboardData {
    const snapshot = this.engine.getSnapshot();
    const history = this.engine.getHistory();
    const providers = this.engine.getRegistry().getAllProviderInfo();
    const capabilities = this.engine.getCapabilities();
    return this.dashboardProvider.build(snapshot, history, providers, capabilities);
  }

  getHealth(): SecurityHealthReport {
    const snapshot = this.engine.getSnapshot();
    return this.healthChecker.check(snapshot);
  }

  getCapabilities(): SecurityCapabilitiesReport {
    const capabilities = this.engine.getCapabilities();
    return this.capabilitiesChecker.report(capabilities);
  }

  runDiagnostics(): SecurityDiagnosticsReport {
    return this.diagnostics.run(this.engine);
  }

  getConfiguration(): SecurityConfiguration {
    return this.engine.getConfiguration();
  }

  updateConfiguration(updates: Partial<SecurityConfiguration>): void {
    this.engine.updateConfiguration(updates);
  }

  getEngine(): SecurityEngine {
    return this.engine;
  }

  updateDefinitions(version: string): void {
    this.engine.updateDefinitions(version);
  }

  dispose(): void {
    this.engine.dispose();
  }
}
