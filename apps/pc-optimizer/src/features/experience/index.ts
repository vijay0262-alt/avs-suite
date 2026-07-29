/**
 * Experience Layer — Barrel Export.
 *
 * Integrates Usage Capability Framework (Part 1) and Quota Engine (Part 2)
 * into a centralized experience layer.
 *
 * Components:
 *   - ExperienceManager              — main orchestrator
 *   - ExperienceResolver             — resolves full experience state
 *   - TrialManager                   — trial lifecycle management
 *   - FeatureVisibilityService       — visible/limited/hidden states
 *   - FeatureAccessValidator         — canAccess, canUse, isLimited, isLocked
 *   - UpgradeRecommendationEngine    — context-based recommendations
 *   - UpgradeReasonBuilder           — structured upgrade reasons
 *   - UsageSummaryProvider           — usage summary API
 *   - ExperienceEvents               — typed event emitter (8 events)
 *
 * This module does NOT modify any existing architecture.
 */

// Types
export type {
  FeatureVisibilityState,
  TrialStatus,
  TrialInfo,
  FeatureAccessResult,
  UpgradeBenefit,
  UpgradeReason,
  FeatureUsageSummary,
  UsageSummary,
  ExperienceState,
  LocalAnalyticsEntry,
  LocalAnalyticsSummary,
  FeatureVisibilityRule,
  UpgradeRecommendationRule,
  TrialConfiguration,
  ExperienceConfig,
  ExperienceEventType,
  ExperienceEventListener,
  ExperienceValidationIssue,
  ExperienceValidationResult,
  ExperienceContext,
  SubscriptionPlan,
} from './types';

// Events
export { ExperienceEventEmitter, experienceEvents } from './experienceEvents';

// Default Config
export { DEFAULT_EXPERIENCE_CONFIG } from './defaultExperienceConfig';

// Trial Manager
export { TrialManager } from './trialManager';

// Feature Visibility Service
export { FeatureVisibilityService } from './featureVisibilityService';

// Feature Access Validator
export { FeatureAccessValidator } from './featureAccessValidator';

// Upgrade Reason Builder
export { UpgradeReasonBuilder } from './upgradeReasonBuilder';

// Upgrade Recommendation Engine
export { UpgradeRecommendationEngine } from './upgradeRecommendationEngine';

// Usage Summary Provider
export { UsageSummaryProvider } from './usageSummaryProvider';

// Experience Resolver
export { ExperienceResolver } from './experienceResolver';

// Experience Manager
export { ExperienceManager, experienceManager } from './experienceManager';
