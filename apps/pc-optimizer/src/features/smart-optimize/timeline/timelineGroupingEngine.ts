/**
 * Unified Timeline & Activity Center — Grouping Engine
 *
 * Groups timeline items by day, week, month, optimization session,
 * maintenance session, automation session, recovery session,
 * AI session, and custom groups.
 */
import type {
  TimelineItem,
  TimelineGroup,
  TimelineGroupingType,
  TimelineGroupingResult,
  TimelineConfiguration,
} from './types';
import { getCategoryLabel } from './types';

export class TimelineGroupingEngine {
  private _config: TimelineConfiguration;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  group(items: TimelineItem[], type: TimelineGroupingType): TimelineGroupingResult {
    switch (type) {
      case 'day':
        return this._groupByDay(items);
      case 'week':
        return this._groupByWeek(items);
      case 'month':
        return this._groupByMonth(items);
      case 'optimization_session':
        return this._groupBySession(items, 'optimization', 'optimization_session', 'Optimization Session');
      case 'maintenance_session':
        return this._groupBySession(items, 'maintenance', 'maintenance_session', 'Maintenance Session');
      case 'automation_session':
        return this._groupBySession(items, 'automation', 'automation_session', 'Automation Session');
      case 'recovery_session':
        return this._groupBySession(items, 'recovery', 'recovery_session', 'Recovery Session');
      case 'ai_session':
        return this._groupBySession(items, 'ai_interaction', 'ai_session', 'AI Session');
      case 'custom':
        return this._groupByCustom(items);
      default:
        return { groups: [], totalItems: items.length, ungrouped: items };
    }
  }

  private _groupByDay(items: TimelineItem[]): TimelineGroupingResult {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const day = item.timestamp.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(item);
    }
    return this._buildGroups(map, 'day', (key) => key);
  }

  private _groupByWeek(items: TimelineItem[]): TimelineGroupingResult {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const date = new Date(item.timestamp);
      const weekStart = this._getWeekStart(date);
      const key = weekStart.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return this._buildGroups(map, 'week', (key) => `Week of ${key}`);
  }

  private _groupByMonth(items: TimelineItem[]): TimelineGroupingResult {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const month = item.timestamp.slice(0, 7);
      if (!map.has(month)) map.set(month, []);
      map.get(month)!.push(item);
    }
    return this._buildGroups(map, 'month', (key) => key);
  }

  private _groupBySession(
    items: TimelineItem[],
    category: string,
    type: TimelineGroupingType,
    labelPrefix: string,
  ): TimelineGroupingResult {
    const map = new Map<string, TimelineItem[]>();
    const ungrouped: TimelineItem[] = [];
    for (const item of items) {
      if (item.category === category) {
        const key = item.relatedOperation ?? item.id;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      } else {
        ungrouped.push(item);
      }
    }
    const groups = this._buildGroups(map, type, (key) => `${labelPrefix} ${key}`).groups;
    return { groups, totalItems: items.length, ungrouped };
  }

  private _groupByCustom(items: TimelineItem[]): TimelineGroupingResult {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const key = (item.details['customGroup'] as string) ?? 'ungrouped';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return this._buildGroups(map, 'custom', (key) => key);
  }

  private _buildGroups(
    map: Map<string, TimelineItem[]>,
    type: TimelineGroupingType,
    labelFn: (key: string) => string,
  ): TimelineGroupingResult {
    const groups: TimelineGroup[] = [];
    let total = 0;
    for (const [key, items] of map) {
      items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      groups.push({
        key,
        label: labelFn(key),
        type,
        items,
        count: items.length,
        startTime: items[0]?.timestamp ?? new Date().toISOString(),
        endTime: items[items.length - 1]?.timestamp ?? new Date().toISOString(),
        futureMetadata: {},
      });
      total += items.length;
    }
    groups.sort((a, b) => {
      const cmp = b.startTime.localeCompare(a.startTime);
      if (cmp !== 0) return cmp;
      return b.count - a.count;
    });
    if (this._config.groupingRules.maxGroups > 0 && groups.length > this._config.groupingRules.maxGroups) {
      groups.length = this._config.groupingRules.maxGroups;
    }
    return { groups, totalItems: total, ungrouped: [] };
  }

  private _getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  getGroupSummary(group: TimelineGroup): Record<string, unknown> {
    const categories = new Map<string, number>();
    for (const item of group.items) {
      const label = getCategoryLabel(item.category);
      categories.set(label, (categories.get(label) ?? 0) + 1);
    }
    return {
      label: group.label,
      count: group.count,
      startTime: group.startTime,
      endTime: group.endTime,
      categories: Object.fromEntries(categories),
    };
  }
}
