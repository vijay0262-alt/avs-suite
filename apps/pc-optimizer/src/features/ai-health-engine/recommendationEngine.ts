/**
 * RecommendationEngine — generates prioritized, data-driven
 * recommendations based on category analysis results, insights,
 * and execution history.
 *
 * Each recommendation includes:
 *   - Priority (critical → low)
 *   - Estimated benefit (score improvement)
 *   - Estimated time
 *   - Risk level
 *   - Reason
 *   - Affected modules
 *   - Required capability (for licensing)
 */
import type {
  CategoryResult,
  HealthRecommendation,
  RecommendationPriority,
  RiskLevel,
  HealthAnalysisInput,
  HealthCategoryId,
  Severity,
} from './types';

function generateRecId(prefix: string, index: number): string {
  return `rec-${prefix}-${index}`;
}

function severityToPriority(severity: Severity): RecommendationPriority {
  switch (severity) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    case 'info': return 'low';
  }
}

function severityToBenefit(severity: Severity): number {
  switch (severity) {
    case 'critical': return 25;
    case 'high': return 15;
    case 'medium': return 8;
    case 'low': return 3;
    case 'info': return 0;
  }
}

function severityToTime(severity: Severity): number {
  switch (severity) {
    case 'critical': return 120;
    case 'high': return 60;
    case 'medium': return 30;
    case 'low': return 15;
    case 'info': return 5;
  }
}

const CATEGORY_MODULES: Record<HealthCategoryId, { modules: string[]; capability: string | null }> = {
  storage: { modules: ['junk-cleaner', 'disk-analyzer'], capability: 'junk.scan' },
  performance: { modules: ['performance'], capability: 'performance.optimize' },
  memory: { modules: ['performance'], capability: null },
  startup: { modules: ['startup-manager'], capability: 'startup.view' },
  browser: { modules: ['privacy-cleaner'], capability: 'privacy.scan' },
  privacy: { modules: ['privacy-cleaner'], capability: 'privacy.scan' },
  temp_files: { modules: ['junk-cleaner'], capability: 'junk.scan' },
  recycle_bin: { modules: ['junk-cleaner'], capability: 'junk.scan' },
  system_updates: { modules: [], capability: null },
  drivers: { modules: [], capability: null },
  security: { modules: [], capability: null },
};

export class RecommendationEngine {
  /**
   * Generate prioritized recommendations from category results and history.
   */
  generate(categoryResults: CategoryResult[], input: HealthAnalysisInput): HealthRecommendation[] {
    const recs: HealthRecommendation[] = [];
    let idx = 0;

    for (const result of categoryResults) {
      if (result.issues.length === 0) continue;

      const moduleInfo = CATEGORY_MODULES[result.categoryId] ?? { modules: [], capability: null };

      for (const issue of result.issues) {
        if (issue.impact === 0) continue;

        const priority = severityToPriority(issue.severity);
        const benefit = Math.min(severityToBenefit(issue.severity), issue.impact);
        const timeSeconds = severityToTime(issue.severity);
        const risk: RiskLevel = issue.autoFixable ? 'low' : 'medium';

        recs.push({
          id: generateRecId(result.categoryId, idx++),
          title: issue.title,
          priority,
          estimatedBenefit: benefit,
          estimatedTimeSeconds: timeSeconds,
          riskLevel: risk,
          reason: issue.description,
          affectedModules: moduleInfo.modules,
          requiredCapability: moduleInfo.capability,
          category: result.categoryId,
        });
      }
    }

    // ── History-based recommendations ────────────────────────

    const stats = input.executionStatistics;
    const history = input.executionHistory;

    // Recommend running maintenance if it hasn't been done recently
    if (stats.lastRunAt) {
      const daysSinceLast = (Date.now() - new Date(stats.lastRunAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLast > 14) {
        recs.push({
          id: generateRecId('maintenance', idx++),
          title: 'Run maintenance scan',
          priority: 'medium',
          estimatedBenefit: 10,
          estimatedTimeSeconds: 60,
          riskLevel: 'low',
          reason: `Last maintenance was ${Math.round(daysSinceLast)} days ago. Regular maintenance prevents degradation.`,
          affectedModules: ['junk-cleaner', 'registry-cleaner', 'privacy-cleaner'],
          requiredCapability: null,
          category: 'performance' as HealthCategoryId,
        });
      }
    } else if (stats.totalExecutions === 0) {
      recs.push({
        id: generateRecId('first-scan', idx++),
        title: 'Run your first system scan',
        priority: 'high',
        estimatedBenefit: 15,
        estimatedTimeSeconds: 120,
        riskLevel: 'low',
        reason: 'No maintenance has been performed yet. An initial scan establishes a health baseline.',
        affectedModules: ['junk-cleaner', 'registry-cleaner'],
        requiredCapability: null,
        category: 'performance' as HealthCategoryId,
      });
    }

    // Recommend scheduling if no scheduled executions exist
    const hasScheduled = history.some((r) => r.scheduleId !== null);
    if (!hasScheduled && stats.totalExecutions > 0) {
      recs.push({
        id: generateRecId('schedule', idx++),
        title: 'Set up a maintenance schedule',
        priority: 'low',
        estimatedBenefit: 5,
        estimatedTimeSeconds: 30,
        riskLevel: 'none',
        reason: 'No scheduled maintenance detected. Automating maintenance ensures consistent system health.',
        affectedModules: ['scheduler'],
        requiredCapability: null,
        category: 'performance' as HealthCategoryId,
      });
    }

    // Sort by priority (critical first), then by estimated benefit (descending)
    const priorityOrder: Record<RecommendationPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    recs.sort((a, b) => {
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return b.estimatedBenefit - a.estimatedBenefit;
    });

    return recs;
  }
}

/**
 * Default singleton instance.
 */
export const recommendationEngine = new RecommendationEngine();
