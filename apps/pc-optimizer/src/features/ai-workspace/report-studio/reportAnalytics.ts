/**
 * AI Report Studio — Analytics
 *
 * EPIC 5 PHASE A PART 5
 *
 * Aggregate analytics for report usage. No personal data.
 */
import type { ReportAnalyticsData, ExportFormat, ReportType } from './types';

export class ReportAnalytics {
  private _totalGenerated: number = 0;
  private _totalExports: number = 0;
  private _totalComparisons: number = 0;
  private _totalScheduled: number = 0;
  private _byReportType: Map<string, number> = new Map();
  private _byExportFormat: Map<string, number> = new Map();
  private _generationTimeSum: number = 0;

  recordGeneration(reportType: ReportType, generationTimeMs: number): void {
    this._totalGenerated++;
    this._byReportType.set(reportType, (this._byReportType.get(reportType) ?? 0) + 1);
    this._generationTimeSum += generationTimeMs;
  }

  recordExport(format: ExportFormat): void {
    this._totalExports++;
    this._byExportFormat.set(format, (this._byExportFormat.get(format) ?? 0) + 1);
  }

  recordComparison(): void {
    this._totalComparisons++;
  }

  recordSchedule(): void {
    this._totalScheduled++;
  }

  getAnalytics(): ReportAnalyticsData {
    const byReportType: Record<string, number> = {};
    for (const [key, val] of this._byReportType) byReportType[key] = val;

    const byExportFormat: Record<string, number> = {};
    for (const [key, val] of this._byExportFormat) byExportFormat[key] = val;

    return {
      totalReportsGenerated: this._totalGenerated,
      totalExports: this._totalExports,
      totalComparisons: this._totalComparisons,
      totalScheduled: this._totalScheduled,
      byReportType,
      byExportFormat,
      averageGenerationTimeMs: this._totalGenerated > 0 ? this._generationTimeSum / this._totalGenerated : 0,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  reset(): void {
    this._totalGenerated = 0;
    this._totalExports = 0;
    this._totalComparisons = 0;
    this._totalScheduled = 0;
    this._byReportType.clear();
    this._byExportFormat.clear();
    this._generationTimeSum = 0;
  }
}
