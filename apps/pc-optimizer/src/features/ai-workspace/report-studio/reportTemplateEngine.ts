/**
 * AI Report Studio — Template Engine
 *
 * EPIC 5 PHASE A PART 5
 *
 * Manages report templates. Supports enterprise templates and plugin architecture.
 */
import type { ReportTemplate, ReportType, ReportPlugin } from './types';
import { createDefaultTemplates } from './types';

export class ReportTemplateEngine {
  private _templates: Map<string, ReportTemplate> = new Map();

  constructor(templates?: ReportTemplate[]) {
    const initial = templates ?? createDefaultTemplates();
    for (const t of initial) {
      this._templates.set(t.id, t);
    }
  }

  register(template: ReportTemplate): boolean {
    if (this._templates.has(template.id)) return false;
    this._templates.set(template.id, template);
    return true;
  }

  unregister(id: string): boolean {
    return this._templates.delete(id);
  }

  get(id: string): ReportTemplate | null {
    return this._templates.get(id) ?? null;
  }

  getByReportType(type: ReportType): ReportTemplate | null {
    for (const t of this._templates.values()) {
      if (t.reportType === type) return t;
    }
    return null;
  }

  getAll(): ReportTemplate[] {
    return Array.from(this._templates.values());
  }

  getEnterpriseTemplates(): ReportTemplate[] {
    return this.getAll().filter((t) => t.isEnterprise);
  }

  has(id: string): boolean {
    return this._templates.has(id);
  }

  count(): number {
    return this._templates.size;
  }

  registerPlugin(plugin: ReportPlugin): void {
    const templates = plugin.getTemplates();
    for (const t of templates) {
      this.register(t);
    }
  }
}
