/**
 * AI Workspace Personalization Platform — Behavior Analyzer
 *
 * EPIC 5 PHASE A PART 7
 *
 * Analyzes user behavior events to identify patterns in tool usage,
 * navigation, recommendation acceptance, and session activity.
 * No personal document analysis.
 */
import type {
  BehaviorEvent,
  BehaviorAnalysisResult,
  ToolUsageStats,
  NavigationPattern,
  ActiveHoursStats,
  GoalUsageStats,
  WorkspaceConfiguration,
} from './types';

export class BehaviorAnalyzer {
  private _config: WorkspaceConfiguration;
  private _events: Map<string, BehaviorEvent[]> = new Map();

  constructor(config: WorkspaceConfiguration) {
    this._config = config;
  }

  updateConfig(config: WorkspaceConfiguration): void {
    this._config = config;
  }

  recordEvent(event: BehaviorEvent): void {
    const userEvents = this._events.get(event.userId) ?? [];
    userEvents.push(event);
    const cutoff = Date.now() - this._config.preferenceRules.behaviorAnalysisWindowDays * 24 * 60 * 60 * 1000;
    const filtered = userEvents.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
    this._events.set(event.userId, filtered);
  }

  recordEvents(events: BehaviorEvent[]): void {
    for (const event of events) {
      this.recordEvent(event);
    }
  }

  getEvents(userId: string): BehaviorEvent[] {
    return this._events.get(userId) ?? [];
  }

  analyze(userId: string): BehaviorAnalysisResult {
    const events = this.getEvents(userId);
    const now = new Date();

    const toolUsage = this._analyzeToolUsage(events);
    const navigationPatterns = this._analyzeNavigation(events);
    const recommendationAcceptanceRate = this._analyzeRecommendations(events);
    const preferredReports = this._analyzePreferredReports(events);
    const activeHours = this._analyzeActiveHours(events);
    const sessionStats = this._analyzeSessions(events);
    const goalUsage = this._analyzeGoalUsage(events);

    return {
      userId,
      totalEvents: events.length,
      toolUsage,
      navigationPatterns,
      recommendationAcceptanceRate,
      preferredReports,
      activeHours,
      sessionFrequency: sessionStats.frequency,
      averageSessionDuration: sessionStats.avgDuration,
      goalUsage,
      generatedAt: now.toISOString(),
      futureMetadata: {},
    };
  }

  clear(userId: string): void {
    this._events.delete(userId);
  }

  clearAll(): void {
    this._events.clear();
  }

  private _analyzeToolUsage(events: BehaviorEvent[]): ToolUsageStats[] {
    const toolCounts = new Map<string, { count: number; lastUsed: string }>();

    for (const event of events) {
      if (event.type === 'tool_used' && event.targetId) {
        const existing = toolCounts.get(event.targetId);
        if (existing) {
          existing.count++;
          if (new Date(event.timestamp) > new Date(existing.lastUsed)) {
            existing.lastUsed = event.timestamp;
          }
        } else {
          toolCounts.set(event.targetId, { count: 1, lastUsed: event.timestamp });
        }
      }
    }

    const result: ToolUsageStats[] = [];
    for (const [toolId, stats] of toolCounts) {
      const days = this._config.preferenceRules.behaviorAnalysisWindowDays;
      const avgFreq = stats.count / days;
      result.push({
        toolId,
        usageCount: stats.count,
        lastUsedAt: stats.lastUsed,
        averageFrequency: avgFreq,
        futureMetadata: {},
      });
    }

    return result.sort((a, b) => b.usageCount - a.usageCount);
  }

  private _analyzeNavigation(events: BehaviorEvent[]): NavigationPattern[] {
    const navCounts = new Map<string, { from: string; to: string; count: number }>();

    const navEvents = events
      .filter((e) => e.type === 'navigation')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let prevPage: string | null = null;
    for (const event of navEvents) {
      const page = event.context.page ?? '';
      if (prevPage && page) {
        const key = `${prevPage}->${page}`;
        const existing = navCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          navCounts.set(key, { from: prevPage, to: page, count: 1 });
        }
      }
      prevPage = page || prevPage;
    }

    return Array.from(navCounts.values())
      .map((v) => ({
        fromPage: v.from,
        toPage: v.to,
        frequency: v.count,
        futureMetadata: {},
      }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  private _analyzeRecommendations(events: BehaviorEvent[]): number {
    let accepted = 0;
    let dismissed = 0;

    for (const event of events) {
      if (event.type === 'recommendation_accepted') accepted++;
      if (event.type === 'recommendation_dismissed') dismissed++;
    }

    const total = accepted + dismissed;
    return total > 0 ? accepted / total : 0;
  }

  private _analyzePreferredReports(events: BehaviorEvent[]): string[] {
    const reportCounts = new Map<string, number>();

    for (const event of events) {
      if (event.type === 'report_viewed' && event.targetId) {
        reportCounts.set(event.targetId, (reportCounts.get(event.targetId) ?? 0) + 1);
      }
    }

    return Array.from(reportCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }

  private _analyzeActiveHours(events: BehaviorEvent[]): ActiveHoursStats[] {
    const hourCounts = new Map<number, number>();

    for (const event of events) {
      const hour = new Date(event.timestamp).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }

    return Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, activityCount: count, futureMetadata: {} }))
      .sort((a, b) => a.hour - b.hour);
  }

  private _analyzeSessions(events: BehaviorEvent[]): { frequency: number; avgDuration: number } {
    const sessions = events.filter((e) => e.type === 'session_started' || e.type === 'session_ended');

    const sessionStarts = new Map<string, string>();
    const durations: number[] = [];

    for (const event of sessions) {
      if (event.type === 'session_started' && event.context.sessionId) {
        sessionStarts.set(event.context.sessionId, event.timestamp);
      } else if (event.type === 'session_ended' && event.context.sessionId) {
        const start = sessionStarts.get(event.context.sessionId);
        if (start) {
          const duration = new Date(event.timestamp).getTime() - new Date(start).getTime();
          if (duration > 0) durations.push(duration);
        }
      }
    }

    const days = this._config.preferenceRules.behaviorAnalysisWindowDays;
    const uniqueSessions = new Set(sessions.map((s) => s.context.sessionId).filter(Boolean)).size;
    const frequency = uniqueSessions / days;
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return { frequency, avgDuration };
  }

  private _analyzeGoalUsage(events: BehaviorEvent[]): GoalUsageStats[] {
    const goalStats = new Map<string, { created: number; completed: number }>();

    for (const event of events) {
      if (event.type === 'goal_created' && event.targetType) {
        const existing = goalStats.get(event.targetType) ?? { created: 0, completed: 0 };
        existing.created++;
        goalStats.set(event.targetType, existing);
      } else if (event.type === 'goal_completed' && event.targetType) {
        const existing = goalStats.get(event.targetType) ?? { created: 0, completed: 0 };
        existing.completed++;
        goalStats.set(event.targetType, existing);
      }
    }

    return Array.from(goalStats.entries()).map(([type, stats]) => ({
      goalType: type,
      count: stats.created,
      completionRate: stats.created > 0 ? stats.completed / stats.created : 0,
      futureMetadata: {},
    }));
  }
}
