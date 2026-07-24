/**
 * @avs/licensing — licensing foundation for AVS PC Optimizer.
 *
 * This package provides:
 *   - License model and states
 *   - License events (typed pub/sub)
 *   - Feature Manager (FeatureManager.has(feature))
 *   - License Manager (centralized orchestrator)
 *   - License Storage (encrypted, tamper-resistant, versioned)
 *   - Activation Service (interfaces only — no implementation)
 *   - Device ID (anonymous fingerprint)
 *   - Offline Mode (cached license, grace period, local validation)
 *
 * No mock/fake implementations are provided for the activation
 * service. Clean interfaces are defined here. The concrete
 * implementation will be provided when the real license server
 * is built. The NullLicenseManager is a legitimate null-object
 * pattern for when no licensing infrastructure is configured —
 * it always returns 'free' state and is NOT a mock.
 */

// Re-export existing types for backward compatibility
export type { LicenseInfo, ILicensingService } from './legacy';
export { NullLicensingService } from './legacy';

// License states
export type { LicenseState } from './states';
export {
  ALL_LICENSE_STATES,
  LICENSE_STATE_LABELS,
  isActiveState,
  isGraceState,
  isFunctionalState,
  isErrorState,
  stateToEdition,
} from './states';

// License model
export type {
  LicenseModel,
  LicenseView,
  ValidationResult,
  ActivationResult,
  DeactivationResult,
} from './model';
export { CURRENT_FORMAT_VERSION, toLicenseView } from './model';

// License events
export type { LicenseEventType, LicenseEvent, LicenseEventListener } from './events';
export { createLicenseEvent, LicenseEventEmitter } from './events';

// Feature Manager
export type { ManagedFeature, IFeatureManager, FeatureManagerConfig } from './featureManager';
export { createFeatureManager, isFeatureAvailableForState, FEATURE_MAP } from './featureManager';

// License Manager
export type { LicenseManagerConfig, ILicenseManager } from './manager';
export { LicenseManager } from './manager';

// License Storage
export type { StorageEnvelope, ILicenseStorage, StorageErrorType } from './storage';
export {
  LicenseStorageError,
  serializeLicense,
  deserializeLicense,
  computeChecksum,
} from './storage';

// Activation Service (interfaces only)
export type { IActivationService, ActivationConfig } from './activation';
export { DEFAULT_ACTIVATION_CONFIG, ACTIVATION_ERROR_REASONS } from './activation';

// Device ID
export type { IDeviceIdProvider } from './deviceId';
export { deriveDeviceId, isValidDeviceId } from './deviceId';

// Offline Mode
export type { OfflineConfig } from './offline';
export {
  DEFAULT_OFFLINE_CONFIG,
  validateOffline,
  calculateGraceExpiry,
  shouldEnterGrace,
  hasGraceEnded,
  canStartOffline,
  getOfflineState,
} from './offline';

// Trial Architecture
export type { TrialInfo } from './trial';
export {
  DEFAULT_TRIAL_DURATION_DAYS,
  getTrialInfo,
  isActiveTrial,
  isExpiredTrial,
} from './trial';
