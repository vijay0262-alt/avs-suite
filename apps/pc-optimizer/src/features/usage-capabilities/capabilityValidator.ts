/**
 * Capability Validator — validates capability, feature, and
 * subscription definitions and configurations.
 *
 * Detects:
 *   - Missing required fields
 *   - Duplicate IDs
 *   - Unknown plan references
 *   - Unknown capability references in features
 *   - Unknown capability references in subscriptions
 *   - Unknown feature references in subscriptions
 *   - Tier ordering inconsistencies
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  CapabilityConfig,
  CapabilityDefinition,
  FeatureDefinition,
  SubscriptionDefinition,
  SubscriptionPlan,
  ValidationResult,
  ValidationIssue,
} from './types';
import { isKnownPlan, getPlanTierIndex, PLAN_TIER_ORDER } from './types';

export class CapabilityValidator {
  /**
   * Validate a full configuration object.
   */
  validateConfig(config: CapabilityConfig): ValidationResult {
    const issues: ValidationIssue[] = [];

    // Validate capabilities
    const capabilityIds = new Set<string>();
    for (const cap of config.capabilities) {
      issues.push(...this._validateCapability(cap, capabilityIds));
      capabilityIds.add(cap.id);
    }

    // Validate features
    const featureIds = new Set<string>();
    for (const feat of config.features) {
      issues.push(...this._validateFeature(feat, featureIds, capabilityIds));
      featureIds.add(feat.id);
    }

    // Validate subscriptions
    const subscriptionPlans = new Set<SubscriptionPlan>();
    for (const sub of config.subscriptions) {
      issues.push(...this._validateSubscription(sub, subscriptionPlans, capabilityIds, featureIds));
      subscriptionPlans.add(sub.plan);
    }

    // Check for tier ordering consistency
    issues.push(...this._validateTierOrdering(config.subscriptions));

    const valid = issues.filter((i) => i.level === 'error').length === 0;

    return { valid, issues };
  }

  /**
   * Validate a single capability definition.
   */
  validateCapability(capability: CapabilityDefinition): ValidationResult {
    const issues: ValidationIssue[] = [];
    issues.push(...this._validateCapability(capability, new Set()));
    return { valid: issues.filter((i) => i.level === 'error').length === 0, issues };
  }

  /**
   * Validate a single feature definition.
   */
  validateFeature(feature: FeatureDefinition, knownCapabilities: Set<string>): ValidationResult {
    const issues: ValidationIssue[] = [];
    issues.push(...this._validateFeature(feature, new Set(), knownCapabilities));
    return { valid: issues.filter((i) => i.level === 'error').length === 0, issues };
  }

  /**
   * Validate a single subscription definition.
   */
  validateSubscription(
    subscription: SubscriptionDefinition,
    knownCapabilities: Set<string>,
    knownFeatures: Set<string>,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    issues.push(...this._validateSubscription(subscription, new Set(), knownCapabilities, knownFeatures));
    return { valid: issues.filter((i) => i.level === 'error').length === 0, issues };
  }

  // ── Private Validation Methods ─────────────────────────────

  private _validateCapability(cap: CapabilityDefinition, existingIds: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!cap.id) {
      issues.push({ level: 'error', code: 'CAP_MISSING_ID', message: 'Capability is missing id' });
    }
    if (!cap.displayName) {
      issues.push({ level: 'error', code: 'CAP_MISSING_NAME', message: `Capability "${cap.id}" is missing displayName` });
    }
    if (!cap.description) {
      issues.push({ level: 'warning', code: 'CAP_MISSING_DESC', message: `Capability "${cap.id}" is missing description` });
    }
    if (!cap.category) {
      issues.push({ level: 'warning', code: 'CAP_MISSING_CATEGORY', message: `Capability "${cap.id}" is missing category` });
    }
    if (!isKnownPlan(cap.minimumPlan)) {
      issues.push({ level: 'error', code: 'CAP_UNKNOWN_PLAN', message: `Capability "${cap.id}" has unknown minimumPlan "${cap.minimumPlan}"` });
    }
    if (cap.id && existingIds.has(cap.id)) {
      issues.push({ level: 'error', code: 'CAP_DUPLICATE_ID', message: `Duplicate capability id "${cap.id}"` });
    }

    return issues;
  }

  private _validateFeature(feat: FeatureDefinition, existingIds: Set<string>, knownCapabilities: Set<string>): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!feat.id) {
      issues.push({ level: 'error', code: 'FEAT_MISSING_ID', message: 'Feature is missing id' });
    }
    if (!feat.displayName) {
      issues.push({ level: 'error', code: 'FEAT_MISSING_NAME', message: `Feature "${feat.id}" is missing displayName` });
    }
    if (!feat.description) {
      issues.push({ level: 'warning', code: 'FEAT_MISSING_DESC', message: `Feature "${feat.id}" is missing description` });
    }
    if (!feat.category) {
      issues.push({ level: 'warning', code: 'FEAT_MISSING_CATEGORY', message: `Feature "${feat.id}" is missing category` });
    }
    if (!isKnownPlan(feat.minimumPlan)) {
      issues.push({ level: 'error', code: 'FEAT_UNKNOWN_PLAN', message: `Feature "${feat.id}" has unknown minimumPlan "${feat.minimumPlan}"` });
    }
    if (feat.id && existingIds.has(feat.id)) {
      issues.push({ level: 'error', code: 'FEAT_DUPLICATE_ID', message: `Duplicate feature id "${feat.id}"` });
    }
    if (feat.requiredCapabilities.length === 0) {
      issues.push({ level: 'warning', code: 'FEAT_NO_CAPS', message: `Feature "${feat.id}" has no required capabilities` });
    }
    for (const capId of feat.requiredCapabilities) {
      if (knownCapabilities.size > 0 && !knownCapabilities.has(capId)) {
        issues.push({ level: 'error', code: 'FEAT_UNKNOWN_CAP', message: `Feature "${feat.id}" references unknown capability "${capId}"` });
      }
    }

    return issues;
  }

  private _validateSubscription(
    sub: SubscriptionDefinition,
    existingPlans: Set<SubscriptionPlan>,
    knownCapabilities: Set<string>,
    knownFeatures: Set<string>,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!sub.plan) {
      issues.push({ level: 'error', code: 'SUB_MISSING_PLAN', message: 'Subscription is missing plan' });
    }
    if (!isKnownPlan(sub.plan)) {
      issues.push({ level: 'error', code: 'SUB_UNKNOWN_PLAN', message: `Subscription has unknown plan "${sub.plan}"` });
    }
    if (!sub.label) {
      issues.push({ level: 'error', code: 'SUB_MISSING_LABEL', message: `Subscription "${sub.plan}" is missing label` });
    }
    if (sub.plan && existingPlans.has(sub.plan)) {
      issues.push({ level: 'error', code: 'SUB_DUPLICATE_PLAN', message: `Duplicate subscription plan "${sub.plan}"` });
    }
    if (sub.tierIndex < 0 || sub.tierIndex >= PLAN_TIER_ORDER.length) {
      issues.push({ level: 'error', code: 'SUB_INVALID_TIER', message: `Subscription "${sub.plan}" has invalid tierIndex ${sub.tierIndex}` });
    }
    for (const capId of sub.capabilities) {
      if (knownCapabilities.size > 0 && !knownCapabilities.has(capId)) {
        issues.push({ level: 'error', code: 'SUB_UNKNOWN_CAP', message: `Subscription "${sub.plan}" references unknown capability "${capId}"` });
      }
    }
    for (const featId of sub.features) {
      if (knownFeatures.size > 0 && !knownFeatures.has(featId)) {
        issues.push({ level: 'error', code: 'SUB_UNKNOWN_FEAT', message: `Subscription "${sub.plan}" references unknown feature "${featId}"` });
      }
    }

    return issues;
  }

  private _validateTierOrdering(subscriptions: SubscriptionDefinition[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const sub of subscriptions) {
      const expectedTier = getPlanTierIndex(sub.plan);
      if (expectedTier !== sub.tierIndex) {
        issues.push({
          level: 'warning',
          code: 'SUB_TIER_MISMATCH',
          message: `Subscription "${sub.plan}" has tierIndex ${sub.tierIndex} but expected ${expectedTier}`,
        });
      }
    }

    return issues;
  }
}

export const capabilityValidator = new CapabilityValidator();
