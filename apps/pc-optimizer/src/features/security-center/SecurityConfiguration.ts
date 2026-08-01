/**
 * SecurityConfiguration — manages security center configuration.
 */
import type { SecurityConfiguration, ThreatSeverity } from './types';
import { DEFAULT_SECURITY_CONFIG } from './types';

export class SecurityConfigurationManager {
  private config: SecurityConfiguration;

  constructor(overrides?: Partial<SecurityConfiguration>) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...overrides };
    this.validate();
  }

  get(): SecurityConfiguration {
    return { ...this.config };
  }

  update(updates: Partial<SecurityConfiguration>): void {
    this.config = { ...this.config, ...updates };
    this.validate();
  }

  isProviderTypeEnabled(type: string): boolean {
    switch (type) {
      case 'behavior': return this.config.enableBehaviorAnalysis;
      case 'signature': return this.config.enableSignatureDetection;
      case 'persistence': return this.config.enablePersistenceDetection;
      case 'browser_protection': return this.config.enableBrowserProtection;
      case 'reputation': return this.config.enableReputationAnalysis;
      case 'threat_intelligence': return this.config.enableThreatIntelligence;
      default: return false;
    }
  }

  shouldNotify(severity: ThreatSeverity): boolean {
    if (!this.config.enableNotifications) return false;
    const order: ThreatSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    const minIndex = order.indexOf(this.config.notificationMinSeverity);
    const severityIndex = order.indexOf(severity);
    return severityIndex >= minIndex;
  }

  private validate(): void {
    if (this.config.maxConcurrentProviders < 1) this.config.maxConcurrentProviders = 1;
    if (this.config.scanTimeoutMs < 1000) this.config.scanTimeoutMs = 1000;
    if (this.config.minConfidenceThreshold < 0) this.config.minConfidenceThreshold = 0;
    if (this.config.minConfidenceThreshold > 1) this.config.minConfidenceThreshold = 1;
    if (this.config.cacheTtlMs < 0) this.config.cacheTtlMs = 0;
    if (this.config.maxHistoryEntries < 1) this.config.maxHistoryEntries = 1;
  }
}
