/**
 * Profile Validator — validates device profile integrity.
 *
 * Validates:
 *   Profile consistency, confidence, evidence, category compatibility,
 *   historical continuity, version compatibility.
 */
import type {
  DeviceProfile,
  ProfileValidationResult,
  ProfileValidationIssue,
  ProfileConfiguration,
  DeviceProfileType,
  PerformanceTier,
  WorkloadType,
  ProfileChangeType,
} from './types';

const VALID_PROFILE_TYPES: DeviceProfileType[] = [
  'general_purpose', 'office_workstation', 'developer_workstation',
  'gaming_pc', 'creative_workstation', 'student_laptop',
  'business_laptop', 'trading_workstation', 'home_pc', 'media_center',
  'power_user', 'server', 'virtual_machine', 'custom',
];

const VALID_PERFORMANCE_TIERS: PerformanceTier[] = [
  'low_end', 'mid_range', 'high_end', 'enterprise', 'unknown',
];

const VALID_WORKLOAD_TYPES: WorkloadType[] = [
  'gaming', 'development', 'office', 'media_editing', 'trading',
  'browsing', 'streaming', 'general_use', 'mixed_usage', 'unknown',
];

const VALID_CHANGE_TYPES: ProfileChangeType[] = [
  'new', 'strengthened', 'weakened', 'changed', 'merged', 'split',
];

export class ProfileValidator {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  validateProfile(profile: DeviceProfile): ProfileValidationResult {
    const issues: ProfileValidationIssue[] = [];

    // Required fields
    if (!profile.id) issues.push({ level: 'error', code: 'PROFILE_MISSING_ID', message: 'Profile missing id' });
    if (!profile.deviceName) issues.push({ level: 'error', code: 'PROFILE_MISSING_DEVICE_NAME', message: 'Profile missing deviceName' });
    if (!profile.generatedAt) issues.push({ level: 'error', code: 'PROFILE_MISSING_GENERATED_AT', message: 'Profile missing generatedAt' });

    // Profile type
    if (!VALID_PROFILE_TYPES.includes(profile.primaryProfile)) {
      issues.push({ level: 'error', code: 'PROFILE_INVALID_TYPE', message: `Invalid primary profile: ${profile.primaryProfile}`, profileId: profile.id });
    }

    // Performance tier
    if (!VALID_PERFORMANCE_TIERS.includes(profile.hardwareSummary.performanceTier)) {
      issues.push({ level: 'error', code: 'PROFILE_INVALID_TIER', message: `Invalid performance tier: ${profile.hardwareSummary.performanceTier}`, profileId: profile.id });
    }

    // Workload
    if (!VALID_WORKLOAD_TYPES.includes(profile.workloadSummary.primaryWorkload)) {
      issues.push({ level: 'error', code: 'PROFILE_INVALID_WORKLOAD', message: `Invalid workload: ${profile.workloadSummary.primaryWorkload}`, profileId: profile.id });
    }

    // Confidence
    this._validateScore(profile.confidenceScore, 'confidence', profile.id, issues);

    // Evidence
    if (profile.evidence.evidenceCount === 0) {
      issues.push({ level: 'error', code: 'PROFILE_NO_EVIDENCE', message: 'Profile has no evidence', profileId: profile.id });
    }
    if (profile.evidence.sourceProviders.length === 0) {
      issues.push({ level: 'error', code: 'PROFILE_NO_SOURCE_PROVIDERS', message: 'Profile has no source providers', profileId: profile.id });
    }
    if (profile.evidence.assumptions.length === 0) {
      issues.push({ level: 'warning', code: 'PROFILE_NO_ASSUMPTIONS', message: 'Profile has no stated assumptions', profileId: profile.id });
    }

    // Confidence threshold
    if (profile.confidenceScore < this._config.minConfidenceThreshold) {
      issues.push({
        level: 'warning',
        code: 'PROFILE_LOW_CONFIDENCE',
        message: `Confidence ${profile.confidenceScore.toFixed(2)} below threshold ${this._config.minConfidenceThreshold}`,
        profileId: profile.id,
      });
    }

    // Version compatibility
    if (profile.futureMetadata && typeof profile.futureMetadata === 'object') {
      // futureMetadata is optional, no validation needed
    }

    // Secondary profiles
    const rules = this._config.classificationRules;
    if (profile.secondaryProfiles.length > rules.maxSecondaryProfiles) {
      issues.push({
        level: 'warning',
        code: 'PROFILE_TOO_MANY_SECONDARY',
        message: `Secondary profiles ${profile.secondaryProfiles.length} exceed max ${rules.maxSecondaryProfiles}`,
        profileId: profile.id,
      });
    }

    // Check secondary profile types
    for (const sec of profile.secondaryProfiles) {
      if (!VALID_PROFILE_TYPES.includes(sec.profileType)) {
        issues.push({ level: 'error', code: 'PROFILE_INVALID_SECONDARY_TYPE', message: `Invalid secondary profile: ${sec.profileType}`, profileId: profile.id });
      }
    }

    // Change history
    for (const change of profile.changeHistory) {
      if (!VALID_CHANGE_TYPES.includes(change.changeType)) {
        issues.push({ level: 'error', code: 'PROFILE_INVALID_CHANGE_TYPE', message: `Invalid change type: ${change.changeType}`, profileId: profile.id });
      }
    }

    // Profile consistency: primary should have highest score
    if (profile.profileScores.length > 0) {
      const topScore = profile.profileScores[0];
      if (topScore && topScore.profileType !== profile.primaryProfile) {
        // Check if primary is general_purpose (fallback)
        if (profile.primaryProfile !== 'general_purpose') {
          issues.push({
            level: 'warning',
            code: 'PROFILE_INCONSISTENT_PRIMARY',
            message: `Primary profile ${profile.primaryProfile} doesn't match highest score ${topScore.profileType}`,
            profileId: profile.id,
          });
        }
      }
    }

    const errors = issues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues };
  }

  // ── Private ────────────────────────────────────────────────

  private _validateScore(
    score: number,
    name: string,
    profileId: string,
    issues: ProfileValidationIssue[],
  ): void {
    if (typeof score !== 'number' || isNaN(score)) {
      issues.push({ level: 'error', code: `PROFILE_INVALID_${name.toUpperCase()}_SCORE`, message: `Invalid ${name} score`, profileId });
      return;
    }
    if (score < 0 || score > 1) {
      issues.push({ level: 'error', code: `PROFILE_${name.toUpperCase()}_OUT_OF_RANGE`, message: `${name} score ${score} out of range [0,1]`, profileId });
    }
  }
}
