/**
 * AI Report Studio — Formatter
 *
 * EPIC 5 PHASE A PART 5
 *
 * Formats reports for display.
 */
import type { Report } from './types';
import { getReportTypeLabel, getReportStatusLabel } from './types';

export interface FormattedReport {
  title: string;
  summary: string;
  sections: string[];
  insights: string[];
  recommendations: string[];
  confidence: number;
  raw: Report;
}

export class ReportFormatter {
  format(report: Report): FormattedReport {
    return {
      title: report.title,
      summary: `${getReportTypeLabel(report.type)} — Generated at ${report.generatedAt} — Confidence: ${(report.confidence * 100).toFixed(0)}%`,
      sections: report.sections.map((s) => `${s.title} (${s.widgetIds.length} widgets, ${s.insights.length} insights)`),
      insights: report.insights.map((i) => `[${i.severity}] ${i.title}: ${i.description}`),
      recommendations: report.recommendations,
      confidence: report.confidence,
      raw: report,
    };
  }

  formatCompact(report: Report): string {
    const parts: string[] = [];
    parts.push(`[${getReportTypeLabel(report.type)}] ${report.title}`);
    parts.push(`Status: ${getReportStatusLabel(report.status)} | Sections: ${report.sections.length} | Insights: ${report.insights.length} | Confidence: ${(report.confidence * 100).toFixed(0)}%`);
    return parts.join('\n');
  }

  formatSummary(report: Report): string {
    const lines: string[] = [];
    lines.push(report.title);
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Time Range: ${report.timeRange.preset}`);
    lines.push(`Confidence: ${(report.confidence * 100).toFixed(0)}%`);
    lines.push(`Sections: ${report.sections.length}`);
    lines.push(`Widgets: ${report.widgets.length}`);
    lines.push(`Charts: ${report.charts.length}`);
    lines.push(`Tables: ${report.tables.length}`);
    lines.push(`Insights: ${report.insights.length}`);
    lines.push(`Recommendations: ${report.recommendations.length}`);
    return lines.join('\n');
  }
}
