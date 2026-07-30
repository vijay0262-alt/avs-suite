/**
 * AI Report Studio — Filter Engine
 *
 * EPIC 5 PHASE A PART 5
 *
 * Applies filters to report data. Supports date range, device profile,
 * goal, optimization type, automation, maintenance, recovery, health
 * score, tags, severity, and custom filters.
 */
import type { ReportFilter, ReportFilterSet, CopilotContext } from './types';

export class ReportFilterEngine {
  apply(filters: ReportFilterSet, data: Record<string, unknown>[]): Record<string, unknown>[] {
    if (filters.filters.length === 0) return data;
    return data.filter((item) => this._matchesAll(item, filters.filters));
  }

  private _matchesAll(item: Record<string, unknown>, filters: ReportFilter[]): boolean {
    return filters.every((f) => this._matches(item, f));
  }

  private _matches(item: Record<string, unknown>, filter: ReportFilter): boolean {
    const fieldValue = item[filter.type];

    switch (filter.operator) {
      case 'eq': return fieldValue === filter.value;
      case 'neq': return fieldValue !== filter.value;
      case 'gt': return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue > filter.value;
      case 'lt': return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue < filter.value;
      case 'gte': return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue >= filter.value;
      case 'lte': return typeof fieldValue === 'number' && typeof filter.value === 'number' && fieldValue <= filter.value;
      case 'contains':
        if (typeof fieldValue === 'string' && typeof filter.value === 'string') return fieldValue.includes(filter.value);
        if (Array.isArray(fieldValue)) return fieldValue.includes(filter.value);
        return false;
      case 'in':
        if (Array.isArray(filter.value)) return filter.value.includes(fieldValue);
        return false;
      case 'between':
        if (Array.isArray(filter.value) && filter.value.length === 2 && typeof fieldValue === 'number') {
          return fieldValue >= (filter.value[0] as number) && fieldValue <= (filter.value[1] as number);
        }
        return false;
      default:
        return true;
    }
  }

  createDateRangeFilter(start: string, end: string): ReportFilter {
    return {
      type: 'date_range',
      value: [start, end],
      operator: 'between',
      futureMetadata: {},
    };
  }

  createHealthScoreFilter(min: number, max: number): ReportFilter {
    return {
      type: 'health_score',
      value: [min, max],
      operator: 'between',
      futureMetadata: {},
    };
  }

  createSeverityFilter(severities: string[]): ReportFilter {
    return {
      type: 'severity',
      value: severities,
      operator: 'in',
      futureMetadata: {},
    };
  }

  createTagFilter(tag: string): ReportFilter {
    return {
      type: 'tags',
      value: tag,
      operator: 'contains',
      futureMetadata: {},
    };
  }
}
