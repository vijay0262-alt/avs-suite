/**
 * Experience Layer — Type Definitions.
 *
 * Integrates Usage Capability Framework (Part 1) and Quota Engine (Part 2)
 * into a centralized experience layer. This module does NOT modify any
 * existing architecture — it only builds integration infrastructure.
 */
import type { SubscriptionPlan } from '../usage-capabilities/types';
export type { SubscriptionPlan };
import type { QuotaState, UsageRecord } from '../usage-quota/types';

// ── Feature Visibility ───────────────────────────────────────

export type FeatureVisibilityState = 'visible' | 'limited' | 'hidden';

// ── Trial State ──────────────────────────────────────────────

export type TrialStatus =
  | 'active'
  | 'expired'
  | 'available'
  | 'used'
  | 'disabled';

export interface TrialInfo {
  status: TrialStatus;
  startedAt: string | null;
  expiresAt: string | null;
  durationDays: number;
  daysRemaining: number;
  isEligible: boolean;
}

// ── Feature Access Result ────────────────────────────────────

export interface FeatureAccessResult {
  featureId: string;
  canAccess: boolean;
  canUse: boolean;
  visibility: FeatureVisibilityState;
  isLimited: boolean;
  isLocked: boolean;
  reason: string | null;
  remainingQuota: number | null;
  quotaUnit: string | null;
  nextResetAt: string | null;
  upgradeAvailable: boolean;
  recommendedPlan: SubscriptionPlan | null;
  upgradeBenefit: string | null;
  displayMessage: string | null;
  badgeText: string | null;
}

// ── Upgrade Reason ───────────────────────────────────────────

export interface UpgradeBenefit {
  what: string;
  detail: string;
}

export interface UpgradeReason {
  featureId: string;
  currentPlan: SubscriptionPlan;
  recommendedPlan: SubscriptionPlan;
  reason: string;
  benefits: UpgradeBenefit[];
  urgency: 'low' | 'medium' | 'high';
  contextHint: string;
}

// ── Usage Summary ────────────────────────────────────────────

export interface FeatureUsageSummary {
  featureId: string;
  displayName: string;
  remaining: number | null;
  limit: number | null;
  unit: string | null;
  isUnlimited: boolean;
  nextResetAt: string | null;
}

export interface UsageSummary {
  currentPlan: SubscriptionPlan;
  planLabel: string;
  trialStatus: TrialStatus;
  trialDaysRemaining: number;
  features: FeatureUsageSummary[];
  unlockedFeatures: string[];
  limitedFeatures: string[];
  lockedFeatures: string[];
  recommendedUpgrade: UpgradeReason | null;
  nextResetAt: string | null;
}

// ── Experience State ─────────────────────────────────────────

export interface ExperienceState {
  plan: SubscriptionPlan;
  planLabel: string;
  trial: TrialInfo;
  features: FeatureAccessResult[];
  unlockedFeatures: string[];
  limitedFeatures: string[];
  lockedFeatures: string[];
  hiddenFeatures: string[];
  recommendedUpgrade: UpgradeReason | null;
  generatedAt: string;
}

// ── Local Analytics ──────────────────────────────────────────

export interface LocalAnalyticsEntry {
  featureId: string;
  action: string;
  timestamp: string;
  context: string;
}

export interface LocalAnalyticsSummary {
  mostUsedFeatures: { featureId: string; count: number }[];
  mostReachedQuotas: { quotaId: string; count: number }[];
  frequentlyRequestedLocked: { featureId: string; count: number }[];
  recommendationFrequency: { featureId: string; count: number }[];
  totalFeatureAccesses: number;
  totalDenials: number;
}

// ── Configuration ────────────────────────────────────────────

export interface FeatureVisibilityRule {
  featureId: string;
  defaultVisibility: FeatureVisibilityState;
  planVisibility: Partial<Record<SubscriptionPlan, FeatureVisibilityState>>;
  badgeText: Partial<Record<SubscriptionPlan, string>>;
  displayMessage: Partial<Record<SubscriptionPlan, string>>;
}

export interface UpgradeRecommendationRule {
  featureId: string;
  triggerQuotaId: string;
  triggerThreshold: number;
  recommendedPlan: SubscriptionPlan;
  reason: string;
  benefits: UpgradeBenefit[];
  urgency: 'low' | 'medium' | 'high';
  contextHint: string;
}

export interface TrialConfiguration {
  defaultDurationDays: number;
  trialPlan: SubscriptionPlan;
  maxTrials: number;
  enabled: boolean;
  featureTrials: { featureId: string; durationDays: number }[];
}

export interface ExperienceConfig {
  visibilityRules: FeatureVisibilityRule[];
  recommendationRules: UpgradeRecommendationRule[];
  trialConfig: TrialConfiguration;
  planLabels: Partial<Record<SubscriptionPlan, string>>;
  messages: {
    quotaExceeded: string;
    featureLocked: string;
    trialAvailable: string;
    trialExpired: string;
    upgradeAvailable: string;
  };
}

// ── Events ───────────────────────────────────────────────────

export type ExperienceEventType =
  | 'experience_loaded'
  | 'experience_updated'
  | 'quota_limit_reached'
  | 'trial_started'
  | 'trial_expired'
  | 'upgrade_recommended'
  | 'feature_accessed'
  | 'feature_denied';

export type ExperienceEventListener = (payload: unknown) => void;

// ── Validation ───────────────────────────────────────────────

export interface ExperienceValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  context?: string;
}

export interface ExperienceValidationResult {
  valid: boolean;
  issues: ExperienceValidationIssue[];
}

// ── Experience Context ───────────────────────────────────────

export interface ExperienceContext {
  plan: SubscriptionPlan;
  trial: TrialInfo;
  capabilities: string[];
  quotaStates: Map<string, QuotaState>;
  recentRecords: UsageRecord[];
}
