/**
 * Quota Validator — validates quota definitions and configurations.
 *
 * Detects:
 *   - Missing required fields
 *   - Duplicate IDs
 *   - Invalid limit types
 *   - Invalid reset policies
 *   - Invalid limit values (negative, NaN)
 *   - Corrupted usage data
 *   - Storage failures
 */
import type {
  QuotaDefinition,
  QuotaConfig,
  QuotaValidationIssue,
  QuotaValidationResult,
  QuotaStorageData,
} from './types';
import { isValidResetPolicy, isValidLimitType } from './types';

export class QuotaValidator {
  /**
   * Validate a full configuration object.
   */
  validateConfig(config: QuotaConfig): QuotaValidationResult {
    const issues: QuotaValidationIssue[] = [];
    const ids = new Set<string>();

    for (const quota of config.quotas) {
      issues.push(...this._validateQuota(quota, ids));
      ids.add(quota.id);
    }

    const valid = issues.filter((i) => i.level === 'error').length === 0;
    return { valid, issues };
  }

  /**
   * Validate a single quota definition.
   */
  validateQuota(quota: QuotaDefinition): QuotaValidationResult {
    const issues: QuotaValidationIssue[] = [];
    issues.push(...this._validateQuota(quota, new Set()));
    return { valid: issues.filter((i) => i.level === 'error').length === 0, issues };
  }

  /**
   * Validate storage data for corruption.
   */
  validateStorageData(data: QuotaStorageData): QuotaValidationResult {
    const issues: QuotaValidationIssue[] = [];

    if (!data) {
      issues.push({ level: 'error', code: 'STORAGE_NULL', message: 'Storage data is null' });
      return { valid: false, issues };
    }

    if (!data.states || typeof data.states !== 'object') {
      issues.push({ level: 'error', code: 'STORAGE_NO_STATES', message: 'Storage data missing states object' });
    }

    if (!Array.isArray(data.records)) {
      issues.push({ level: 'error', code: 'STORAGE_NO_RECORDS', message: 'Storage data missing records array' });
    }

    // Check for corrupted state entries
    if (data.states) {
      for (const [key, state] of Object.entries(data.states)) {
        if (typeof state.currentUsage !== 'number' || isNaN(state.currentUsage)) {
          issues.push({ level: 'warning', code: 'STORAGE_CORRUPT_USAGE', message: `State "${key}" has corrupted currentUsage`, context: key });
        }
        if (state.lastResetAt !== null && typeof state.lastResetAt !== 'string') {
          issues.push({ level: 'warning', code: 'STORAGE_CORRUPT_RESET', message: `State "${key}" has corrupted lastResetAt`, context: key });
        }
      }
    }

    // Check for corrupted records
    if (Array.isArray(data.records)) {
      for (const record of data.records) {
        if (!record.id || typeof record.id !== 'string') {
          issues.push({ level: 'warning', code: 'STORAGE_CORRUPT_RECORD_ID', message: 'Record missing valid id' });
        }
        if (typeof record.amountUsed !== 'number' || isNaN(record.amountUsed)) {
          issues.push({ level: 'warning', code: 'STORAGE_CORRUPT_RECORD_AMOUNT', message: `Record "${record.id}" has corrupted amountUsed` });
        }
      }
    }

    const valid = issues.filter((i) => i.level === 'error').length === 0;
    return { valid, issues };
  }

  // ── Private ────────────────────────────────────────────────

  private _validateQuota(quota: QuotaDefinition, existingIds: Set<string>): QuotaValidationIssue[] {
    const issues: QuotaValidationIssue[] = [];

    if (!quota.id) {
      issues.push({ level: 'error', code: 'QUOTA_MISSING_ID', message: 'Quota is missing id' });
    }
    if (!quota.displayName) {
      issues.push({ level: 'error', code: 'QUOTA_MISSING_NAME', message: `Quota "${quota.id}" is missing displayName` });
    }
    if (!quota.description) {
      issues.push({ level: 'warning', code: 'QUOTA_MISSING_DESC', message: `Quota "${quota.id}" is missing description` });
    }
    if (!quota.category) {
      issues.push({ level: 'warning', code: 'QUOTA_MISSING_CATEGORY', message: `Quota "${quota.id}" is missing category` });
    }
    if (!isValidLimitType(quota.limitType)) {
      issues.push({ level: 'error', code: 'QUOTA_INVALID_LIMIT_TYPE', message: `Quota "${quota.id}" has invalid limitType "${quota.limitType}"` });
    }
    if (!isValidResetPolicy(quota.resetPolicy)) {
      issues.push({ level: 'error', code: 'QUOTA_INVALID_RESET_POLICY', message: `Quota "${quota.id}" has invalid resetPolicy "${quota.resetPolicy}"` });
    }
    if (quota.limitType !== 'unlimited' && quota.limitType !== 'disabled') {
      if (typeof quota.limitValue !== 'number' || isNaN(quota.limitValue) || quota.limitValue < 0) {
        issues.push({ level: 'error', code: 'QUOTA_INVALID_LIMIT_VALUE', message: `Quota "${quota.id}" has invalid limitValue ${quota.limitValue}` });
      }
    }
    if (quota.id && existingIds.has(quota.id)) {
      issues.push({ level: 'error', code: 'QUOTA_DUPLICATE_ID', message: `Duplicate quota id "${quota.id}"` });
    }
    if (quota.limitType === 'unlimited' && !quota.isUnlimited) {
      issues.push({ level: 'warning', code: 'QUOTA_UNLIMITED_MISMATCH', message: `Quota "${quota.id}" has limitType "unlimited" but isUnlimited is false` });
    }
    if (quota.limitType === 'disabled' && quota.enabled) {
      issues.push({ level: 'warning', code: 'QUOTA_DISABLED_MISMATCH', message: `Quota "${quota.id}" has limitType "disabled" but enabled is true` });
    }

    return issues;
  }
}

export const quotaValidator = new QuotaValidator();
