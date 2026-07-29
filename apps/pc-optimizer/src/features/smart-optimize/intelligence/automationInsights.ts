/**
 * Automation Insights — generates actionable intelligence insights.
 *
 * Generates: Most Valuable Rule, Least Useful Rule, Recommended New Rule,
 * Frequently Deferred Tasks, Optimization Opportunities, Automation Effectiveness,
 * Future Improvements, Prediction Accuracy, Rule Effectiveness, Health Trend.
 */
import type {
  IntelligenceInput,
  IntelligenceConfiguration,
  IntelligenceInsight,
  InsightResult,
  InsightPlugin,
  DetectedPattern,
  OutcomeAnalysisResult,
  DecisionAnalysisResult,
  IntelligenceStatistics,
} from './types';
import { generateInsightId } from './types';

export interface InsightContext {
  patterns: DetectedPattern[];
  outcomes: OutcomeAnalysisResult;
  decisions: DecisionAnalysisResult;
  statistics: IntelligenceStatistics;
}

export class AutomationInsights {
  private _config: IntelligenceConfiguration;
  private _plugins: InsightPlugin[] = [];

  constructor(config: IntelligenceConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: InsightPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  generate(input: IntelligenceInput, context: InsightContext): InsightResult {
    const insights: IntelligenceInsight[] = [];

    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const insight = plugin.generate(input);
        if (insight) insights.push(insight);
      }
    }

    insights.push(...this._generateBuiltin(input, context));

    return {
      insights,
      generatedAt: new Date().toISOString(),
      totalInsights: insights.length,
      futureMetadata: {},
    };
  }

  private _generateBuiltin(input: IntelligenceInput, context: InsightContext): IntelligenceInsight[] {
    const insights: IntelligenceInsight[] = [];

    const mostValuable = this._mostValuableRule(input, context);
    if (mostValuable) insights.push(mostValuable);

    const leastUseful = this._leastUsefulRule(input, context);
    if (leastUseful) insights.push(leastUseful);

    const recommendedNew = this._recommendedNewRule(input, context);
    if (recommendedNew) insights.push(recommendedNew);

    const deferredTasks = this._frequentlyDeferredTasks(input, context);
    if (deferredTasks) insights.push(deferredTasks);

    const opportunities = this._optimizationOpportunities(input, context);
    if (opportunities) insights.push(opportunities);

    const effectiveness = this._automationEffectiveness(input, context);
    if (effectiveness) insights.push(effectiveness);

    const futureImprovements = this._futureImprovements(input, context);
    if (futureImprovements) insights.push(futureImprovements);

    const predictionAccuracy = this._predictionAccuracy(input, context);
    if (predictionAccuracy) insights.push(predictionAccuracy);

    const ruleEffectiveness = this._ruleEffectiveness(input, context);
    if (ruleEffectiveness) insights.push(ruleEffectiveness);

    const healthTrend = this._healthTrend(input, context);
    if (healthTrend) insights.push(healthTrend);

    return insights;
  }

  private _mostValuableRule(_input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const topRules = context.statistics.topRules.filter((r) => r.totalTriggers >= 3);
    if (topRules.length === 0) return null;

    const best = topRules
      .sort((a, b) => (b.successRate * b.averageBenefit) - (a.successRate * a.averageBenefit))[0]!;

    return {
      id: generateInsightId(),
      type: 'most_valuable_rule',
      title: `Most Valuable Rule: ${best.ruleId}`,
      description: `Rule "${best.ruleId}" has ${(best.successRate * 100).toFixed(0)}% success rate with ${best.totalTriggers} triggers and average benefit ${best.averageBenefit.toFixed(2)}`,
      confidence: best.successRate,
      impact: best.averageBenefit,
      supportingEvidence: [
        { source: 'statistics', metric: 'rule_success_rate', value: best.successRate, timestamp: new Date().toISOString(), description: `Success rate: ${(best.successRate * 100).toFixed(1)}%`, futureMetadata: {} },
        { source: 'statistics', metric: 'rule_total_triggers', value: best.totalTriggers, timestamp: new Date().toISOString(), description: `Total triggers: ${best.totalTriggers}`, futureMetadata: {} },
        { source: 'statistics', metric: 'rule_avg_benefit', value: best.averageBenefit, timestamp: new Date().toISOString(), description: `Average benefit: ${best.averageBenefit.toFixed(2)}`, futureMetadata: {} },
      ],
      actionable: true,
      suggestedActions: [`Prioritize rule ${best.ruleId} in automation evaluation`, 'Consider enabling auto-approval for this rule'],
      futureMetadata: {},
    };
  }

  private _leastUsefulRule(_input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const lowRules = context.statistics.topRules.filter((r) => r.totalTriggers >= 3 && r.successRate < 0.3);
    if (lowRules.length === 0) return null;

    const worst = lowRules.sort((a, b) => a.successRate - b.successRate)[0]!;

    return {
      id: generateInsightId(),
      type: 'least_useful_rule',
      title: `Least Useful Rule: ${worst.ruleId}`,
      description: `Rule "${worst.ruleId}" has only ${(worst.successRate * 100).toFixed(0)}% success rate with ${worst.totalTriggers} triggers — consider disabling or revising`,
      confidence: 1.0 - worst.successRate,
      impact: worst.averageBenefit,
      supportingEvidence: [
        { source: 'statistics', metric: 'rule_success_rate', value: worst.successRate, timestamp: new Date().toISOString(), description: `Success rate: ${(worst.successRate * 100).toFixed(1)}%`, futureMetadata: {} },
        { source: 'statistics', metric: 'rule_approval_rate', value: worst.approvalRate, timestamp: new Date().toISOString(), description: `Approval rate: ${(worst.approvalRate * 100).toFixed(1)}%`, futureMetadata: {} },
      ],
      actionable: true,
      suggestedActions: [`Review conditions for rule ${worst.ruleId}`, 'Consider disabling if no improvement after revision'],
      futureMetadata: {},
    };
  }

  private _recommendedNewRule(input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const acceptedPattern = context.patterns.find((p) => p.type === 'frequently_accepted');
    if (!acceptedPattern) return null;

    return {
      id: generateInsightId(),
      type: 'recommended_new_rule',
      title: 'Recommended New Rule',
      description: `Based on accepted patterns, consider creating a new rule for trigger types: ${acceptedPattern.affectedTriggers.join(', ') || 'detected patterns'}`,
      confidence: acceptedPattern.confidence,
      impact: 0.5,
      supportingEvidence: acceptedPattern.supportingEvidence,
      actionable: true,
      suggestedActions: ['Create a new automation rule based on the accepted pattern', 'Use similar conditions and actions as the frequently accepted rules'],
      futureMetadata: {},
    };
  }

  private _frequentlyDeferredTasks(input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const deferredPattern = context.patterns.find((p) => p.type === 'frequently_deferred');
    if (!deferredPattern) return null;

    return {
      id: generateInsightId(),
      type: 'frequently_deferred_tasks',
      title: 'Frequently Deferred Tasks',
      description: `${deferredPattern.affectedRules.length} rule(s) are frequently deferred — consider adjusting cooldown or safety policies`,
      confidence: deferredPattern.confidence,
      impact: 0.4,
      supportingEvidence: deferredPattern.supportingEvidence,
      actionable: true,
      suggestedActions: ['Reduce cooldown duration for affected rules', 'Review safety policies that may be too restrictive'],
      futureMetadata: {},
    };
  }

  private _optimizationOpportunities(input: IntelligenceInput, _context: InsightContext): IntelligenceInsight | null {
    if (input.healthScore < 60) {
      return {
        id: generateInsightId(),
        type: 'optimization_opportunities',
        title: 'Optimization Opportunity: Low Health Score',
        description: `Current health score is ${input.healthScore}/100 — significant optimization opportunity available`,
        confidence: 0.8,
        impact: (100 - input.healthScore) / 100,
        supportingEvidence: [
          { source: 'system_state', metric: 'health_score', value: input.healthScore, timestamp: new Date().toISOString(), description: `Health score: ${input.healthScore}/100`, futureMetadata: {} },
        ],
        actionable: true,
        suggestedActions: ['Generate an optimization plan targeting the lowest health areas', 'Schedule maintenance during the next idle window'],
        futureMetadata: {},
      };
    }
    return null;
  }

  private _automationEffectiveness(input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const stats = context.statistics;
    if (stats.totalHistoryEntries < 5) return null;

    const effectivenessScore = (stats.overallSuccessRate * 0.4 + stats.overallAcceptanceRate * 0.3 + stats.averageConfidence * 0.3);

    return {
      id: generateInsightId(),
      type: 'automation_effectiveness',
      title: 'Automation Effectiveness',
      description: `Automation effectiveness score: ${(effectivenessScore * 100).toFixed(0)}% (success: ${(stats.overallSuccessRate * 100).toFixed(0)}%, acceptance: ${(stats.overallAcceptanceRate * 100).toFixed(0)}%, confidence: ${stats.averageConfidence.toFixed(2)})`,
      confidence: effectivenessScore,
      impact: effectivenessScore,
      supportingEvidence: [
        { source: 'statistics', metric: 'success_rate', value: stats.overallSuccessRate, timestamp: new Date().toISOString(), description: `Success rate: ${(stats.overallSuccessRate * 100).toFixed(1)}%`, futureMetadata: {} },
        { source: 'statistics', metric: 'acceptance_rate', value: stats.overallAcceptanceRate, timestamp: new Date().toISOString(), description: `Acceptance rate: ${(stats.overallAcceptanceRate * 100).toFixed(1)}%`, futureMetadata: {} },
        { source: 'statistics', metric: 'avg_confidence', value: stats.averageConfidence, timestamp: new Date().toISOString(), description: `Average confidence: ${stats.averageConfidence.toFixed(2)}`, futureMetadata: {} },
      ],
      actionable: false,
      suggestedActions: [],
      futureMetadata: {},
    };
  }

  private _futureImprovements(input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const improvements: string[] = [];
    if (context.outcomes.overallSuccessRate < 0.7) improvements.push('Improve success rate by disabling underperforming rules');
    if (context.decisions.metrics.ignoreRate > 0.2) improvements.push('Reduce ignore rate by improving trigger relevance');
    if (context.decisions.metrics.rejectionRate > 0.3) improvements.push('Reduce rejection rate by adjusting risk thresholds');
    if (context.statistics.averageConfidence < 0.5) improvements.push('Improve prediction confidence with more historical data');

    if (improvements.length === 0) return null;

    return {
      id: generateInsightId(),
      type: 'future_improvements',
      title: 'Future Improvements',
      description: improvements.join('; '),
      confidence: 0.6,
      impact: 0.5,
      supportingEvidence: [
        { source: 'outcome_analysis', metric: 'overall_success_rate', value: context.outcomes.overallSuccessRate, timestamp: new Date().toISOString(), description: `Success rate: ${(context.outcomes.overallSuccessRate * 100).toFixed(1)}%`, futureMetadata: {} },
        { source: 'decision_analysis', metric: 'ignore_rate', value: context.decisions.metrics.ignoreRate, timestamp: new Date().toISOString(), description: `Ignore rate: ${(context.decisions.metrics.ignoreRate * 100).toFixed(1)}%`, futureMetadata: {} },
      ],
      actionable: true,
      suggestedActions: improvements,
      futureMetadata: {},
    };
  }

  private _predictionAccuracy(input: IntelligenceInput, _context: InsightContext): IntelligenceInsight | null {
    const entries = input.automationHistory;
    if (entries.length < 5) return null;

    const entriesWithPrediction = entries.filter((e) => e.metadata['predictedSuccess'] !== undefined);
    if (entriesWithPrediction.length < 3) return null;

    let totalError = 0;
    for (const e of entriesWithPrediction) {
      const predicted = e.metadata['predictedSuccess'] as number;
      const actual = e.outcome === 'executed' ? 1.0 : 0.0;
      totalError += Math.abs(predicted - actual);
    }
    const avgError = totalError / entriesWithPrediction.length;
    const accuracy = 1.0 - avgError;

    return {
      id: generateInsightId(),
      type: 'prediction_accuracy',
      title: 'Prediction Accuracy',
      description: `Prediction accuracy: ${(accuracy * 100).toFixed(0)}% based on ${entriesWithPrediction.length} predictions with known outcomes`,
      confidence: accuracy,
      impact: accuracy,
      supportingEvidence: [
        { source: 'automation_history', metric: 'prediction_accuracy', value: accuracy, timestamp: new Date().toISOString(), description: `Accuracy: ${(accuracy * 100).toFixed(1)}%`, futureMetadata: {} },
        { source: 'automation_history', metric: 'predictions_evaluated', value: entriesWithPrediction.length, timestamp: new Date().toISOString(), description: `${entriesWithPrediction.length} predictions evaluated`, futureMetadata: {} },
      ],
      actionable: false,
      suggestedActions: [],
      futureMetadata: {},
    };
  }

  private _ruleEffectiveness(input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const rules = context.statistics.topRules;
    if (rules.length < 2) return null;

    const effective = rules.filter((r) => r.successRate >= 0.7).length;
    const total = rules.length;
    const effectivenessRate = effective / total;

    return {
      id: generateInsightId(),
      type: 'rule_effectiveness',
      title: 'Rule Effectiveness',
      description: `${effective}/${total} rules have success rate >= 70% (${(effectivenessRate * 100).toFixed(0)}% effectiveness)`,
      confidence: effectivenessRate,
      impact: effectivenessRate,
      supportingEvidence: [
        { source: 'statistics', metric: 'effective_rules', value: effective, timestamp: new Date().toISOString(), description: `${effective} effective rules`, futureMetadata: {} },
        { source: 'statistics', metric: 'total_rules', value: total, timestamp: new Date().toISOString(), description: `${total} total rules`, futureMetadata: {} },
      ],
      actionable: true,
      suggestedActions: ['Review rules with success rate below 70%', 'Consider disabling rules with consistently low success rates'],
      futureMetadata: {},
    };
  }

  private _healthTrend(input: IntelligenceInput, context: InsightContext): IntelligenceInsight | null {
    const healthTrend = context.outcomes.trends.find((t) => t.metric === 'success_rate');
    if (!healthTrend) return null;

    return {
      id: generateInsightId(),
      type: 'health_trend',
      title: `Health Trend: ${healthTrend.direction}`,
      description: `Success rate is ${healthTrend.direction} (change: ${(healthTrend.changeRate * 100).toFixed(1)}%, current: ${(healthTrend.currentValue * 100).toFixed(1)}%)`,
      confidence: Math.abs(healthTrend.changeRate),
      impact: Math.abs(healthTrend.changeRate),
      supportingEvidence: healthTrend.supportingEvidence,
      actionable: healthTrend.direction === 'declining',
      suggestedActions: healthTrend.direction === 'declining'
        ? ['Investigate causes of declining success rate', 'Review recently changed rules or policies']
        : [],
      futureMetadata: {},
    };
  }
}
