/**
 * AI Report Studio — Comparison Engine
 *
 * EPIC 5 PHASE A PART 5
 *
 * Compares reports: time periods, goals, optimization plans, device
 * profiles, health scores, recovery sessions, automation results.
 */
import type { Report, ReportComparison, ComparisonDifference, ComparisonType } from './types';
import { generateComparisonId } from './types';

export class ReportComparisonEngine {
  compare(reportA: Report, reportB: Report, type: ComparisonType = 'time_periods'): ReportComparison {
    const differences = this._findDifferences(reportA, reportB);
    const summary = this._generateSummary(reportA, reportB, differences, type);

    return {
      id: generateComparisonId(),
      type,
      reportA,
      reportB,
      differences,
      summary,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _findDifferences(a: Report, b: Report): ComparisonDifference[] {
    const diffs: ComparisonDifference[] = [];

    // Compare confidence
    if (a.confidence !== b.confidence) {
      diffs.push({
        field: 'confidence',
        valueA: a.confidence,
        valueB: b.confidence,
        delta: b.confidence - a.confidence,
        description: `Confidence changed from ${a.confidence.toFixed(2)} to ${b.confidence.toFixed(2)}`,
        futureMetadata: {},
      });
    }

    // Compare insights count
    if (a.insights.length !== b.insights.length) {
      diffs.push({
        field: 'insights_count',
        valueA: a.insights.length,
        valueB: b.insights.length,
        delta: b.insights.length - a.insights.length,
        description: `Insights count changed from ${a.insights.length} to ${b.insights.length}`,
        futureMetadata: {},
      });
    }

    // Compare recommendations count
    if (a.recommendations.length !== b.recommendations.length) {
      diffs.push({
        field: 'recommendations_count',
        valueA: a.recommendations.length,
        valueB: b.recommendations.length,
        delta: b.recommendations.length - a.recommendations.length,
        description: `Recommendations count changed from ${a.recommendations.length} to ${b.recommendations.length}`,
        futureMetadata: {},
      });
    }

    // Compare sections count
    if (a.sections.length !== b.sections.length) {
      diffs.push({
        field: 'sections_count',
        valueA: a.sections.length,
        valueB: b.sections.length,
        delta: b.sections.length - a.sections.length,
        description: `Sections count changed from ${a.sections.length} to ${b.sections.length}`,
        futureMetadata: {},
      });
    }

    // Compare charts count
    if (a.charts.length !== b.charts.length) {
      diffs.push({
        field: 'charts_count',
        valueA: a.charts.length,
        valueB: b.charts.length,
        delta: b.charts.length - a.charts.length,
        description: `Charts count changed from ${a.charts.length} to ${b.charts.length}`,
        futureMetadata: {},
      });
    }

    // Compare widgets count
    if (a.widgets.length !== b.widgets.length) {
      diffs.push({
        field: 'widgets_count',
        valueA: a.widgets.length,
        valueB: b.widgets.length,
        delta: b.widgets.length - a.widgets.length,
        description: `Widgets count changed from ${a.widgets.length} to ${b.widgets.length}`,
        futureMetadata: {},
      });
    }

    return diffs;
  }

  private _generateSummary(a: Report, b: Report, diffs: ComparisonDifference[], type: ComparisonType): string {
    if (diffs.length === 0) {
      return `No significant differences found between "${a.title}" and "${b.title}".`;
    }

    const improvements = diffs.filter((d) => typeof d.delta === 'number' && d.delta > 0).length;
    const declines = diffs.filter((d) => typeof d.delta === 'number' && d.delta < 0).length;

    return `Comparison of "${a.title}" vs "${b.title}" (${type}): ${diffs.length} difference(s) found — ${improvements} improvement(s), ${declines} decline(s).`;
  }
}
