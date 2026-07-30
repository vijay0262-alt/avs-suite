/**
 * Unified Timeline & Activity Center — Filter Engine
 *
 * Filters timeline items by category, module, date range, severity,
 * status, tags, confidence, related entities, and custom filters.
 */
import type {
  TimelineItem,
  TimelineFilter,
  TimelineConfiguration,
} from './types';
import { severityToScore } from './types';

export class TimelineFilterEngine {
  private _config: TimelineConfiguration;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  filter(items: TimelineItem[], filter: TimelineFilter): TimelineItem[] {
    let result = items;

    if (filter.categories && filter.categories.length > 0) {
      const set = new Set(filter.categories);
      result = result.filter((i) => set.has(i.category));
    }

    if (filter.modules && filter.modules.length > 0) {
      const set = new Set(filter.modules);
      result = result.filter((i) => set.has(i.sourceModule));
    }

    if (filter.eventTypes && filter.eventTypes.length > 0) {
      const set = new Set(filter.eventTypes);
      result = result.filter((i) => set.has(i.eventType));
    }

    if (filter.dateRange) {
      const start = filter.dateRange.start;
      const end = filter.dateRange.end;
      result = result.filter((i) => i.timestamp >= start && i.timestamp <= end);
    }

    if (filter.severities && filter.severities.length > 0) {
      const set = new Set(filter.severities);
      result = result.filter((i) => set.has(i.severity));
    }

    if (filter.statuses && filter.statuses.length > 0) {
      const set = new Set(filter.statuses);
      result = result.filter((i) => set.has(i.status));
    }

    if (filter.tags && filter.tags.length > 0) {
      const tagSet = new Set(filter.tags.map((t) => t.toLowerCase()));
      result = result.filter((i) => i.tags.some((t) => tagSet.has(t.toLowerCase())));
    }

    if (filter.minConfidence !== undefined) {
      result = result.filter((i) => i.confidence !== null && i.confidence >= filter.minConfidence!);
    }

    if (filter.maxConfidence !== undefined) {
      result = result.filter((i) => i.confidence !== null && i.confidence <= filter.maxConfidence!);
    }

    if (filter.relatedOperation) {
      result = result.filter((i) => i.relatedOperation === filter.relatedOperation);
    }

    if (filter.relatedRecommendation) {
      result = result.filter((i) => i.relatedRecommendation === filter.relatedRecommendation);
    }

    if (filter.relatedSnapshot) {
      result = result.filter((i) => i.relatedSnapshot === filter.relatedSnapshot);
    }

    if (filter.custom) {
      result = result.filter(filter.custom);
    }

    if (this._config.filterRules.maxFilterResults > 0) {
      result = result.slice(0, this._config.filterRules.maxFilterResults);
    }

    return result;
  }

  filterByCategory(items: TimelineItem[], category: TimelineFilter['categories']): TimelineItem[] {
    if (!category) return items;
    const set = new Set(category);
    return items.filter((i) => set.has(i.category));
  }

  filterByModule(items: TimelineItem[], module: string): TimelineItem[] {
    return items.filter((i) => i.sourceModule === module);
  }

  filterByDateRange(items: TimelineItem[], start: string, end: string): TimelineItem[] {
    return items.filter((i) => i.timestamp >= start && i.timestamp <= end);
  }

  filterBySeverity(items: TimelineItem[], minSeverity: TimelineFilter['severities']): TimelineItem[] {
    if (!minSeverity || minSeverity.length === 0) return items;
    const minScore = Math.min(...minSeverity.map(severityToScore));
    return items.filter((i) => severityToScore(i.severity) >= minScore);
  }

  filterByTags(items: TimelineItem[], tags: string[]): TimelineItem[] {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    return items.filter((i) => i.tags.some((t) => tagSet.has(t.toLowerCase())));
  }

  countByFilter(items: TimelineItem[], filter: TimelineFilter): number {
    return this.filter(items, filter).length;
  }
}
