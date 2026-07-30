/**
 * Optimization Recovery & Rollback Center — Configuration
 *
 * Provides default configuration and factory function with deep merge.
 * No hardcoded recovery logic — all behavior is config-driven.
 */
import type { RecoveryConfiguration } from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

export const DEFAULT_RECOVERY_CONFIGURATION: RecoveryConfiguration = {
  configVersion: '1.0.0',
  retentionRules: {
    maxSnapshotAgeDays: 30,
    maxSnapshotCount: 50,
    autoArchive: true,
    autoDelete: false,
    priorityThreshold: 'medium',
  },
  recoveryPolicyRules: {
    requireValidation: true,
    requireConfirmation: true,
    allowPartialRecovery: true,
    maxRollbackDepth: 5,
    blockOnIntegrityFailure: true,
    blockOnDependencyFailure: true,
  },
  validationRules: {
    checkSnapshotIntegrity: true,
    checkDependencies: true,
    checkPermissions: true,
    checkCapabilities: true,
    checkSubscription: true,
    checkQuota: true,
    checkRecoverySafety: true,
    checkRecoveryReadiness: true,
  },
  comparisonRules: {
    compareHealth: true,
    comparePerformance: true,
    compareStorage: true,
    compareConfiguration: true,
    maxDifferences: 100,
  },
  featureFlags: {
    enableRecovery: true,
    enableComparison: true,
    enableValidation: true,
    enableHistory: true,
    enableAnalytics: true,
    enableExport: true,
    enableExplainability: true,
    enableSnapshotCatalog: true,
    enableEligibility: true,
    enableCaching: true,
    futureFlags: {},
  },
  enableEvents: true,
  maxHistoryEntries: 200,
  recoveryExpiryMs: 3600000,
  maxRecoveriesPerSession: 10,
  performanceTargetMs: 200,
  futureMetadata: {},
};

export function createRecoveryConfiguration(
  overrides?: DeepPartial<RecoveryConfiguration>,
): RecoveryConfiguration {
  if (!overrides) return structuredClone(DEFAULT_RECOVERY_CONFIGURATION);

  const base = structuredClone(DEFAULT_RECOVERY_CONFIGURATION);

  if (overrides.configVersion !== undefined) base.configVersion = overrides.configVersion;
  if (overrides.enableEvents !== undefined) base.enableEvents = overrides.enableEvents;
  if (overrides.maxHistoryEntries !== undefined) base.maxHistoryEntries = overrides.maxHistoryEntries;
  if (overrides.recoveryExpiryMs !== undefined) base.recoveryExpiryMs = overrides.recoveryExpiryMs;
  if (overrides.maxRecoveriesPerSession !== undefined) base.maxRecoveriesPerSession = overrides.maxRecoveriesPerSession;
  if (overrides.performanceTargetMs !== undefined) base.performanceTargetMs = overrides.performanceTargetMs;
  if (overrides.futureMetadata !== undefined) base.futureMetadata = overrides.futureMetadata;

  if (overrides.retentionRules) {
    Object.assign(base.retentionRules, overrides.retentionRules);
  }
  if (overrides.recoveryPolicyRules) {
    Object.assign(base.recoveryPolicyRules, overrides.recoveryPolicyRules);
  }
  if (overrides.validationRules) {
    Object.assign(base.validationRules, overrides.validationRules);
  }
  if (overrides.comparisonRules) {
    Object.assign(base.comparisonRules, overrides.comparisonRules);
  }
  if (overrides.featureFlags) {
    Object.assign(base.featureFlags, overrides.featureFlags);
    if (overrides.featureFlags.futureFlags) {
      Object.assign(base.featureFlags.futureFlags, overrides.featureFlags.futureFlags);
    }
  }

  return base;
}
