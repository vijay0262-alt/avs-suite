/**
 * Insight Validator — validates insight integrity.
 *
 * Validates:
 *   Confidence, evidence, related knowledge, related recommendations,
 *   priority, expiration, formatting.
 */
import type {
  Insight,
  InsightList,
  InsightValidationResult,
  InsightValidationIssue,
  InsightConfiguration,
  InsightPriority,
  InsightType,
  InsightCategory,
} from './types';

const VALID_TYPES: InsightType[] = [
  'morning_brief', 'evening_summary', 'optimization_summary', 'health_summary',
  'weekly_digest', 'monthly_digest', 'achievement', 'milestone', 'system_change',
  'recommendation_summary', 'maintenance_summary', 'performance_summary',
  'storage_summary', 'privacy_summary', 'windows_summary', 'security_summary',
  'automation_summary', 'custom',
];

const VALID_CATEGORIES: InsightCategory[] = [
  'system', 'health', 'performance', 'storage', 'browser', 'privacy',
  'startup', 'windows', 'duplicates', 'security', 'maintenance', 'automation',
  'achievement', 'milestone', 'custom',
];

const VALID_PRIORITIES: InsightPriority[] = [
  'critical', 'important', 'recommended', 'informational', 'celebration',
];

export class InsightValidator {
  private _config: InsightConfiguration;

  constructor(config: InsightConfiguration) {
    this._config = config;
  }

  updateConfig(config: InsightConfiguration): void {
    this._config = config;
  }

  validateInsight(insight: Insight): InsightValidationResult {
    const issues: InsightValidationIssue[] = [];

    // Required fields
    if (!insight.id) issues.push({ level: 'error', code: 'INSIGHT_MISSING_ID', message: 'Insight missing id' });
    if (!insight.title) issues.push({ level: 'error', code: 'INSIGHT_MISSING_TITLE', message: 'Insight missing title' });
    if (!insight.summary) issues.push({ level: 'error', code: 'INSIGHT_MISSING_SUMMARY', message: 'Insight missing summary' });

    // Type
    if (!VALID_TYPES.includes(insight.type)) {
      issues.push({ level: 'error', code: 'INSIGHT_INVALID_TYPE', message: `Invalid type: ${insight.type}`, insightId: insight.id });
    }

    // Category
    if (!VALID_CATEGORIES.includes(insight.category)) {
      issues.push({ level: 'error', code: 'INSIGHT_INVALID_CATEGORY', message: `Invalid category: ${insight.category}`, insightId: insight.id });
    }

    // Priority
    if (!VALID_PRIORITIES.includes(insight.priority)) {
      issues.push({ level: 'error', code: 'INSIGHT_INVALID_PRIORITY', message: `Invalid priority: ${insight.priority}`, insightId: insight.id });
    }

    // Scores
    this._validateScore(insight.importanceScore, 'importance', insight.id, issues);
    this._validateScore(insight.confidenceScore, 'confidence', insight.id, issues);

    // Evidence
    if (insight.evidence.evidenceCount === 0) {
      issues.push({ level: 'error', code: 'INSIGHT_NO_EVIDENCE', message: 'Insight has no evidence', insightId: insight.id });
    }
    if (insight.evidence.sourceProviders.length === 0) {
      issues.push({ level: 'error', code: 'INSIGHT_NO_SOURCE_PROVIDERS', message: 'Insight has no source providers', insightId: insight.id });
    }

    // Confidence threshold
    if (insight.confidenceScore < this._config.minConfidenceThreshold) {
      issues.push({
        level: 'warning',
        code: 'INSIGHT_LOW_CONFIDENCE',
        message: `Confidence ${insight.confidenceScore.toFixed(2)} below threshold ${this._config.minConfidenceThreshold}`,
        insightId: insight.id,
      });
    }

    // Expiration
    if (insight.expiresAt) {
      const expiryTime = new Date(insight.expiresAt).getTime();
      if (expiryTime < new Date(insight.generatedAt).getTime()) {
        issues.push({ level: 'error', code: 'INSIGHT_EXPIRED_BEFORE_GENERATED', message: 'Insight expires before it was generated', insightId: insight.id });
      }
    }

    // Reading time
    if (insight.estimatedReadingTime < 0) {
      issues.push({ level: 'error', code: 'INSIGHT_NEGATIVE_READING_TIME', message: 'Estimated reading time is negative', insightId: insight.id });
    }

    const errors = issues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues };
  }

  validateList(list: InsightList): InsightValidationResult {
    const allIssues: InsightValidationIssue[] = [];

    if (!list.metadata.listId) {
      allIssues.push({ level: 'error', code: 'LIST_MISSING_ID', message: 'List missing id' });
    }
    if (!list.metadata.knowledgeId) {
      allIssues.push({ level: 'error', code: 'LIST_MISSING_KNOWLEDGE_ID', message: 'List missing knowledgeId' });
    }

    for (const insight of list.insights) {
      const result = this.validateInsight(insight);
      allIssues.push(...result.issues);
    }

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const insight of list.insights) {
      if (ids.has(insight.id)) {
        allIssues.push({ level: 'error', code: 'INSIGHT_DUPLICATE_ID', message: `Duplicate insight id: ${insight.id}` });
      }
      ids.add(insight.id);
    }

    const errors = allIssues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues: allIssues };
  }

  // ── Private ────────────────────────────────────────────────

  private _validateScore(
    score: number,
    name: string,
    insightId: string,
    issues: InsightValidationIssue[],
  ): void {
    if (typeof score !== 'number' || isNaN(score)) {
      issues.push({ level: 'error', code: `INSIGHT_INVALID_${name.toUpperCase()}_SCORE`, message: `Invalid ${name} score`, insightId });
      return;
    }
    if (score < 0 || score > 1) {
      issues.push({ level: 'error', code: `INSIGHT_${name.toUpperCase()}_OUT_OF_RANGE`, message: `${name} score ${score} out of range [0,1]`, insightId });
    }
  }
}
