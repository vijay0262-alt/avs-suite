/**
 * Achievement Widget Provider — extracts achievements, milestones, and history.
 *
 * Displays: Latest achievements, Milestones, Optimization streak,
 * Health milestones, Storage recovered, Historical improvements.
 */
import type { WidgetProvider, WidgetProviderContext } from '../widgets/types';
import type {
  AchievementData,
  AchievementItem,
  MilestoneItem,
  HealthMilestone,
  HistoricalImprovement,
  CoreWidgetDataBundle,
} from './types';

export class AchievementProvider implements WidgetProvider {
  private _initialized = false;

  async initialize(): Promise<void> {
    this._initialized = true;
  }

  async load(context: WidgetProviderContext): Promise<AchievementData> {
    const bundle = (context as unknown as { dataBundle: CoreWidgetDataBundle }).dataBundle;
    const history = bundle?.aiContext?.history;
    const knowledge = bundle?.knowledge;

    if (!history && !knowledge) {
      return this._emptyData();
    }

    // Build achievements from optimization history
    const achievements: AchievementItem[] = [];
    const milestones: MilestoneItem[] = [];
    const healthMilestones: HealthMilestone[] = [];
    const historicalImprovements: HistoricalImprovement[] = [];

    if (history) {
      // Achievement: First optimization
      if (history.totalOptimizations > 0) {
        achievements.push({
          id: 'first_optimization',
          title: 'First Optimization',
          description: 'Completed your first system optimization',
          achievedAt: history.optimizationHistory[0]?.timestamp ?? new Date().toISOString(),
          category: 'optimization',
        });
      }

      // Achievement: 100 optimizations
      if (history.totalOptimizations >= 100) {
        achievements.push({
          id: 'centurion',
          title: 'Centurion',
          description: 'Completed 100 optimizations',
          achievedAt: new Date().toISOString(),
          category: 'optimization',
        });
      }

      // Milestone: Storage recovered
      if (history.totalCleanedMB >= 1000) {
        milestones.push({
          id: 'storage_warrior',
          title: 'Storage Warrior',
          description: `Recovered ${(history.totalCleanedMB / 1000).toFixed(1)} GB of storage`,
          achievedAt: new Date().toISOString(),
          type: 'storage',
        });
      }

      // Milestone: Issues fixed
      if (history.totalIssuesFixed >= 50) {
        milestones.push({
          id: 'fixer',
          title: 'The Fixer',
          description: `Fixed ${history.totalIssuesFixed} system issues`,
          achievedAt: new Date().toISOString(),
          type: 'health',
        });
      }

      // Historical improvements from optimization history
      for (const entry of history.optimizationHistory.slice(0, 10)) {
        historicalImprovements.push({
          id: `hist_${entry.timestamp}`,
          title: entry.type,
          description: `${entry.type}: ${entry.itemsProcessed} items processed`,
          achievedAt: entry.timestamp,
          improvementType: entry.type,
          value: entry.spaceFreedMB,
          unit: 'MB',
        });
      }
    }

    // Health milestones from knowledge
    if (knowledge) {
      const healthFacts = knowledge.facts.filter((f) => f.category === 'health');
      for (const fact of healthFacts.slice(0, 5)) {
        const score = typeof fact.value === 'number' ? fact.value : 0;
        if (score >= 75) {
          healthMilestones.push({
            id: `health_${fact.id}`,
            title: `Health Score: ${score}`,
            description: fact.description,
            achievedAt: fact.extractedAt,
            scoreThreshold: score,
          });
        }
      }
    }

    // Optimization streak: count consecutive recent optimizations
    const optimizationStreak = history?.optimizationHistory?.length ?? 0;

    return {
      achievements,
      milestones,
      optimizationStreak,
      healthMilestones,
      totalStorageRecovered: history?.totalCleanedMB ?? 0,
      historicalImprovements,
    };
  }

  async refresh(context: WidgetProviderContext): Promise<AchievementData> {
    return this.load(context);
  }

  async dispose(): Promise<void> {
    this._initialized = false;
  }

  validate(): boolean {
    return this._initialized;
  }

  private _emptyData(): AchievementData {
    return {
      achievements: [],
      milestones: [],
      optimizationStreak: 0,
      healthMilestones: [],
      totalStorageRecovered: 0,
      historicalImprovements: [],
    };
  }
}
