/**
 * Conversation Context Builder — builds compact structured context.
 *
 * Avoids sending unnecessary information to the LLM.
 * Supports summary and detailed context levels.
 */
import type {
  AIContext,
  KnowledgeObject,
  RecommendationList,
  InsightList,
  PredictionList,
  DeviceProfile,
  ConversationContext,
  ConversationContextMetadata,
  ContextDetailLevel,
  ConversationIntentType,
  AIModuleName,
  ConversationConfiguration,
  SystemSummary,
  HealthSummary,
  StorageSummary,
  PerformanceSummary,
  StartupSummary,
  BrowserSummary,
  PrivacySummary,
  KnowledgeSummaryInfo,
  RecommendationSummaryInfo,
  InsightSummaryInfo,
  PredictionSummaryInfo,
  DeviceProfileSummaryInfo,
  HistorySummaryInfo,
} from './types';
import { generateContextId } from './types';

export class ConversationContextBuilder {
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration) {
    this._config = config;
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  build(
    intent: ConversationIntentType,
    detailLevel: ContextDetailLevel,
    context: AIContext | null,
    knowledge: KnowledgeObject | null,
    recommendations: RecommendationList | null,
    insights: InsightList | null,
    predictions: PredictionList | null,
    deviceProfile: DeviceProfile | null,
    modulesUsed: AIModuleName[],
    generationTimeMs: number,
  ): ConversationContext {
    const limits = this._config.contextLimits;
    const maxItems = detailLevel === 'summary' ? limits.summaryModeThreshold : limits.maxRecommendations;

    const systemSummary = context ? this._buildSystemSummary(context) : null;
    const healthSummary = context ? this._buildHealthSummary(context, maxItems) : null;
    const storageSummary = context ? this._buildStorageSummary(context) : null;
    const performanceSummary = context ? this._buildPerformanceSummary(context) : null;
    const startupSummary = context ? this._buildStartupSummary(context) : null;
    const browserSummary = context ? this._buildBrowserSummary(context) : null;
    const privacySummary = context ? this._buildPrivacySummary(context) : null;
    const knowledgeSummary = knowledge ? this._buildKnowledgeSummary(knowledge) : null;
    const recommendationSummary = recommendations ? this._buildRecommendationSummary(recommendations, maxItems) : null;
    const insightSummary = insights ? this._buildInsightSummary(insights, maxItems) : null;
    const predictionSummary = predictions ? this._buildPredictionSummary(predictions, maxItems) : null;
    const deviceProfileSummary = deviceProfile ? this._buildDeviceProfileSummary(deviceProfile) : null;
    const historySummary = context ? this._buildHistorySummary(context) : null;

    let evidenceCount = 0;
    if (knowledge) evidenceCount += knowledge.statistics.totalEvidencePieces;
    if (recommendations) evidenceCount += recommendations.metadata.totalRecommendations;
    if (insights) evidenceCount += insights.metadata.totalInsights;
    if (predictions) evidenceCount += predictions.metadata.totalPredictions;

    const metadata: ConversationContextMetadata = {
      intent,
      modulesUsed,
      evidenceCount,
      generationTimeMs,
    };

    return {
      contextId: generateContextId(),
      timestamp: new Date().toISOString(),
      detailLevel,
      systemSummary,
      healthSummary,
      storageSummary,
      performanceSummary,
      startupSummary,
      browserSummary,
      privacySummary,
      knowledgeSummary,
      recommendationSummary,
      insightSummary,
      predictionSummary,
      deviceProfileSummary,
      historySummary,
      metadata,
    };
  }

  // ── Private builders ───────────────────────────────────────

  private _buildSystemSummary(ctx: AIContext): SystemSummary {
    const s = ctx.system;
    return {
      osVersion: s?.osVersion ?? 'Unknown',
      hostname: s?.hostname ?? 'Unknown',
      cpuModel: s?.cpuModel ?? 'Unknown',
      cpuCores: s?.cpuCores ?? 0,
      totalMemoryMB: s?.totalMemoryMB ?? 0,
      gpuModel: s?.gpuModel ?? null,
      uptime: s?.uptime ?? 0,
    };
  }

  private _buildHealthSummary(ctx: AIContext, maxItems: number): HealthSummary {
    const h = ctx.health;
    return {
      overallScore: h?.overallScore ?? 0,
      cpuScore: h?.cpuScore ?? 0,
      ramScore: h?.ramScore ?? 0,
      diskScore: h?.diskScore ?? 0,
      stabilityScore: h?.stabilityScore ?? 0,
      securityScore: h?.securityScore ?? 0,
      issueCount: h?.issues.length ?? 0,
      topIssues: (h?.issues ?? []).slice(0, maxItems).map((i) => ({
        severity: i.severity,
        description: i.description,
      })),
    };
  }

  private _buildStorageSummary(ctx: AIContext): StorageSummary {
    const s = ctx.storage;
    const total = s?.totalCapacityMB ?? 0;
    const used = s?.usedMB ?? 0;
    return {
      totalCapacityMB: total,
      usedMB: used,
      freeMB: s?.freeMB ?? 0,
      driveType: s?.driveType ?? 'Unknown',
      driveHealth: s?.driveHealth ?? 'unknown',
      usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
    };
  }

  private _buildPerformanceSummary(ctx: AIContext): PerformanceSummary {
    const p = ctx.performance;
    return {
      cpuUsage: p?.cpuUsage ?? 0,
      ramUsage: p?.ramUsage ?? 0,
      diskUsage: p?.diskUsage ?? 0,
      activeProcesses: p?.activeProcesses ?? 0,
    };
  }

  private _buildStartupSummary(ctx: AIContext): StartupSummary {
    const s = ctx.startup;
    return {
      totalItems: s?.totalStartupItems ?? 0,
      enabledItems: s?.enabledItems ?? 0,
      estimatedBootTimeSec: s?.estimatedBootTimeSec ?? 0,
      highImpactCount: s?.highImpactItems.length ?? 0,
    };
  }

  private _buildBrowserSummary(ctx: AIContext): BrowserSummary {
    const b = ctx.browser;
    return {
      installedBrowsers: (b?.installedBrowsers ?? []).map((br) => br.name),
      totalCacheMB: b?.totalCacheMB ?? 0,
      extensionCount: b?.extensions.length ?? 0,
    };
  }

  private _buildPrivacySummary(ctx: AIContext): PrivacySummary {
    const p = ctx.privacy;
    return {
      trackingCookies: p?.trackingCookies ?? 0,
      historyEntries: p?.historyEntries ?? 0,
      tempFilesMB: p?.tempFilesMB ?? 0,
      recycleBinMB: p?.recycleBinMB ?? 0,
    };
  }

  private _buildKnowledgeSummary(k: KnowledgeObject): KnowledgeSummaryInfo {
    return {
      totalFacts: k.statistics.totalFacts,
      totalRelationships: k.statistics.totalRelationships,
      totalTrends: k.statistics.totalTrends,
      averageConfidence: k.statistics.averageConfidence,
      topCategories: Object.keys(k.statistics.factsByCategory).slice(0, 5),
    };
  }

  private _buildRecommendationSummary(recs: RecommendationList, maxItems: number): RecommendationSummaryInfo {
    const byPriority: Record<string, number> = {};
    for (const r of recs.recommendations) {
      byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
    }
    return {
      totalRecommendations: recs.metadata.totalRecommendations,
      byPriority,
      topRecommendations: recs.recommendations.slice(0, maxItems).map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        confidence: r.scores.confidenceScore,
      })),
    };
  }

  private _buildInsightSummary(insights: InsightList, maxItems: number): InsightSummaryInfo {
    const byPriority: Record<string, number> = {};
    for (const i of insights.insights) {
      byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1;
    }
    return {
      totalInsights: insights.metadata.totalInsights,
      byPriority,
      topInsights: insights.insights.slice(0, maxItems).map((i) => ({
        id: i.id,
        title: i.title,
        priority: i.priority,
      })),
    };
  }

  private _buildPredictionSummary(preds: PredictionList, maxItems: number): PredictionSummaryInfo {
    const byRisk: Record<string, number> = {};
    for (const p of preds.predictions) {
      byRisk[p.riskLevel] = (byRisk[p.riskLevel] ?? 0) + 1;
    }
    return {
      totalPredictions: preds.metadata.totalPredictions,
      byRisk,
      topPredictions: preds.predictions.slice(0, maxItems).map((p) => ({
        id: p.id,
        title: p.title,
        riskLevel: p.riskLevel,
        confidence: p.confidenceScore,
      })),
    };
  }

  private _buildDeviceProfileSummary(profile: DeviceProfile): DeviceProfileSummaryInfo {
    return {
      primaryProfile: profile.primaryProfile,
      confidenceScore: profile.confidenceScore,
      performanceTier: profile.hardwareSummary.performanceTier,
      primaryWorkload: profile.workloadSummary.primaryWorkload,
    };
  }

  private _buildHistorySummary(ctx: AIContext): HistorySummaryInfo {
    const h = ctx.history;
    return {
      totalOptimizations: h?.totalOptimizations ?? 0,
      totalCleanedMB: h?.totalCleanedMB ?? 0,
      totalIssuesFixed: h?.totalIssuesFixed ?? 0,
      lastOptimizationAt: h?.lastOptimizationAt ?? null,
    };
  }
}
