/**
 * Insight Generator — generates proactive insights from
 * existing AVS platform data.
 *
 * Insights are data-driven and never fabricated.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  AssistantContext,
  AssistantInsight,
  InsightType,
  InsightSeverity,
} from './types';
import { generateInsightId, formatBytes, scoreToLevel } from './types';

export class InsightGenerator {
  generate(context: AssistantContext): AssistantInsight[] {
    const insights: AssistantInsight[] = [];

    insights.push(...this._checkScoreTrend(context));
    insights.push(...this._checkStorageGrowth(context));
    insights.push(...this._checkStartupImpact(context));
    insights.push(...this._checkBrowserCache(context));
    insights.push(...this._checkWindowsUpdate(context));
    insights.push(...this._checkDuplicateSpace(context));
    insights.push(...this._checkMaintenanceDue(context));
    insights.push(...this._checkPrivacyConcern(context));
    insights.push(...this._checkPerformanceBottleneck(context));

    return insights.sort((a, b) => {
      const severityOrder: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  generateTop(context: AssistantContext, limit: number): AssistantInsight[] {
    return this.generate(context).slice(0, limit);
  }

  private _checkScoreTrend(ctx: AssistantContext): AssistantInsight[] {
    if (!ctx.trends || ctx.trends.todayScore === null) return [];
    const trends = ctx.trends;
    const insights: AssistantInsight[] = [];

    if (trends.change7Days !== null && trends.change7Days > 5) {
      insights.push(this._createInsight(
        'score_improvement',
        'Health score improving',
        `Your health score increased by ${trends.change7Days} points over the past 7 days. Recent optimizations are having a positive effect.`,
        'info',
        null,
        `Trend: ${trends.direction}, Change: +${trends.change7Days}`,
        'Continue regular maintenance to sustain improvements',
        0.85,
      ));
    }

    if (trends.change7Days !== null && trends.change7Days < -5) {
      insights.push(this._createInsight(
        'score_decline',
        'Health score declining',
        `Your health score decreased by ${Math.abs(trends.change7Days)} points over the past 7 days. Consider running an optimization.`,
        'medium',
        null,
        `Trend: ${trends.direction}, Change: ${trends.change7Days}`,
        'Run Smart Optimize to address declining areas',
        0.8,
      ));
    }

    return insights;
  }

  private _checkStorageGrowth(ctx: AssistantContext): AssistantInsight[] {
    const storageResult = ctx.healthReport?.categories.find((c) => c.categoryId === 'storage');
    if (!storageResult || storageResult.score < 70) {
      return [this._createInsight(
        'storage_increase',
        'Storage space getting low',
        storageResult
          ? `Storage health is ${storageResult.score}/100. ${storageResult.issues.length} storage issues detected.`
          : 'Storage analysis not available.',
        storageResult && storageResult.score < 50 ? 'high' : 'medium',
        'storage',
        storageResult ? `Score: ${storageResult.score}/100` : 'No data',
        'Clean up large files and remove duplicates to free space',
        0.75,
      )];
    }
    return [];
  }

  private _checkStartupImpact(ctx: AssistantContext): AssistantInsight[] {
    const startupResult = ctx.healthReport?.categories.find((c) => c.categoryId === 'startup');
    if (!startupResult || startupResult.score >= 75) return [];

    const recentStartupExecutions = ctx.executionHistory.filter(
      (e) => e.taskResults.some((t) => t.taskId === 'startup_optimizer'),
    ).slice(0, 3);

    if (recentStartupExecutions.length > 0) {
      return [this._createInsight(
        'startup_improvement',
        'Startup impact improved',
        `Startup score is ${startupResult.score}/100 after ${recentStartupExecutions.length} recent startup optimization${recentStartupExecutions.length > 1 ? 's' : ''}.`,
        'info',
        'startup',
        `Score: ${startupResult.score}/100, Recent optimizations: ${recentStartupExecutions.length}`,
        'Disable more startup items to further improve boot time',
        0.8,
      )];
    }

    return [this._createInsight(
      'startup_improvement',
      'Startup needs attention',
      `Startup score is ${startupResult.score}/100 (${scoreToLevel(startupResult.score)}). Disabling unnecessary startup applications can improve boot time.`,
      startupResult.score < 50 ? 'high' : 'medium',
      'startup',
      `Score: ${startupResult.score}/100, Issues: ${startupResult.issues.length}`,
      'Review and disable unnecessary startup items',
      0.8,
    )];
  }

  private _checkBrowserCache(ctx: AssistantContext): AssistantInsight[] {
    const browserResult = ctx.healthReport?.categories.find((c) => c.categoryId === 'browser');
    if (!browserResult || browserResult.score >= 75) return [];

    return [this._createInsight(
      'browser_cache_growth',
      'Browser cache has grown',
      `Browser health is ${browserResult.score}/100. ${browserResult.issues.length} browser issues detected. Cleaning browser data can improve privacy and performance.`,
      browserResult.score < 50 ? 'medium' : 'low',
      'browser',
      `Score: ${browserResult.score}/100, Issues: ${browserResult.issues.length}`,
      'Clear browser cache, cookies, and history',
      0.75,
    )];
  }

  private _checkWindowsUpdate(ctx: AssistantContext): AssistantInsight[] {
    const updateResult = ctx.healthReport?.categories.find((c) => c.categoryId === 'system_updates');
    if (!updateResult || updateResult.score >= 70) return [];

    return [this._createInsight(
      'windows_update_overdue',
      'Windows Update is overdue',
      `Windows Update score is ${updateResult.score}/100. ${updateResult.issues.length} update issues detected. Installing pending updates improves security and stability.`,
      updateResult.score < 40 ? 'high' : 'medium',
      'system_updates',
      `Score: ${updateResult.score}/100, Issues: ${updateResult.issues.length}`,
      'Open Windows Update and install pending updates',
      0.85,
    )];
  }

  private _checkDuplicateSpace(ctx: AssistantContext): AssistantInsight[] {
    const plan = ctx.optimizationPlan;
    if (!plan) return [];

    const dupItems = plan.items.filter((i) => i.category === 'storage' && i.estimatedSpaceRecovery > 0);
    const totalDupSpace = dupItems.reduce((sum, i) => sum + i.estimatedSpaceRecovery, 0);

    if (totalDupSpace > 100 * 1024 * 1024) {
      return [this._createInsight(
        'duplicate_space',
        'Duplicate files consuming significant space',
        `Duplicate files are consuming ${formatBytes(totalDupSpace)} of storage. Removing them can free up significant space.`,
        totalDupSpace > 1024 * 1024 * 1024 ? 'high' : 'medium',
        'storage',
        `Duplicate space: ${formatBytes(totalDupSpace)}`,
        'Run duplicate file cleanup to recover wasted space',
        0.85,
      )];
    }
    return [];
  }

  private _checkMaintenanceDue(ctx: AssistantContext): AssistantInsight[] {
    const lastExecution = ctx.executionHistory[0];
    if (!lastExecution) {
      return [this._createInsight(
        'maintenance_due',
        'No recent maintenance',
        'No optimization has been run yet. Running Smart Optimize can improve your system health.',
        'low',
        null,
        'No execution history found',
        'Run Smart Optimize to analyze and optimize your system',
        0.7,
      )];
    }

    const daysSince = (Date.now() - new Date(lastExecution.startTime).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 14) {
      return [this._createInsight(
        'maintenance_due',
        'Maintenance overdue',
        `Last optimization was ${Math.round(daysSince)} days ago. Regular maintenance keeps your system healthy.`,
        'low',
        null,
        `Last execution: ${lastExecution.startTime}, ${Math.round(daysSince)} days ago`,
        'Run Smart Optimize to maintain system health',
        0.75,
      )];
    }
    return [];
  }

  private _checkPrivacyConcern(ctx: AssistantContext): AssistantInsight[] {
    const privacyResult = ctx.healthReport?.categories.find((c) => c.categoryId === 'privacy');
    if (!privacyResult || privacyResult.score >= 75) return [];

    return [this._createInsight(
      'privacy_concern',
      'Privacy needs attention',
      `Privacy score is ${privacyResult.score}/100. ${privacyResult.issues.length} privacy issues detected.`,
      privacyResult.score < 50 ? 'medium' : 'low',
      'privacy',
      `Score: ${privacyResult.score}/100, Issues: ${privacyResult.issues.length}`,
      'Clean browser data and review privacy settings',
      0.75,
    )];
  }

  private _checkPerformanceBottleneck(ctx: AssistantContext): AssistantInsight[] {
    const perfResult = ctx.healthReport?.categories.find((c) => c.categoryId === 'performance');
    if (!perfResult || perfResult.score >= 75) return [];

    return [this._createInsight(
      'performance_bottleneck',
      'Performance bottleneck detected',
      `Performance score is ${perfResult.score}/100. ${perfResult.issues.length} performance issues detected.`,
      perfResult.score < 50 ? 'high' : 'medium',
      'performance',
      `Score: ${perfResult.score}/100, Issues: ${perfResult.issues.length}`,
      'Optimize startup, clean temporary files, and free up storage',
      0.8,
    )];
  }

  private _createInsight(
    type: InsightType,
    title: string,
    description: string,
    severity: InsightSeverity,
    category: AssistantInsight['category'],
    evidence: string,
    suggestedAction: string,
    confidence: number,
  ): AssistantInsight {
    return {
      id: generateInsightId(),
      type,
      title,
      description,
      severity,
      category,
      evidence,
      suggestedAction,
      confidence,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const insightGenerator = new InsightGenerator();
