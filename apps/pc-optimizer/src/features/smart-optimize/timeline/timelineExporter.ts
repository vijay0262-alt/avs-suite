/**
 * Unified Timeline & Activity Center — Exporter
 *
 * Exports timeline items, statistics, and analytics in various formats
 * with plugin extensibility.
 */
import type {
  TimelineItem,
  TimelineStatistics,
  TimelineAnalytics,
  TimelineExport,
  ExportFormat,
  ExportPlugin,
  TimelineFilter,
  TimelineConfiguration,
} from './types';
import { generateExportId } from './types';
import { TimelineFormatter } from './timelineFormatter';

export class TimelineExporter {
  private _config: TimelineConfiguration;
  private _formatter: TimelineFormatter;
  private _plugins: ExportPlugin[] = [];

  constructor(config: TimelineConfiguration) {
    this._config = config;
    this._formatter = new TimelineFormatter();
  }

  registerPlugin(plugin: ExportPlugin): boolean {
    if (this._plugins.some((p) => p.getPluginName() === plugin.getPluginName())) {
      return false;
    }
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  unregisterPlugin(pluginName: string): boolean {
    const idx = this._plugins.findIndex((p) => p.getPluginName() === pluginName);
    if (idx === -1) return false;
    this._plugins.splice(idx, 1);
    return true;
  }

  getSupportedFormats(): ExportFormat[] {
    const builtIn: ExportFormat[] = ['json', 'markdown', 'csv', 'pdf_ready'];
    const pluginFormats = this._plugins
      .filter((p) => p.isAvailable())
      .map((p) => p.getFormat());
    return [...new Set([...builtIn, ...pluginFormats])];
  }

  exportItems(
    items: TimelineItem[],
    format: ExportFormat,
    filter: TimelineFilter | null = null,
  ): TimelineExport {
    // Check plugins first
    for (const plugin of this._plugins) {
      if (!plugin.isAvailable()) continue;
      if (plugin.getFormat() === format) {
        return plugin.export(items, filter);
      }
    }

    // Built-in formats
    const content = this._formatter.formatItems(items, format, filter);
    return {
      id: generateExportId(),
      format,
      content,
      metadata: {
        exportedAt: new Date().toISOString(),
        itemCount: items.length,
        formatVersion: this._config.configVersion,
        byteSize: content.length,
        filtersApplied: filter,
        futureMetadata: {},
      },
      futureMetadata: {},
    };
  }

  exportStatistics(stats: TimelineStatistics, format: ExportFormat): TimelineExport {
    const content = this._formatter.formatStatistics(stats, format);
    return {
      id: generateExportId(),
      format,
      content,
      metadata: {
        exportedAt: new Date().toISOString(),
        itemCount: 1,
        formatVersion: this._config.configVersion,
        byteSize: content.length,
        filtersApplied: null,
        futureMetadata: {},
      },
      futureMetadata: {},
    };
  }

  exportAnalytics(analytics: TimelineAnalytics, format: ExportFormat): TimelineExport {
    const content = this._formatter.formatAnalytics(analytics, format);
    return {
      id: generateExportId(),
      format,
      content,
      metadata: {
        exportedAt: new Date().toISOString(),
        itemCount: 1,
        formatVersion: this._config.configVersion,
        byteSize: content.length,
        filtersApplied: null,
        futureMetadata: {},
      },
      futureMetadata: {},
    };
  }

  exportAll(
    items: TimelineItem[],
    filter: TimelineFilter | null = null,
  ): Record<string, TimelineExport> {
    const formats: ExportFormat[] = ['json', 'markdown', 'csv', 'pdf_ready'];
    const results: Record<string, TimelineExport> = {};
    for (const fmt of formats) {
      results[fmt] = this.exportItems(items, fmt, filter);
    }
    return results;
  }
}
