/**
 * Insight Generator — generates insights from knowledge and recommendations.
 *
 * This generator analyzes knowledge facts, recommendations, changes, and
 * trends to produce structured, evidence-based insights.
 *
 * It NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY produces intelligent insights.
 *
 * Extensibility: Future modules register insight provider plugins.
 */
import type {
  KnowledgeObject,
  Recommendation,
  Insight,
  InsightType,
  InsightCategory,
  Achievement,
  Milestone,
  InsightConfiguration,
} from './types';
import { InsightComposer } from './insightComposer';

export class InsightGenerator {
  private _composer: InsightComposer;
  private _config: InsightConfiguration;

  constructor(config: InsightConfiguration) {
    this._config = config;
    this._composer = new InsightComposer(config);
  }

  updateConfig(config: InsightConfiguration): void {
    this._config = config;
    this._composer.updateConfig(config);
  }

  /**
   * Generate insights from knowledge and recommendations.
   */
  generate(knowledge: KnowledgeObject, recommendations: Recommendation[]): Insight[] {
    if (knowledge.facts.length === 0) return [];

    const insights: Insight[] = [];

    for (const type of this._config.enabledTypes) {
      const typeInsights = this._generateByType(type, knowledge, recommendations);
      // Filter out insights with no evidence
      insights.push(...typeInsights.filter((i) => i.evidence.evidenceCount > 0));
    }

    // Generate achievements
    const achievements = this._checkAchievements(knowledge, recommendations);
    for (const achievement of achievements) {
      insights.push(this._composer.composeAchievement(
        achievement.name, achievement.description, achievement.category,
        achievement.importance, knowledge,
      ));
    }

    // Generate milestones
    const milestones = this._checkMilestones(knowledge, recommendations);
    for (const milestone of milestones) {
      insights.push(this._composer.composeMilestone(
        milestone.name, milestone.description, milestone.category,
        milestone.target, milestone.current, milestone.importance, knowledge,
      ));
    }

    return insights;
  }

  /**
   * Generate insights for a specific type.
   */
  generateByType(type: InsightType, knowledge: KnowledgeObject, recommendations: Recommendation[]): Insight[] {
    return this._generateByType(type, knowledge, recommendations);
  }

  /**
   * Get the composer.
   */
  getComposer(): InsightComposer {
    return this._composer;
  }

  // ── Private ────────────────────────────────────────────────

  private _generateByType(
    type: InsightType,
    knowledge: KnowledgeObject,
    recommendations: Recommendation[],
  ): Insight[] {
    switch (type) {
      case 'morning_brief': {
        if (!knowledge.facts.some((f) => f.category === 'health' || f.category === 'system')) return [];
        return [this._composer.composeMorningBrief(knowledge, recommendations)];
      }
      case 'evening_summary': {
        if (!knowledge.facts.some((f) => f.category === 'health' || f.category === 'system')) return [];
        return [this._composer.composeEveningSummary(knowledge, recommendations)];
      }
      case 'optimization_summary': {
        if (recommendations.length === 0) return [];
        return [this._composer.composeOptimizationSummary(knowledge, recommendations)];
      }
      case 'health_summary': {
        if (!knowledge.facts.some((f) => f.category === 'health')) return [];
        return [this._composer.composeHealthSummary(knowledge, recommendations)];
      }
      case 'recommendation_summary': {
        if (recommendations.length === 0) return [];
        return [this._composer.composeRecommendationSummary(knowledge, recommendations)];
      }
      case 'system_change':
        return this._composer.composeSystemChange(knowledge, recommendations);
      case 'performance_summary':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'performance', 'performance_summary', 'Performance Summary');
      case 'storage_summary':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'storage', 'storage_summary', 'Storage Summary');
      case 'privacy_summary':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'privacy', 'privacy_summary', 'Privacy Summary');
      case 'windows_summary':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'windows', 'windows_summary', 'Windows Summary');
      case 'security_summary':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'security', 'security_summary', 'Security Summary');
      case 'maintenance_summary': {
        const results: Insight[] = [];
        const startup = this._generateCategoryIfFacts(knowledge, recommendations, 'startup', 'maintenance_summary', 'Startup Summary');
        results.push(...startup);
        const maint = this._generateCategoryIfFacts(knowledge, recommendations, 'maintenance', 'maintenance_summary', 'Maintenance Summary');
        results.push(...maint);
        return results;
      }
      case 'automation_summary':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'automation', 'automation_summary', 'Automation Summary');
      case 'weekly_digest':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'system', 'weekly_digest', 'Weekly Digest');
      case 'monthly_digest':
        return this._generateCategoryIfFacts(knowledge, recommendations, 'system', 'monthly_digest', 'Monthly Digest');
      case 'achievement':
      case 'milestone':
        return [];
      default:
        return [];
    }
  }

  private _generateCategoryIfFacts(
    knowledge: KnowledgeObject,
    recommendations: Recommendation[],
    category: InsightCategory,
    insightType: InsightType,
    title: string,
  ): Insight[] {
    const hasFacts = knowledge.facts.some((f) => this._mapFactCategory(f.category) === category);
    if (!hasFacts) return [];
    return [this._composer.composeCategorySummary(knowledge, recommendations, category, insightType, title)];
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

  private _checkAchievements(knowledge: KnowledgeObject, recommendations: Recommendation[]): Achievement[] {
    const achievements: Achievement[] = [];
    const now = new Date().toISOString();

    // Health above 95
    const overallScore = knowledge.facts.find((f) => f.name === 'overall_score');
    if (overallScore && typeof overallScore.value === 'number' && overallScore.value >= 95) {
      achievements.push({
        id: 'achievement_health_above_95',
        name: 'Excellent Health',
        description: 'System health is above 95!',
        category: 'health',
        unlockedAt: now,
        importance: 0.9,
        milestone: false,
        metadata: { score: overallScore.value },
      });
    }

    // No dangerous startup apps
    const startupItems = knowledge.facts.find((f) => f.name === 'total_items');
    const enabledItems = knowledge.facts.find((f) => f.name === 'enabled_items');
    if (startupItems && enabledItems && typeof startupItems.value === 'number' && typeof enabledItems.value === 'number' && enabledItems.value <= 5) {
      achievements.push({
        id: 'achievement_clean_startup',
        name: 'Clean Startup',
        description: 'Startup programs are minimal and optimized.',
        category: 'startup',
        unlockedAt: now,
        importance: 0.7,
        milestone: false,
        metadata: { enabled: enabledItems.value },
      });
    }

    // Windows fully updated
    const pendingUpdates = knowledge.facts.find((f) => f.name === 'pending_updates');
    if (pendingUpdates && typeof pendingUpdates.value === 'number' && pendingUpdates.value === 0) {
      achievements.push({
        id: 'achievement_windows_updated',
        name: 'Windows Fully Updated',
        description: 'All Windows updates are installed.',
        category: 'windows',
        unlockedAt: now,
        importance: 0.6,
        milestone: false,
        metadata: {},
      });
    }

    // Browser privacy excellent
    const trackingCookies = knowledge.facts.find((f) => f.name === 'tracking_cookies');
    if (trackingCookies && typeof trackingCookies.value === 'number' && trackingCookies.value === 0) {
      achievements.push({
        id: 'achievement_browser_privacy',
        name: 'Browser Privacy Excellent',
        description: 'No tracking cookies detected.',
        category: 'privacy',
        unlockedAt: now,
        importance: 0.7,
        milestone: false,
        metadata: {},
      });
    }

    // Custom achievement rules
    for (const rule of this._config.achievementRules) {
      try {
        if (rule.check(knowledge, recommendations)) {
          achievements.push({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            category: rule.category,
            unlockedAt: now,
            importance: rule.importance,
            milestone: false,
            metadata: {},
          });
        }
      } catch {
        // Continue on rule failure
      }
    }

    return achievements;
  }

  private _checkMilestones(knowledge: KnowledgeObject, recommendations: Recommendation[]): Milestone[] {
    const milestones: Milestone[] = [];
    const now = new Date().toISOString();

    // Health improvement milestone
    const overallScore = knowledge.facts.find((f) => f.name === 'overall_score');
    if (overallScore && typeof overallScore.value === 'number') {
      if (overallScore.value >= 80) {
        milestones.push({
          id: 'milestone_health_80',
          name: 'Health Above 80',
          description: 'System health reached 80 or above.',
          category: 'health',
          reachedAt: now,
          target: 80,
          current: overallScore.value,
          importance: 0.8,
          metadata: {},
        });
      }
    }

    // Custom milestone rules
    for (const rule of this._config.milestoneRules) {
      try {
        const current = rule.getCurrent(knowledge, recommendations);
        if (current >= rule.target) {
          milestones.push({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            category: rule.category,
            reachedAt: now,
            target: rule.target,
            current,
            importance: rule.importance,
            metadata: {},
          });
        }
      } catch {
        // Continue on rule failure
      }
    }

    return milestones;
  }
}
