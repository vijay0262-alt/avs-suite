/**
 * Simulation Exporter — exports simulation results in multiple formats.
 *
 * Supports: JSON, Markdown, PDF-ready data model, Future export providers.
 */
import type {
  SimulationResult,
  SimulationComparison,
  SimulationExport,
  SimulationExportMetadata,
  SimulationConfiguration,
  ExportFormat,
  ExportPlugin,
} from './types';
import { SimulationFormatter } from './simulationFormatter';

export class SimulationExporter {
  private _config: SimulationConfiguration;
  private _formatter: SimulationFormatter;
  private _plugins: ExportPlugin[] = [];

  constructor(config: SimulationConfiguration) {
    this._config = config;
    this._formatter = new SimulationFormatter(config);
  }

  registerPlugin(plugin: ExportPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  export(simulation: SimulationResult, format: ExportFormat): SimulationExport {
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getFormat() === format) {
        const result = plugin.export(simulation, this._config);
        if (result) return result;
      }
    }

    const content = this._formatter.format(simulation, format);
    const metadata: SimulationExportMetadata = {
      exportedAt: new Date().toISOString(),
      simulationId: simulation.id,
      formatVersion: '1.0.0',
      byteSize: content.length,
      futureMetadata: {},
    };

    return {
      format,
      content,
      metadata,
      futureMetadata: {},
    };
  }

  exportComparison(comparison: SimulationComparison, format: ExportFormat): SimulationExport {
    const content = this._formatter.formatComparison(comparison, format);
    const metadata: SimulationExportMetadata = {
      exportedAt: new Date().toISOString(),
      simulationId: comparison.id,
      formatVersion: '1.0.0',
      byteSize: content.length,
      futureMetadata: {},
    };

    return {
      format,
      content,
      metadata,
      futureMetadata: {},
    };
  }

  exportAll(simulation: SimulationResult): SimulationExport[] {
    const formats: ExportFormat[] = ['json', 'markdown', 'pdf_ready'];
    return formats.map((f) => this.export(simulation, f));
  }

  getSupportedFormats(): ExportFormat[] {
    const formats: ExportFormat[] = ['json', 'markdown', 'pdf_ready'];
    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        formats.push(plugin.getFormat());
      }
    }
    return [...new Set(formats)];
  }

  get formatter(): SimulationFormatter { return this._formatter; }
  get config(): SimulationConfiguration { return this._config; }
}
