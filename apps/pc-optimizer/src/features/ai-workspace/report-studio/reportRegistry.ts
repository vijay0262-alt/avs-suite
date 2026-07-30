/**
 * AI Report Studio — Report Registry
 *
 * EPIC 5 PHASE A PART 5
 *
 * Central registry for report definitions. Supports plugin architecture.
 */
import type { ReportDefinition, ReportType, ReportPlugin } from './types';
import { createDefaultReportDefinitions } from './types';

export class ReportRegistry {
  private _definitions: Map<ReportType, ReportDefinition> = new Map();

  constructor(definitions?: ReportDefinition[]) {
    const initial = definitions ?? createDefaultReportDefinitions();
    for (const def of initial) {
      this._definitions.set(def.type, def);
    }
  }

  register(definition: ReportDefinition): boolean {
    if (this._definitions.has(definition.type)) return false;
    this._definitions.set(definition.type, definition);
    return true;
  }

  unregister(type: ReportType): boolean {
    return this._definitions.delete(type);
  }

  get(type: ReportType): ReportDefinition | null {
    return this._definitions.get(type) ?? null;
  }

  getAll(): ReportDefinition[] {
    return Array.from(this._definitions.values());
  }

  getByCategory(category: string): ReportDefinition[] {
    return this.getAll().filter((d) => d.category === category);
  }

  has(type: ReportType): boolean {
    return this._definitions.has(type);
  }

  count(): number {
    return this._definitions.size;
  }

  registerPlugin(plugin: ReportPlugin): void {
    const defs = plugin.getReportDefinitions();
    for (const def of defs) {
      this.register(def);
    }
  }
}
