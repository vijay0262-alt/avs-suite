/**
 * Usage Analyzer — analyzes usage patterns from context and knowledge.
 *
 * Analyzes: Optimization Frequency, Browsing Activity, Startup Behavior,
 * Disk Growth, Storage Consumption, Application Categories,
 * Session Duration, Maintenance Habits.
 *
 * NEVER inspects private user data. Only uses aggregated telemetry
 * and system metadata already available through approved providers.
 */
import type {
  AIContext,
  KnowledgeObject,
  UsageSummary,
  ProfileConfiguration,
  ContextEvidence,
} from './types';
import { clampScore } from './types';

export class UsageAnalyzer {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  analyze(context: AIContext, knowledge: KnowledgeObject): UsageSummary {
    const rules = this._config.usageRules;

    const optimizationFrequency = this._deriveOptimizationFrequency(context, rules);
    const browsingActivity = this._deriveBrowsingActivity(context, rules);
    const startupBehavior = this._deriveStartupBehavior(context, rules);
    const diskGrowthRate = this._deriveDiskGrowthRate(knowledge);
    const storageConsumption = this._deriveStorageConsumption(context, knowledge);
    const maintenanceHabits = this._deriveMaintenanceHabits(context);
    const sessionDuration = this._deriveSessionDuration(context);
    const applicationCategories = this._deriveAppCategories(knowledge);

    const confidence = this._calculateConfidence(context, knowledge);

    return {
      optimizationFrequency,
      browsingActivity,
      startupBehavior,
      diskGrowthRate,
      storageConsumption,
      maintenanceHabits,
      sessionDuration,
      applicationCategories,
      confidence,
    };
  }

  getEvidence(context: AIContext, _knowledge: KnowledgeObject): ContextEvidence[] {
    const evidence: ContextEvidence[] = [];
    const ts = new Date().toISOString();

    if (context.history) {
      evidence.push({ source: 'history', metric: 'total_optimizations', value: context.history.totalOptimizations, timestamp: ts });
    }
    if (context.browser) {
      evidence.push({ source: 'browser', metric: 'total_cache_mb', value: context.browser.totalCacheMB, timestamp: ts });
    }
    if (context.startup) {
      evidence.push({ source: 'startup', metric: 'enabled_items', value: context.startup.enabledItems, timestamp: ts });
    }
    if (context.storage) {
      evidence.push({ source: 'storage', metric: 'used_mb', value: context.storage.usedMB, timestamp: ts });
    }
    if (context.system) {
      evidence.push({ source: 'system', metric: 'uptime', value: context.system.uptime, timestamp: ts });
    }

    return evidence;
  }

  // ── Private ────────────────────────────────────────────────

  private _deriveOptimizationFrequency(
    context: AIContext,
    rules: ProfileConfiguration['usageRules'],
  ): UsageSummary['optimizationFrequency'] {
    const total = context.history?.totalOptimizations ?? 0;
    if (total === 0) return 'unknown';
    if (total <= rules.lowOptimizationFrequency) return 'low';
    if (total >= rules.highOptimizationFrequency) return 'high';
    return 'medium';
  }

  private _deriveBrowsingActivity(
    context: AIContext,
    rules: ProfileConfiguration['usageRules'],
  ): UsageSummary['browsingActivity'] {
    const cacheMB = context.browser?.totalCacheMB ?? 0;
    if (cacheMB === 0) return 'unknown';
    if (cacheMB <= rules.lowBrowsingCacheMB) return 'low';
    if (cacheMB >= rules.highBrowsingCacheMB) return 'high';
    return 'medium';
  }

  private _deriveStartupBehavior(
    context: AIContext,
    rules: ProfileConfiguration['usageRules'],
  ): UsageSummary['startupBehavior'] {
    const enabled = context.startup?.enabledItems ?? 0;
    if (enabled === 0) return 'unknown';
    if (enabled >= rules.heavyStartupThreshold) return 'heavy';
    if (enabled >= rules.moderateStartupThreshold) return 'moderate';
    return 'light';
  }

  private _deriveDiskGrowthRate(knowledge: KnowledgeObject): UsageSummary['diskGrowthRate'] {
    const storageTrend = knowledge.trends.find(
      (t) => t.factName.includes('used_space') || t.factName.includes('used_mb'),
    );
    if (!storageTrend || storageTrend.slope === null) return 'unknown';

    const slopePerDay = storageTrend.slope * 24 * 60 * 60 * 1000;
    const rules = this._config.usageRules;
    if (Math.abs(slopePerDay) >= rules.fastDiskGrowthMBPerDay) return 'fast';
    if (Math.abs(slopePerDay) >= rules.moderateDiskGrowthMBPerDay) return 'moderate';
    return 'slow';
  }

  private _deriveStorageConsumption(context: AIContext, _knowledge: KnowledgeObject): UsageSummary['storageConsumption'] {
    const used = context.storage?.usedMB ?? 0;
    const total = context.storage?.totalCapacityMB ?? 0;
    if (total === 0) return 'unknown';
    const ratio = used / total;
    if (ratio >= 0.85) return 'high';
    if (ratio >= 0.6) return 'medium';
    return 'low';
  }

  private _deriveMaintenanceHabits(context: AIContext): UsageSummary['maintenanceHabits'] {
    const schedulerEnabled = context.scheduler?.enabled ?? false;
    const totalOptimizations = context.history?.totalOptimizations ?? 0;

    if (schedulerEnabled && totalOptimizations > 5) return 'proactive';
    if (totalOptimizations > 0) return 'reactive';
    return 'negligent';
  }

  private _deriveSessionDuration(context: AIContext): UsageSummary['sessionDuration'] {
    const uptime = context.system?.uptime ?? 0;
    const hours = uptime / 3600;
    if (hours === 0) return 'unknown';
    if (hours >= 8) return 'long';
    if (hours >= 2) return 'medium';
    return 'short';
  }

  private _deriveAppCategories(knowledge: KnowledgeObject): string[] {
    const categories = new Set<string>();
    for (const fact of knowledge.facts) {
      if (fact.category === 'browser') categories.add('browser');
      if (fact.category === 'startup') categories.add('startup');
      if (fact.category === 'storage') categories.add('storage');
      if (fact.category === 'privacy') categories.add('privacy');
      if (fact.category === 'windows') categories.add('windows');
      if (fact.category === 'duplicates') categories.add('duplicates');
      if (fact.category === 'history') categories.add('history');
      if (fact.category === 'scheduler') categories.add('scheduler');
    }
    return Array.from(categories);
  }

  private _calculateConfidence(context: AIContext, knowledge: KnowledgeObject): number {
    let confidence = 0;
    if (context.history) confidence += 0.2;
    if (context.browser) confidence += 0.2;
    if (context.startup) confidence += 0.15;
    if (context.storage) confidence += 0.15;
    if (context.system) confidence += 0.15;
    if (knowledge.trends.length > 0) confidence += 0.15;
    return clampScore(confidence);
  }
}
