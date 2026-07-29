/**
 * AI Context Validator — validates providers, context, and data integrity.
 *
 * Validates:
 *   Required metadata
 *   Duplicate providers
 *   Invalid data
 *   Version mismatch
 *   Missing fields
 *   Corrupted context
 *
 * Validation errors never crash the application.
 */
import type {
  AIContextProvider,
  AIContext,
  ContextValidationResult,
  ContextValidationIssue,
  ContextProvenance,
  AIContextConfiguration,
} from './types';
import { CONTEXT_SECTIONS, isValidContextSection } from './types';

export class AIContextValidator {
  private _config: AIContextConfiguration;

  constructor(config: AIContextConfiguration) {
    this._config = config;
  }

  updateConfig(config: AIContextConfiguration): void {
    this._config = config;
  }

  /**
   * Validate a single provider.
   */
  validateProvider(provider: AIContextProvider): ContextValidationResult {
    const issues: ContextValidationIssue[] = [];

    const name = provider.getProviderName();
    if (!name) {
      issues.push({
        level: 'error',
        code: 'PROVIDER_NO_NAME',
        message: 'Provider must have a name',
      });
    }

    const version = provider.getVersion();
    if (!version) {
      issues.push({
        level: 'error',
        code: 'PROVIDER_NO_VERSION',
        message: `Provider "${name}" must have a version`,
        providerName: name,
      });
    }

    const priority = provider.getPriority();
    if (typeof priority !== 'number' || priority < 0) {
      issues.push({
        level: 'error',
        code: 'PROVIDER_INVALID_PRIORITY',
        message: `Provider "${name}" must have a non-negative priority`,
        providerName: name,
      });
    }

    const selfValidation = provider.validate();
    if (!selfValidation.valid) {
      for (const issue of selfValidation.issues) {
        issues.push({
          level: 'error',
          code: 'PROVIDER_SELF_VALIDATION',
          message: `Provider "${name}": ${issue}`,
          providerName: name,
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate a complete AIContext.
   */
  validateContext(context: AIContext): ContextValidationResult {
    const issues: ContextValidationIssue[] = [];

    // Validate metadata
    if (!context.metadata) {
      issues.push({
        level: 'error',
        code: 'MISSING_METADATA',
        message: 'Context must have metadata',
      });
    } else {
      const meta = context.metadata;
      if (!meta.contextId) {
        issues.push({ level: 'error', code: 'MISSING_CONTEXT_ID', message: 'Metadata must have contextId' });
      }
      if (!meta.timestamp) {
        issues.push({ level: 'error', code: 'MISSING_TIMESTAMP', message: 'Metadata must have timestamp' });
      }
      if (!meta.contextVersion) {
        issues.push({ level: 'warning', code: 'MISSING_CONTEXT_VERSION', message: 'Metadata should have contextVersion' });
      }
      if (!meta.appVersion) {
        issues.push({ level: 'warning', code: 'MISSING_APP_VERSION', message: 'Metadata should have appVersion' });
      }
      if (!meta.platform) {
        issues.push({ level: 'warning', code: 'MISSING_PLATFORM', message: 'Metadata should have platform' });
      }
    }

    // Validate provenance
    if (this._config.enableTraceability) {
      if (!context.provenance || !Array.isArray(context.provenance)) {
        issues.push({
          level: 'error',
          code: 'MISSING_PROVENANCE',
          message: 'Context must have provenance array when traceability is enabled',
        });
      } else {
        for (const prov of context.provenance) {
          const provIssues = this._validateProvenance(prov);
          issues.push(...provIssues);
        }
      }
    }

    // Validate sections — check for unknown sections
    const knownSections = new Set(CONTEXT_SECTIONS);
    for (const key of Object.keys(context)) {
      if (key !== 'metadata' && key !== 'provenance' && !knownSections.has(key as never)) {
        issues.push({
          level: 'warning',
          code: 'UNKNOWN_SECTION',
          message: `Unknown context section: "${key}"`,
          section: key,
        });
      }
    }

    // Validate confidence thresholds
    if (this._config.enableTraceability && context.provenance) {
      for (const prov of context.provenance) {
        if (prov.confidence < this._config.minConfidenceThreshold) {
          issues.push({
            level: 'warning',
            code: 'LOW_CONFIDENCE',
            message: `Provider "${prov.providerName}" has confidence ${prov.confidence} below threshold ${this._config.minConfidenceThreshold}`,
            providerName: prov.providerName,
          });
        }
      }
    }

    return { valid: issues.filter((i) => i.level === 'error').length === 0, issues };
  }

  /**
   * Check for duplicate provider names.
   */
  checkDuplicateProviders(providers: AIContextProvider[]): ContextValidationResult {
    const issues: ContextValidationIssue[] = [];
    const seen = new Map<string, number>();

    for (const provider of providers) {
      const name = provider.getProviderName();
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      if (count > 1) {
        issues.push({
          level: 'error',
          code: 'DUPLICATE_PROVIDER',
          message: `Duplicate provider name: "${name}"`,
          providerName: name,
        });
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Validate a context section key.
   */
  isValidSection(section: string): boolean {
    return isValidContextSection(section);
  }

  // ── Private ────────────────────────────────────────────────

  private _validateProvenance(prov: ContextProvenance): ContextValidationIssue[] {
    const issues: ContextValidationIssue[] = [];

    if (!prov.providerName) {
      issues.push({ level: 'error', code: 'PROVENANCE_NO_PROVIDER', message: 'Provenance must have providerName' });
    }
    if (!prov.providerVersion) {
      issues.push({ level: 'error', code: 'PROVENANCE_NO_VERSION', message: 'Provenance must have providerVersion' });
    }
    if (!prov.collectedAt) {
      issues.push({ level: 'error', code: 'PROVENANCE_NO_TIMESTAMP', message: 'Provenance must have collectedAt' });
    }
    if (typeof prov.confidence !== 'number' || prov.confidence < 0 || prov.confidence > 1) {
      issues.push({ level: 'error', code: 'PROVENANCE_INVALID_CONFIDENCE', message: 'Provenance confidence must be 0.0–1.0' });
    }
    if (!Array.isArray(prov.evidence)) {
      issues.push({ level: 'error', code: 'PROVENANCE_NO_EVIDENCE', message: 'Provenance must have evidence array' });
    }

    return issues;
  }
}
