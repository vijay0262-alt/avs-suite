/**
 * ProtectionConfiguration — manages real-time protection configuration.
 */
import type { ProtectionConfiguration, MonitorConfig, ProtectionRule } from './types';
import { DEFAULT_PROTECTION_CONFIG } from './types';

export class ProtectionConfigurationManager {
  private config: ProtectionConfiguration;

  constructor(overrides?: Partial<ProtectionConfiguration>) {
    this.config = {
      ...DEFAULT_PROTECTION_CONFIG,
      ...overrides,
      monitors: overrides?.monitors ?? DEFAULT_PROTECTION_CONFIG.monitors.map((m) => ({ ...m })),
      rules: overrides?.rules ?? [],
    };
    this.validate();
  }

  get(): ProtectionConfiguration {
    return {
      ...this.config,
      monitors: this.config.monitors.map((m) => ({ ...m })),
      rules: this.config.rules.map((r) => ({ ...r })),
    };
  }

  update(updates: Partial<ProtectionConfiguration>): void {
    this.config = { ...this.config, ...updates };
    this.validate();
  }

  setMode(mode: ProtectionConfiguration['mode']): void {
    this.config.mode = mode;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  getMonitors(): MonitorConfig[] {
    return this.config.monitors.map((m) => ({ ...m }));
  }

  updateMonitor(type: MonitorConfig['type'], updates: Partial<MonitorConfig>): void {
    const idx = this.config.monitors.findIndex((m) => m.type === type);
    if (idx >= 0) {
      this.config.monitors[idx] = { ...this.config.monitors[idx]!, ...updates };
    }
  }

  enableMonitor(type: MonitorConfig['type']): void {
    this.updateMonitor(type, { enabled: true });
  }

  disableMonitor(type: MonitorConfig['type']): void {
    this.updateMonitor(type, { enabled: false });
  }

  getRules(): ProtectionRule[] {
    return [...this.config.rules];
  }

  addRule(rule: ProtectionRule): void {
    this.config.rules.push(rule);
  }

  removeRule(ruleId: string): void {
    this.config.rules = this.config.rules.filter((r) => r.id !== ruleId);
  }

  updateRule(ruleId: string, updates: Partial<ProtectionRule>): void {
    const idx = this.config.rules.findIndex((r) => r.id === ruleId);
    if (idx >= 0) {
      this.config.rules[idx] = { ...this.config.rules[idx]!, ...updates };
    }
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getMode(): ProtectionConfiguration['mode'] {
    return this.config.mode;
  }

  getMaxQueueSize(): number {
    return this.config.maxQueueSize;
  }

  getMaxConcurrentActions(): number {
    return this.config.maxConcurrentActions;
  }

  getCpuTarget(): number {
    return this.config.cpuTargetPercent;
  }

  getMemoryTarget(): number {
    return this.config.memoryTargetMB;
  }

  isTelemetryEnabled(): boolean {
    return this.config.telemetryEnabled;
  }

  getTelemetryIntervalMs(): number {
    return this.config.telemetryIntervalMs;
  }

  getMaxTelemetrySamples(): number {
    return this.config.maxTelemetrySamples;
  }

  getMaxHistoryEntries(): number {
    return this.config.maxHistoryEntries;
  }

  isRestartOnFailure(): boolean {
    return this.config.restartOnFailure;
  }

  getMaxRestartAttempts(): number {
    return this.config.maxRestartAttempts;
  }

  getRestartDelayMs(): number {
    return this.config.restartDelayMs;
  }

  reset(): void {
    this.config = {
      ...DEFAULT_PROTECTION_CONFIG,
      monitors: DEFAULT_PROTECTION_CONFIG.monitors.map((m) => ({ ...m })),
      rules: [],
    };
  }

  private validate(): void {
    if (this.config.maxQueueSize < 10) {
      throw new Error('maxQueueSize must be at least 10');
    }
    if (this.config.maxConcurrentActions < 1) {
      throw new Error('maxConcurrentActions must be at least 1');
    }
    if (this.config.cpuTargetPercent < 0.1) {
      throw new Error('cpuTargetPercent must be at least 0.1');
    }
    if (this.config.memoryTargetMB < 10) {
      throw new Error('memoryTargetMB must be at least 10');
    }
  }
}
