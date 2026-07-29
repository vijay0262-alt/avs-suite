/**
 * Report Exporter — exports reports in multiple formats.
 *
 * Supports: PDF (interface only), HTML, Markdown, JSON, CSV.
 * Does NOT implement cloud export.
 */
import type {
  OptimizationReport,
  ExportFormat,
  ExportResult,
  ReportConfiguration,
} from './types';
import { formatDuration, formatBytes } from './types';

export class ReportExporter {
  private _config: ReportConfiguration;

  constructor(config: ReportConfiguration) {
    this._config = config;
  }

  updateConfig(config: ReportConfiguration): void {
    this._config = config;
  }

  export(report: OptimizationReport, format: ExportFormat): ExportResult {
    switch (format) {
      case 'json':
        return this._exportJson(report);
      case 'html':
        return this._exportHtml(report);
      case 'markdown':
        return this._exportMarkdown(report);
      case 'csv':
        return this._exportCsv(report);
      case 'pdf':
        return this._exportPdfInterface(report);
    }
  }

  getSupportedFormats(): ExportFormat[] {
    return ['json', 'html', 'markdown', 'csv', 'pdf'];
  }

  private _exportJson(report: OptimizationReport): ExportResult {
    return {
      format: 'json',
      content: JSON.stringify(report, null, 2),
      mimeType: 'application/json',
      filename: `report_${report.executionId}.json`,
      generatedAt: new Date().toISOString(),
    };
  }

  private _exportHtml(report: OptimizationReport): ExportResult {
    const sections = this._buildHtmlSections(report);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${report.title}</title>
</head>
<body>
  <h1>${report.title}</h1>
  <p>Generated: ${report.generatedAt}</p>
  <p>Result: ${report.overallResult}</p>
  <p>Duration: ${formatDuration(report.duration)}</p>
  ${sections}
</body>
</html>`;
    return {
      format: 'html',
      content: html,
      mimeType: 'text/html',
      filename: `report_${report.executionId}.html`,
      generatedAt: new Date().toISOString(),
    };
  }

  private _exportMarkdown(report: OptimizationReport): ExportResult {
    const lines: string[] = [];
    lines.push(`# ${report.title}`);
    lines.push('');
    lines.push(`**Execution ID:** ${report.executionId}`);
    lines.push(`**Plan ID:** ${report.planId}`);
    lines.push(`**Generated:** ${report.generatedAt}`);
    lines.push(`**Result:** ${report.overallResult}`);
    lines.push(`**Duration:** ${formatDuration(report.duration)}`);
    lines.push('');
    if (report.healthDelta !== null) {
      lines.push(`## Health Delta`);
      lines.push(`- Before: ${report.healthBefore}`);
      lines.push(`- After: ${report.healthAfter}`);
      lines.push(`- Delta: +${report.healthDelta}`);
      lines.push('');
    }
    lines.push(`## Benefits`);
    lines.push(`- Storage Recovered: ${formatBytes(report.storageRecovered)}`);
    lines.push(`- Startup Improvement: ${report.startupImprovement.toFixed(1)}s`);
    lines.push(`- Privacy Improvement: +${report.privacyImprovement}`);
    lines.push(`- Performance Improvement: +${report.performanceImprovement}`);
    lines.push('');
    lines.push(`## Confidence: ${(report.confidence * 100).toFixed(0)}%`);
    lines.push(`## Rollback: ${report.rollbackAvailable ? `Available for ${this._config.rollbackDurationHours} hours` : 'Not available'}`);

    return {
      format: 'markdown',
      content: lines.join('\n'),
      mimeType: 'text/markdown',
      filename: `report_${report.executionId}.md`,
      generatedAt: new Date().toISOString(),
    };
  }

  private _exportCsv(report: OptimizationReport): ExportResult {
    const rows = [
      ['Field', 'Value'],
      ['Report ID', report.id],
      ['Execution ID', report.executionId],
      ['Plan ID', report.planId],
      ['Generated At', report.generatedAt],
      ['Title', report.title],
      ['Overall Result', report.overallResult],
      ['Duration (ms)', String(report.duration)],
      ['Health Before', String(report.healthBefore ?? 'N/A')],
      ['Health After', String(report.healthAfter ?? 'N/A')],
      ['Health Delta', String(report.healthDelta ?? 'N/A')],
      ['Storage Recovered (bytes)', String(report.storageRecovered)],
      ['Startup Improvement (s)', String(report.startupImprovement)],
      ['Privacy Improvement', String(report.privacyImprovement)],
      ['Performance Improvement', String(report.performanceImprovement)],
      ['Recommendations Resolved', String(report.recommendationsResolved)],
      ['Recommendations Remaining', String(report.recommendationsRemaining)],
      ['Predictions Updated', String(report.predictionsUpdated)],
      ['Rollback Available', String(report.rollbackAvailable)],
      ['Confidence', String(report.confidence)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    return {
      format: 'csv',
      content: csv,
      mimeType: 'text/csv',
      filename: `report_${report.executionId}.csv`,
      generatedAt: new Date().toISOString(),
    };
  }

  private _exportPdfInterface(report: OptimizationReport): ExportResult {
    return {
      format: 'pdf',
      content: JSON.stringify({ reportId: report.id, ready: false, message: 'PDF export interface — implement with renderer' }),
      mimeType: 'application/pdf',
      filename: `report_${report.executionId}.pdf`,
      generatedAt: new Date().toISOString(),
    };
  }

  private _buildHtmlSections(report: OptimizationReport): string {
    const parts: string[] = [];
    if (report.healthDelta !== null) {
      parts.push(`<h2>Health Delta</h2><p>${report.healthBefore} → ${report.healthAfter} (+${report.healthDelta})</p>`);
    }
    parts.push(`<h2>Benefits</h2><ul>`);
    parts.push(`<li>Storage Recovered: ${formatBytes(report.storageRecovered)}</li>`);
    parts.push(`<li>Startup Improvement: ${report.startupImprovement.toFixed(1)}s</li>`);
    parts.push(`<li>Privacy Improvement: +${report.privacyImprovement}</li>`);
    parts.push(`<li>Performance Improvement: +${report.performanceImprovement}</li>`);
    parts.push(`</ul>`);
    parts.push(`<p><strong>Confidence:</strong> ${(report.confidence * 100).toFixed(0)}%</p>`);
    parts.push(`<p><strong>Rollback:</strong> ${report.rollbackAvailable ? `Available for ${this._config.rollbackDurationHours} hours` : 'Not available'}</p>`);
    return parts.join('\n');
  }
}
