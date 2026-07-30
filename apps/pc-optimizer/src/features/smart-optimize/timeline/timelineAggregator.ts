/**
 * Unified Timeline & Activity Center — Aggregator
 *
 * Aggregates collected events, deduplicates, and prepares them
 * for insertion into the timeline store.
 */
import type {
  TimelineEventInput,
  TimelineItem,
  TimelineConfiguration,
} from './types';
import {
  generateTimelineItemId,
  extractSearchKeywords,
} from './types';

export class TimelineAggregator {
  private _config: TimelineConfiguration;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  aggregate(inputs: TimelineEventInput[]): TimelineItem[] {
    const items: TimelineItem[] = [];
    const seen = new Set<string>();

    for (const input of inputs) {
      const dedupKey = this._dedupKey(input);
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const item = this._toItem(input);
      items.push(item);
    }

    items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return items;
  }

  aggregateSingle(input: TimelineEventInput): TimelineItem {
    return this._toItem(input);
  }

  merge(existing: TimelineItem[], incoming: TimelineItem[]): TimelineItem[] {
    const map = new Map<string, TimelineItem>();
    for (const item of existing) map.set(item.id, item);
    for (const item of incoming) {
      if (!map.has(item.id)) map.set(item.id, item);
    }
    return Array.from(map.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private _toItem(input: TimelineEventInput): TimelineItem {
    const now = new Date().toISOString();
    const keywords = input.searchKeywords ?? extractSearchKeywords(input);
    return {
      id: generateTimelineItemId(),
      timestamp: now,
      category: input.category,
      eventType: input.eventType,
      title: this._truncate(input.title, this._config.formattingRules.maxTitleLength),
      summary: this._truncate(input.summary, this._config.formattingRules.maxSummaryLength),
      details: input.details ?? {},
      sourceModule: input.sourceModule,
      relatedOperation: input.relatedOperation ?? null,
      relatedRecommendation: input.relatedRecommendation ?? null,
      relatedSnapshot: input.relatedSnapshot ?? null,
      severity: input.severity ?? 'info',
      status: input.status ?? 'active',
      confidence: input.confidence ?? null,
      tags: input.tags ?? [],
      searchKeywords: keywords,
      evidence: input.evidence ?? [],
      futureMetadata: input.futureMetadata ?? {},
    };
  }

  private _dedupKey(input: TimelineEventInput): string {
    return `${input.eventType}|${input.sourceModule}|${input.relatedOperation ?? ''}|${input.relatedRecommendation ?? ''}`;
  }

  private _truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 3) + '...';
  }
}
