/**
 * FindingsGatherer — collects real SourceFinding[] from system services
 * for the Smart Optimization Engine.
 *
 * Gathers findings from:
 *   - Dashboard metrics (temp files, recycle bin, browser cache, startup apps)
 *   - Privacy service (privacy traces)
 *   - Registry service (registry issues)
 *   - Performance service (memory/CPU alerts)
 *
 * Every finding includes evidence with real measured values.
 * The AI never invents information.
 */
import type { SourceFinding, OptimizationEvidence } from './types';
import { makeEvidence } from './types';
import { dashboardService } from '../dashboard/dashboard.service';
import { privacyService } from '../privacy/privacy.service';
import { registryService } from '../registry/registry.service';
import { performanceService } from '../performance/performance.service';
import { startupService } from '../startup/startup.service';

export interface GatheredFindings {
  findings: SourceFinding[];
  healthScore: number;
}

export async function gatherFindings(): Promise<GatheredFindings> {
  const findings: SourceFinding[] = [];
  const now = Date.now();

  // Gather from all services in parallel, catching errors individually
  const [metricsResult, privacyResult, registryResult, perfResult, startupResult] =
    await Promise.allSettled([
      dashboardService.getMetrics(),
      privacyService.scan(),
      registryService.scan(),
      performanceService.getMetrics(),
      startupService.listEntries(),
    ]);

  // ── Dashboard Metrics → temp files, recycle bin, browser cache, security ──
  if (metricsResult.status === 'fulfilled') {
    const m = metricsResult.value;
    const perf = m.performance;

    if (perf.temporaryFilesSize > 50 * 1024 * 1024) {
      const evidence: OptimizationEvidence[] = [
        makeEvidence('junk_cleaner', 'temporaryFilesSize', `${(perf.temporaryFilesSize / 1024 / 1024).toFixed(0)}`, 'MB', 0.95),
      ];
      findings.push({
        module: 'junk_cleaner',
        findingId: `temp-files-${now}`,
        category: 'temp_files',
        title: 'Temporary Files',
        description: `${(perf.temporaryFilesSize / 1024 / 1024).toFixed(0)} MB of temporary files detected.`,
        severity: perf.temporaryFilesSize > 1 * 1024 * 1024 * 1024 ? 'high' : 'medium',
        evidence,
        estimatedBenefit: { storageRecoveryMB: perf.temporaryFilesSize / 1024 / 1024 },
        sourceData: { size: perf.temporaryFilesSize },
        timestamp: now,
      });
    }

    if (perf.recycleBinSize > 50 * 1024 * 1024) {
      findings.push({
        module: 'junk_cleaner',
        findingId: `recycle-bin-${now}`,
        category: 'recycle_bin',
        title: 'Recycle Bin',
        description: `${(perf.recycleBinSize / 1024 / 1024).toFixed(0)} MB in Recycle Bin.`,
        severity: perf.recycleBinSize > 500 * 1024 * 1024 ? 'high' : 'low',
        evidence: [makeEvidence('junk_cleaner', 'recycleBinSize', `${(perf.recycleBinSize / 1024 / 1024).toFixed(0)}`, 'MB', 0.95)],
        estimatedBenefit: { storageRecoveryMB: perf.recycleBinSize / 1024 / 1024 },
        sourceData: { size: perf.recycleBinSize },
        timestamp: now,
      });
    }

    if (perf.browserCacheSize > 50 * 1024 * 1024) {
      findings.push({
        module: 'browser_health',
        findingId: `browser-cache-${now}`,
        category: 'browser_cache',
        title: 'Browser Cache',
        description: `${(perf.browserCacheSize / 1024 / 1024).toFixed(0)} MB of browser cache.`,
        severity: perf.browserCacheSize > 500 * 1024 * 1024 ? 'medium' : 'low',
        evidence: [makeEvidence('browser_health', 'browserCacheSize', `${(perf.browserCacheSize / 1024 / 1024).toFixed(0)}`, 'MB', 0.9)],
        estimatedBenefit: { storageRecoveryMB: perf.browserCacheSize / 1024 / 1024 },
        sourceData: { size: perf.browserCacheSize },
        timestamp: now,
      });
    }

    // Security findings
    const pendingUpdates = m.security.updates.pendingUpdates || 0;
    if (pendingUpdates > 0) {
      findings.push({
        module: 'windows_health',
        findingId: `windows-update-${now}`,
        category: 'windows_update',
        title: 'Windows Updates Pending',
        description: `${pendingUpdates} pending Windows updates.`,
        severity: pendingUpdates > 10 ? 'high' : 'medium',
        evidence: [makeEvidence('windows_health', 'pendingUpdates', `${pendingUpdates}`, 'count', 0.95)],
        estimatedBenefit: {},
        sourceData: { pendingUpdates },
        timestamp: now,
      });
    }
  }

  // ── Privacy ──
  if (privacyResult.status === 'fulfilled') {
    const result = privacyResult.value;
    if (result.itemCount > 0) {
      findings.push({
        module: 'browser_health',
        findingId: `privacy-traces-${now}`,
        category: 'browser_privacy',
        title: 'Privacy Traces',
        description: `${result.itemCount} privacy traces found across ${result.categoriesFound.length} categories.`,
        severity: result.totalSize > 500 * 1024 * 1024 ? 'high' : result.itemCount > 50 ? 'medium' : 'low',
        evidence: [
          makeEvidence('browser_health', 'itemCount', `${result.itemCount}`, 'items', 0.9),
          makeEvidence('browser_health', 'totalSize', `${(result.totalSize / 1024 / 1024).toFixed(0)}`, 'MB', 0.85),
        ],
        estimatedBenefit: {
          storageRecoveryMB: result.totalSize / 1024 / 1024,
          privacyImprovement: 15,
        },
        sourceData: { itemCount: result.itemCount, totalSize: result.totalSize, categories: result.categoriesFound },
        timestamp: now,
      });
    }
  }

  // ── Registry ──
  if (registryResult.status === 'fulfilled') {
    const result = registryResult.value;
    if (result.issues.length > 0) {
      findings.push({
        module: 'registry_cleaner',
        findingId: `registry-issues-${now}`,
        category: 'registry',
        title: 'Registry Issues',
        description: `${result.issues.length} invalid or obsolete registry entries found.`,
        severity: result.issues.length > 50 ? 'high' : result.issues.length > 10 ? 'medium' : 'low',
        evidence: [makeEvidence('registry_cleaner', 'issueCount', `${result.issues.length}`, 'entries', 0.9)],
        estimatedBenefit: { performanceImprovement: 5 },
        sourceData: { issueCount: result.issues.length },
        timestamp: now,
      });
    }
  }

  // ── Performance ──
  if (perfResult.status === 'fulfilled') {
    const metrics = perfResult.value;
    const memUsage = metrics.memory?.usage ?? 0;
    if (memUsage > 80) {
      const usedMB = metrics.memory?.used ?? 0;
      const totalMB = metrics.memory?.total ?? 0;
      const recoverable = usedMB - totalMB * 0.5;
      findings.push({
        module: 'process_ai',
        findingId: `memory-pressure-${now}`,
        category: 'memory_optimization',
        title: 'High Memory Usage',
        description: `Memory usage at ${memUsage.toFixed(0)}%. Potential ${(recoverable / 1024).toFixed(0)} MB recoverable.`,
        severity: memUsage > 90 ? 'high' : 'medium',
        evidence: [
          makeEvidence('process_ai', 'memoryUsage', `${memUsage.toFixed(0)}`, '%', 0.95),
          makeEvidence('process_ai', 'memoryUsed', `${(usedMB / 1024).toFixed(1)}`, 'GB', 0.9),
        ],
        estimatedBenefit: { ramRecoveryMB: Math.max(0, recoverable / 1024) },
        sourceData: { usage: memUsage, used: usedMB, total: totalMB },
        timestamp: now,
      });
    }
  }

  // ── Startup ──
  if (startupResult.status === 'fulfilled') {
    const entries = startupResult.value;
    const highImpact = entries.filter((e) => e.impact === 'high' && e.enabled);
    if (highImpact.length > 0) {
      findings.push({
        module: 'startup_manager',
        findingId: `startup-items-${now}`,
        category: 'startup',
        title: 'High-Impact Startup Items',
        description: `${highImpact.length} high-impact startup applications are enabled, slowing boot time.`,
        severity: highImpact.length > 5 ? 'high' : 'medium',
        evidence: [
          makeEvidence('startup_manager', 'highImpactCount', `${highImpact.length}`, 'items', 0.9),
          makeEvidence('startup_manager', 'totalStartupApps', `${entries.length}`, 'items', 0.85),
        ],
        estimatedBenefit: { startupImprovementMs: highImpact.length * 500 },
        sourceData: { highImpact: highImpact.length, total: entries.length },
        timestamp: now,
      });
    }
  }

  // Calculate a rough health score from findings
  const healthScore = computeHealthScore(findings);

  return { findings, healthScore };
}

function computeHealthScore(findings: SourceFinding[]): number {
  let score = 100;
  for (const f of findings) {
    const penalty =
      f.severity === 'critical' ? 15 :
      f.severity === 'high' ? 10 :
      f.severity === 'medium' ? 5 :
      f.severity === 'low' ? 2 : 0;
    score -= penalty;
  }
  return Math.max(0, Math.min(100, score));
}
