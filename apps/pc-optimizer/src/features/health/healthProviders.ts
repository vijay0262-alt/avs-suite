/**
 * Module health contribution providers.
 *
 * Each provider wraps an existing service to compute a HealthContribution
 * with real measured data. These are registered with HealthScoreService
 * at app startup.
 *
 * Penalties are derived from the same metrics used by dashboard.utils.ts
 * calculateHealthScore(), but expressed as penalties (delta from 100)
 * rather than scores (0–100). This keeps the formula consistent:
 *
 *   healthScore = 100 - sum(penalties)
 */

import type { HealthContribution, HealthContributionProvider, ModuleId } from './HealthContribution';
import { clampHealth } from './HealthContribution';
import { healthScoreService } from './HealthScoreService';
import { getHealthEngineConfig } from './HealthEngineConfig';
import { dashboardService } from '../dashboard/dashboard.service';
import { registryService } from '../registry/registry.service';
import { privacyService } from '../privacy/privacy.service';
import type { DashboardMetrics } from '../dashboard/dashboard.types';

// Cache metrics to avoid multiple RPC calls per compute cycle
let cachedMetrics: DashboardMetrics | null = null;
let metricsFetchPromise: Promise<DashboardMetrics | null> | null = null;

async function getMetrics(): Promise<DashboardMetrics | null> {
  if (cachedMetrics) return cachedMetrics;
  if (metricsFetchPromise) return metricsFetchPromise;
  metricsFetchPromise = dashboardService.getMetrics().then((m) => {
    cachedMetrics = m;
    metricsFetchPromise = null;
    return m;
  }).catch(() => {
    metricsFetchPromise = null;
    return null;
  });
  return metricsFetchPromise;
}

export function invalidateMetricsCache(): void {
  cachedMetrics = null;
}

// ── Junk Cleaner ────────────────────────────────────────────────────

export class JunkHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    const metrics = await getMetrics();
    const tempSize = metrics?.performance.temporaryFilesSize ?? 0;
    const recycleBin = metrics?.performance.recycleBinSize ?? 0;
    const browserCache = metrics?.performance.browserCacheSize ?? 0;
    const recoverable = metrics?.performance.potentialRecoverable ?? 0;

    const junkBytes = tempSize + recycleBin + browserCache;
    const penalty = recoverable > 0
      ? Math.min(30, Math.log10(recoverable / (1024 * 1024) + 1) * 5)
      : 0;

    return {
      moduleId: 'junk' as ModuleId,
      moduleName: 'Junk Cleaner',
      currentPenalty: clampHealth(penalty),
      maxPenalty: 30,
      resolvedPenalty: 0,
      detail: junkBytes > 0
        ? `${Math.round(junkBytes / (1024 * 1024))} MB of junk files`
        : 'No junk files detected',
      canAutoFix: true,
      actionPath: '/junk-cleaner',
    };
  }
}

// ── Registry Cleaner ────────────────────────────────────────────────

export class RegistryHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    try {
      const result = await registryService.scan();
      const issueCount = result.issues.length;
      const penalty = Math.min(20, issueCount * 0.5);

      return {
        moduleId: 'registry' as ModuleId,
        moduleName: 'Registry Cleaner',
        currentPenalty: clampHealth(penalty),
        maxPenalty: 20,
        resolvedPenalty: 0,
        detail: issueCount > 0
          ? `${issueCount} registry issues found`
          : 'No registry issues',
        canAutoFix: true,
        actionPath: '/registry-cleaner',
      };
    } catch {
      return {
        moduleId: 'registry' as ModuleId,
        moduleName: 'Registry Cleaner',
        currentPenalty: 0,
        maxPenalty: 20,
        resolvedPenalty: 0,
        detail: 'Unable to scan registry',
        canAutoFix: true,
        actionPath: '/registry-cleaner',
      };
    }
  }
}

// ── Startup Manager ─────────────────────────────────────────────────

export class StartupHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    const metrics = await getMetrics();
    const startupApps = metrics?.performance.startupApps ?? 0;
    const penalty = Math.min(50, startupApps * 5);

    return {
      moduleId: 'startup' as ModuleId,
      moduleName: 'Startup Manager',
      currentPenalty: clampHealth(penalty),
      maxPenalty: 50,
      resolvedPenalty: 0,
      detail: `${startupApps} startup apps enabled`,
      canAutoFix: true,
      actionPath: '/startup-manager',
    };
  }
}

// ── Privacy Cleaner ─────────────────────────────────────────────────

export class PrivacyHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    try {
      const result = await privacyService.detectBrowsers();
      const browserCount = result.browsers.length;
      // Use same formula as calculateHealthScore: penaltyPerRisk from config, capped at maxPenalty
      const cfg = getHealthEngineConfig();
      const penalty = Math.min(cfg.privacy.maxPenalty, browserCount * cfg.privacy.penaltyPerRisk);

      return {
        moduleId: 'privacy' as ModuleId,
        moduleName: 'Privacy Cleaner',
        currentPenalty: clampHealth(penalty),
        maxPenalty: cfg.privacy.maxPenalty,
        resolvedPenalty: 0,
        detail: browserCount > 0
          ? `${browserCount} browser(s) with traces`
          : 'No privacy risks detected',
        canAutoFix: true,
        actionPath: '/privacy-cleaner',
      };
    } catch {
      return {
        moduleId: 'privacy' as ModuleId,
        moduleName: 'Privacy Cleaner',
        currentPenalty: 0,
        maxPenalty: 100,
        resolvedPenalty: 0,
        detail: 'Unable to detect privacy risks',
        canAutoFix: true,
        actionPath: '/privacy-cleaner',
      };
    }
  }
}

// ── Performance ─────────────────────────────────────────────────────

export class PerformanceHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    const metrics = await getMetrics();
    const cpuUsage = metrics?.cpu.usage ?? 0;
    const memUsage = metrics?.memory.usage ?? 0;
    // Use same threshold-based formula as calculateHealthScore
    const cfg = getHealthEngineConfig();
    let penalty = 0;
    if (cpuUsage > cfg.performance.cpuCriticalThreshold) {
      penalty += cfg.performance.cpuCriticalPenalty;
    } else if (cpuUsage > cfg.performance.cpuWarningThreshold) {
      penalty += cfg.performance.cpuWarningPenalty;
    }
    if (memUsage > cfg.performance.memoryCriticalThreshold) {
      penalty += cfg.performance.memoryCriticalPenalty;
    } else if (memUsage > cfg.performance.memoryWarningThreshold) {
      penalty += cfg.performance.memoryWarningPenalty;
    }
    const maxPenalty = cfg.performance.cpuCriticalPenalty + cfg.performance.memoryCriticalPenalty;

    return {
      moduleId: 'performance' as ModuleId,
      moduleName: 'Performance',
      currentPenalty: clampHealth(penalty),
      maxPenalty,
      resolvedPenalty: 0,
      detail: `CPU ${cpuUsage.toFixed(0)}% / RAM ${memUsage.toFixed(0)}%`,
      canAutoFix: true,
      actionPath: '/performance',
    };
  }
}

// ── Disk Usage ──────────────────────────────────────────────────────

export class DiskHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    const metrics = await getMetrics();
    const drives = metrics?.storage ?? [];
    if (drives.length === 0) {
      return {
        moduleId: 'disk' as ModuleId,
        moduleName: 'Disk Analyzer',
        currentPenalty: 0,
        maxPenalty: 20,
        resolvedPenalty: 0,
        detail: 'No drives detected',
        canAutoFix: false,
        actionPath: '/disk-analyzer',
      };
    }
    const avgUsage = drives.reduce((sum, d) => sum + d.usage, 0) / drives.length;
    const penalty = Math.min(20, Math.max(0, (avgUsage - 70) * 0.5));

    return {
      moduleId: 'disk' as ModuleId,
      moduleName: 'Disk Analyzer',
      currentPenalty: clampHealth(penalty),
      maxPenalty: 20,
      resolvedPenalty: 0,
      detail: `${drives.length} drives, avg ${avgUsage.toFixed(0)}% used`,
      canAutoFix: false,
      actionPath: '/disk-analyzer',
    };
  }
}

// ── Security ────────────────────────────────────────────────────────

export class SecurityHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    const metrics = await getMetrics();
    const security = metrics?.security;
    // Use same penalty values as calculateHealthScore from HealthEngineConfig
    const cfg = getHealthEngineConfig();
    const maxPenalty = cfg.security.defenderDisabledPenalty + cfg.security.realTimeProtectionDisabledPenalty +
      cfg.security.firewallDisabledPenalty + cfg.security.smartScreenDisabledPenalty + cfg.security.pendingUpdatesPenalty;
    if (!security) {
      return {
        moduleId: 'security' as ModuleId,
        moduleName: 'Security',
        currentPenalty: 0,
        maxPenalty,
        resolvedPenalty: 0,
        detail: 'Security status unavailable',
        canAutoFix: false,
        actionPath: '/security',
      };
    }

    let penalty = 0;
    const thirdPartyAV = security.defender.thirdPartyAV || security.firewall.thirdPartyAV;
    if (!thirdPartyAV) {
      if (!security.defender.enabled) penalty += cfg.security.defenderDisabledPenalty;
      if (!security.defender.realTimeProtection) penalty += cfg.security.realTimeProtectionDisabledPenalty;
      if (!security.firewall.enabled) penalty += cfg.security.firewallDisabledPenalty;
    }
    if (!security.smartScreen) penalty += cfg.security.smartScreenDisabledPenalty;
    if (security.updates.pendingUpdates > 0) penalty += cfg.security.pendingUpdatesPenalty;

    return {
      moduleId: 'security' as ModuleId,
      moduleName: 'Security',
      currentPenalty: clampHealth(penalty),
      maxPenalty,
      resolvedPenalty: 0,
      detail: penalty === 0 ? 'All protections active' : `${penalty.toFixed(0)} points of security issues`,
      canAutoFix: false,
      actionPath: '/security',
    };
  }
}

// ── System Information ──────────────────────────────────────────────

export class SystemHealthProvider implements HealthContributionProvider {
  async getContribution(): Promise<HealthContribution> {
    const metrics = await getMetrics();
    const uptime = metrics?.windows.uptime ?? 0;
    const uptimeDays = uptime / 86400;
    const penalty = uptimeDays > 30 ? 10 : 0;

    return {
      moduleId: 'system' as ModuleId,
      moduleName: 'System Information',
      currentPenalty: clampHealth(penalty),
      maxPenalty: 10,
      resolvedPenalty: 0,
      detail: uptimeDays > 30
        ? `Uptime ${Math.round(uptimeDays)} days`
        : 'System healthy',
      canAutoFix: false,
      actionPath: '/system-information',
    };
  }
}

// ── Registration helper ─────────────────────────────────────────────

export function registerAllHealthProviders(): void {
  healthScoreService.registerProvider('junk' as ModuleId, new JunkHealthProvider());
  healthScoreService.registerProvider('registry' as ModuleId, new RegistryHealthProvider());
  healthScoreService.registerProvider('startup' as ModuleId, new StartupHealthProvider());
  healthScoreService.registerProvider('privacy' as ModuleId, new PrivacyHealthProvider());
  healthScoreService.registerProvider('performance' as ModuleId, new PerformanceHealthProvider());
  healthScoreService.registerProvider('disk' as ModuleId, new DiskHealthProvider());
  healthScoreService.registerProvider('security' as ModuleId, new SecurityHealthProvider());
  healthScoreService.registerProvider('system' as ModuleId, new SystemHealthProvider());
}

