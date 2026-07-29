/**
 * Report Validator — validates report integrity.
 *
 * Validates: execution integrity, benefit calculations, delta calculations,
 * confidence, prediction updates, recommendation updates.
 */
import type {
  OptimizationReport,
  ReportValidationResult,
  ReportValidationError,
  ReportValidationWarning,
} from './types';

export class ReportValidator {
  validate(report: OptimizationReport): ReportValidationResult {
    const errors: ReportValidationError[] = [];
    const warnings: ReportValidationWarning[] = [];

    this._validateExecutionIntegrity(report, errors, warnings);
    this._validateBenefitCalculations(report, errors, warnings);
    this._validateDeltaCalculations(report, errors, warnings);
    this._validateConfidence(report, errors, warnings);
    this._validatePredictionUpdates(report, errors, warnings);
    this._validateRecommendationUpdates(report, errors, warnings);

    return { valid: errors.length === 0, errors, warnings };
  }

  private _validateExecutionIntegrity(
    report: OptimizationReport,
    errors: ReportValidationError[],
    warnings: ReportValidationWarning[],
  ): void {
    if (!report.id) {
      errors.push({ code: 'NO_REPORT_ID', message: 'Report has no ID' });
    }
    if (!report.executionId) {
      errors.push({ code: 'NO_EXECUTION_ID', message: 'Report has no execution ID' });
    }
    if (!report.planId) {
      errors.push({ code: 'NO_PLAN_ID', message: 'Report has no plan ID' });
    }
    if (report.duration < 0) {
      errors.push({ code: 'NEGATIVE_DURATION', message: 'Duration cannot be negative' });
    }
    if (report.overallResult === 'failed' && report.healthDelta !== null && report.healthDelta > 0) {
      warnings.push({ code: 'FAILED_WITH_HEALTH_GAIN', message: 'Report marked as failed but health improved' });
    }
  }

  private _validateBenefitCalculations(
    report: OptimizationReport,
    errors: ReportValidationError[],
    _warnings: ReportValidationWarning[],
  ): void {
    if (report.storageRecovered < 0) {
      errors.push({ code: 'NEGATIVE_STORAGE', message: 'Storage recovered cannot be negative', section: 'benefits' });
    }
    if (report.startupImprovement < 0) {
      errors.push({ code: 'NEGATIVE_STARTUP', message: 'Startup improvement cannot be negative', section: 'benefits' });
    }
    if (report.privacyImprovement < 0) {
      errors.push({ code: 'NEGATIVE_PRIVACY', message: 'Privacy improvement cannot be negative', section: 'benefits' });
    }
    if (report.performanceImprovement < 0) {
      errors.push({ code: 'NEGATIVE_PERFORMANCE', message: 'Performance improvement cannot be negative', section: 'benefits' });
    }
  }

  private _validateDeltaCalculations(
    report: OptimizationReport,
    errors: ReportValidationError[],
    _warnings: ReportValidationWarning[],
  ): void {
    if (report.healthBefore !== null && report.healthAfter !== null && report.healthDelta !== null) {
      const expected = report.healthAfter - report.healthBefore;
      if (report.healthDelta !== expected) {
        errors.push({
          code: 'HEALTH_DELTA_MISMATCH',
          message: `Health delta ${report.healthDelta} does not match ${report.healthAfter} - ${report.healthBefore} = ${expected}`,
          section: 'health_delta',
        });
      }
    }
  }

  private _validateConfidence(
    report: OptimizationReport,
    _errors: ReportValidationError[],
    warnings: ReportValidationWarning[],
  ): void {
    if (report.confidence < 0 || report.confidence > 1) {
      warnings.push({ code: 'CONFIDENCE_OUT_OF_RANGE', message: `Confidence ${report.confidence} is outside 0-1 range` });
    }
    if (report.confidence < 0.5) {
      warnings.push({ code: 'LOW_CONFIDENCE', message: `Confidence ${report.confidence} is below 0.5 threshold` });
    }
  }

  private _validatePredictionUpdates(
    report: OptimizationReport,
    _errors: ReportValidationError[],
    warnings: ReportValidationWarning[],
  ): void {
    if (report.predictionsUpdated < 0) {
      warnings.push({ code: 'NEGATIVE_PREDICTIONS', message: 'Predictions updated cannot be negative', section: 'updated_predictions' });
    }
  }

  private _validateRecommendationUpdates(
    report: OptimizationReport,
    _errors: ReportValidationError[],
    warnings: ReportValidationWarning[],
  ): void {
    if (report.recommendationsResolved < 0) {
      warnings.push({ code: 'NEGATIVE_RESOLVED', message: 'Recommendations resolved cannot be negative', section: 'updated_recommendations' });
    }
    if (report.recommendationsRemaining < 0) {
      warnings.push({ code: 'NEGATIVE_REMAINING', message: 'Recommendations remaining cannot be negative', section: 'updated_recommendations' });
    }
  }
}
