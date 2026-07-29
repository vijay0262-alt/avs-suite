/**
 * AI Device Profile Engine — Barrel Export.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every device profile must be
 *    evidence-based, traceable back to context providers, knowledge,
 *    and predictions, with a confidence score."
 *
 * Components:
 *   - DeviceProfileManager   — main public API facade
 *   - DeviceProfileEngine    — core profile generation
 *   - ProfileBuilder         — pipeline orchestrator
 *   - ProfileRegistry        — plugin registration
 *   - DeviceClassifier       — classify device into profiles
 *   - HardwareAnalyzer       — analyze hardware characteristics
 *   - SoftwareAnalyzer       — analyze software characteristics
 *   - UsageAnalyzer          — analyze usage patterns
 *   - WorkloadAnalyzer       — estimate workload characteristics
 *   - ProfileScorer          — calculate confidence and stability
 *   - ProfileValidator       — validate profile integrity
 *   - ProfileHistory         — track profile evolution
 *   - ProfileEvents          — typed event emitter (6 events)
 *   - ProfileConfiguration   — default config and factory
 */

// Types
export type {
  DeviceProfileType,
  PerformanceTier,
  WorkloadType,
  ProfileChangeType,
  HardwareSummary,
  HardwareDetails,
  SoftwareSummary,
  SoftwareCategory,
  UsageSummary,
  WorkloadSummary,
  ProfileScore,
  ProfileEvidence,
  DeviceProfile,
  ProfileChangeRecord,
  ProfileStatistics,
  ProfileValidationIssue,
  ProfileValidationResult,
  ProfileHistoryEntry,
  ClassificationRules,
  ScoringRules,
  ConfidenceRules,
  HardwareRules,
  SoftwareRules,
  UsageRules,
  ProfileDefinition,
  ProfileConfiguration,
  ProfileEventType,
  ProfileEventListener,
  ProfileProviderPlugin,
  AIContext,
  ContextEvidence,
  KnowledgeObject,
  KnowledgeEvidence,
  KnowledgeFact,
  PredictionList,
} from './types';

export {
  generateProfileId,
  generateProfileHistoryId,
  generateProfileChangeId,
  clampScore,
  getProfileLabel,
  getWorkloadLabel,
  getPerformanceTierLabel,
  createProfileEvidence,
} from './types';

export { ProfileEventEmitter, profileEvents } from './profileEvents';
export { DEFAULT_PROFILE_CONFIG, DEFAULT_PROFILE_DEFINITIONS, createProfileConfig } from './profileConfiguration';
export { ProfileRegistry } from './profileRegistry';
export { HardwareAnalyzer } from './hardwareAnalyzer';
export { SoftwareAnalyzer } from './softwareAnalyzer';
export { UsageAnalyzer } from './usageAnalyzer';
export { WorkloadAnalyzer } from './workloadAnalyzer';
export { DeviceClassifier } from './deviceClassifier';
export { ProfileScorer } from './profileScorer';
export { ProfileValidator } from './profileValidator';
export { ProfileHistory } from './profileHistory';
export { ProfileBuilder } from './profileBuilder';
export { DeviceProfileEngine } from './deviceProfileEngine';
export { DeviceProfileManager } from './deviceProfileManager';
