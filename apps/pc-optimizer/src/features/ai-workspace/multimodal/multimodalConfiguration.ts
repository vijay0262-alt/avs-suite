/**
 * Multimodal AI Interaction Platform — Configuration
 *
 * EPIC 5 PHASE A PART 6
 *
 * Configuration-driven multimodal platform with supported modalities,
 * provider settings, validation rules, attachment policies, feature flags,
 * and performance targets. No hardcoded providers.
 */
import type {
  MultimodalConfiguration,
  MultimodalProviderSettings,
  MultimodalValidationRules,
  AttachmentPolicy,
  MultimodalFeatureFlags,
  MultimodalPerformanceTargets,
  InputModality,
} from './types';
import {
  createDefaultMultimodalConfiguration,
  createDefaultProviderSettings,
  createDefaultValidationRules,
  createDefaultAttachmentPolicy,
  createDefaultFeatureFlags,
  createDefaultPerformanceTargets,
  createDefaultSupportedModalities,
} from './types';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Record<string, unknown>
    ? DeepPartial<T[P]>
    : T[P] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[P];
};

export const DEFAULT_MULTIMODAL_CONFIGURATION: MultimodalConfiguration = createDefaultMultimodalConfiguration();

export function createMultimodalConfiguration(
  overrides?: DeepPartial<MultimodalConfiguration>,
): MultimodalConfiguration {
  if (!overrides) return structuredClone(DEFAULT_MULTIMODAL_CONFIGURATION);
  return mergeConfiguration(DEFAULT_MULTIMODAL_CONFIGURATION, overrides);
}

function mergeConfiguration(
  base: MultimodalConfiguration,
  overrides: DeepPartial<MultimodalConfiguration>,
): MultimodalConfiguration {
  return {
    configVersion: overrides.configVersion ?? base.configVersion,
    supportedModalities: (overrides.supportedModalities as InputModality[] | undefined) ?? base.supportedModalities,
    providerSettings: (overrides.providerSettings as MultimodalProviderSettings[] | undefined) ?? base.providerSettings,
    validationRules: overrides.validationRules
      ? mergeValidationRules(base.validationRules, overrides.validationRules)
      : base.validationRules,
    attachmentPolicies: overrides.attachmentPolicies
      ? mergeAttachmentPolicy(base.attachmentPolicies, overrides.attachmentPolicies)
      : base.attachmentPolicies,
    featureFlags: overrides.featureFlags
      ? { ...base.featureFlags, ...overrides.featureFlags }
      : base.featureFlags,
    performanceTargets: overrides.performanceTargets
      ? { ...base.performanceTargets, ...overrides.performanceTargets }
      : base.performanceTargets,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeValidationRules(
  base: MultimodalValidationRules,
  overrides: DeepPartial<MultimodalValidationRules>,
): MultimodalValidationRules {
  return {
    maxInputSizeBytes: overrides.maxInputSizeBytes ?? base.maxInputSizeBytes,
    maxTextLength: overrides.maxTextLength ?? base.maxTextLength,
    minConfidenceThreshold: overrides.minConfidenceThreshold ?? base.minConfidenceThreshold,
    allowedLanguages: (overrides.allowedLanguages as string[] | undefined) ?? base.allowedLanguages,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

function mergeAttachmentPolicy(
  base: AttachmentPolicy,
  overrides: DeepPartial<AttachmentPolicy>,
): AttachmentPolicy {
  return {
    maxAttachments: overrides.maxAttachments ?? base.maxAttachments,
    maxTotalSizeBytes: overrides.maxTotalSizeBytes ?? base.maxTotalSizeBytes,
    allowedMimeTypes: (overrides.allowedMimeTypes as string[] | undefined) ?? base.allowedMimeTypes,
    allowedModalities: (overrides.allowedModalities as InputModality[] | undefined) ?? base.allowedModalities,
    retentionMs: overrides.retentionMs ?? base.retentionMs,
    futureMetadata: overrides.futureMetadata ?? base.futureMetadata,
  };
}

export function validateMultimodalConfiguration(
  config: MultimodalConfiguration,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.configVersion) errors.push('configVersion is required');
  if (config.supportedModalities.length === 0) errors.push('supportedModalities must not be empty');
  if (config.validationRules.maxInputSizeBytes < 1) errors.push('maxInputSizeBytes must be >= 1');
  if (config.validationRules.maxTextLength < 1) errors.push('maxTextLength must be >= 1');
  if (config.validationRules.minConfidenceThreshold < 0 || config.validationRules.minConfidenceThreshold > 1)
    errors.push('minConfidenceThreshold must be between 0 and 1');
  if (config.attachmentPolicies.maxAttachments < 0) errors.push('maxAttachments must be >= 0');
  if (config.attachmentPolicies.maxTotalSizeBytes < 0) errors.push('maxTotalSizeBytes must be >= 0');
  if (config.performanceTargets.routingTargetMs < 0) errors.push('routingTargetMs must be >= 0');
  if (config.performanceTargets.normalizationTargetMs < 0) errors.push('normalizationTargetMs must be >= 0');

  return { valid: errors.length === 0, errors };
}
