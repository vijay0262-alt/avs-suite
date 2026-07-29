/**
 * Insight Composer — composes insights from knowledge and recommendations.
 *
 * The composer builds structured insight objects by combining knowledge facts,
 * recommendation data, and evidence into explainable summaries.
 *
 * It NEVER invents information. Every insight is traceable.
 */
import type {
  KnowledgeObject,
  KnowledgeFact,
  Recommendation,
  Insight,
  InsightType,
  InsightCategory,
  InsightEvidence,
  InsightConfiguration,
} from './types';
import {
  generateInsightId,
  createInsightEvidence,
  estimateReadingTime,
  clampScore,
} from './types';

export class InsightComposer {
  private _config: InsightConfiguration;

  constructor(config: InsightConfiguration) {
    this._config = config;
  }

  updateConfig(config: InsightConfiguration): void {
    this._config = config;
  }

  /**
   * Compose a morning brief insight.
   */
  composeMorningBrief(knowledge: KnowledgeObject, recommendations: Recommendation[]): Insight {
    const healthFact = knowledge.facts.find((f) => f.name === 'overall_score');
    const healthScore = healthFact && typeof healthFact.value === 'number' ? healthFact.value : 0;

    const changes = knowledge.changes;
    const changeDescriptions = changes.slice(0, 5).map((c) => c.deltaDescription);

    const topRecs = recommendations.slice(0, 3);
    const recTitles = topRecs.map((r) => r.title);

    const estimatedTime = topRecs.reduce((sum, r) => sum + r.benefits.estimatedTime, 0);
    const estimatedHealthGain = topRecs.reduce((sum, r) => sum + (r.benefits.estimatedHealthIncrease ?? 0), 0);
    const projectedHealth = Math.min(100, healthScore + estimatedHealthGain);

    const summary = `Overall Health: ${healthScore}. ${changes.length} change${changes.length !== 1 ? 's' : ''} since last scan. ${topRecs.length} recommendation${topRecs.length !== 1 ? 's' : ''} available. Estimated time: ${estimatedTime}s. Projected health after optimization: ${projectedHealth}.`;

    const description = [
      `Good morning! Here's your system overview.`,
      '',
      `**Overall Health:** ${healthScore}`,
      '',
      '**Changes since last scan:**',
      changeDescriptions.length > 0 ? changeDescriptions.map((c) => `- ${c}`).join('\n') : '- No significant changes detected',
      '',
      '**AI recommends:**',
      recTitles.length > 0 ? recTitles.map((r) => `- ${r}`).join('\n') : '- No recommendations at this time',
      '',
      `**Estimated time:** ${estimatedTime} seconds`,
      `**Estimated health after optimization:** ${projectedHealth}`,
    ].join('\n');

    const facts = [healthFact, ...topRecs.flatMap((r) => knowledge.facts.filter((f) => r.evidence.supportingFacts.includes(f.id)))].filter(Boolean) as KnowledgeFact[];
    const evidence = createInsightEvidence(
      facts,
      topRecs.map((r) => r.id),
      [knowledge.metadata.knowledgeId],
    );

    return this._createInsight(
      'morning_brief', 'system',
      'Morning Brief', `Your daily system overview`,
      summary, description,
      evidence, facts, topRecs.map((r) => r.id), [knowledge.metadata.knowledgeId],
      this._getExpirationHours('morning_brief'),
    );
  }

  /**
   * Compose an evening summary insight.
   */
  composeEveningSummary(knowledge: KnowledgeObject, recommendations: Recommendation[]): Insight {
    const healthFact = knowledge.facts.find((f) => f.name === 'overall_score');
    const healthScore = healthFact && typeof healthFact.value === 'number' ? healthFact.value : 0;

    const changes = knowledge.changes;
    const improvements = changes.filter((c) => c.changeType === 'improved');
    const degradations = changes.filter((c) => c.changeType === 'degraded');

    const summary = `Today's summary: Health at ${healthScore}. ${improvements.length} improvement${improvements.length !== 1 ? 's' : ''}, ${degradations.length} degradation${degradations.length !== 1 ? 's' : ''}. ${recommendations.length} pending recommendation${recommendations.length !== 1 ? 's' : ''}.`;

    const description = [
      `Here's your evening summary.`,
      '',
      `**Overall Health:** ${healthScore}`,
      `**Improvements today:** ${improvements.length}`,
      `**Degradations today:** ${degradations.length}`,
      `**Pending recommendations:** ${recommendations.length}`,
    ].join('\n');

    const facts = [healthFact].filter(Boolean) as KnowledgeFact[];
    const evidence = createInsightEvidence(facts, [], [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      'evening_summary', 'system',
      'Evening Summary', `Your end-of-day system summary`,
      summary, description,
      evidence, facts, [], [knowledge.metadata.knowledgeId],
      this._getExpirationHours('evening_summary'),
    );
  }

  /**
   * Compose a health summary insight.
   */
  composeHealthSummary(knowledge: KnowledgeObject, _recommendations: Recommendation[]): Insight {
    const healthFacts = knowledge.facts.filter((f) => f.category === 'health');
    const overallScore = healthFacts.find((f) => f.name === 'overall_score');
    const score = overallScore && typeof overallScore.value === 'number' ? overallScore.value : 0;

    const cpuScore = healthFacts.find((f) => f.name === 'cpu_score');
    const ramScore = healthFacts.find((f) => f.name === 'ram_score');
    const diskScore = healthFacts.find((f) => f.name === 'disk_score');
    const securityScore = healthFacts.find((f) => f.name === 'security_score');

    const summary = `System health: ${score}/100. CPU: ${cpuScore?.value ?? '?'}, RAM: ${ramScore?.value ?? '?'}, Disk: ${diskScore?.value ?? '?'}, Security: ${securityScore?.value ?? '?'}.`;

    const description = [
      '## Health Summary',
      '',
      `**Overall:** ${score}/100`,
      `**CPU:** ${cpuScore?.value ?? 'N/A'}`,
      `**RAM:** ${ramScore?.value ?? 'N/A'}`,
      `**Disk:** ${diskScore?.value ?? 'N/A'}`,
      `**Security:** ${securityScore?.value ?? 'N/A'}`,
      '',
      score >= 80 ? 'Your system is in excellent health.' : score >= 60 ? 'Your system health is good but has room for improvement.' : 'Your system health needs attention.',
    ].join('\n');

    const evidence = createInsightEvidence(healthFacts, [], [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      'health_summary', 'health',
      'Health Summary', `Your system health overview`,
      summary, description,
      evidence, healthFacts, [], [knowledge.metadata.knowledgeId],
      this._getExpirationHours('health_summary'),
    );
  }

  /**
   * Compose an optimization summary insight.
   */
  composeOptimizationSummary(knowledge: KnowledgeObject, recommendations: Recommendation[]): Insight {
    const completedRecs = recommendations.filter((r) => r.status === 'completed');
    const spaceRecovered = completedRecs.reduce((sum, r) => sum + (r.benefits.estimatedSpaceRecovered ?? 0), 0);
    const healthGain = completedRecs.reduce((sum, r) => sum + (r.benefits.estimatedHealthIncrease ?? 0), 0);
    const timeSpent = completedRecs.reduce((sum, r) => sum + r.benefits.estimatedTime, 0);

    const summary = `Optimization completed. ${completedRecs.length} action${completedRecs.length !== 1 ? 's' : ''} taken. ${spaceRecovered > 0 ? `${spaceRecovered}MB recovered. ` : ''}Health ${healthGain > 0 ? `+${healthGain} ` : ''}in ${timeSpent}s.`;

    const description = [
      "Today's optimization completed.",
      '',
      '**Actions taken:**',
      completedRecs.length > 0 ? completedRecs.map((r) => `- ${r.title}`).join('\n') : '- No actions taken',
      '',
      spaceRecovered > 0 ? `**Space recovered:** ${spaceRecovered}MB` : '',
      healthGain > 0 ? `**Health increased by:** ${healthGain}` : '',
      `**Time spent:** ${timeSpent}s`,
      '',
      '**Rollback available**',
    ].filter(Boolean).join('\n');

    const facts = knowledge.facts.filter((f) =>
      completedRecs.some((r) => r.evidence.supportingFacts.includes(f.id)) ||
      recommendations.some((r) => r.evidence.supportingFacts.includes(f.id)),
    ).slice(0, 10);
    const evidence = createInsightEvidence(facts, recommendations.map((r) => r.id), [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      'optimization_summary', 'maintenance',
      'Optimization Summary', `Summary of completed optimizations`,
      summary, description,
      evidence, facts, completedRecs.map((r) => r.id), [knowledge.metadata.knowledgeId],
      this._getExpirationHours('optimization_summary'),
    );
  }

  /**
   * Compose a recommendation summary insight.
   */
  composeRecommendationSummary(knowledge: KnowledgeObject, recommendations: Recommendation[]): Insight {
    const topRecs = recommendations.slice(0, 5);
    const summary = `${recommendations.length} recommendation${recommendations.length !== 1 ? 's' : ''} available. Top: ${topRecs.map((r) => r.title).join(', ')}.`;

    const description = [
      '## Recommendation Summary',
      '',
      `**Total recommendations:** ${recommendations.length}`,
      '',
      '**Top recommendations:**',
      topRecs.map((r) => `- ${r.title} (Priority: ${r.priority})`).join('\n'),
    ].join('\n');

    const facts = knowledge.facts.filter((f) => topRecs.some((r) => r.evidence.supportingFacts.includes(f.id)));
    const evidence = createInsightEvidence(facts, topRecs.map((r) => r.id), [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      'recommendation_summary', 'system',
      'Recommendation Summary', `Your current recommendations overview`,
      summary, description,
      evidence, facts, topRecs.map((r) => r.id), [knowledge.metadata.knowledgeId],
      this._getExpirationHours('recommendation_summary'),
    );
  }

  /**
   * Compose a category-specific summary insight.
   */
  composeCategorySummary(
    knowledge: KnowledgeObject,
    recommendations: Recommendation[],
    category: InsightCategory,
    insightType: InsightType,
    title: string,
  ): Insight {
    const categoryFacts = knowledge.facts.filter((f) => this._mapFactCategory(f.category) === category);
    const categoryRecs = recommendations.filter((r) => r.category === category);

    const summary = `${title}: ${categoryFacts.length} fact${categoryFacts.length !== 1 ? 's' : ''}, ${categoryRecs.length} recommendation${categoryRecs.length !== 1 ? 's' : ''}.`;

    const factLines = categoryFacts.slice(0, 10).map((f) => `- ${f.description}: ${f.value}${f.unit ? ' ' + f.unit : ''}`);
    const description = [
      `## ${title}`,
      '',
      '**Current state:**',
      factLines.length > 0 ? factLines.join('\n') : '- No data available',
      '',
      categoryRecs.length > 0 ? '**Recommendations:**' : '',
      categoryRecs.length > 0 ? categoryRecs.map((r) => `- ${r.title}`).join('\n') : '',
    ].filter(Boolean).join('\n');

    const evidence = createInsightEvidence(categoryFacts, categoryRecs.map((r) => r.id), [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      insightType, category,
      title, `Your ${category} overview`,
      summary, description,
      evidence, categoryFacts, categoryRecs.map((r) => r.id), [knowledge.metadata.knowledgeId],
      this._getExpirationHours(insightType),
    );
  }

  /**
   * Compose a system change insight.
   */
  composeSystemChange(knowledge: KnowledgeObject, _recommendations: Recommendation[]): Insight[] {
    const insights: Insight[] = [];

    for (const change of knowledge.changes) {
      const fact = knowledge.facts.find((f) => f.id === change.factId);
      if (!fact) continue;

      const summary = `${change.deltaDescription} (${change.changeType})`;
      const description = [
        `## System Change Detected`,
        '',
        `**Change:** ${change.deltaDescription}`,
        `**Type:** ${change.changeType}`,
        `**Fact:** ${fact.description}`,
        `**Previous value:** ${change.previousValue}`,
        `**Current value:** ${change.currentValue}`,
      ].join('\n');

      const evidence = createInsightEvidence([fact], [], [knowledge.metadata.knowledgeId]);

      insights.push(this._createInsight(
        'system_change', this._mapFactCategory(fact.category),
        'System Change', change.deltaDescription,
        summary, description,
        evidence, [fact], [], [knowledge.metadata.knowledgeId],
        this._getExpirationHours('system_change'),
      ));
    }

    return insights;
  }

  /**
   * Compose an achievement insight.
   */
  composeAchievement(
    name: string,
    description: string,
    category: InsightCategory,
    importance: number,
    knowledge: KnowledgeObject,
  ): Insight {
    const summary = `Achievement unlocked: ${name}`;
    const desc = [
      `## Achievement Unlocked!`,
      '',
      `**${name}**`,
      '',
      description,
    ].join('\n');

    const evidence = createInsightEvidence(knowledge.facts.slice(0, 3), [], [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      'achievement', category,
      name, 'Achievement unlocked',
      summary, desc,
      evidence, knowledge.facts.slice(0, 3), [], [knowledge.metadata.knowledgeId],
      this._getExpirationHours('achievement'),
      importance,
    );
  }

  /**
   * Compose a milestone insight.
   */
  composeMilestone(
    name: string,
    description: string,
    category: InsightCategory,
    target: number,
    current: number,
    importance: number,
    knowledge: KnowledgeObject,
  ): Insight {
    const summary = `Milestone reached: ${name} (${current}/${target})`;
    const desc = [
      `## Milestone Reached!`,
      '',
      `**${name}**`,
      '',
      description,
      '',
      `**Target:** ${target}`,
      `**Current:** ${current}`,
    ].join('\n');

    const evidence = createInsightEvidence(knowledge.facts.slice(0, 3), [], [knowledge.metadata.knowledgeId]);

    return this._createInsight(
      'milestone', category,
      name, 'Milestone reached',
      summary, desc,
      evidence, knowledge.facts.slice(0, 3), [], [knowledge.metadata.knowledgeId],
      this._getExpirationHours('milestone'),
      importance,
    );
  }

  // ── Private ────────────────────────────────────────────────

  private _createInsight(
    type: InsightType,
    category: InsightCategory,
    title: string,
    subtitle: string,
    summary: string,
    description: string,
    evidence: InsightEvidence,
    facts: KnowledgeFact[],
    relatedRecs: string[],
    relatedKnowledge: string[],
    expirationHours: number,
    importanceOverride?: number,
  ): Insight {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

    const importance = importanceOverride ?? this._calculateImportance(facts, evidence.confidence, type);

    return {
      id: generateInsightId(type, title),
      title,
      subtitle,
      summary,
      description,
      category,
      type,
      priority: 'informational',
      generatedAt: now,
      expiresAt,
      importanceScore: clampScore(importance),
      confidenceScore: clampScore(evidence.confidence),
      estimatedReadingTime: estimateReadingTime(description),
      relatedRecommendations: relatedRecs,
      relatedKnowledge,
      relatedFacts: facts.map((f) => f.id),
      evidence,
      status: 'active',
      futureMetadata: {},
    };
  }

  private _calculateImportance(facts: KnowledgeFact[], confidence: number, type: InsightType): number {
    let importance = 0.3;

    if (facts.length > 5) importance += 0.2;
    else if (facts.length > 2) importance += 0.1;

    importance += confidence * 0.3;

    if (type === 'morning_brief') importance += 0.2;
    if (type === 'health_summary') importance += 0.15;
    if (type === 'optimization_summary') importance += 0.15;
    if (type === 'system_change') importance += 0.1;
    if (type === 'achievement' || type === 'milestone') importance += 0.25;

    return clampScore(importance);
  }

  private _getExpirationHours(type: InsightType): number {
    const rules = this._config.expirationRules;
    switch (type) {
      case 'morning_brief': return rules.morningBriefExpirationHours;
      case 'evening_summary': return rules.eveningSummaryExpirationHours;
      case 'achievement': return rules.achievementExpirationHours;
      case 'milestone': return rules.milestoneExpirationHours;
      default: return rules.defaultExpirationHours;
    }
  }

  private _mapFactCategory(factCategory: string): InsightCategory {
    const map: Record<string, InsightCategory> = {
      system: 'system', health: 'health', performance: 'performance',
      storage: 'storage', browser: 'browser', privacy: 'privacy',
      startup: 'startup', windows: 'windows', duplicates: 'duplicates',
      scheduler: 'automation', history: 'maintenance', reports: 'maintenance',
      experience: 'maintenance', capabilities: 'maintenance', quota: 'maintenance',
      analytics: 'maintenance', custom: 'custom',
    };
    return map[factCategory] ?? 'custom';
  }
}
