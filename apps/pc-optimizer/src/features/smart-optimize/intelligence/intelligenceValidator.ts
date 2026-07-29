/**
 * Intelligence Validator — validates analysis results, recommendations, and predictions.
 */
import type {
  IntelligenceRecommendation,
  SuccessPrediction,
  DetectedPattern,
  IntelligenceInsight,
  IntelligenceValidationResult,
  IntelligenceValidationError,
  IntelligenceValidationWarning,
  LearningResult,
} from './types';

export class IntelligenceValidator {
  validateRecommendation(rec: IntelligenceRecommendation): IntelligenceValidationResult {
    const errors: IntelligenceValidationError[] = [];
    const warnings: IntelligenceValidationWarning[] = [];

    if (!rec.id) errors.push({ code: 'MISSING_ID', message: 'Recommendation has no id' });
    if (!rec.reason) errors.push({ code: 'MISSING_REASON', message: 'Recommendation has no reason' });
    if (rec.confidence < 0 || rec.confidence > 1) errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence out of range [0,1]', field: 'confidence' });
    if (rec.historicalSuccess < 0 || rec.historicalSuccess > 1) errors.push({ code: 'INVALID_SUCCESS', message: 'Historical success out of range [0,1]', field: 'historicalSuccess' });
    if (rec.expectedBenefit < 0) errors.push({ code: 'INVALID_BENEFIT', message: 'Expected benefit must be >= 0', field: 'expectedBenefit' });
    if (rec.supportingEvidence.length === 0) warnings.push({ code: 'NO_EVIDENCE', message: 'Recommendation has no supporting evidence' });
    if (rec.confidence < 0.3) warnings.push({ code: 'LOW_CONFIDENCE', message: 'Recommendation confidence is low' });

    return { valid: errors.length === 0, errors, warnings };
  }

  validatePrediction(pred: SuccessPrediction): IntelligenceValidationResult {
    const errors: IntelligenceValidationError[] = [];
    const warnings: IntelligenceValidationWarning[] = [];

    if (!pred.id) errors.push({ code: 'MISSING_ID', message: 'Prediction has no id' });
    if (pred.predictedSuccessRate < 0 || pred.predictedSuccessRate > 1) errors.push({ code: 'INVALID_RATE', message: 'Predicted success rate out of range [0,1]', field: 'predictedSuccessRate' });
    if (pred.confidence < 0 || pred.confidence > 1) errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence out of range [0,1]', field: 'confidence' });
    if (pred.basedOnSamples < 0) errors.push({ code: 'INVALID_SAMPLES', message: 'Sample count must be >= 0', field: 'basedOnSamples' });
    if (pred.basedOnSamples < 3) warnings.push({ code: 'LOW_SAMPLES', message: 'Prediction based on fewer than 3 samples' });
    if (pred.factors.length === 0) warnings.push({ code: 'NO_FACTORS', message: 'Prediction has no factors' });
    if (pred.supportingEvidence.length === 0) warnings.push({ code: 'NO_EVIDENCE', message: 'Prediction has no supporting evidence' });

    return { valid: errors.length === 0, errors, warnings };
  }

  validatePattern(pattern: DetectedPattern): IntelligenceValidationResult {
    const errors: IntelligenceValidationError[] = [];
    const warnings: IntelligenceValidationWarning[] = [];

    if (!pattern.id) errors.push({ code: 'MISSING_ID', message: 'Pattern has no id' });
    if (!pattern.name) errors.push({ code: 'MISSING_NAME', message: 'Pattern has no name' });
    if (pattern.confidence < 0 || pattern.confidence > 1) errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence out of range [0,1]', field: 'confidence' });
    if (pattern.frequency < 0) errors.push({ code: 'INVALID_FREQUENCY', message: 'Frequency must be >= 0', field: 'frequency' });
    if (pattern.supportingEvidence.length === 0) warnings.push({ code: 'NO_EVIDENCE', message: 'Pattern has no supporting evidence' });

    return { valid: errors.length === 0, errors, warnings };
  }

  validateInsight(insight: IntelligenceInsight): IntelligenceValidationResult {
    const errors: IntelligenceValidationError[] = [];
    const warnings: IntelligenceValidationWarning[] = [];

    if (!insight.id) errors.push({ code: 'MISSING_ID', message: 'Insight has no id' });
    if (!insight.title) errors.push({ code: 'MISSING_TITLE', message: 'Insight has no title' });
    if (insight.confidence < 0 || insight.confidence > 1) errors.push({ code: 'INVALID_CONFIDENCE', message: 'Confidence out of range [0,1]', field: 'confidence' });
    if (insight.supportingEvidence.length === 0) warnings.push({ code: 'NO_EVIDENCE', message: 'Insight has no supporting evidence' });

    return { valid: errors.length === 0, errors, warnings };
  }

  validateLearningResult(result: LearningResult): IntelligenceValidationResult {
    const errors: IntelligenceValidationError[] = [];
    const warnings: IntelligenceValidationWarning[] = [];

    if (result.analysisDurationMs > 300) warnings.push({ code: 'SLOW_ANALYSIS', message: `Analysis took ${result.analysisDurationMs.toFixed(0)}ms — target is under 300ms` });
    if (result.recommendations.recommendations.length === 0) warnings.push({ code: 'NO_RECOMMENDATIONS', message: 'No recommendations generated' });
    if (result.patterns.length === 0) warnings.push({ code: 'NO_PATTERNS', message: 'No patterns detected' });
    if (result.insights.insights.length === 0) warnings.push({ code: 'NO_INSIGHTS', message: 'No insights generated' });

    for (const rec of result.recommendations.recommendations) {
      const recResult = this.validateRecommendation(rec);
      errors.push(...recResult.errors);
      warnings.push(...recResult.warnings);
    }

    for (const pattern of result.patterns) {
      const patResult = this.validatePattern(pattern);
      errors.push(...patResult.errors);
    }

    for (const insight of result.insights.insights) {
      const insResult = this.validateInsight(insight);
      errors.push(...insResult.errors);
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
