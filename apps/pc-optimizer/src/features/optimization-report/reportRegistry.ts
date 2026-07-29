/**
 * Report Registry — manages intelligence reports.
 */
import type { IntelligenceReport } from './types';

export class ReportRegistry {
  private _reports: Map<string, IntelligenceReport> = new Map();

  register(report: IntelligenceReport): boolean {
    if (this._reports.has(report.id)) return false;
    this._reports.set(report.id, report);
    return true;
  }

  unregister(reportId: string): boolean {
    return this._reports.delete(reportId);
  }

  get(reportId: string): IntelligenceReport | undefined {
    return this._reports.get(reportId);
  }

  getByExecution(executionId: string): IntelligenceReport | undefined {
    for (const report of this._reports.values()) {
      if (report.executionId === executionId) return report;
    }
    return undefined;
  }

  getByPlan(planId: string): IntelligenceReport[] {
    const results: IntelligenceReport[] = [];
    for (const report of this._reports.values()) {
      if (report.planId === planId) results.push(report);
    }
    return results;
  }

  getAll(): IntelligenceReport[] {
    return Array.from(this._reports.values());
  }

  has(reportId: string): boolean {
    return this._reports.has(reportId);
  }

  get count(): number {
    return this._reports.size;
  }

  clear(): void {
    this._reports.clear();
  }
}
