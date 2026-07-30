/**
 * Optimization Recovery & Rollback Center — Exporter
 *
 * Exports recovery records, plans, and comparisons in JSON, Markdown,
 * and PDF-ready formats. Supports plugin architecture for future formats.
 */
import type {
  RecoveryRecord,
  RecoveryPlan,
  RecoveryComparison,
  RecoveryExport,
  ExportFormat,
  RecoveryConfiguration,
  ExportPlugin,
} from './types';
import { RecoveryFormatter } from './recoveryFormatter';

export class RecoveryExporter {
  private _config: RecoveryConfiguration;
  private _formatter: RecoveryFormatter;
  private _plugins: ExportPlugin[] = [];

  constructor(config: RecoveryConfiguration) {
    this._config = config;
    this._formatter = new RecoveryFormatter();
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
  }

  registerPlugin(plugin: ExportPlugin): boolean {
    if (this._plugins.some((p) => p.getPluginName() === plugin.getPluginName())) return false;
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => b.getPriority() - a.getPriority());
    return true;
  }

  unregisterPlugin(name: string): boolean {
    const idx = this._plugins.findIndex((p) => p.getPluginName() === name);
    if (idx === -1) return false;
    this._plugins.splice(idx, 1);
    return true;
  }

  getSupportedFormats(): ExportFormat[] {
    const builtin: ExportFormat[] = ['json', 'markdown', 'pdf_ready'];
    const pluginFormats = this._plugins.filter((p) => p.isAvailable()).map((p) => p.getFormat());
    return [...builtin, ...pluginFormats];
  }

  exportRecovery(
    recovery: RecoveryRecord,
    plan: RecoveryPlan | null,
    format: ExportFormat,
  ): RecoveryExport {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getFormat() === format) {
        return plugin.export(recovery, plan);
      }
    }

    const content = this._formatter.formatRecovery(recovery, plan, format);
    return {
      format,
      content,
      metadata: {
        exportedAt: new Date().toISOString(),
        recoveryId: recovery.id,
        formatVersion: '1.0.0',
        byteSize: content.length,
        futureMetadata: {},
      },
      futureMetadata: {},
    };
  }

  exportComparison(comparison: RecoveryComparison, format: ExportFormat): RecoveryExport {
    const content = this._formatter.formatComparison(comparison, format);
    return {
      format,
      content,
      metadata: {
        exportedAt: new Date().toISOString(),
        recoveryId: comparison.id,
        formatVersion: '1.0.0',
        byteSize: content.length,
        futureMetadata: {},
      },
      futureMetadata: {},
    };
  }

  exportAll(
    recovery: RecoveryRecord,
    plan: RecoveryPlan | null,
  ): Record<ExportFormat, RecoveryExport> {
    const results: Partial<Record<ExportFormat, RecoveryExport>> = {};
    for (const format of this.getSupportedFormats()) {
      results[format] = this.exportRecovery(recovery, plan, format);
    }
    return results as Record<ExportFormat, RecoveryExport>;
  }
}
