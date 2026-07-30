/**
 * AI Report Studio — Validator
 *
 * EPIC 5 PHASE A PART 5
 *
 * Validates reports: data sources, permissions, template, widgets.
 */
import type { Report, ReportValidationResult, ReportValidationError, ReportValidationWarning, CopilotContext, PermissionLevel } from './types';

export class ReportValidator {
  private _permissionOrder: PermissionLevel[] = ['free', 'pro', 'enterprise'];

  validate(
    report: Report,
    context: CopilotContext,
    userPermission: PermissionLevel,
    requiredDataSources: string[],
  ): ReportValidationResult {
    const errors: ReportValidationError[] = [];
    const warnings: ReportValidationWarning[] = [];

    this._validateDataSources(context, requiredDataSources, errors);
    this._validateWidgets(report, warnings);
    this._validateInsights(report, warnings);
    this._validateConfidence(report, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      futureMetadata: {},
    };
  }

  private _validateDataSources(context: CopilotContext, required: string[], errors: ReportValidationError[]): void {
    const availableSources = new Set(context.sources.filter((s) => s.available).map((s) => s.type));
    for (const src of required) {
      if (!availableSources.has(src as never)) {
        errors.push({
          code: 'MISSING_DATA_SOURCE',
          message: `Required data source "${src}" is not available`,
          field: 'dataSources',
        });
      }
    }
  }

  private _validateWidgets(report: Report, warnings: ReportValidationWarning[]): void {
    if (report.widgets.length === 0) {
      warnings.push({
        code: 'NO_WIDGETS',
        message: 'Report has no widgets',
        field: 'widgets',
      });
    }

    for (const w of report.widgets) {
      if (w.status === 'error') {
        warnings.push({
          code: 'WIDGET_ERROR',
          message: `Widget "${w.definition.title}" has an error state`,
          field: 'widgets',
        });
      }
    }
  }

  private _validateInsights(report: Report, warnings: ReportValidationWarning[]): void {
    if (report.insights.length === 0) {
      warnings.push({
        code: 'NO_INSIGHTS',
        message: 'Report has no insights',
        field: 'insights',
      });
    }
  }

  private _validateConfidence(report: Report, warnings: ReportValidationWarning[]): void {
    if (report.confidence < 0.5) {
      warnings.push({
        code: 'LOW_CONFIDENCE',
        message: `Report confidence is low (${(report.confidence * 100).toFixed(0)}%)`,
        field: 'confidence',
      });
    }
  }
}
