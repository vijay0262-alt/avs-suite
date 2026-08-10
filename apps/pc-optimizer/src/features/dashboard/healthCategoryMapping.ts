import type { HealthScanModuleResult } from './dashboard.types';

export type HealthCategoryId =
  | 'system_health'
  | 'storage'
  | 'performance'
  | 'privacy'
  | 'protection';

export interface HealthCategoryConfig {
  categoryId: HealthCategoryId;
  categoryName: string;
  description: string;
  icon: string;
  modules: string[];
}

export const HEALTH_CATEGORIES: HealthCategoryConfig[] = [
  {
    categoryId: 'system_health',
    categoryName: 'System Health',
    description: 'Registry integrity and system configuration',
    icon: 'ServerStackIcon',
    modules: ['registry', 'system'],
  },
  {
    categoryId: 'storage',
    categoryName: 'Storage',
    description: 'Junk files, temporary data, and disk usage',
    icon: 'CircleStackIcon',
    modules: ['junk', 'disk'],
  },
  {
    categoryId: 'performance',
    categoryName: 'Performance',
    description: 'Startup apps, memory, and CPU optimization',
    icon: 'BoltIcon',
    modules: ['startup', 'performance'],
  },
  {
    categoryId: 'privacy',
    categoryName: 'Privacy',
    description: 'Browser traces, cookies, and activity history',
    icon: 'EyeSlashIcon',
    modules: ['privacy', 'browser'],
  },
  {
    categoryId: 'protection',
    categoryName: 'Protection',
    description: 'Security status, firewall, and threat protection',
    icon: 'ShieldCheckIcon',
    modules: ['security'],
  },
];

const MODULE_TO_CATEGORY: Record<string, HealthCategoryId> = {};
for (const cat of HEALTH_CATEGORIES) {
  for (const mod of cat.modules) {
    MODULE_TO_CATEGORY[mod] = cat.categoryId;
  }
}

export function getCategoryIdForModule(moduleId: string): HealthCategoryId | undefined {
  return MODULE_TO_CATEGORY[moduleId];
}

export function getCategoryConfig(categoryId: HealthCategoryId): HealthCategoryConfig | undefined {
  return HEALTH_CATEGORIES.find((c) => c.categoryId === categoryId);
}

export function groupModulesToCategories(
  modules: HealthScanModuleResult[],
): HealthScanModuleResult[] {
  const result: HealthScanModuleResult[] = [];

  for (const catConfig of HEALTH_CATEGORIES) {
    const categoryModules = modules.filter((m) =>
      catConfig.modules.includes(m.moduleId),
    );

    if (categoryModules.length === 0) continue;

    const issuesFound = categoryModules.reduce((s, m) => s + m.issuesFound, 0);
    const recoverableSpace = categoryModules.reduce((s, m) => s + m.recoverableSpace, 0);
    const scores = categoryModules.filter((m) => m.status === 'complete').map((m) => m.score);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
      : 0;

    const anyScanning = categoryModules.some((m) => m.status === 'scanning');
    const anyError = categoryModules.some((m) => m.status === 'error');
    const anyDeferred = categoryModules.some((m) => m.status === 'deferred');
    const allComplete = categoryModules.every((m) => m.status === 'complete');
    const allPending = categoryModules.every((m) => m.status === 'pending');

    let status: HealthScanModuleResult['status'];
    if (anyScanning) status = 'scanning';
    else if (anyError) status = 'error';
    else if (anyDeferred) status = 'deferred';
    else if (allComplete) status = 'complete';
    else if (allPending) status = 'pending';
    else status = 'complete';

    const severity = issuesFound > 50 ? 'high' : issuesFound > 10 ? 'medium' : 'low';
    const canAutoFix = categoryModules.some((m) => m.canAutoFix);

    const moduleDetails = categoryModules
      .filter((m) => m.issuesFound > 0)
      .map((m) => `${m.moduleName}: ${m.issuesFound} issues`)
      .join('; ');
    const measuredDetail = moduleDetails || `${catConfig.categoryName} analyzed`;

    const actualResults = categoryModules.filter((m) => m.actual);
    const aggregatedActual = actualResults.length > 0
      ? {
          success: actualResults.every((a) => a.actual!.success),
          filesDeleted: actualResults.reduce((s, m) => s + (m.actual!.filesDeleted ?? 0), 0),
          bytesRecovered: actualResults.reduce((s, m) => s + (m.actual!.bytesRecovered ?? 0), 0),
          itemsRemoved: actualResults.reduce((s, m) => s + (m.actual!.itemsRemoved ?? 0), 0),
          entriesDisabled: actualResults.reduce((s, m) => s + (m.actual!.entriesDisabled ?? 0), 0),
          issuesFixed: actualResults.reduce((s, m) => s + (m.actual!.issuesFixed ?? 0), 0),
          errors: actualResults.flatMap((m) => m.actual!.errors),
        }
      : undefined;

    const verifiedModules = categoryModules.filter((m) => m.verification);
    const aggregatedVerification = verifiedModules.length > 0
      ? {
          beforeScore: Math.round(verifiedModules.reduce((s, m) => s + m.verification!.beforeScore, 0) / verifiedModules.length),
          beforeIssues: verifiedModules.reduce((s, m) => s + m.verification!.beforeIssues, 0),
          beforeRecoverable: verifiedModules.reduce((s, m) => s + m.verification!.beforeRecoverable, 0),
          afterScore: Math.round(verifiedModules.reduce((s, m) => s + m.verification!.afterScore, 0) / verifiedModules.length),
          afterIssues: verifiedModules.reduce((s, m) => s + m.verification!.afterIssues, 0),
          afterRecoverable: verifiedModules.reduce((s, m) => s + m.verification!.afterRecoverable, 0),
          fixed: verifiedModules.reduce((s, m) => s + m.verification!.fixed, 0),
          deferred: verifiedModules.reduce((s, m) => s + m.verification!.deferred, 0),
          failed: verifiedModules.reduce((s, m) => s + m.verification!.failed, 0),
          remaining: verifiedModules.reduce((s, m) => s + m.verification!.remaining, 0),
        }
      : undefined;

    result.push({
      moduleId: catConfig.categoryId,
      moduleName: catConfig.categoryName,
      status,
      score: avgScore,
      issuesFound,
      recoverableSpace,
      severity,
      measuredDetail,
      details: {
        summary: catConfig.description,
        impact: severity,
        safeToRemove: canAutoFix,
        groups: [],
        notChanged: [],
        why: catConfig.description,
      },
      canAutoFix,
      actual: aggregatedActual,
      verification: aggregatedVerification,
    });
  }

  return result;
}
