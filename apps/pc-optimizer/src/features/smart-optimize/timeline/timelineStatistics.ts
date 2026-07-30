/**
 * Unified Timeline & Activity Center — Statistics
 *
 * Computes statistics from timeline items: counts by category, type,
 * severity, status, module, events per day, confidence averages.
 */
import type {
  TimelineItem,
  TimelineStatistics,
  TimelineCategory,
  TimelineSeverity,
  TimelineItemStatus,
} from './types';

export class TimelineStatisticsEngine {
  compute(items: TimelineItem[]): TimelineStatistics {
    const eventsByCategory = {} as Record<TimelineCategory, number>;
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity = {} as Record<TimelineSeverity, number>;
    const eventsByStatus = {} as Record<TimelineItemStatus, number>;
    const eventsByModule: Record<string, number> = {};
    const eventsPerDay: Record<string, number> = {};

    let firstTs: string | null = null;
    let lastTs: string | null = null;
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const item of items) {
      eventsByCategory[item.category] = (eventsByCategory[item.category] ?? 0) + 1;
      eventsByType[item.eventType] = (eventsByType[item.eventType] ?? 0) + 1;
      eventsBySeverity[item.severity] = (eventsBySeverity[item.severity] ?? 0) + 1;
      eventsByStatus[item.status] = (eventsByStatus[item.status] ?? 0) + 1;
      eventsByModule[item.sourceModule] = (eventsByModule[item.sourceModule] ?? 0) + 1;

      const day = item.timestamp.slice(0, 10);
      eventsPerDay[day] = (eventsPerDay[day] ?? 0) + 1;

      if (firstTs === null || item.timestamp < firstTs) firstTs = item.timestamp;
      if (lastTs === null || item.timestamp > lastTs) lastTs = item.timestamp;

      if (item.confidence !== null) {
        confidenceSum += item.confidence;
        confidenceCount++;
      }
    }

    return {
      totalEvents: items.length,
      eventsByCategory,
      eventsByType,
      eventsBySeverity,
      eventsByStatus,
      eventsByModule,
      eventsPerDay,
      firstEventTimestamp: firstTs,
      lastEventTimestamp: lastTs,
      averageConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
      futureMetadata: {},
    };
  }

  computeIncremental(
    existing: TimelineStatistics,
    newItems: TimelineItem[],
  ): TimelineStatistics {
    for (const item of newItems) {
      existing.totalEvents++;
      existing.eventsByCategory[item.category] = (existing.eventsByCategory[item.category] ?? 0) + 1;
      existing.eventsByType[item.eventType] = (existing.eventsByType[item.eventType] ?? 0) + 1;
      existing.eventsBySeverity[item.severity] = (existing.eventsBySeverity[item.severity] ?? 0) + 1;
      existing.eventsByStatus[item.status] = (existing.eventsByStatus[item.status] ?? 0) + 1;
      existing.eventsByModule[item.sourceModule] = (existing.eventsByModule[item.sourceModule] ?? 0) + 1;

      const day = item.timestamp.slice(0, 10);
      existing.eventsPerDay[day] = (existing.eventsPerDay[day] ?? 0) + 1;

      if (existing.firstEventTimestamp === null || item.timestamp < existing.firstEventTimestamp) {
        existing.firstEventTimestamp = item.timestamp;
      }
      if (existing.lastEventTimestamp === null || item.timestamp > existing.lastEventTimestamp) {
        existing.lastEventTimestamp = item.timestamp;
      }
    }

    return existing;
  }
}
