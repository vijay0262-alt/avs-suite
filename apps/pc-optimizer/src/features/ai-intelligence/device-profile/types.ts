/**
 * AI Device Profile Engine — Type Definitions.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every device profile must be
 *    evidence-based, traceable back to context providers, knowledge,
 *    and predictions, with a confidence score."
 *
 * The Device Profile Engine classifies devices, detects usage patterns,
 * calculates profile confidence, and exposes a reusable profile that
 * other AI modules can consume.
 *
 * It does NOT execute optimizations.
 * It does NOT change recommendation logic.
 * It does NOT inspect private user data (file contents, documents, browser
 * history, passwords, clipboard, personal files).
 * It ONLY uses aggregated, non-sensitive telemetry and system metadata
 * already available through approved context providers.
 *
 * Pipeline:
 *   Context → Knowledge → Predictions → Usage Analysis →
 *   Device Classification → Profile Builder → Device Profile →
 *   Future Consumers (Recommendations, Insights, Automation,
 *   Conversation, Dashboard, Cloud)
 */
import type { AIContext, ContextEvidence } from '../context/types';
import type { KnowledgeObject, KnowledgeEvidence, KnowledgeFact } from '../knowledge/types';
import type { PredictionList } from '../predictions/types';

// Re-export for convenience
export type { AIContext, ContextEvidence } from '../context/types';
export type { KnowledgeObject, KnowledgeEvidence, KnowledgeFact } from '../knowledge/types';
export type { PredictionList } from '../predictions/types';

// ── Device Profile Types ─────────────────────────────────────

export type DeviceProfileType =
  | 'general_purpose'
  | 'office_workstation'
  | 'developer_workstation'
  | 'gaming_pc'
  | 'creative_workstation'
  | 'student_laptop'
  | 'business_laptop'
  | 'trading_workstation'
  | 'home_pc'
  | 'media_center'
  | 'power_user'
  | 'server'
  | 'virtual_machine'
  | 'custom';

// ── Performance Tier ─────────────────────────────────────────

export type PerformanceTier =
  | 'low_end'
  | 'mid_range'
  | 'high_end'
  | 'enterprise'
  | 'unknown';

// ── Workload Type ────────────────────────────────────────────

export type WorkloadType =
  | 'gaming'
  | 'development'
  | 'office'
  | 'media_editing'
  | 'trading'
  | 'browsing'
  | 'streaming'
  | 'general_use'
  | 'mixed_usage'
  | 'unknown';

// ── Profile Change Type ──────────────────────────────────────

export type ProfileChangeType =
  | 'new'
  | 'strengthened'
  | 'weakened'
  | 'changed'
  | 'merged'
  | 'split';

// ── Hardware Summary ─────────────────────────────────────────

export interface HardwareSummary {
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  gpuModel: string | null;
  storageType: string;
  storageCapacityMB: number;
  driveCount: number;
  performanceTier: PerformanceTier;
  displayCount: number | null;
  hasBattery: boolean | null;
  details: HardwareDetails;
  confidence: number;
}

export interface HardwareDetails {
  ramCapacity: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  cpuTier: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  gpuTier: 'none' | 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  storageTier: 'low' | 'medium' | 'high' | 'very_high' | 'unknown';
  isLaptop: boolean | null;
  isServer: boolean | null;
  isVirtualMachine: boolean | null;
}

// ── Software Summary ─────────────────────────────────────────

export interface SoftwareSummary {
  installedAppCount: number | null;
  developerToolCount: number;
  creativeSoftwareCount: number;
  gameCount: number;
  officeSuiteCount: number;
  browserCount: number;
  virtualizationCount: number;
  securitySoftwareCount: number;
  backgroundServiceCount: number;
  categories: SoftwareCategory[];
  confidence: number;
}

export interface SoftwareCategory {
  category: string;
  count: number;
  relevance: number;
}

// ── Usage Summary ────────────────────────────────────────────

export interface UsageSummary {
  optimizationFrequency: 'low' | 'medium' | 'high' | 'unknown';
  browsingActivity: 'low' | 'medium' | 'high' | 'unknown';
  startupBehavior: 'light' | 'moderate' | 'heavy' | 'unknown';
  diskGrowthRate: 'slow' | 'moderate' | 'fast' | 'unknown';
  storageConsumption: 'low' | 'medium' | 'high' | 'unknown';
  maintenanceHabits: 'proactive' | 'reactive' | 'negligent' | 'unknown';
  sessionDuration: 'short' | 'medium' | 'long' | 'unknown';
  applicationCategories: string[];
  confidence: number;
}

// ── Workload Summary ─────────────────────────────────────────

export interface WorkloadSummary {
  primaryWorkload: WorkloadType;
  secondaryWorkloads: WorkloadType[];
  workloadScores: Record<string, number>;
  confidence: number;
}

// ── Profile Score ────────────────────────────────────────────

export interface ProfileScore {
  profileType: DeviceProfileType;
  score: number;
  weight: number;
  evidence: string[];
}

// ── Profile Evidence ─────────────────────────────────────────

/**
 * Every device profile MUST include evidence.
 * No profile without evidence. The AI must never invent information.
 */
export interface ProfileEvidence {
  relatedFacts: string[];
  relatedKnowledge: string[];
  relatedPredictions: string[];
  contextEvidence: ContextEvidence[];
  knowledgeEvidence: KnowledgeEvidence[];
  evidenceCount: number;
  sourceProviders: string[];
  confidence: number;
  historicalStability: number;
  profileConsistency: number;
  dataFreshness: number;
  assumptions: string[];
}

// ── Device Profile ───────────────────────────────────────────

/**
 * A structured, evidence-based device profile.
 * Never executes. Never modifies the system. Only classifies and describes.
 */
export interface DeviceProfile {
  id: string;
  generatedAt: string;
  updatedAt: string;
  deviceName: string;
  platform: string;
  hardwareSummary: HardwareSummary;
  softwareSummary: SoftwareSummary;
  usageSummary: UsageSummary;
  workloadSummary: WorkloadSummary;
  primaryProfile: DeviceProfileType;
  secondaryProfiles: ProfileScore[];
  profileScores: ProfileScore[];
  confidenceScore: number;
  evidence: ProfileEvidence;
  changeHistory: ProfileChangeRecord[];
  futureMetadata: Record<string, unknown>;
}

// ── Profile Change Record ────────────────────────────────────

export interface ProfileChangeRecord {
  id: string;
  timestamp: string;
  changeType: ProfileChangeType;
  fromProfile: DeviceProfileType | null;
  toProfile: DeviceProfileType | null;
  fromScore: number | null;
  toScore: number | null;
  description: string;
  metadata: Record<string, unknown>;
}

// ── Profile Statistics ───────────────────────────────────────

export interface ProfileStatistics {
  totalProfiles: number;
  byType: Record<string, number>;
  byPerformanceTier: Record<string, number>;
  byWorkload: Record<string, number>;
  averageConfidence: number;
  profileChangesCount: number;
  lastUpdated: string | null;
  profileVersion: string;
}

// ── Validation ───────────────────────────────────────────────

export interface ProfileValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  profileId?: string;
}

export interface ProfileValidationResult {
  valid: boolean;
  issues: ProfileValidationIssue[];
}

// ── History ──────────────────────────────────────────────────

export interface ProfileHistoryEntry {
  id: string;
  profileId: string;
  action: 'created' | 'updated' | 'changed' | 'strengthened' | 'weakened' | 'validated';
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Configuration ────────────────────────────────────────────

export interface ClassificationRules {
  minConfidence: number;
  primaryProfileThreshold: number;
  secondaryProfileThreshold: number;
  maxSecondaryProfiles: number;
  hybridProfileEnabled: boolean;
}

export interface ScoringRules {
  hardwareWeight: number;
  softwareWeight: number;
  usageWeight: number;
  workloadWeight: number;
  historicalStabilityWeight: number;
  consistencyWeight: number;
  freshnessWeight: number;
}

export interface ConfidenceRules {
  minEvidenceCount: number;
  highConfidenceThreshold: number;
  mediumConfidenceThreshold: number;
  lowConfidenceThreshold: number;
  insufficientDataThreshold: number;
}

export interface HardwareRules {
  lowRamThresholdMB: number;
  mediumRamThresholdMB: number;
  highRamThresholdMB: number;
  lowCpuCores: number;
  mediumCpuCores: number;
  highCpuCores: number;
  lowStorageThresholdMB: number;
  mediumStorageThresholdMB: number;
  highStorageThresholdMB: number;
  laptopBatteryIndication: boolean;
}

export interface SoftwareRules {
  devToolIndicators: string[];
  creativeSoftwareIndicators: string[];
  gameIndicators: string[];
  officeSuiteIndicators: string[];
  virtualizationIndicators: string[];
  securitySoftwareIndicators: string[];
  serverIndicators: string[];
  vmIndicators: string[];
}

export interface UsageRules {
  lowOptimizationFrequency: number;
  highOptimizationFrequency: number;
  lowBrowsingCacheMB: number;
  highBrowsingCacheMB: number;
  heavyStartupThreshold: number;
  moderateStartupThreshold: number;
  fastDiskGrowthMBPerDay: number;
  moderateDiskGrowthMBPerDay: number;
}

export interface ProfileDefinition {
  type: DeviceProfileType;
  label: string;
  description: string;
  minHardwareTier: PerformanceTier;
  typicalWorkloads: WorkloadType[];
  typicalSoftwareCategories: string[];
}

export interface ProfileConfiguration {
  profileVersion: string;
  classificationRules: ClassificationRules;
  scoringRules: ScoringRules;
  confidenceRules: ConfidenceRules;
  hardwareRules: HardwareRules;
  softwareRules: SoftwareRules;
  usageRules: UsageRules;
  profileDefinitions: ProfileDefinition[];
  enableHistory: boolean;
  maxHistoryEntries: number;
  minConfidenceThreshold: number;
}

// ── Events ───────────────────────────────────────────────────

export type ProfileEventType =
  | 'profile_created'
  | 'profile_updated'
  | 'profile_changed'
  | 'profile_strengthened'
  | 'profile_weakened'
  | 'profile_validated';

export type ProfileEventListener = (payload: unknown) => void;

// ── Profile Provider Plugin (Extensibility) ──────────────────

/**
 * Future profile providers register without modifying existing code.
 * No hardcoded module logic. Only registration.
 */
export interface ProfileProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  analyzeProfile(
    context: AIContext,
    knowledge: KnowledgeObject,
    predictions: PredictionList | null,
    config: ProfileConfiguration,
  ): ProfileScore[];
}

// ── Helper Functions ─────────────────────────────────────────

export function generateProfileId(deviceName: string): string {
  const slug = deviceName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `profile_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateProfileHistoryId(): string {
  return `profhist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateProfileChangeId(): string {
  return `profchg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getProfileLabel(type: DeviceProfileType): string {
  const labels: Record<DeviceProfileType, string> = {
    general_purpose: 'General Purpose',
    office_workstation: 'Office Workstation',
    developer_workstation: 'Developer Workstation',
    gaming_pc: 'Gaming PC',
    creative_workstation: 'Creative Workstation',
    student_laptop: 'Student Laptop',
    business_laptop: 'Business Laptop',
    trading_workstation: 'Trading Workstation',
    home_pc: 'Home PC',
    media_center: 'Media Center',
    power_user: 'Power User',
    server: 'Server',
    virtual_machine: 'Virtual Machine',
    custom: 'Custom',
  };
  return labels[type] ?? 'Unknown';
}

export function getWorkloadLabel(type: WorkloadType): string {
  const labels: Record<WorkloadType, string> = {
    gaming: 'Gaming',
    development: 'Development',
    office: 'Office',
    media_editing: 'Media Editing',
    trading: 'Trading',
    browsing: 'Browsing',
    streaming: 'Streaming',
    general_use: 'General Use',
    mixed_usage: 'Mixed Usage',
    unknown: 'Unknown',
  };
  return labels[type] ?? 'Unknown';
}

export function getPerformanceTierLabel(tier: PerformanceTier): string {
  const labels: Record<PerformanceTier, string> = {
    low_end: 'Low-End',
    mid_range: 'Mid-Range',
    high_end: 'High-End',
    enterprise: 'Enterprise',
    unknown: 'Unknown',
  };
  return labels[tier] ?? 'Unknown';
}

export function createProfileEvidence(
  facts: KnowledgeFact[],
  knowledgeIds: string[],
  predictionIds: string[],
  contextEvidence: ContextEvidence[],
  knowledgeEvidence: KnowledgeEvidence[],
  sourceProviders: string[],
  confidence: number,
  historicalStability: number,
  profileConsistency: number,
  dataFreshness: number,
  assumptions: string[],
): ProfileEvidence {
  return {
    relatedFacts: facts.map((f) => f.id),
    relatedKnowledge: knowledgeIds,
    relatedPredictions: predictionIds,
    contextEvidence,
    knowledgeEvidence,
    evidenceCount: contextEvidence.length + knowledgeEvidence.length + facts.length,
    sourceProviders,
    confidence: clampScore(confidence),
    historicalStability: clampScore(historicalStability),
    profileConsistency: clampScore(profileConsistency),
    dataFreshness: Math.max(0, dataFreshness),
    assumptions,
  };
}
