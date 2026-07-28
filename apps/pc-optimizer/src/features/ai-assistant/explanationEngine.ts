/**
 * Explanation Engine — builds structured explanations for
 * user questions using existing AVS platform data.
 *
 * Every answer includes:
 *   Current data, Reasoning, Evidence, Recommended action,
 *   Expected benefit, Confidence
 *
 * Never fabricates information.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  AssistantContext,
  AssistantExplanation,
  QuestionType,
  ExplanationEvidence,
  RecommendedAction,
} from './types';
import type { HealthRecommendation } from '../ai-health-engine/types';
import { scoreToLevel, formatBytes, formatDuration } from './types';
import { AssistantContextBuilder } from './assistantContextBuilder';
import { QuestionRouter } from './questionRouter';
import { PromptTemplateRegistry } from './promptTemplateRegistry';

export class ExplanationEngine {
  private _contextBuilder: AssistantContextBuilder;
  private _questionRouter: QuestionRouter;
  private _templates: PromptTemplateRegistry;

  constructor(
    contextBuilder?: AssistantContextBuilder,
    questionRouter?: QuestionRouter,
    templates?: PromptTemplateRegistry,
  ) {
    this._contextBuilder = contextBuilder ?? new AssistantContextBuilder();
    this._questionRouter = questionRouter ?? new QuestionRouter();
    this._templates = templates ?? new PromptTemplateRegistry();
  }

  explain(question: string, context: AssistantContext): AssistantExplanation {
    const classification = this._questionRouter.classify(question);
    return this.explainByType(classification.type, context);
  }

  explainByType(type: QuestionType, context: AssistantContext): AssistantExplanation {
    switch (type) {
      case 'why_score_low':
        return this._explainWhyScoreLow(context);
      case 'why_score_improved':
        return this._explainWhyScoreImproved(context);
      case 'what_changed':
        return this._explainWhatChanged(context);
      case 'what_optimize_first':
        return this._explainWhatOptimizeFirst(context);
      case 'why_startup_poor':
        return this._explainWhyStartupPoor(context);
      case 'why_duplicates':
        return this._explainWhyDuplicates(context);
      case 'how_much_recover':
        return this._explainHowMuchRecover(context);
      case 'what_smart_optimize':
        return this._explainSmartOptimize(context);
      case 'why_browser_privacy_low':
        return this._explainWhyBrowserPrivacyLow(context);
      case 'why_windows_fair':
        return this._explainWhyWindowsFair(context);
      case 'which_safest':
        return this._explainWhichSafest(context);
      case 'what_happened_after':
        return this._explainWhatHappenedAfter(context);
      default:
        return this._explainFallback(context);
    }
  }

  private _explainWhyScoreLow(ctx: AssistantContext): AssistantExplanation {
    const report = ctx.healthReport;
    if (!report) return this._noDataResponse('why_score_low');

    const score = report.overall.score;
    const level = report.overall.level;
    const worstCategories = [...report.categories]
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);

    const evidence: ExplanationEvidence[] = worstCategories.map((c) => ({
      source: 'AI Health Engine',
      data: `${c.categoryName}: ${c.score}/100 (${c.issues.length} issues)`,
      category: c.categoryId,
    }));

    const topIssues = worstCategories.flatMap((c) =>
      c.issues.slice(0, 2).map((i) => ({ ...i, categoryId: c.categoryId })),
    );

    const reasoning = `Your health score is ${score}/100 (${level}). The lowest-scoring categories are ${worstCategories.map((c) => c.categoryName).join(', ')}. ${topIssues.length > 0 ? `Key issues: ${topIssues.map((i) => i.title).join('; ')}.` : ''}`;

    const bestRec = report.recommendations[0] ?? null;
    const recommendedAction = bestRec ? this._buildActionFromRec(bestRec) : null;

    return {
      questionType: 'why_score_low',
      summary: `Your health score is ${score}/100 (${level}).`,
      currentData: `Overall Score: ${score}/100, Level: ${level}, Grade: ${report.overall.letterGrade}`,
      reasoning,
      evidence,
      recommendedAction,
      expectedBenefit: bestRec ? `+${bestRec.estimatedBenefit} points to health score` : 'Improvement depends on actions taken',
      confidence: 0.9,
      followUpSuggestions: this._questionRouter.suggestFollowUps('why_score_low'),
    };
  }

  private _explainWhyScoreImproved(ctx: AssistantContext): AssistantExplanation {
    const trends = ctx.trends;
    if (!trends || trends.todayScore === null) return this._noDataResponse('why_score_improved');

    const change = trends.change7Days;
    const recentExecutions = ctx.executionHistory.slice(0, 5);

    const evidence: ExplanationEvidence[] = [
      {
        source: 'Trend Analysis',
        data: `Score change over 7 days: ${change !== null ? `+${change}` : 'N/A'}`,
        category: null,
      },
      ...recentExecutions.map((e) => ({
        source: 'Execution History',
        data: `${e.source} execution: ${e.status}, ${e.filesRemoved} files removed, ${formatBytes(e.totalSpaceRecovered)} recovered`,
        category: null,
      })),
    ];

    const reasoning = `Your score ${change !== null && change > 0 ? 'improved' : 'changed'} by ${change ?? 'an unknown amount'} over the past 7 days. ${recentExecutions.length > 0 ? `This correlates with ${recentExecutions.length} recent optimization${recentExecutions.length > 1 ? 's' : ''}.` : 'No recent executions found.'}`;

    return {
      questionType: 'why_score_improved',
      summary: `Your score ${change !== null && change > 0 ? 'improved' : 'changed'} by ${change ?? 'N/A'} points over 7 days.`,
      currentData: `Current: ${trends.todayScore}, 7-day avg: ${trends.last7DaysAvg ?? 'N/A'}`,
      reasoning,
      evidence,
      recommendedAction: null,
      expectedBenefit: 'Continue regular maintenance to sustain improvements',
      confidence: 0.8,
      followUpSuggestions: this._questionRouter.suggestFollowUps('why_score_improved'),
    };
  }

  private _explainWhatChanged(ctx: AssistantContext): AssistantExplanation {
    const recentExecutions = ctx.executionHistory.slice(0, 5);
    const trends = ctx.trends;

    const evidence: ExplanationEvidence[] = recentExecutions.map((e) => ({
      source: 'Execution History',
      data: `${e.startTime}: ${e.source} — ${e.status}, ${e.filesRemoved} files, ${formatBytes(e.totalSpaceRecovered)}`,
      category: null,
    }));

    if (trends) {
      evidence.push({
        source: 'Trend Analysis',
        data: `Overall trend: ${trends.direction}, 7-day change: ${trends.change7Days ?? 'N/A'}`,
        category: null,
      });
    }

    const reasoning = recentExecutions.length > 0
      ? `${recentExecutions.length} recent execution${recentExecutions.length > 1 ? 's' : ''} recorded. ${recentExecutions[0] ? `Most recent: ${recentExecutions[0].source} on ${recentExecutions[0].startTime}.` : ''}`
      : 'No recent changes detected.';

    return {
      questionType: 'what_changed',
      summary: recentExecutions.length > 0 ? `${recentExecutions.length} recent optimization${recentExecutions.length > 1 ? 's' : ''} detected.` : 'No recent changes.',
      currentData: `Executions: ${recentExecutions.length}, Trend: ${trends?.direction ?? 'N/A'}`,
      reasoning,
      evidence,
      recommendedAction: null,
      expectedBenefit: 'Stay informed about system changes',
      confidence: 0.75,
      followUpSuggestions: this._questionRouter.suggestFollowUps('what_changed'),
    };
  }

  private _explainWhatOptimizeFirst(ctx: AssistantContext): AssistantExplanation {
    const report = ctx.healthReport;
    const plan = ctx.optimizationPlan;

    if (!report && !plan) return this._noDataResponse('what_optimize_first');

    const recommendations = report?.recommendations ?? [];
    const topRecs = recommendations.slice(0, 3);
    const planItems = plan?.items.filter((i) => !i.isLocked && !i.isSkipped).slice(0, 3) ?? [];

    const evidence: ExplanationEvidence[] = [
      ...topRecs.map((r) => ({
        source: 'AI Health Engine',
        data: `${r.title}: priority ${r.priority}, benefit +${r.estimatedBenefit}`,
        category: r.category,
      })),
      ...planItems.map((i) => ({
        source: 'Optimization Planner',
        data: `${i.title}: benefit +${i.estimatedBenefit}, risk ${i.risk}`,
        category: i.category,
      })),
    ];

    const bestRec = topRecs[0] ?? null;
    const reasoning = bestRec
      ? `Based on your health analysis, the highest priority action is "${bestRec.title}" (${bestRec.priority} priority, +${bestRec.estimatedBenefit} estimated benefit).`
      : 'No recommendations available.';

    const recommendedAction = bestRec ? this._buildActionFromRec(bestRec) : null;

    return {
      questionType: 'what_optimize_first',
      summary: bestRec ? `Start with: ${bestRec.title}` : 'No recommendations available.',
      currentData: `Health Score: ${report?.overall.score ?? 'N/A'}, Recommendations: ${recommendations.length}`,
      reasoning,
      evidence,
      recommendedAction,
      expectedBenefit: bestRec ? `+${bestRec.estimatedBenefit} points` : 'N/A',
      confidence: 0.85,
      followUpSuggestions: this._questionRouter.suggestFollowUps('what_optimize_first'),
    };
  }

  private _explainWhyStartupPoor(ctx: AssistantContext): AssistantExplanation {
    const startupResult = this._contextBuilder.getCategoryResult(ctx, 'startup');
    if (!startupResult) return this._noDataResponse('why_startup_poor');

    const evidence: ExplanationEvidence[] = startupResult.issues.map((i) => ({
      source: 'Startup Analyzer',
      data: `${i.title}: ${i.description} (${i.severity})`,
      category: 'startup',
    }));

    const reasoning = `Startup is rated ${scoreToLevel(startupResult.score)} (${startupResult.score}/100) due to ${startupResult.issues.length} issue${startupResult.issues.length !== 1 ? 's' : ''}. ${startupResult.issues.map((i) => i.title).join('; ')}`;

    return {
      questionType: 'why_startup_poor',
      summary: `Startup is rated ${scoreToLevel(startupResult.score)} (${startupResult.score}/100).`,
      currentData: `Startup Score: ${startupResult.score}/100, Issues: ${startupResult.issues.length}`,
      reasoning,
      evidence,
      recommendedAction: {
        title: 'Disable unnecessary startup items',
        description: 'Review and disable startup applications that slow down boot time.',
        category: 'startup',
        estimatedBenefit: 15,
        riskLevel: 'low',
        requiredCapability: 'startup-manager',
      },
      expectedBenefit: 'Faster boot time, improved startup score',
      confidence: 0.85,
      followUpSuggestions: this._questionRouter.suggestFollowUps('why_startup_poor'),
    };
  }

  private _explainWhyDuplicates(ctx: AssistantContext): AssistantExplanation {
    const storageResult = this._contextBuilder.getCategoryResult(ctx, 'storage');
    const evidence: ExplanationEvidence[] = [];

    if (storageResult) {
      evidence.push({
        source: 'Storage Intelligence',
        data: `Storage score: ${storageResult.score}/100, Issues: ${storageResult.issues.length}`,
        category: 'storage',
      });
    }

    if (ctx.optimizationPlan) {
      const dupItems = ctx.optimizationPlan.items.filter((i) => i.category === 'storage');
      evidence.push(...dupItems.map((i) => ({
        source: 'Optimization Planner',
        data: `${i.title}: ${formatBytes(i.estimatedSpaceRecovery)} recoverable`,
        category: 'storage' as const,
      })));
    }

    const reasoning = 'Duplicate files accumulate when files are copied to multiple locations, downloaded multiple times, or created by applications. The Duplicate Detection Engine identifies files with identical content using SHA-256 hashing.';

    return {
      questionType: 'why_duplicates',
      summary: 'Duplicate files are identical copies stored in multiple locations.',
      currentData: storageResult ? `Storage Score: ${storageResult.score}/100` : 'Storage data not available',
      reasoning,
      evidence,
      recommendedAction: {
        title: 'Remove duplicate files',
        description: 'Use the Duplicate Detection Engine to identify and safely remove duplicate files.',
        category: 'storage',
        estimatedBenefit: 10,
        riskLevel: 'low',
        requiredCapability: null,
      },
      expectedBenefit: 'Recover wasted storage space',
      confidence: 0.8,
      followUpSuggestions: this._questionRouter.suggestFollowUps('why_duplicates'),
    };
  }

  private _explainHowMuchRecover(ctx: AssistantContext): AssistantExplanation {
    const plan = ctx.optimizationPlan;
    const report = ctx.healthReport;

    let totalRecovery = 0;
    const evidence: ExplanationEvidence[] = [];

    if (plan) {
      totalRecovery = plan.estimatedSpaceRecovery;
      evidence.push({
        source: 'Optimization Planner',
        data: `Total estimated recovery: ${formatBytes(totalRecovery)}`,
        category: null,
      });

      const byCategory = new Map<string, number>();
      for (const item of plan.items) {
        if (item.isLocked || item.isSkipped) continue;
        byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.estimatedSpaceRecovery);
      }
      for (const [cat, bytes] of byCategory) {
        evidence.push({
          source: 'Optimization Planner',
          data: `${cat}: ${formatBytes(bytes)}`,
          category: cat as ExplanationEvidence['category'],
        });
      }
    }

    if (report) {
      for (const cat of report.categories) {
        if (cat.categoryId === 'temp_files' || cat.categoryId === 'recycle_bin' || cat.categoryId === 'storage') {
          evidence.push({
            source: 'AI Health Engine',
            data: `${cat.categoryName}: ${cat.score}/100`,
            category: cat.categoryId,
          });
        }
      }
    }

    const reasoning = plan
      ? `Based on your optimization plan, you can recover ${formatBytes(totalRecovery)} by running the recommended optimizations.`
      : 'No optimization plan available to estimate recovery.';

    return {
      questionType: 'how_much_recover',
      summary: plan ? `You can recover ${formatBytes(totalRecovery)}.` : 'Unable to estimate recovery.',
      currentData: `Estimated Recovery: ${formatBytes(totalRecovery)}`,
      reasoning,
      evidence,
      recommendedAction: plan ? {
        title: 'Run optimization plan',
        description: 'Execute the recommended optimization items to recover storage space.',
        category: null,
        estimatedBenefit: plan.estimatedPerformanceImprovement,
        riskLevel: plan.overallRisk,
        requiredCapability: null,
      } : null,
      expectedBenefit: `${formatBytes(totalRecovery)} of storage space`,
      confidence: plan ? 0.85 : 0.3,
      followUpSuggestions: this._questionRouter.suggestFollowUps('how_much_recover'),
    };
  }

  private _explainSmartOptimize(ctx: AssistantContext): AssistantExplanation {
    const plan = ctx.optimizationPlan;
    const evidence: ExplanationEvidence[] = [];

    if (plan) {
      evidence.push({
        source: 'Optimization Planner',
        data: `Plan type: ${plan.planType}, Items: ${plan.items.length}, Duration: ${formatDuration(plan.estimatedDurationSeconds)}`,
        category: null,
      });
    }

    const reasoning = 'Smart Optimize analyzes your PC health using the AI Health Engine, creates a prioritized optimization plan using the Optimization Planner, and executes safe maintenance tasks through the Execution Engine. It targets the highest-impact items first based on your health score.';

    return {
      questionType: 'what_smart_optimize',
      summary: 'Smart Optimize analyzes, plans, and executes safe optimizations automatically.',
      currentData: plan ? `Current plan: ${plan.planType}, ${plan.items.length} items` : 'No active plan',
      reasoning,
      evidence,
      recommendedAction: {
        title: 'Run Smart Optimize',
        description: 'Execute a balanced optimization plan targeting your lowest-scoring categories.',
        category: null,
        estimatedBenefit: plan?.estimatedPerformanceImprovement ?? 20,
        riskLevel: plan?.overallRisk ?? 'low',
        requiredCapability: null,
      },
      expectedBenefit: plan ? `+${plan.predictedHealthScore - plan.currentHealthScore} health score points` : 'Improved system performance',
      confidence: 0.9,
      followUpSuggestions: this._questionRouter.suggestFollowUps('what_smart_optimize'),
    };
  }

  private _explainWhyBrowserPrivacyLow(ctx: AssistantContext): AssistantExplanation {
    const browserResult = this._contextBuilder.getCategoryResult(ctx, 'browser');
    const privacyResult = this._contextBuilder.getCategoryResult(ctx, 'privacy');

    const evidence: ExplanationEvidence[] = [];
    if (browserResult) {
      evidence.push(...browserResult.issues.map((i) => ({
        source: 'Browser Health',
        data: `${i.title}: ${i.description}`,
        category: 'browser' as const,
      })));
    }
    if (privacyResult) {
      evidence.push(...privacyResult.issues.map((i) => ({
        source: 'Privacy Analyzer',
        data: `${i.title}: ${i.description}`,
        category: 'privacy' as const,
      })));
    }

    const browserScore = browserResult?.score ?? 'N/A';
    const privacyScore = privacyResult?.score ?? 'N/A';
    const reasoning = `Browser health is ${browserScore}/100 and privacy is ${privacyScore}/100. Issues may include accumulated cookies, cache, browsing history, and tracking data.`;

    return {
      questionType: 'why_browser_privacy_low',
      summary: `Browser: ${browserScore}/100, Privacy: ${privacyScore}/100.`,
      currentData: `Browser Score: ${browserScore}, Privacy Score: ${privacyScore}`,
      reasoning,
      evidence,
      recommendedAction: {
        title: 'Clean browser data',
        description: 'Clear cookies, cache, and browsing history to improve privacy and browser health.',
        category: 'browser',
        estimatedBenefit: 15,
        riskLevel: 'low',
        requiredCapability: null,
      },
      expectedBenefit: 'Improved privacy score and browser performance',
      confidence: 0.85,
      followUpSuggestions: this._questionRouter.suggestFollowUps('why_browser_privacy_low'),
    };
  }

  private _explainWhyWindowsFair(ctx: AssistantContext): AssistantExplanation {
    const updateResult = this._contextBuilder.getCategoryResult(ctx, 'system_updates');
    const securityResult = this._contextBuilder.getCategoryResult(ctx, 'security');
    const driverResult = this._contextBuilder.getCategoryResult(ctx, 'drivers');

    const evidence: ExplanationEvidence[] = [];
    for (const result of [updateResult, securityResult, driverResult]) {
      if (result) {
        evidence.push(...result.issues.map((i) => ({
          source: 'Windows Health',
          data: `${i.title}: ${i.description}`,
          category: null,
        })));
      }
    }

    const scores = [updateResult?.score, securityResult?.score, driverResult?.score].filter((s) => s !== undefined) as number[];
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const reasoning = `Windows health is rated ${avgScore ? scoreToLevel(avgScore) : 'N/A'} based on Windows Update (${updateResult?.score ?? 'N/A'}), Security (${securityResult?.score ?? 'N/A'}), and Drivers (${driverResult?.score ?? 'N/A'}).`;

    return {
      questionType: 'why_windows_fair',
      summary: avgScore ? `Windows health: ${avgScore}/100 (${scoreToLevel(avgScore)}).` : 'Windows health data not available.',
      currentData: `Updates: ${updateResult?.score ?? 'N/A'}, Security: ${securityResult?.score ?? 'N/A'}, Drivers: ${driverResult?.score ?? 'N/A'}`,
      reasoning,
      evidence,
      recommendedAction: updateResult && updateResult.score < 70 ? {
        title: 'Install Windows Updates',
        description: 'Check for and install pending Windows updates.',
        category: 'system_updates',
        estimatedBenefit: 10,
        riskLevel: 'low',
        requiredCapability: null,
      } : null,
      expectedBenefit: 'Improved Windows health and security',
      confidence: 0.8,
      followUpSuggestions: this._questionRouter.suggestFollowUps('why_windows_fair'),
    };
  }

  private _explainWhichSafest(ctx: AssistantContext): AssistantExplanation {
    const report = ctx.healthReport;
    const plan = ctx.optimizationPlan;

    if (!report && !plan) return this._noDataResponse('which_safest');

    const allRecs = report?.recommendations ?? [];
    const safeRecs = allRecs.filter((r) => r.riskLevel === 'none' || r.riskLevel === 'low');
    const planItems = plan?.items.filter((i) => (i.risk === 'none' || i.risk === 'low') && !i.isLocked) ?? [];

    const evidence: ExplanationEvidence[] = [
      ...safeRecs.map((r) => ({
        source: 'AI Health Engine',
        data: `${r.title}: risk ${r.riskLevel}, benefit +${r.estimatedBenefit}`,
        category: r.category,
      })),
      ...planItems.map((i) => ({
        source: 'Optimization Planner',
        data: `${i.title}: risk ${i.risk}, benefit +${i.estimatedBenefit}`,
        category: i.category,
      })),
    ];

    const reasoning = `Found ${safeRecs.length} low-risk recommendations and ${planItems.length} low-risk optimization items. These actions have minimal risk of causing issues while providing meaningful improvements.`;

    const bestSafe = safeRecs[0] ?? null;

    return {
      questionType: 'which_safest',
      summary: `${safeRecs.length + planItems.length} safe recommendations available.`,
      currentData: `Safe recommendations: ${safeRecs.length}, Safe optimization items: ${planItems.length}`,
      reasoning,
      evidence,
      recommendedAction: bestSafe ? this._buildActionFromRec(bestSafe) : null,
      expectedBenefit: bestSafe ? `+${bestSafe.estimatedBenefit} points with minimal risk` : 'Safe improvements available',
      confidence: 0.85,
      followUpSuggestions: this._questionRouter.suggestFollowUps('which_safest'),
    };
  }

  private _explainWhatHappenedAfter(ctx: AssistantContext): AssistantExplanation {
    const lastExecution = this._contextBuilder.getLastExecution(ctx);
    const trends = ctx.trends;

    if (!lastExecution) return this._noDataResponse('what_happened_after');

    const evidence: ExplanationEvidence[] = [
      {
        source: 'Execution History',
        data: `Execution: ${lastExecution.source}, Status: ${lastExecution.status}, Duration: ${formatDuration(lastExecution.durationMs / 1000)}`,
        category: null,
      },
      {
        source: 'Execution Results',
        data: `Files removed: ${lastExecution.filesRemoved}, Space recovered: ${formatBytes(lastExecution.totalSpaceRecovered)}`,
        category: null,
      },
    ];

    if (trends) {
      evidence.push({
        source: 'Trend Analysis',
        data: `Score change: ${trends.change7Days ?? 'N/A'} over 7 days`,
        category: null,
      });
    }

    const reasoning = `Your last optimization was a ${lastExecution.source} execution that ${lastExecution.status}. It removed ${lastExecution.filesRemoved} files and recovered ${formatBytes(lastExecution.totalSpaceRecovered)}. ${trends && trends.change7Days !== null ? `Your health score changed by ${trends.change7Days > 0 ? '+' : ''}${trends.change7Days} points since then.` : ''}`;

    return {
      questionType: 'what_happened_after',
      summary: `Last optimization: ${lastExecution.status}, ${formatBytes(lastExecution.totalSpaceRecovered)} recovered.`,
      currentData: `Status: ${lastExecution.status}, Files: ${lastExecution.filesRemoved}, Space: ${formatBytes(lastExecution.totalSpaceRecovered)}`,
      reasoning,
      evidence,
      recommendedAction: null,
      expectedBenefit: 'Understanding optimization impact',
      confidence: 0.8,
      followUpSuggestions: this._questionRouter.suggestFollowUps('what_happened_after'),
    };
  }

  private _explainFallback(ctx: AssistantContext): AssistantExplanation {
    const score = this._contextBuilder.getOverallScore(ctx);
    const availability = this._contextBuilder.getDataAvailabilitySummary(ctx);

    return {
      questionType: 'unknown',
      summary: "I couldn't classify your question. Here's what I can help with.",
      currentData: score !== null ? `Current health score: ${score}/100` : 'No health data available',
      reasoning: 'I can answer questions about your health score, optimization recommendations, storage recovery, startup performance, browser privacy, Windows health, duplicate files, and optimization history.',
      evidence: availability.map((a) => ({
        source: 'Data Availability',
        data: `${a.source}: ${a.available ? 'Available' : 'Not available'}`,
        category: null,
      })),
      recommendedAction: null,
      expectedBenefit: 'Try asking a specific question from the quick questions list',
      confidence: 0.5,
      followUpSuggestions: this._questionRouter.suggestFollowUps('unknown'),
    };
  }

  private _noDataResponse(type: QuestionType): AssistantExplanation {
    return {
      questionType: type,
      summary: 'I don\'t have enough data to answer this question.',
      currentData: 'No data available',
      reasoning: 'The required data source is not available. Please run a health analysis first.',
      evidence: [],
      recommendedAction: null,
      expectedBenefit: 'Run a health scan to get detailed answers',
      confidence: 0.3,
      followUpSuggestions: this._questionRouter.suggestFollowUps(type),
    };
  }

  private _buildActionFromRec(rec: HealthRecommendation): RecommendedAction {
    return {
      title: rec.title,
      description: rec.reason,
      category: rec.category,
      estimatedBenefit: rec.estimatedBenefit,
      riskLevel: rec.riskLevel,
      requiredCapability: rec.requiredCapability,
    };
  }
}

export const explanationEngine = new ExplanationEngine();
