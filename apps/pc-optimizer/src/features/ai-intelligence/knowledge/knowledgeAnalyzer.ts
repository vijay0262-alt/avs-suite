/**
 * Knowledge Analyzer — extracts facts from AIContext.
 *
 * Facts are objective. Never infer.
 * Each fact is directly extracted from a context section.
 */
import type { AIContext, KnowledgeFact, FactCategory, FactDataType } from './types';
import { generateFactId } from './types';
import type { EvidenceBuilder } from './evidenceBuilder';

export class KnowledgeAnalyzer {
  private _evidenceBuilder: EvidenceBuilder;

  constructor(evidenceBuilder: EvidenceBuilder) {
    this._evidenceBuilder = evidenceBuilder;
  }

  /**
   * Extract all facts from an AIContext.
   */
  analyze(context: AIContext): KnowledgeFact[] {
    const facts: KnowledgeFact[] = [];
    const ts = context.metadata.timestamp;

    if (context.system) {
      facts.push(...this._extractSystemFacts(context, ts));
    }
    if (context.health) {
      facts.push(...this._extractHealthFacts(context, ts));
    }
    if (context.performance) {
      facts.push(...this._extractPerformanceFacts(context, ts));
    }
    if (context.storage) {
      facts.push(...this._extractStorageFacts(context, ts));
    }
    if (context.browser) {
      facts.push(...this._extractBrowserFacts(context, ts));
    }
    if (context.privacy) {
      facts.push(...this._extractPrivacyFacts(context, ts));
    }
    if (context.startup) {
      facts.push(...this._extractStartupFacts(context, ts));
    }
    if (context.windows) {
      facts.push(...this._extractWindowsFacts(context, ts));
    }
    if (context.duplicates) {
      facts.push(...this._extractDuplicatesFacts(context, ts));
    }
    if (context.scheduler) {
      facts.push(...this._extractSchedulerFacts(context, ts));
    }
    if (context.history) {
      facts.push(...this._extractHistoryFacts(context, ts));
    }
    if (context.reports) {
      facts.push(...this._extractReportsFacts(context, ts));
    }
    if (context.experience) {
      facts.push(...this._extractExperienceFacts(context, ts));
    }
    if (context.capabilities) {
      facts.push(...this._extractCapabilitiesFacts(context, ts));
    }
    if (context.quota) {
      facts.push(...this._extractQuotaFacts(context, ts));
    }
    if (context.analytics) {
      facts.push(...this._extractAnalyticsFacts(context, ts));
    }

    return facts;
  }

  // ── Private extraction methods ─────────────────────────────

  private _makeFact(
    category: FactCategory,
    name: string,
    value: string | number | boolean | unknown[],
    dataType: FactDataType,
    unit: string | null,
    description: string,
    sourceProvider: string,
    contextTimestamp: string,
    confidence: number = 1.0,
  ): KnowledgeFact {
    return {
      id: generateFactId(category, name),
      category,
      name,
      value,
      dataType,
      unit,
      description,
      evidence: this._evidenceBuilder.forFact(name, value, sourceProvider, contextTimestamp, confidence),
      confidence,
      sourceProvider,
      extractedAt: contextTimestamp,
    };
  }

  private _extractSystemFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const s = context.system!;
    const src = s.provenance.providerName;
    const conf = s.provenance.confidence;
    return [
      this._makeFact('system', 'os_version', s.osVersion, 'string', null, 'Operating system version', src, ts, conf),
      this._makeFact('system', 'os_build', s.osBuild, 'string', null, 'OS build number', src, ts, conf),
      this._makeFact('system', 'architecture', s.architecture, 'string', null, 'System architecture', src, ts, conf),
      this._makeFact('system', 'hostname', s.hostname, 'string', null, 'Machine hostname', src, ts, conf),
      this._makeFact('system', 'uptime', s.uptime, 'number', 'seconds', 'System uptime', src, ts, conf),
      this._makeFact('system', 'cpu_model', s.cpuModel, 'string', null, 'CPU model', src, ts, conf),
      this._makeFact('system', 'cpu_cores', s.cpuCores, 'number', 'cores', 'Number of CPU cores', src, ts, conf),
      this._makeFact('system', 'total_memory', s.totalMemoryMB, 'number', 'MB', 'Total system memory', src, ts, conf),
      this._makeFact('system', 'gpu_model', s.gpuModel ?? 'N/A', 'string', null, 'GPU model', src, ts, conf),
    ];
  }

  private _extractHealthFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const h = context.health!;
    const src = h.provenance.providerName;
    const conf = h.provenance.confidence;
    return [
      this._makeFact('health', 'overall_score', h.overallScore, 'number', 'score', 'Overall health score', src, ts, conf),
      this._makeFact('health', 'cpu_score', h.cpuScore, 'number', 'score', 'CPU health score', src, ts, conf),
      this._makeFact('health', 'ram_score', h.ramScore, 'number', 'score', 'RAM health score', src, ts, conf),
      this._makeFact('health', 'disk_score', h.diskScore, 'number', 'score', 'Disk health score', src, ts, conf),
      this._makeFact('health', 'stability_score', h.stabilityScore, 'number', 'score', 'System stability score', src, ts, conf),
      this._makeFact('health', 'security_score', h.securityScore, 'number', 'score', 'Security score', src, ts, conf),
      this._makeFact('health', 'issue_count', h.issues.length, 'number', 'issues', 'Number of detected issues', src, ts, conf),
    ];
  }

  private _extractPerformanceFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const p = context.performance!;
    const src = p.provenance.providerName;
    const conf = p.provenance.confidence;
    return [
      this._makeFact('performance', 'cpu_usage', p.cpuUsage, 'number', '%', 'Current CPU usage', src, ts, conf),
      this._makeFact('performance', 'ram_usage', p.ramUsage, 'number', '%', 'Current RAM usage', src, ts, conf),
      this._makeFact('performance', 'disk_usage', p.diskUsage, 'number', '%', 'Current disk usage', src, ts, conf),
      this._makeFact('performance', 'active_processes', p.activeProcesses, 'number', 'processes', 'Active process count', src, ts, conf),
    ];
  }

  private _extractStorageFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const s = context.storage!;
    const src = s.provenance.providerName;
    const conf = s.provenance.confidence;
    return [
      this._makeFact('storage', 'total_capacity', s.totalCapacityMB, 'number', 'MB', 'Total storage capacity', src, ts, conf),
      this._makeFact('storage', 'used_space', s.usedMB, 'number', 'MB', 'Used storage space', src, ts, conf),
      this._makeFact('storage', 'free_space', s.freeMB, 'number', 'MB', 'Free storage space', src, ts, conf),
      this._makeFact('storage', 'drive_type', s.driveType, 'string', null, 'Drive type', src, ts, conf),
      this._makeFact('storage', 'drive_health', s.driveHealth, 'string', null, 'Drive health status', src, ts, conf),
      this._makeFact('storage', 'fragmentation', s.fragmentationPercent ?? -1, 'number', '%', 'Disk fragmentation level', src, ts, conf),
      this._makeFact('storage', 'large_file_count', s.largeFiles.length, 'number', 'files', 'Number of large files', src, ts, conf),
    ];
  }

  private _extractBrowserFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const b = context.browser!;
    const src = b.provenance.providerName;
    const conf = b.provenance.confidence;
    return [
      this._makeFact('browser', 'installed_browsers', b.installedBrowsers.length, 'number', 'browsers', 'Number of installed browsers', src, ts, conf),
      this._makeFact('browser', 'total_cache', b.totalCacheMB, 'number', 'MB', 'Total browser cache size', src, ts, conf),
      this._makeFact('browser', 'total_cookies', b.totalCookiesMB, 'number', 'MB', 'Total cookies size', src, ts, conf),
      this._makeFact('browser', 'total_history', b.totalHistoryMB, 'number', 'MB', 'Total browsing history size', src, ts, conf),
      this._makeFact('browser', 'extension_count', b.extensions.length, 'number', 'extensions', 'Number of browser extensions', src, ts, conf),
    ];
  }

  private _extractPrivacyFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const p = context.privacy!;
    const src = p.provenance.providerName;
    const conf = p.provenance.confidence;
    return [
      this._makeFact('privacy', 'tracking_cookies', p.trackingCookies, 'number', 'cookies', 'Tracking cookies count', src, ts, conf),
      this._makeFact('privacy', 'history_entries', p.historyEntries, 'number', 'entries', 'History entries count', src, ts, conf),
      this._makeFact('privacy', 'temp_files', p.tempFilesMB, 'number', 'MB', 'Temporary files size', src, ts, conf),
      this._makeFact('privacy', 'recycle_bin', p.recycleBinMB, 'number', 'MB', 'Recycle bin size', src, ts, conf),
      this._makeFact('privacy', 'recent_items', p.recentItems, 'number', 'items', 'Recent items count', src, ts, conf),
    ];
  }

  private _extractStartupFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const s = context.startup!;
    const src = s.provenance.providerName;
    const conf = s.provenance.confidence;
    return [
      this._makeFact('startup', 'total_items', s.totalStartupItems, 'number', 'items', 'Total startup items', src, ts, conf),
      this._makeFact('startup', 'enabled_items', s.enabledItems, 'number', 'items', 'Enabled startup items', src, ts, conf),
      this._makeFact('startup', 'disabled_items', s.disabledItems, 'number', 'items', 'Disabled startup items', src, ts, conf),
      this._makeFact('startup', 'estimated_boot_time', s.estimatedBootTimeSec, 'number', 'seconds', 'Estimated boot time', src, ts, conf),
      this._makeFact('startup', 'high_impact_count', s.highImpactItems.length, 'number', 'items', 'High-impact startup items', src, ts, conf),
    ];
  }

  private _extractWindowsFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const w = context.windows!;
    const src = w.provenance.providerName;
    const conf = w.provenance.confidence;
    return [
      this._makeFact('windows', 'windows_version', w.windowsVersion, 'string', null, 'Windows version', src, ts, conf),
      this._makeFact('windows', 'build_number', w.buildNumber, 'string', null, 'Windows build number', src, ts, conf),
      this._makeFact('windows', 'pending_updates', w.pendingUpdates, 'number', 'updates', 'Pending Windows updates', src, ts, conf),
      this._makeFact('windows', 'service_count', w.services.length, 'number', 'services', 'Windows services count', src, ts, conf),
    ];
  }

  private _extractDuplicatesFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const d = context.duplicates!;
    const src = d.provenance.providerName;
    const conf = d.provenance.confidence;
    return [
      this._makeFact('duplicates', 'duplicate_groups', d.totalDuplicateGroups, 'number', 'groups', 'Duplicate file groups', src, ts, conf),
      this._makeFact('duplicates', 'duplicate_files', d.totalDuplicateFiles, 'number', 'files', 'Total duplicate files', src, ts, conf),
      this._makeFact('duplicates', 'wasted_space', d.wastedSpaceMB, 'number', 'MB', 'Wasted space from duplicates', src, ts, conf),
      this._makeFact('duplicates', 'scan_status', d.scanStatus, 'string', null, 'Duplicate scan status', src, ts, conf),
    ];
  }

  private _extractSchedulerFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const s = context.scheduler!;
    const src = s.provenance.providerName;
    const conf = s.provenance.confidence;
    return [
      this._makeFact('scheduler', 'enabled', s.enabled, 'boolean', null, 'Scheduler enabled status', src, ts, conf),
      this._makeFact('scheduler', 'task_count', s.scheduledTasks.length, 'number', 'tasks', 'Scheduled task count', src, ts, conf),
    ];
  }

  private _extractHistoryFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const h = context.history!;
    const src = h.provenance.providerName;
    const conf = h.provenance.confidence;
    return [
      this._makeFact('history', 'total_optimizations', h.totalOptimizations, 'number', 'optimizations', 'Total optimizations performed', src, ts, conf),
      this._makeFact('history', 'total_cleaned', h.totalCleanedMB, 'number', 'MB', 'Total space cleaned', src, ts, conf),
      this._makeFact('history', 'total_issues_fixed', h.totalIssuesFixed, 'number', 'issues', 'Total issues fixed', src, ts, conf),
    ];
  }

  private _extractReportsFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const r = context.reports!;
    const src = r.provenance.providerName;
    const conf = r.provenance.confidence;
    return [
      this._makeFact('reports', 'total_reports', r.totalReports, 'number', 'reports', 'Total reports generated', src, ts, conf),
      this._makeFact('reports', 'scheduled_reports', r.scheduledReports, 'number', 'reports', 'Scheduled reports count', src, ts, conf),
    ];
  }

  private _extractExperienceFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const e = context.experience!;
    const src = e.provenance.providerName;
    const conf = e.provenance.confidence;
    return [
      this._makeFact('experience', 'current_plan', e.currentPlan, 'string', null, 'Current subscription plan', src, ts, conf),
      this._makeFact('experience', 'trial_status', e.trialStatus, 'string', null, 'Trial status', src, ts, conf),
      this._makeFact('experience', 'unlocked_features', e.unlockedFeatures.length, 'number', 'features', 'Unlocked features count', src, ts, conf),
      this._makeFact('experience', 'locked_features', e.lockedFeatures.length, 'number', 'features', 'Locked features count', src, ts, conf),
    ];
  }

  private _extractCapabilitiesFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const c = context.capabilities!;
    const src = c.provenance.providerName;
    const conf = c.provenance.confidence;
    return [
      this._makeFact('capabilities', 'total_capabilities', c.totalCapabilities, 'number', 'capabilities', 'Total capabilities', src, ts, conf),
      this._makeFact('capabilities', 'enabled_capabilities', c.enabledCapabilities.length, 'number', 'capabilities', 'Enabled capabilities count', src, ts, conf),
      this._makeFact('capabilities', 'disabled_capabilities', c.disabledCapabilities.length, 'number', 'capabilities', 'Disabled capabilities count', src, ts, conf),
    ];
  }

  private _extractQuotaFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const q = context.quota!;
    const src = q.provenance.providerName;
    const conf = q.provenance.confidence;
    const facts: KnowledgeFact[] = [];
    for (const quota of q.quotas) {
      facts.push(
        this._makeFact('quota', `quota_${quota.quotaId}_used`, quota.used, 'number', 'units', `Usage for ${quota.quotaId}`, src, ts, conf),
      );
      facts.push(
        this._makeFact('quota', `quota_${quota.quotaId}_remaining`, quota.remaining, 'number', 'units', `Remaining quota for ${quota.quotaId}`, src, ts, conf),
      );
    }
    return facts;
  }

  private _extractAnalyticsFacts(context: AIContext, ts: string): KnowledgeFact[] {
    const a = context.analytics!;
    const src = a.provenance.providerName;
    const conf = a.provenance.confidence;
    return [
      this._makeFact('analytics', 'total_feature_accesses', a.totalFeatureAccesses, 'number', 'accesses', 'Total feature accesses', src, ts, conf),
      this._makeFact('analytics', 'total_denials', a.totalDenials, 'number', 'denials', 'Total feature denials', src, ts, conf),
    ];
  }
}
