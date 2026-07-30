/**
 * Unified Timeline & Activity Center — Analytics
 *
 * Generates analytics: events per day, optimization count, maintenance
 * count, recovery count, automation success rate, recommendation
 * acceptance rate, health trend, and timeline activity.
 */
import type {
  TimelineItem,
  TimelineAnalytics,
  HealthTrendPoint,
  TagCount,
  ModuleCount,
  TimelineActivityPoint,
  TimelineCategory,
  TimelineConfiguration,
} from './types';

export class TimelineAnalyticsEngine {
  private _config: TimelineConfiguration;

  constructor(config: TimelineConfiguration) {
    this._config = config;
  }

  compute(items: TimelineItem[]): TimelineAnalytics {
    const eventsPerDay: Record<string, number> = {};
    const tagCounts = new Map<string, number>();
    const moduleCounts = new Map<string, number>();
    const activityMap = new Map<string, TimelineActivityPoint>();

    let optimizationCount = 0;
    let maintenanceCount = 0;
    let recoveryCount = 0;
    let automationTotal = 0;
    let automationSuccess = 0;
    let recommendationTotal = 0;
    let recommendationAccepted = 0;
    const healthPoints: HealthTrendPoint[] = [];

    for (const item of items) {
      const day = item.timestamp.slice(0, 10);
      eventsPerDay[day] = (eventsPerDay[day] ?? 0) + 1;

      // Activity point
      if (!activityMap.has(day)) {
        activityMap.set(day, {
          timestamp: day,
          count: 0,
          categories: {} as Record<TimelineCategory, number>,
        });
      }
      const ap = activityMap.get(day)!;
      ap.count++;
      ap.categories[item.category] = (ap.categories[item.category] ?? 0) + 1;

      // Tags
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }

      // Modules
      moduleCounts.set(item.sourceModule, (moduleCounts.get(item.sourceModule) ?? 0) + 1);

      // Category-specific counts
      switch (item.category) {
        case 'optimization':
          optimizationCount++;
          break;
        case 'maintenance':
          maintenanceCount++;
          break;
        case 'recovery':
          recoveryCount++;
          break;
        case 'automation':
          automationTotal++;
          if (item.status === 'resolved' || item.eventType === 'automation_approved') {
            automationSuccess++;
          }
          break;
        case 'recommendation':
          recommendationTotal++;
          if (item.eventType === 'recommendation_accepted') {
            recommendationAccepted++;
          }
          break;
        case 'health':
          if (item.details['healthScore'] !== undefined) {
            const score = Number(item.details['healthScore']);
            const prevScore = Number(item.details['previousHealthScore'] ?? score);
            healthPoints.push({
              timestamp: item.timestamp,
              healthScore: score,
              delta: score - prevScore,
            });
          }
          break;
      }
    }

    const topTags: TagCount[] = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const topModules: ModuleCount[] = Array.from(moduleCounts.entries())
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    const timelineActivity = Array.from(activityMap.values()).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );

    return {
      totalEvents: items.length,
      optimizationCount,
      maintenanceCount,
      recoveryCount,
      automationSuccessRate: automationTotal > 0 ? automationSuccess / automationTotal : 0,
      recommendationAcceptanceRate: recommendationTotal > 0 ? recommendationAccepted / recommendationTotal : 0,
      healthTrend: healthPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      eventsPerDay,
      topTags,
      topModules,
      timelineActivity,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }
}
