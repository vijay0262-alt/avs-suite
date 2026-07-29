/**
 * Prediction Validator — validates prediction integrity.
 *
 * Validates:
 *   History availability, trend quality, confidence, prediction date,
 *   evidence, model compatibility, version compatibility.
 */
import type {
  Prediction,
  PredictionList,
  PredictionValidationResult,
  PredictionValidationIssue,
  PredictionConfiguration,
  PredictionType,
  PredictionCategory,
  RiskLevel,
  TimeHorizon,
  PredictionTrendType,
} from './types';

const VALID_TYPES: PredictionType[] = [
  'storage_capacity', 'health_score_trend', 'startup_growth',
  'browser_cache_growth', 'temp_file_growth', 'duplicate_file_growth',
  'disk_consumption', 'optimization_frequency', 'maintenance_requirement',
  'privacy_degradation', 'windows_maintenance', 'custom',
];

const VALID_CATEGORIES: PredictionCategory[] = [
  'system', 'health', 'performance', 'storage', 'browser', 'privacy',
  'startup', 'windows', 'duplicates', 'security', 'maintenance',
  'automation', 'custom',
];

const VALID_RISK_LEVELS: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];
const VALID_TRENDS: PredictionTrendType[] = ['increasing', 'decreasing', 'stable', 'seasonal', 'unknown'];
const VALID_HORIZONS: TimeHorizon[] = ['24h', '7d', '30d', '90d', '180d', '365d', 'custom'];

export class PredictionValidator {
  private _config: PredictionConfiguration;

  constructor(config: PredictionConfiguration) {
    this._config = config;
  }

  updateConfig(config: PredictionConfiguration): void {
    this._config = config;
  }

  validatePrediction(prediction: Prediction): PredictionValidationResult {
    const issues: PredictionValidationIssue[] = [];

    // Required fields
    if (!prediction.id) issues.push({ level: 'error', code: 'PRED_MISSING_ID', message: 'Prediction missing id' });
    if (!prediction.title) issues.push({ level: 'error', code: 'PRED_MISSING_TITLE', message: 'Prediction missing title' });
    if (!prediction.summary) issues.push({ level: 'error', code: 'PRED_MISSING_SUMMARY', message: 'Prediction missing summary' });

    // Type
    if (!VALID_TYPES.includes(prediction.predictionType)) {
      issues.push({ level: 'error', code: 'PRED_INVALID_TYPE', message: `Invalid type: ${prediction.predictionType}`, predictionId: prediction.id });
    }

    // Category
    if (!VALID_CATEGORIES.includes(prediction.category)) {
      issues.push({ level: 'error', code: 'PRED_INVALID_CATEGORY', message: `Invalid category: ${prediction.category}`, predictionId: prediction.id });
    }

    // Risk level
    if (!VALID_RISK_LEVELS.includes(prediction.riskLevel)) {
      issues.push({ level: 'error', code: 'PRED_INVALID_RISK', message: `Invalid risk level: ${prediction.riskLevel}`, predictionId: prediction.id });
    }

    // Trend
    if (!VALID_TRENDS.includes(prediction.trend)) {
      issues.push({ level: 'error', code: 'PRED_INVALID_TREND', message: `Invalid trend: ${prediction.trend}`, predictionId: prediction.id });
    }

    // Time horizon
    if (!VALID_HORIZONS.includes(prediction.timeHorizon)) {
      issues.push({ level: 'error', code: 'PRED_INVALID_HORIZON', message: `Invalid time horizon: ${prediction.timeHorizon}`, predictionId: prediction.id });
    }

    // Confidence
    this._validateScore(prediction.confidenceScore, 'confidence', prediction.id, issues);

    // Evidence
    if (prediction.evidence.evidenceCount === 0) {
      issues.push({ level: 'error', code: 'PRED_NO_EVIDENCE', message: 'Prediction has no evidence', predictionId: prediction.id });
    }
    if (prediction.evidence.sourceProviders.length === 0) {
      issues.push({ level: 'error', code: 'PRED_NO_SOURCE_PROVIDERS', message: 'Prediction has no source providers', predictionId: prediction.id });
    }
    if (prediction.evidence.historicalSamples < this._config.confidenceRules.minSamples) {
      issues.push({ level: 'error', code: 'PRED_INSUFFICIENT_HISTORY', message: `Historical samples ${prediction.evidence.historicalSamples} below minimum ${this._config.confidenceRules.minSamples}`, predictionId: prediction.id });
    }

    // Confidence threshold
    if (prediction.confidenceScore < this._config.minConfidenceThreshold) {
      issues.push({
        level: 'warning',
        code: 'PRED_LOW_CONFIDENCE',
        message: `Confidence ${prediction.confidenceScore.toFixed(2)} below threshold ${this._config.minConfidenceThreshold}`,
        predictionId: prediction.id,
      });
    }

    // Model version compatibility
    if (prediction.evidence.modelVersion !== this._config.modelSettings.modelVersion) {
      issues.push({
        level: 'warning',
        code: 'PRED_MODEL_VERSION_MISMATCH',
        message: `Model version ${prediction.evidence.modelVersion} != config ${this._config.modelSettings.modelVersion}`,
        predictionId: prediction.id,
      });
    }

    // Prediction date
    if (prediction.predictionDate) {
      const predTime = new Date(prediction.predictionDate).getTime();
      const generatedTime = new Date(prediction.generatedAt).getTime();
      if (predTime < generatedTime) {
        issues.push({ level: 'error', code: 'PRED_DATE_BEFORE_GENERATED', message: 'Prediction date is before generation date', predictionId: prediction.id });
      }
    }

    // Expiration
    if (prediction.expiresAt) {
      const expiryTime = new Date(prediction.expiresAt).getTime();
      if (expiryTime < new Date(prediction.generatedAt).getTime()) {
        issues.push({ level: 'error', code: 'PRED_EXPIRED_BEFORE_GENERATED', message: 'Prediction expires before it was generated', predictionId: prediction.id });
      }
    }

    // Assumptions
    if (prediction.evidence.assumptions.length === 0) {
      issues.push({ level: 'warning', code: 'PRED_NO_ASSUMPTIONS', message: 'Prediction has no stated assumptions', predictionId: prediction.id });
    }

    const errors = issues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues };
  }

  validateList(list: PredictionList): PredictionValidationResult {
    const allIssues: PredictionValidationIssue[] = [];

    if (!list.metadata.listId) {
      allIssues.push({ level: 'error', code: 'LIST_MISSING_ID', message: 'List missing id' });
    }
    if (!list.metadata.knowledgeId) {
      allIssues.push({ level: 'error', code: 'LIST_MISSING_KNOWLEDGE_ID', message: 'List missing knowledgeId' });
    }

    for (const prediction of list.predictions) {
      const result = this.validatePrediction(prediction);
      allIssues.push(...result.issues);
    }

    // Check for duplicate IDs
    const ids = new Set<string>();
    for (const prediction of list.predictions) {
      if (ids.has(prediction.id)) {
        allIssues.push({ level: 'error', code: 'PRED_DUPLICATE_ID', message: `Duplicate prediction id: ${prediction.id}` });
      }
      ids.add(prediction.id);
    }

    const errors = allIssues.filter((i) => i.level === 'error');
    return { valid: errors.length === 0, issues: allIssues };
  }

  // ── Private ────────────────────────────────────────────────

  private _validateScore(
    score: number,
    name: string,
    predictionId: string,
    issues: PredictionValidationIssue[],
  ): void {
    if (typeof score !== 'number' || isNaN(score)) {
      issues.push({ level: 'error', code: `PRED_INVALID_${name.toUpperCase()}_SCORE`, message: `Invalid ${name} score`, predictionId });
      return;
    }
    if (score < 0 || score > 1) {
      issues.push({ level: 'error', code: `PRED_${name.toUpperCase()}_OUT_OF_RANGE`, message: `${name} score ${score} out of range [0,1]`, predictionId });
    }
  }
}
