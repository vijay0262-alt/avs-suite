/**
 * Unified Timeline & Activity Center — Search Engine
 *
 * Searches timeline items by title, summary, tags, event type,
 * module, operation ID, recommendation ID, and custom fields.
 */
import type {
  TimelineItem,
  TimelineSearchQuery,
  TimelineSearchResult,
  TimelineConfiguration,
} from './types';

export class TimelineSearchEngine {
  private _config: TimelineConfiguration;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  search(items: TimelineItem[], query: TimelineSearchQuery): TimelineSearchResult {
    const start = performance.now();
    let results = items;

    if (query.text) {
      const lower = query.text.toLowerCase();
      results = results.filter((i) =>
        i.title.toLowerCase().includes(lower) ||
        i.summary.toLowerCase().includes(lower) ||
        i.searchKeywords.some((k) => k.includes(lower)) ||
        i.tags.some((t) => t.toLowerCase().includes(lower)),
      );
    }

    if (query.title) {
      const lower = query.title.toLowerCase();
      results = results.filter((i) => i.title.toLowerCase().includes(lower));
    }

    if (query.summary) {
      const lower = query.summary.toLowerCase();
      results = results.filter((i) => i.summary.toLowerCase().includes(lower));
    }

    if (query.tags && query.tags.length > 0) {
      const tagSet = new Set(query.tags.map((t) => t.toLowerCase()));
      results = results.filter((i) => i.tags.some((t) => tagSet.has(t.toLowerCase())));
    }

    if (query.eventTypes && query.eventTypes.length > 0) {
      const set = new Set(query.eventTypes);
      results = results.filter((i) => set.has(i.eventType));
    }

    if (query.modules && query.modules.length > 0) {
      const set = new Set(query.modules);
      results = results.filter((i) => set.has(i.sourceModule));
    }

    if (query.operationId) {
      results = results.filter((i) => i.relatedOperation === query.operationId);
    }

    if (query.recommendationId) {
      results = results.filter((i) => i.relatedRecommendation === query.recommendationId);
    }

    if (query.deviceProfile) {
      const lower = query.deviceProfile.toLowerCase();
      results = results.filter((i) =>
        i.details['deviceProfile']?.toString().toLowerCase().includes(lower) ||
        i.tags.some((t) => t.toLowerCase().includes(lower)),
      );
    }

    if (query.custom) {
      results = results.filter(query.custom);
    }

    const elapsed = performance.now() - start;
    return {
      items: results,
      totalMatches: results.length,
      query,
      durationMs: elapsed,
    };
  }

  searchByText(items: TimelineItem[], text: string): TimelineItem[] {
    const lower = text.toLowerCase();
    return items.filter((i) =>
      i.title.toLowerCase().includes(lower) ||
      i.summary.toLowerCase().includes(lower) ||
      i.searchKeywords.some((k) => k.includes(lower)),
    );
  }

  searchByTag(items: TimelineItem[], tag: string): TimelineItem[] {
    const lower = tag.toLowerCase();
    return items.filter((i) => i.tags.some((t) => t.toLowerCase() === lower));
  }

  searchByOperation(items: TimelineItem[], operationId: string): TimelineItem[] {
    return items.filter((i) => i.relatedOperation === operationId);
  }

  searchByRecommendation(items: TimelineItem[], recommendationId: string): TimelineItem[] {
    return items.filter((i) => i.relatedRecommendation === recommendationId);
  }
}
