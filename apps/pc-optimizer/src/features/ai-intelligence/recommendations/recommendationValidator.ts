/**
 * Recommendation Validator — validates recommendation integrity.
 *
 * Validates:
 *   Evidence exists, scores valid, priority valid, category valid,
 *   benefit estimates, risk, confidence, relationships.
 */
import type {
  Recommendation,
  RecommendationList,
  RecommendationValidationResult,
  RecommendationValidationIssue,
  RecommendationConfiguration,
} from './types';

const VALID_CATEGORIES = [
  'performance', 'storage', 'browser', 'privacy', 'windows',
  'startup', 'duplicates', 'security', 'maintenance', 'automation',
  'health', 'custom',
];

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low', 'informational'];
const VALID_RISK_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];

export class RecommendationValidator {
  private _config: RecommendationConfiguration;

  constructor(config: RecommendationConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecommendationConfiguration): void {
    this._config = config;
  }

  /**
   * Validate a single recommendation.
   */
  validateRecommendation(rec: Recommendation): RecommendationValidationResult {
    const issues: RecommendationValidationIssue[] = [];

    // Required fields
    if (!rec.id) issues.push({ level: 'error', code: 'REC_MISSING_ID', message: 'Recommendation missing id' });
    if (!rec.title) issues.push({ level: 'error', code: 'REC_MISSING_TITLE', message: 'Recommendation missing title' });
    if (!rec.summary) issues.push({ level: 'error', code: 'REC_MISSING_SUMMARY', message: 'Recommendation missing summary' });
    if (!rec.description) issues.push({ level: 'error', code: 'REC_MISSING_DESCRIPTION', message: 'Recommendation missing description' });

    // Category
    if (!VALID_CATEGORIES.includes(rec.category)) {
      issues.push({ level: 'error', code: 'REC_INVALID_CATEGORY', message: `Invalid category: ${rec.category}`, recommendationId: rec.id });
    }

    // Priority
    if (!VALID_PRIORITIES.includes(rec.priority)) {
      issues.push({ level: 'error', code: 'REC_INVALID_PRIORITY', message: `Invalid priority: ${rec.priority}`, recommendationId: rec.id });
    }

    // Risk level
    if (!VALID_RISK_LEVELS.includes(rec.safety.riskLevel)) {
      issues.push({ level: 'error', code: 'REC_INVALID_RISK', message: `Invalid risk level: ${rec.safety.riskLevel}`, recommendationId: rec.id });
    }

    // Scores
    this._validateScore(rec.scores.impactScore, 'impact', rec.id, issues);
    this._validateScore(rec.scores.safetyScore, 'safety', rec.id, issues);
    this._validateScore(rec.scores.urgencyScore, 'urgency', rec.id, issues);
    this._validateScore(rec.scores.effortScore, 'effort', rec.id, issues);
    this._validateScore(rec.scores.confidenceScore, 'confidence', rec.id, issues);
    this._validateScore(rec.scores.overallScore, 'overall', rec.id, issues);

    // Evidence
    if (rec.evidence.evidenceCount === 0) {
      issues.push({ level: 'error', code: 'REC_NO_EVIDENCE', message: 'Recommendation has no evidence', recommendationId: rec.id });
    }
    if (rec.evidence.supportingFacts.length === 0) {
      issues.push({ level: 'error', code: 'REC_NO_SUPPORTING_FACTS', message: 'Recommendation has no supporting facts', recommendationId: rec.id });
    }
    if (rec.evidence.sourceProviders.length === 0) {
      issues.push({ level: 'error', code: 'REC_NO_SOURCE_PROVIDERS', message: 'Recommendation has no source providers', recommendationId: rec.id });
    }

    // Confidence threshold
    if (rec.evidence.confidence < this._config.minConfidenceThreshold) {
      issues.push({
        level: 'warning',
        code: 'REC_LOW_CONFIDENCE',
        message: `Confidence ${rec.evidence.confidence.toFixed(2)} below threshold ${this._config.minConfidenceThreshold}`,
        recommendationId: rec.id,
      });
    }

    // Safety threshold
    if (rec.scores.safetyScore < this._config.minSafetyThreshold) {
      issues.push({
        level: 'warning',
        code: 'REC_LOW_SAFETY',
        message: `Safety score ${rec.scores.safetyScore.toFixed(2)} below threshold ${this._config.minSafetyThreshold}`,
        recommendationId: rec.id,
      });
    }

    // Benefits
    if (rec.benefits.estimatedTime < 0) {
      issues.push({ level: 'error', code: 'REC_NEGATIVE_TIME', message: 'Estimated time is negative', recommendationId: rec.id });
    }
    if (rec.benefits.estimatedSpaceRecovered !== null && rec.benefits.estimatedSpaceRecovered < 0) {
      issues.push({ level: 'error', code: 'REC_NEGATIVE_SPACE', message: 'Estimated space recovered is negative', recommendationId: rec.id });
    }

    // Priority consistency with overall score
    const expectedPriority = this._derivePriority(rec.scores.overallScore);
    if (rec.priority !== expectedPriority) {
      issues.push({
        level: 'warning',
        code: 'REC_PRIORITY_MISMATCH',
        message: `Priority ${rec.priority} does not match expected ${expectedPriority} for overall score ${rec.scores.overallScore.toFixed(2)}`,
        recommendationId: rec.id,
      });
    }

    const errors = issues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues };
  }

  /**
   * Validate a recommendation list.
   */
  validateList(list: RecommendationList): RecommendationValidationResult {
    const allIssues: RecommendationValidationIssue[] = [];

    if (!list.metadata.listId) {
      allIssues.push({ level: 'error', code: 'LIST_MISSING_ID', message: 'List missing id' });
    }
    if (!list.metadata.knowledgeId) {
      allIssues.push({ level: 'error', code: 'LIST_MISSING_KNOWLEDGE_ID', message: 'List missing knowledgeId' });
    }

    for (const rec of list.recommendations) {
      const result = this.validateRecommendation(rec);
      allIssues.push(...result.issues);
    }

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const rec of list.recommendations) {
      if (ids.has(rec.id)) {
        allIssues.push({ level: 'error', code: 'REC_DUPLICATE_ID', message: `Duplicate recommendation id: ${rec.id}` });
      }
      ids.add(rec.id);
    }

    const errors = allIssues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues: allIssues };
  }

  // ── Private ────────────────────────────────────────────────

  private _validateScore(
    score: number,
    name: string,
    recId: string,
    issues: RecommendationValidationIssue[],
  ): void {
    if (typeof score !== 'number' || isNaN(score)) {
      issues.push({ level: 'error', code: `REC_INVALID_${name.toUpperCase()}_SCORE`, message: `Invalid ${name} score`, recommendationId: recId });
      return;
    }
    if (score < 0 || score > 1) {
      issues.push({ level: 'error', code: `REC_${name.toUpperCase()}_OUT_OF_RANGE`, message: `${name} score ${score} out of range [0,1]`, recommendationId: recId });
    }
  }

  private _derivePriority(overallScore: number): string {
    const t = this._config.priorityThresholds;
    if (overallScore >= t.critical) return 'critical';
    if (overallScore >= t.high) return 'high';
    if (overallScore >= t.medium) return 'medium';
    if (overallScore >= t.low) return 'low';
    return 'informational';
  }
}
