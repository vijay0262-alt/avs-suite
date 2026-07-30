/**
 * AI Report Studio — Exporter
 *
 * EPIC 5 PHASE A PART 5
 *
 * Exports reports to multiple formats: interactive, JSON, Markdown, CSV,
 * PDF-ready data model. Supports future export providers.
 */
import type { Report, ReportExportResult, ExportFormat } from './types';
import { getExportFormatLabel } from './types';

export class ReportExporter {
  export(report: Report, format: ExportFormat): ReportExportResult {
    switch (format) {
      case 'interactive':
        return this._exportInteractive(report);
      case 'json':
        return this._exportJson(report);
      case 'markdown':
        return this._exportMarkdown(report);
      case 'csv':
        return this._exportCsv(report);
      case 'pdf_ready':
        return this._exportPdfReady(report);
      default:
        return this._exportJson(report);
    }
  }

  private _exportInteractive(report: Report): ReportExportResult {
    const content = JSON.stringify({
      type: 'interactive',
      report,
      drillDown: {
        sections: report.sections.map((s) => ({
          id: s.id,
          title: s.title,
          widgetIds: s.widgetIds,
          insightIds: s.insights.map((i) => i.id),
        })),
        widgets: report.widgets.map((w) => ({
          id: w.id,
          type: w.definition.type,
          title: w.definition.title,
          data: w.data,
        })),
        charts: report.charts.map((c) => ({ id: c.id, type: c.type, title: c.title })),
        tables: report.tables.map((t) => ({ id: t.id, title: t.title, columns: t.columns })),
      },
    }, null, 2);

    return this._createResult(report, 'interactive', content, 'application/json');
  }

  private _exportJson(report: Report): ReportExportResult {
    const content = JSON.stringify(report, null, 2);
    return this._createResult(report, 'json', content, 'application/json');
  }

  private _exportMarkdown(report: Report): ReportExportResult {
    const lines: string[] = [];

    lines.push(`# ${report.title}`);
    lines.push('');
    lines.push(`> ${report.description}`);
    lines.push('');
    lines.push(`**Generated:** ${report.generatedAt}`);
    lines.push(`**Time Range:** ${report.timeRange.preset}`);
    lines.push(`**Confidence:** ${(report.confidence * 100).toFixed(0)}%`);
    lines.push('');

    // Sections
    for (const section of report.sections) {
      lines.push(`## ${section.title}`);
      lines.push('');
      for (const insight of section.insights) {
        lines.push(`- **${insight.title}**: ${insight.description}`);
      }
      lines.push('');
    }

    // Insights
    if (report.insights.length > 0) {
      lines.push('## Insights');
      lines.push('');
      for (const insight of report.insights) {
        lines.push(`### ${insight.title}`);
        lines.push(`- Type: ${insight.type}`);
        lines.push(`- Severity: ${insight.severity}`);
        lines.push(`- Confidence: ${(insight.confidence * 100).toFixed(0)}%`);
        lines.push(`- ${insight.description}`);
        lines.push('');
      }
    }

    // Charts
    if (report.charts.length > 0) {
      lines.push('## Charts');
      lines.push('');
      for (const chart of report.charts) {
        lines.push(`### ${chart.title} (${chart.type})`);
        if (chart.data.labels.length > 0) {
          lines.push(`Labels: ${chart.data.labels.join(', ')}`);
          for (const ds of chart.data.datasets) {
            lines.push(`- ${ds.label}: ${ds.values.join(', ')}`);
          }
        }
        lines.push('');
      }
    }

    // Tables
    if (report.tables.length > 0) {
      lines.push('## Tables');
      lines.push('');
      for (const table of report.tables) {
        lines.push(`### ${table.title}`);
        lines.push(`| ${table.columns.join(' | ')} |`);
        lines.push(`| ${table.columns.map(() => '---').join(' | ')} |`);
        for (const row of table.rows) {
          lines.push(`| ${row.join(' | ')} |`);
        }
        lines.push('');
      }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      lines.push('## Recommendations');
      lines.push('');
      for (const rec of report.recommendations) {
        lines.push(`- ${rec}`);
      }
      lines.push('');
    }

    const content = lines.join('\n');
    return this._createResult(report, 'markdown', content, 'text/markdown');
  }

  private _exportCsv(report: Report): ReportExportResult {
    const lines: string[] = [];

    // Export insights as CSV
    lines.push('Type,Title,Description,Severity,Confidence');
    for (const insight of report.insights) {
      const desc = insight.description.replace(/"/g, '""');
      const title = insight.title.replace(/"/g, '""');
      lines.push(`"${insight.type}","${title}","${desc}","${insight.severity}","${(insight.confidence * 100).toFixed(0)}%"`);
    }

    // Export tables
    for (const table of report.tables) {
      lines.push('');
      lines.push(`# ${table.title}`);
      lines.push(table.columns.join(','));
      for (const row of table.rows) {
        lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
      }
    }

    const content = lines.join('\n');
    return this._createResult(report, 'csv', content, 'text/csv');
  }

  private _exportPdfReady(report: Report): ReportExportResult {
    const pdfData = {
      title: report.title,
      description: report.description,
      generatedAt: report.generatedAt,
      timeRange: report.timeRange.preset,
      confidence: report.confidence,
      sections: report.sections.map((s) => ({
        title: s.title,
        insights: s.insights.map((i) => ({
          title: i.title,
          description: i.description,
          severity: i.severity,
          confidence: i.confidence,
        })),
      })),
      charts: report.charts.map((c) => ({
        title: c.title,
        type: c.type,
        data: c.data,
      })),
      tables: report.tables.map((t) => ({
        title: t.title,
        columns: t.columns,
        rows: t.rows,
      })),
      recommendations: report.recommendations,
      metadata: {
        formatVersion: '1.0',
        pageOrientation: 'portrait',
        pageSize: 'A4',
        margins: { top: 20, bottom: 20, left: 20, right: 20 },
      },
    };

    const content = JSON.stringify(pdfData, null, 2);
    return this._createResult(report, 'pdf_ready', content, 'application/json');
  }

  private _createResult(report: Report, format: ExportFormat, content: string, mimeType: string): ReportExportResult {
    const filename = `${report.type}_${report.id}.${this._getExtension(format)}`;
    return {
      format,
      content,
      mimeType,
      filename,
      size: content.length,
      exportedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _getExtension(format: ExportFormat): string {
    const exts: Record<ExportFormat, string> = {
      interactive: 'json',
      json: 'json',
      markdown: 'md',
      csv: 'csv',
      pdf_ready: 'json',
      future_format: 'txt',
    };
    return exts[format] ?? 'txt';
  }
}
