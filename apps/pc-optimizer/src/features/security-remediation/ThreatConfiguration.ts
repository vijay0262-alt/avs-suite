/**
 * ThreatConfiguration — manages remediation engine configuration.
 */
import type { RemediationConfiguration, RemediationPolicy } from './types';
import { DEFAULT_REMEDIATION_CONFIG, DEFAULT_REMEDIATION_POLICY } from './types';

export class ThreatConfigurationManager {
  private config: RemediationConfiguration;

  constructor(overrides?: Partial<RemediationConfiguration>) {
    this.config = {
      ...DEFAULT_REMEDIATION_CONFIG,
      ...overrides,
      policy: { ...DEFAULT_REMEDIATION_POLICY, ...overrides?.policy },
    };
    this.validate();
  }

  get(): RemediationConfiguration {
    return { ...this.config, policy: { ...this.config.policy } };
  }

  update(updates: Partial<RemediationConfiguration>): void {
    this.config = {
      ...this.config,
      ...updates,
      policy: updates.policy ? { ...this.config.policy, ...updates.policy } : this.config.policy,
    };
    this.validate();
  }

  updatePolicy(updates: Partial<RemediationPolicy>): void {
    this.config = { ...this.config, policy: { ...this.config.policy, ...updates } };
    this.validate();
  }

  reset(): void {
    this.config = {
      ...DEFAULT_REMEDIATION_CONFIG,
      policy: { ...DEFAULT_REMEDIATION_POLICY },
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  isQuarantineEnabled(): boolean {
    return this.config.quarantineEnabled;
  }

  isRollbackEnabled(): boolean {
    return this.config.rollbackEnabled;
  }

  isFalsePositiveTrackingEnabled(): boolean {
    return this.config.falsePositiveTracking;
  }

  isAutoReportEnabled(): boolean {
    return this.config.autoGenerateReports;
  }

  getPolicy(): RemediationPolicy {
    return { ...this.config.policy };
  }

  getQuarantinePath(): string {
    return this.config.quarantinePath;
  }

  getMaxConcurrentActions(): number {
    return this.config.maxConcurrentActions;
  }

  getObservationPeriodMs(): number {
    return this.config.observationPeriodMs;
  }

  getRollbackMaxEntries(): number {
    return this.config.rollbackMaxEntries;
  }

  private validate(): void {
    if (this.config.maxConcurrentActions < 1) {
      throw new Error('maxConcurrentActions must be at least 1');
    }
    if (this.config.rollbackMaxEntries < 1) {
      throw new Error('rollbackMaxEntries must be at least 1');
    }
    if (this.config.observationPeriodMs < 0) {
      throw new Error('observationPeriodMs must be non-negative');
    }
  }
}
