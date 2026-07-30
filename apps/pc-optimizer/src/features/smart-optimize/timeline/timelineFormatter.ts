/**
 * Unified Timeline & Activity Center — Formatter
 *
 * Formats timeline items, statistics, and analytics into
 * JSON, Markdown, CSV, and PDF-ready data models.
 */
import type {
  TimelineItem,
  TimelineStatistics,
  TimelineAnalytics,
  ExportFormat,
  TimelineFilter,
} from './types';
import {
  getCategoryLabel,
  getEventTypeLabel,
  getSeverityLabel,
  getStatusLabel,
} from './types';

export class TimelineFormatter {
  formatItems(items: TimelineItem[], format: ExportFormat, filter: TimelineFilter | null = null): string {
    switch (format) {
      case 'json':
        return this._itemsToJson(items, filter);
      case 'markdown':
        return this._itemsToMarkdown(items);
      case 'csv':
        return this._itemsToCsv(items);
      case 'pdf_ready':
        return this._itemsToPdfReady(items, filter);
      default:
        return this._itemsToJson(items, filter);
    }
  }

  formatStatistics(stats: TimelineStatistics, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(stats, null, 2);
      case 'markdown':
        return this._statsToMarkdown(stats);
      case 'csv':
        return this._statsToCsv(stats);
      case 'pdf_ready':
        return JSON.stringify({ type: 'statistics', data: stats }, null, 2);
      default:
        return JSON.stringify(stats, null, 2);
    }
  }

  formatAnalytics(analytics: TimelineAnalytics, format: ExportFormat): string {
    switch (format) {
      case 'json':
        return JSON.stringify(analytics, null, 2);
      case 'markdown':
        return this._analyticsToMarkdown(analytics);
      case 'csv':
        return this._analyticsToCsv(analytics);
      case 'pdf_ready':
        return JSON.stringify({ type: 'analytics', data: analytics }, null, 2);
      default:
        return JSON.stringify(analytics, null, 2);
    }
  }

  // ── JSON ──────────────────────────────────────────────────

  private _itemsToJson(items: TimelineItem[], filter: TimelineFilter | null): string {
    return JSON.stringify({
      type: 'timeline',
      itemCount: items.length,
      filter: filter ? this._serializeFilter(filter) : null,
      items,
    }, null, 2);
  }

  private _serializeFilter(filter: TimelineFilter): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (filter.categories) result.categories = filter.categories;
    if (filter.modules) result.modules = filter.modules;
    if (filter.eventTypes) result.eventTypes = filter.eventTypes;
    if (filter.dateRange) result.dateRange = filter.dateRange;
    if (filter.severities) result.severities = filter.severities;
    if (filter.statuses) result.statuses = filter.statuses;
    if (filter.tags) result.tags = filter.tags;
    return result;
  }

  // ── Markdown ──────────────────────────────────────────────

  private _itemsToMarkdown(items: TimelineItem[]): string {
    const lines: string[] = ['# Timeline Export', ''];
    lines.push(`**Total Items:** ${items.length}`, '');
    lines.push('| Timestamp | Category | Event Type | Severity | Status | Title | Module |');
    lines.push('|-----------|----------|------------|----------|--------|-------|--------|');
    for (const item of items) {
      lines.push(
        `| ${item.timestamp} | ${getCategoryLabel(item.category)} | ${getEventTypeLabel(item.eventType)} | ${getSeverityLabel(item.severity)} | ${getStatusLabel(item.status)} | ${item.title} | ${item.sourceModule} |`,
      );
    }
    return lines.join('\n');
  }

  private _statsToMarkdown(stats: TimelineStatistics): string {
    const lines: string[] = ['# Timeline Statistics', ''];
    lines.push(`**Total Events:** ${stats.totalEvents}`, '');
    lines.push(`**First Event:** ${stats.firstEventTimestamp ?? 'N/A'}`, '');
    lines.push(`**Last Event:** ${stats.lastEventTimestamp ?? 'N/A'}`, '');
    lines.push(`**Average Confidence:** ${(stats.averageConfidence * 100).toFixed(1)}%`, '');
    lines.push('', '## By Category', '');
    for (const [cat, count] of Object.entries(stats.eventsByCategory)) {
      lines.push(`- **${getCategoryLabel(cat as never)}:** ${count}`);
    }
    lines.push('', '## By Severity', '');
    for (const [sev, count] of Object.entries(stats.eventsBySeverity)) {
      lines.push(`- **${getSeverityLabel(sev as never)}:** ${count}`);
    }
    lines.push('', '## By Module', '');
    for (const [mod, count] of Object.entries(stats.eventsByModule)) {
      lines.push(`- **${mod}:** ${count}`);
    }
    return lines.join('\n');
  }

  private _analyticsToMarkdown(analytics: TimelineAnalytics): string {
    const lines: string[] = ['# Timeline Analytics', ''];
    lines.push(`**Generated At:** ${analytics.generatedAt}`, '');
    lines.push(`**Total Events:** ${analytics.totalEvents}`, '');
    lines.push(`**Optimization Count:** ${analytics.optimizationCount}`, '');
    lines.push(`**Maintenance Count:** ${analytics.maintenanceCount}`, '');
    lines.push(`**Recovery Count:** ${analytics.recoveryCount}`, '');
    lines.push(`**Automation Success Rate:** ${(analytics.automationSuccessRate * 100).toFixed(1)}%`, '');
    lines.push(`**Recommendation Acceptance Rate:** ${(analytics.recommendationAcceptanceRate * 100).toFixed(1)}%`, '');
    lines.push('', '## Top Tags', '');
    for (const t of analytics.topTags) {
      lines.push(`- **${t.tag}:** ${t.count}`);
    }
    lines.push('', '## Top Modules', '');
    for (const m of analytics.topModules) {
      lines.push(`- **${m.module}:** ${m.count}`);
    }
    if (analytics.healthTrend.length > 0) {
      lines.push('', '## Health Trend', '');
      lines.push('| Timestamp | Health Score | Delta |');
      lines.push('|-----------|-------------|-------|');
      for (const p of analytics.healthTrend) {
        lines.push(`| ${p.timestamp} | ${p.healthScore} | ${p.delta > 0 ? '+' : ''}${p.delta} |`);
      }
    }
    return lines.join('\n');
  }

  // ── CSV ───────────────────────────────────────────────────

  private _itemsToCsv(items: TimelineItem[]): string {
    const header = 'id,timestamp,category,eventType,title,summary,sourceModule,severity,status,confidence,tags,relatedOperation,relatedRecommendation,relatedSnapshot';
    const rows = items.map((i) =>
      [
        i.id,
        i.timestamp,
        i.category,
        i.eventType,
        this._csvEscape(i.title),
        this._csvEscape(i.summary),
        i.sourceModule,
        i.severity,
        i.status,
        i.confidence ?? '',
        this._csvEscape(i.tags.join(';')),
        i.relatedOperation ?? '',
        i.relatedRecommendation ?? '',
        i.relatedSnapshot ?? '',
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }

  private _statsToCsv(stats: TimelineStatistics): string {
    const lines: string[] = ['metric,value'];
    lines.push(`totalEvents,${stats.totalEvents}`);
    lines.push(`averageConfidence,${stats.averageConfidence}`);
    for (const [cat, count] of Object.entries(stats.eventsByCategory)) {
      lines.push(`category_${cat},${count}`);
    }
    for (const [sev, count] of Object.entries(stats.eventsBySeverity)) {
      lines.push(`severity_${sev},${count}`);
    }
    for (const [mod, count] of Object.entries(stats.eventsByModule)) {
      lines.push(`module_${mod},${count}`);
    }
    return lines.join('\n');
  }

  private _analyticsToCsv(analytics: TimelineAnalytics): string {
    const lines: string[] = ['metric,value'];
    lines.push(`totalEvents,${analytics.totalEvents}`);
    lines.push(`optimizationCount,${analytics.optimizationCount}`);
    lines.push(`maintenanceCount,${analytics.maintenanceCount}`);
    lines.push(`recoveryCount,${analytics.recoveryCount}`);
    lines.push(`automationSuccessRate,${analytics.automationSuccessRate}`);
    lines.push(`recommendationAcceptanceRate,${analytics.recommendationAcceptanceRate}`);
    for (const t of analytics.topTags) {
      lines.push(`tag_${t.tag},${t.count}`);
    }
    for (const m of analytics.topModules) {
      lines.push(`module_${m.module},${m.count}`);
    }
    return lines.join('\n');
  }

  // ── PDF-Ready ─────────────────────────────────────────────

  private _itemsToPdfReady(items: TimelineItem[], filter: TimelineFilter | null): string {
    return JSON.stringify({
      type: 'timeline_pdf_ready',
      itemCount: items.length,
      filter: filter ? this._serializeFilter(filter) : null,
      sections: items.map((i) => ({
        title: i.title,
        subtitle: `${getCategoryLabel(i.category)} • ${getEventTypeLabel(i.eventType)}`,
        timestamp: i.timestamp,
        severity: getSeverityLabel(i.severity),
        status: getStatusLabel(i.status),
        summary: i.summary,
        module: i.sourceModule,
        tags: i.tags,
        evidence: i.evidence,
      })),
    }, null, 2);
  }

  // ── Helpers ───────────────────────────────────────────────

  private _csvEscape(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}
