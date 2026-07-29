/**
 * Explanation Builder — builds evidence-based explanations.
 *
 * Every answer explains:
 *   What happened, Why it happened, Evidence, Confidence,
 *   Suggested next step, Future impact.
 *
 * Never invents facts.
 */
import type {
  ConversationIntentType,
  Explanation,
  ExplanationEvidence,
  ConversationContext,
  ConversationConfiguration,
} from './types';
import { clampScore } from './types';

export class ExplanationBuilder {
  private _config: ConversationConfiguration;

  constructor(config: ConversationConfiguration) {
    this._config = config;
  }

  updateConfig(config: ConversationConfiguration): void {
    this._config = config;
  }

  build(
    intent: ConversationIntentType,
    context: ConversationContext,
    confidence: number,
  ): Explanation {
    const whatHappened = this._buildWhatHappened(intent, context);
    const whyItHappened = this._buildWhyItHappened(intent, context);
    const evidence = this._collectEvidence(context);
    const suggestedNextStep = this._buildNextStep(intent, context);
    const futureImpact = this._buildFutureImpact(intent, context);
    const assumptions = this._buildAssumptions(intent, context);

    return {
      whatHappened,
      whyItHappened,
      evidence,
      confidence: clampScore(confidence),
      suggestedNextStep,
      futureImpact,
      assumptions,
    };
  }

  // ── Private ────────────────────────────────────────────────

  private _buildWhatHappened(intent: ConversationIntentType, ctx: ConversationContext): string {
    switch (intent) {
      case 'ask_health':
        if (ctx.healthSummary) {
          return `Your system health score is ${ctx.healthSummary.overallScore}/100 with ${ctx.healthSummary.issueCount} detected issues.`;
        }
        return 'Health data is not available.';
      case 'ask_storage':
        if (ctx.storageSummary) {
          return `Your storage is at ${ctx.storageSummary.usagePercent}% capacity (${ctx.storageSummary.usedMB} MB used of ${ctx.storageSummary.totalCapacityMB} MB).`;
        }
        return 'Storage data is not available.';
      case 'ask_performance':
        if (ctx.performanceSummary) {
          return `Current CPU usage is ${ctx.performanceSummary.cpuUsage}%, RAM usage is ${ctx.performanceSummary.ramUsage}%, disk usage is ${ctx.performanceSummary.diskUsage}%.`;
        }
        return 'Performance data is not available.';
      case 'ask_startup':
        if (ctx.startupSummary) {
          return `You have ${ctx.startupSummary.enabledItems} enabled startup items with an estimated boot time of ${ctx.startupSummary.estimatedBootTimeSec} seconds.`;
        }
        return 'Startup data is not available.';
      case 'ask_predictions':
        if (ctx.predictionSummary) {
          return `There are ${ctx.predictionSummary.totalPredictions} active predictions about your system's future state.`;
        }
        return 'Prediction data is not available.';
      case 'ask_recommendations':
        if (ctx.recommendationSummary) {
          return `There are ${ctx.recommendationSummary.totalRecommendations} recommendations available to improve your system.`;
        }
        return 'Recommendation data is not available.';
      case 'ask_device_profile':
        if (ctx.deviceProfileSummary) {
          return `Your device is classified as ${ctx.deviceProfileSummary.primaryProfile} with ${ctx.deviceProfileSummary.performanceTier} performance tier.`;
        }
        return 'Device profile data is not available.';
      case 'optimization_history':
        if (ctx.historySummary) {
          return `You have performed ${ctx.historySummary.totalOptimizations} optimizations, cleaning ${ctx.historySummary.totalCleanedMB} MB and fixing ${ctx.historySummary.totalIssuesFixed} issues.`;
        }
        return 'History data is not available.';
      default:
        return 'Based on available system data, here is what I found.';
    }
  }

  private _buildWhyItHappened(intent: ConversationIntentType, ctx: ConversationContext): string {
    const reasons: string[] = [];

    if (ctx.healthSummary && ctx.healthSummary.issueCount > 0) {
      reasons.push(`${ctx.healthSummary.issueCount} issues detected affecting system health`);
    }
    if (ctx.storageSummary && ctx.storageSummary.usagePercent > 80) {
      reasons.push('High storage usage detected');
    }
    if (ctx.performanceSummary && ctx.performanceSummary.cpuUsage > 80) {
      reasons.push('High CPU usage detected');
    }
    if (ctx.startupSummary && ctx.startupSummary.highImpactCount > 0) {
      reasons.push(`${ctx.startupSummary.highImpactCount} high-impact startup items detected`);
    }
    if (ctx.knowledgeSummary && ctx.knowledgeSummary.totalFacts > 0) {
      reasons.push(`Analysis based on ${ctx.knowledgeSummary.totalFacts} knowledge facts`);
    }

    if (reasons.length === 0) {
      return 'This assessment is based on available system telemetry and AI analysis.';
    }
    return reasons.join('. ');
  }

  private _collectEvidence(ctx: ConversationContext): ExplanationEvidence[] {
    const evidence: ExplanationEvidence[] = [];
    const ts = new Date().toISOString();

    if (ctx.healthSummary) {
      evidence.push({ source: 'health', metric: 'overall_score', value: ctx.healthSummary.overallScore, timestamp: ts });
    }
    if (ctx.storageSummary) {
      evidence.push({ source: 'storage', metric: 'usage_percent', value: ctx.storageSummary.usagePercent, timestamp: ts });
    }
    if (ctx.performanceSummary) {
      evidence.push({ source: 'performance', metric: 'cpu_usage', value: ctx.performanceSummary.cpuUsage, timestamp: ts });
      evidence.push({ source: 'performance', metric: 'ram_usage', value: ctx.performanceSummary.ramUsage, timestamp: ts });
    }
    if (ctx.knowledgeSummary) {
      evidence.push({ source: 'knowledge', metric: 'total_facts', value: ctx.knowledgeSummary.totalFacts, timestamp: ts });
    }

    return evidence.slice(0, this._config.contextLimits.maxEvidencePieces);
  }

  private _buildNextStep(intent: ConversationIntentType, ctx: ConversationContext): string {
    if (ctx.recommendationSummary && ctx.recommendationSummary.totalRecommendations > 0) {
      return 'Review the top recommendations and consider applying the highest priority ones.';
    }
    if (ctx.healthSummary && ctx.healthSummary.overallScore < 70) {
      return 'Consider running a system optimization to improve your health score.';
    }
    if (ctx.storageSummary && ctx.storageSummary.usagePercent > 85) {
      return 'Consider cleaning up large files and temporary data to free up storage space.';
    }
    return 'Continue monitoring your system health regularly.';
  }

  private _buildFutureImpact(intent: ConversationIntentType, ctx: ConversationContext): string {
    if (ctx.predictionSummary && ctx.predictionSummary.totalPredictions > 0) {
      const highRisk = ctx.predictionSummary.byRisk['high'] ?? 0;
      if (highRisk > 0) {
        return `${highRisk} high-risk predictions detected. Addressing issues now can prevent future problems.`;
      }
      return 'Current trends suggest stable system performance if maintenance continues.';
    }
    return 'Regular maintenance will help maintain system performance over time.';
  }

  private _buildAssumptions(intent: ConversationIntentType, ctx: ConversationContext): string[] {
    const assumptions: string[] = [];
    assumptions.push('This response is based on currently available system data');

    if (!ctx.healthSummary) assumptions.push('Health data was not available for this analysis');
    if (!ctx.storageSummary) assumptions.push('Storage data was not available for this analysis');
    if (!ctx.knowledgeSummary) assumptions.push('Knowledge engine data was not available');
    if (!ctx.predictionSummary) assumptions.push('Prediction engine data was not available');

    return assumptions;
  }
}
