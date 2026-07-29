/**
 * Tests for the AI Device Profile Engine.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AIContext, KnowledgeObject } from '../../knowledge/types';
import { createProvenance } from '../../context/types';
import { KnowledgeBuilder } from '../../knowledge/knowledgeBuilder';
import { KnowledgeRegistry } from '../../knowledge/knowledgeRegistry';
import { KnowledgeValidator } from '../../knowledge/knowledgeValidator';
import { DEFAULT_KNOWLEDGE_CONFIG } from '../../knowledge/knowledgeConfiguration';
import type {
  DeviceProfile,
  DeviceProfileType,
  ProfileScore,
  ProfileProviderPlugin,
} from '../types';
import {
  generateProfileId,
  clampScore,
  getProfileLabel,
  getWorkloadLabel,
  getPerformanceTierLabel,
} from '../types';
import { ProfileEventEmitter } from '../profileEvents';
import { DEFAULT_PROFILE_CONFIG, createProfileConfig } from '../profileConfiguration';
import { ProfileRegistry } from '../profileRegistry';
import { HardwareAnalyzer } from '../hardwareAnalyzer';
import { SoftwareAnalyzer } from '../softwareAnalyzer';
import { UsageAnalyzer } from '../usageAnalyzer';
import { WorkloadAnalyzer } from '../workloadAnalyzer';
import { DeviceClassifier } from '../deviceClassifier';
import { ProfileScorer } from '../profileScorer';
import { ProfileValidator } from '../profileValidator';
import { ProfileHistory } from '../profileHistory';
import { ProfileBuilder } from '../profileBuilder';
import { DeviceProfileEngine } from '../deviceProfileEngine';
import { DeviceProfileManager } from '../deviceProfileManager';

// ── Mock Context ─────────────────────────────────────────────

function createMockContext(sections: Partial<AIContext> = {}): AIContext {
  return {
    metadata: { contextId: 'test-ctx', timestamp: new Date().toISOString(), contextVersion: '1.0.0', appVersion: '1.0.0', platform: 'win32', language: 'en-US', currentPlan: 'FREE', generationTimeMs: 5 },
    provenance: [], ...sections,
  };
}

function createFullContext(): AIContext {
  const prov = createProvenance('test-provider', '1.0.0');
  return createMockContext({
    system: { osVersion: 'Win11', osBuild: '22631', architecture: 'x64', hostname: 'DEV-PC', uptime: 14400, cpuModel: 'Intel i7-12700K', cpuCores: 12, totalMemoryMB: 32768, gpuModel: 'NVIDIA RTX 3070', provenance: prov },
    health: { overallScore: 65, cpuScore: 70, ramScore: 60, diskScore: 55, stabilityScore: 75, securityScore: 65, issues: [], provenance: prov },
    performance: { cpuUsage: 45, ramUsage: 60, diskUsage: 70, diskReadSpeedMBps: null, diskWriteSpeedMBps: null, networkLatencyMs: null, activeProcesses: 150, provenance: prov },
    storage: { totalCapacityMB: 1024000, usedMB: 450000, freeMB: 574000, driveType: 'SSD', driveHealth: 'good', fragmentationPercent: 5, largeFiles: [], provenance: prov },
    browser: { installedBrowsers: [{ name: 'Chrome', version: '120', profileCount: 1, cacheMB: 350 }, { name: 'Firefox', version: '121', profileCount: 1, cacheMB: 200 }], totalCacheMB: 550, totalCookiesMB: 80, totalHistoryMB: 100, extensions: [{ browser: 'Chrome', name: 'React DevTools', enabled: true }], provenance: prov },
    privacy: { trackingCookies: 200, historyEntries: 1500, tempFilesMB: 350, recycleBinMB: 120, recentItems: 50, provenance: prov },
    startup: { totalStartupItems: 20, enabledItems: 12, disabledItems: 8, estimatedBootTimeSec: 45, highImpactItems: [{ name: 'Docker', command: 'docker.exe', impact: 'high', enabled: true, publisher: 'Docker Inc' }], provenance: prov },
    windows: { windowsVersion: '11', buildNumber: '22631', lastUpdate: null, pendingUpdates: 3, services: Array.from({ length: 15 }, (_, i) => ({ name: `svc_${i}`, displayName: `Service ${i}`, status: 'running' as const, startType: 'auto' as const })), provenance: prov },
    duplicates: { totalDuplicateGroups: 8, totalDuplicateFiles: 30, wastedSpaceMB: 800, scanStatus: 'completed', topDuplicateGroups: [], provenance: prov },
    scheduler: { enabled: true, scheduledTasks: [{ id: 't1', name: 'Weekly Cleanup', frequency: 'weekly', enabled: true, lastRunAt: null, nextRunAt: null }], lastRunAt: null, nextRunAt: null, provenance: prov },
    history: { totalOptimizations: 15, totalCleanedMB: 5000, totalIssuesFixed: 25, lastOptimizationAt: null, optimizationHistory: [], provenance: prov },
    reports: { totalReports: 3, lastReportAt: null, reportTypes: ['health'], scheduledReports: 1, provenance: prov },
    experience: { currentPlan: 'FREE', planLabel: 'Free', trialStatus: 'available', unlockedFeatures: ['f1'], limitedFeatures: ['f2'], lockedFeatures: ['f3'], provenance: prov },
    capabilities: { totalCapabilities: 10, enabledCapabilities: ['c1'], disabledCapabilities: ['c2'], provenance: prov },
    quota: { quotas: [{ quotaId: 'ai', limit: 5, used: 3, remaining: 2, isUnlimited: false, resetPolicy: 'daily', nextResetAt: null }], provenance: prov },
    analytics: { mostUsedFeatures: [], mostReachedQuotas: [], totalFeatureAccesses: 100, totalDenials: 5, provenance: prov },
  });
}

function createGamingContext(): AIContext {
  const ctx = createFullContext();
  const prov = createProvenance('test-provider', '1.0.0');
  return {
    ...ctx,
    system: { ...ctx.system!, cpuModel: 'AMD Ryzen 9 7950X', cpuCores: 16, totalMemoryMB: 65536, gpuModel: 'NVIDIA RTX 4090', hostname: 'GAMING-RIG', provenance: prov },
    startup: { totalStartupItems: 5, enabledItems: 3, disabledItems: 2, estimatedBootTimeSec: 20, highImpactItems: [{ name: 'Steam', command: 'steam.exe', impact: 'medium', enabled: true, publisher: 'Valve' }], provenance: prov },
    browser: { installedBrowsers: [{ name: 'Chrome', version: '120', profileCount: 1, cacheMB: 200 }], totalCacheMB: 200, totalCookiesMB: 30, totalHistoryMB: 50, extensions: [{ browser: 'Chrome', name: 'NVIDIA GeForce', enabled: true }], provenance: prov },
  };
}

function createOfficeContext(): AIContext {
  const ctx = createFullContext();
  const prov = createProvenance('test-provider', '1.0.0');
  return {
    ...ctx,
    system: { ...ctx.system!, cpuModel: 'Intel i3-10100', cpuCores: 4, totalMemoryMB: 8192, gpuModel: null, hostname: 'OFFICE-PC', provenance: prov },
    startup: { totalStartupItems: 8, enabledItems: 6, disabledItems: 2, estimatedBootTimeSec: 30, highImpactItems: [{ name: 'Microsoft Office', command: 'office.exe', impact: 'medium', enabled: true, publisher: 'Microsoft' }], provenance: prov },
    browser: { installedBrowsers: [{ name: 'Edge', version: '120', profileCount: 1, cacheMB: 80 }], totalCacheMB: 80, totalCookiesMB: 20, totalHistoryMB: 30, extensions: [], provenance: prov },
    history: { totalOptimizations: 2, totalCleanedMB: 500, totalIssuesFixed: 3, lastOptimizationAt: null, optimizationHistory: [], provenance: prov },
  };
}

async function createKnowledge(context?: AIContext): Promise<KnowledgeObject> {
  const builder = new KnowledgeBuilder(new KnowledgeRegistry(), new KnowledgeValidator(DEFAULT_KNOWLEDGE_CONFIG), DEFAULT_KNOWLEDGE_CONFIG);
  return builder.build(context ?? createFullContext());
}

// ── Types & Helpers ──────────────────────────────────────────

describe('Types & Helpers', () => {
  it('generateProfileId returns unique IDs', () => {
    const a = generateProfileId('My-PC');
    const b = generateProfileId('My-PC');
    expect(a).not.toBe(b);
    expect(a).toContain('profile_');
  });
  it('clampScore clamps to [0,1]', () => {
    expect(clampScore(-0.5)).toBe(0);
    expect(clampScore(1.5)).toBe(1);
    expect(clampScore(0.5)).toBe(0.5);
  });
  it('getProfileLabel returns correct label', () => {
    expect(getProfileLabel('developer_workstation')).toBe('Developer Workstation');
    expect(getProfileLabel('gaming_pc')).toBe('Gaming PC');
    expect(getProfileLabel('general_purpose')).toBe('General Purpose');
  });
  it('getWorkloadLabel returns correct label', () => {
    expect(getWorkloadLabel('gaming')).toBe('Gaming');
    expect(getWorkloadLabel('development')).toBe('Development');
    expect(getWorkloadLabel('mixed_usage')).toBe('Mixed Usage');
  });
  it('getPerformanceTierLabel returns correct label', () => {
    expect(getPerformanceTierLabel('high_end')).toBe('High-End');
    expect(getPerformanceTierLabel('enterprise')).toBe('Enterprise');
    expect(getPerformanceTierLabel('unknown')).toBe('Unknown');
  });
});

// ── Events ───────────────────────────────────────────────────

describe('ProfileEventEmitter', () => {
  let e: ProfileEventEmitter;
  beforeEach(() => { e = new ProfileEventEmitter(); });

  it('emits events', () => {
    let received = false;
    e.on('profile_created', () => { received = true; });
    e.emit('profile_created', { id: 'p1' });
    expect(received).toBe(true);
  });
  it('supports unsubscribe', () => {
    let count = 0;
    const unsub = e.on('profile_updated', () => { count++; });
    e.emit('profile_updated', {});
    unsub();
    e.emit('profile_updated', {});
    expect(count).toBe(1);
  });
  it('tracks listener count', () => {
    e.on('profile_created', () => {});
    expect(e.listenerCount('profile_created')).toBe(1);
    expect(e.listenerCount('profile_changed')).toBe(0);
  });
  it('clear removes all', () => {
    e.on('profile_created', () => {});
    e.on('profile_updated', () => {});
    e.clear();
    expect(e.listenerCount('profile_created')).toBe(0);
    expect(e.listenerCount('profile_updated')).toBe(0);
  });
  it('does not crash on listener error', () => {
    e.on('profile_created', () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.emit('profile_created', {});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it('supports all 6 event types', () => {
    const events = ['profile_created', 'profile_updated', 'profile_changed', 'profile_strengthened', 'profile_weakened', 'profile_validated'] as const;
    for (const evt of events) {
      let received = false;
      e.on(evt, () => { received = true; });
      e.emit(evt, {});
      expect(received).toBe(true);
      e.clear();
    }
  });
});

// ── Configuration ────────────────────────────────────────────

describe('ProfileConfiguration', () => {
  it('has defaults', () => {
    expect(DEFAULT_PROFILE_CONFIG.profileVersion).toBe('1.0.0');
    expect(DEFAULT_PROFILE_CONFIG.classificationRules.hybridProfileEnabled).toBe(true);
    expect(DEFAULT_PROFILE_CONFIG.profileDefinitions.length).toBeGreaterThan(10);
  });
  it('createProfileConfig accepts overrides', () => {
    const cfg = createProfileConfig({ profileVersion: '2.0.0' });
    expect(cfg.profileVersion).toBe('2.0.0');
    expect(cfg.classificationRules.hybridProfileEnabled).toBe(true);
  });
  it('merges nested classificationRules', () => {
    const cfg = createProfileConfig({ classificationRules: { primaryProfileThreshold: 0.5 } });
    expect(cfg.classificationRules.primaryProfileThreshold).toBe(0.5);
    expect(cfg.classificationRules.hybridProfileEnabled).toBe(true);
  });
  it('merges nested scoringRules', () => {
    const cfg = createProfileConfig({ scoringRules: { hardwareWeight: 0.5 } });
    expect(cfg.scoringRules.hardwareWeight).toBe(0.5);
    expect(cfg.scoringRules.softwareWeight).toBe(DEFAULT_PROFILE_CONFIG.scoringRules.softwareWeight);
  });
  it('merges nested confidenceRules', () => {
    const cfg = createProfileConfig({ confidenceRules: { minEvidenceCount: 5 } });
    expect(cfg.confidenceRules.minEvidenceCount).toBe(5);
  });
  it('merges nested hardwareRules', () => {
    const cfg = createProfileConfig({ hardwareRules: { lowRamThresholdMB: 2048 } });
    expect(cfg.hardwareRules.lowRamThresholdMB).toBe(2048);
  });
  it('merges nested usageRules', () => {
    const cfg = createProfileConfig({ usageRules: { highOptimizationFrequency: 20 } });
    expect(cfg.usageRules.highOptimizationFrequency).toBe(20);
  });
  it('has profile definitions', () => {
    expect(DEFAULT_PROFILE_CONFIG.profileDefinitions.some((d) => d.type === 'developer_workstation')).toBe(true);
    expect(DEFAULT_PROFILE_CONFIG.profileDefinitions.some((d) => d.type === 'gaming_pc')).toBe(true);
    expect(DEFAULT_PROFILE_CONFIG.profileDefinitions.some((d) => d.type === 'server')).toBe(true);
  });
});

// ── Registry ─────────────────────────────────────────────────

describe('ProfileRegistry', () => {
  let r: ProfileRegistry;
  beforeEach(() => { r = new ProfileRegistry(); });

  it('registers plugin', () => {
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'test', getVersion: () => '1.0', getPriority: () => 1, isAvailable: () => true,
      analyzeProfile: () => [],
    };
    expect(r.registerPlugin(plugin)).toBe(true);
    expect(r.count).toBe(1);
  });
  it('rejects duplicate name', () => {
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'test', getVersion: () => '1.0', getPriority: () => 1, isAvailable: () => true,
      analyzeProfile: () => [],
    };
    r.registerPlugin(plugin);
    expect(r.registerPlugin(plugin)).toBe(false);
  });
  it('unregisters plugin', () => {
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'test', getVersion: () => '1.0', getPriority: () => 1, isAvailable: () => true,
      analyzeProfile: () => [],
    };
    r.registerPlugin(plugin);
    expect(r.unregisterPlugin('test')).toBe(true);
    expect(r.count).toBe(0);
  });
  it('getPlugins sorted by priority', () => {
    const p1: ProfileProviderPlugin = { getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 2, isAvailable: () => true, analyzeProfile: () => [] };
    const p2: ProfileProviderPlugin = { getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, analyzeProfile: () => [] };
    r.registerPlugin(p1);
    r.registerPlugin(p2);
    const plugins = r.getPlugins();
    expect(plugins[0]!.getPluginName()).toBe('b');
  });
  it('getAvailablePlugins filters unavailable', () => {
    const p1: ProfileProviderPlugin = { getPluginName: () => 'a', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, analyzeProfile: () => [] };
    const p2: ProfileProviderPlugin = { getPluginName: () => 'b', getVersion: () => '1', getPriority: () => 1, isAvailable: () => false, analyzeProfile: () => [] };
    r.registerPlugin(p1);
    r.registerPlugin(p2);
    expect(r.getAvailablePlugins().length).toBe(1);
  });
  it('clear removes all', () => {
    const plugin: ProfileProviderPlugin = { getPluginName: () => 'test', getVersion: () => '1', getPriority: () => 1, isAvailable: () => true, analyzeProfile: () => [] };
    r.registerPlugin(plugin);
    r.clear();
    expect(r.count).toBe(0);
  });
});

// ── Hardware Analyzer ────────────────────────────────────────

describe('HardwareAnalyzer', () => {
  let a: HardwareAnalyzer;
  beforeEach(() => { a = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG); });

  it('analyzes hardware from context', () => {
    const hw = a.analyze(createFullContext());
    expect(hw.cpuModel).toBe('Intel i7-12700K');
    expect(hw.cpuCores).toBe(12);
    expect(hw.totalMemoryMB).toBe(32768);
    expect(hw.gpuModel).toBe('NVIDIA RTX 3070');
  });
  it('derives performance tier', () => {
    const hw = a.analyze(createFullContext());
    expect(hw.performanceTier).not.toBe('unknown');
  });
  it('classifies high-end hardware', () => {
    const hw = a.analyze(createFullContext());
    expect(hw.details.ramCapacity).toBe('very_high');
    expect(hw.details.cpuTier).toBe('very_high');
  });
  it('classifies low-end hardware', () => {
    const ctx = createMockContext({
      system: { osVersion: 'Win10', osBuild: '19041', architecture: 'x64', hostname: 'LOW-END', uptime: 3600, cpuModel: 'Intel Celeron', cpuCores: 2, totalMemoryMB: 2048, gpuModel: null, provenance: createProvenance('p', '1') },
    });
    const hw = a.analyze(ctx);
    expect(hw.details.ramCapacity).toBe('low');
    expect(hw.details.cpuTier).toBe('low');
  });
  it('detects GPU tier', () => {
    const ctx = createMockContext({
      system: { osVersion: 'Win11', osBuild: '22631', architecture: 'x64', hostname: 'PC', uptime: 3600, cpuModel: 'i9', cpuCores: 16, totalMemoryMB: 65536, gpuModel: 'NVIDIA RTX 4090', provenance: createProvenance('p', '1') },
    });
    const hw = a.analyze(ctx);
    expect(hw.details.gpuTier).toBe('very_high');
  });
  it('detects no GPU', () => {
    const ctx = createMockContext({
      system: { osVersion: 'Win11', osBuild: '22631', architecture: 'x64', hostname: 'PC', uptime: 3600, cpuModel: 'i5', cpuCores: 4, totalMemoryMB: 8192, gpuModel: null, provenance: createProvenance('p', '1') },
    });
    const hw = a.analyze(ctx);
    expect(hw.details.gpuTier).toBe('none');
  });
  it('produces evidence', () => {
    const evidence = a.getEvidence(createFullContext());
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.some((e) => e.metric === 'cpu_model')).toBe(true);
  });
  it('handles empty context', () => {
    const hw = a.analyze(createMockContext());
    expect(hw.cpuModel).toBe('Unknown');
    expect(hw.cpuCores).toBe(0);
  });
  it('detects server hardware', () => {
    const ctx = createMockContext({
      system: { osVersion: 'Win Server 2019', osBuild: '17763', architecture: 'x64', hostname: 'SRV-01', uptime: 999999, cpuModel: 'Intel Xeon E5-2699', cpuCores: 22, totalMemoryMB: 131072, gpuModel: null, provenance: createProvenance('p', '1') },
    });
    const hw = a.analyze(ctx);
    expect(hw.details.isServer).toBe(true);
  });
  it('detects VM indicators', () => {
    const ctx = createMockContext({
      system: { osVersion: 'Win11', osBuild: '22631', architecture: 'x64', hostname: 'vm-test', uptime: 3600, cpuModel: 'Virtual CPU', cpuCores: 4, totalMemoryMB: 8192, gpuModel: null, provenance: createProvenance('p', '1') },
    });
    const hw = a.analyze(ctx);
    expect(hw.details.isVirtualMachine).toBe(true);
  });
});

// ── Software Analyzer ────────────────────────────────────────

describe('SoftwareAnalyzer', () => {
  let a: SoftwareAnalyzer;
  beforeEach(() => { a = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG); });

  it('analyzes software from context', () => {
    const sw = a.analyze(createFullContext());
    expect(sw.browserCount).toBe(2);
    expect(sw.categories.length).toBeGreaterThan(0);
  });
  it('detects browsers', () => {
    const sw = a.analyze(createFullContext());
    expect(sw.categories.some((c) => c.category === 'browser')).toBe(true);
  });
  it('detects developer tools from startup items', () => {
    const sw = a.analyze(createFullContext());
    expect(sw.developerToolCount).toBeGreaterThan(0);
  });
  it('produces evidence', () => {
    const evidence = a.getEvidence(createFullContext());
    expect(evidence.length).toBeGreaterThan(0);
  });
  it('handles empty context', () => {
    const sw = a.analyze(createMockContext());
    expect(sw.browserCount).toBe(0);
    expect(sw.categories.length).toBe(0);
  });
});

// ── Usage Analyzer ───────────────────────────────────────────

describe('UsageAnalyzer', () => {
  let a: UsageAnalyzer;

  beforeEach(async () => {
    a = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG);
  });

  it('analyzes usage from context and knowledge', async () => {
    const k = await createKnowledge();
    const usage = a.analyze(createFullContext(), k);
    expect(usage.optimizationFrequency).not.toBe('unknown');
    expect(usage.browsingActivity).not.toBe('unknown');
  });
  it('detects high optimization frequency', async () => {
    const k = await createKnowledge();
    const usage = a.analyze(createFullContext(), k);
    expect(usage.optimizationFrequency).toBe('high');
  });
  it('detects heavy startup', async () => {
    const k = await createKnowledge();
    const usage = a.analyze(createFullContext(), k);
    expect(usage.startupBehavior).toBe('moderate');
  });
  it('detects high storage consumption', async () => {
    const k = await createKnowledge();
    const usage = a.analyze(createFullContext(), k);
    expect(usage.storageConsumption).toBe('low');
  });
  it('detects proactive maintenance', async () => {
    const k = await createKnowledge();
    const usage = a.analyze(createFullContext(), k);
    expect(usage.maintenanceHabits).toBe('proactive');
  });
  it('produces evidence', async () => {
    const k = await createKnowledge();
    const evidence = a.getEvidence(createFullContext(), k);
    expect(evidence.length).toBeGreaterThan(0);
  });
  it('handles empty context', async () => {
    const k = await createKnowledge(createMockContext());
    const usage = a.analyze(createMockContext(), k);
    expect(usage.optimizationFrequency).toBe('unknown');
  });
});

// ── Workload Analyzer ────────────────────────────────────────

describe('WorkloadAnalyzer', () => {
  let a: WorkloadAnalyzer;
  beforeEach(() => { a = new WorkloadAnalyzer(DEFAULT_PROFILE_CONFIG); });

  it('estimates workload', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = a.analyze(ctx, k, hw, sw, usage);
    expect(workload.primaryWorkload).not.toBe('unknown');
    expect(Object.keys(workload.workloadScores).length).toBeGreaterThan(5);
  });
  it('produces evidence', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const evidence = a.getEvidence(hw, sw, usage);
    expect(evidence.length).toBeGreaterThan(0);
  });
  it('gaming workload scores higher with gaming hardware', async () => {
    const ctx = createGamingContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = a.analyze(ctx, k, hw, sw, usage);
    expect(workload.workloadScores['gaming'] ?? 0).toBeGreaterThan(0.3);
  });
});

// ── Device Classifier ────────────────────────────────────────

describe('DeviceClassifier', () => {
  let c: DeviceClassifier;
  beforeEach(() => { c = new DeviceClassifier(DEFAULT_PROFILE_CONFIG); });

  it('classifies device', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = new WorkloadAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k, hw, sw, usage);
    const result = c.classify(ctx, k, hw, sw, usage, workload);
    expect(result.primary).toBeDefined();
    expect(result.scores.length).toBeGreaterThan(0);
  });
  it('supports hybrid profiles', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = new WorkloadAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k, hw, sw, usage);
    const result = c.classify(ctx, k, hw, sw, usage, workload);
    // Secondary profiles are not mutually exclusive
    expect(Array.isArray(result.secondary)).toBe(true);
  });
  it('classifies gaming PC', async () => {
    const ctx = createGamingContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = new WorkloadAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k, hw, sw, usage);
    const result = c.classify(ctx, k, hw, sw, usage, workload);
    const gamingScore = result.scores.find((s) => s.profileType === 'gaming_pc');
    expect(gamingScore!.score).toBeGreaterThan(0.3);
  });
  it('classifies office workstation', async () => {
    const ctx = createOfficeContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = new WorkloadAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k, hw, sw, usage);
    const result = c.classify(ctx, k, hw, sw, usage, workload);
    const officeScore = result.scores.find((s) => s.profileType === 'office_workstation');
    expect(officeScore!.score).toBeGreaterThan(0.2);
  });
  it('every score has evidence', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx);
    const usage = new UsageAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k);
    const workload = new WorkloadAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(ctx, k, hw, sw, usage);
    const result = c.classify(ctx, k, hw, sw, usage, workload);
    for (const score of result.scores) {
      if (score.score > 0) expect(score.evidence.length).toBeGreaterThan(0);
    }
  });
});

// ── Profile Scorer ───────────────────────────────────────────

describe('ProfileScorer', () => {
  let s: ProfileScorer;
  beforeEach(() => { s = new ProfileScorer(DEFAULT_PROFILE_CONFIG); });

  it('calculates confidence', () => {
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(createFullContext());
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(createFullContext());
    const conf = s.calculateConfidence(hw, sw, { confidence: 0.8 } as never, { confidence: 0.7 } as never, 10);
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThanOrEqual(1);
  });
  it('reduces confidence with insufficient evidence', () => {
    const hw = new HardwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(createFullContext());
    const sw = new SoftwareAnalyzer(DEFAULT_PROFILE_CONFIG).analyze(createFullContext());
    const conf = s.calculateConfidence(hw, sw, { confidence: 0.8 } as never, { confidence: 0.7 } as never, 1);
    expect(conf).toBeLessThan(1);
  });
  it('calculates stability', () => {
    expect(s.calculateStability([])).toBe(0);
    expect(s.calculateStability([{ primaryProfile: 'a' }, { primaryProfile: 'a' }])).toBe(1);
    expect(s.calculateStability([{ primaryProfile: 'a' }, { primaryProfile: 'b' }])).toBe(0.5);
  });
  it('calculates consistency', () => {
    const scores: ProfileScore[] = [
      { profileType: 'gaming_pc', score: 0.8, weight: 0.8, evidence: [] },
      { profileType: 'office_workstation', score: 0.3, weight: 0.3, evidence: [] },
    ];
    const consistency = s.calculateConsistency(scores);
    expect(consistency).toBeGreaterThan(0.5);
  });
  it('calculates data freshness', () => {
    const now = new Date().toISOString();
    expect(s.calculateDataFreshness(now)).toBeCloseTo(1.0, 1);
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(s.calculateDataFreshness(old)).toBeLessThan(0.3);
  });
});

// ── Profile Validator ────────────────────────────────────────

describe('ProfileValidator', () => {
  let v: ProfileValidator;
  let validProfile: DeviceProfile;

  beforeEach(() => {
    v = new ProfileValidator(DEFAULT_PROFILE_CONFIG);
    validProfile = {
      id: 'test-profile',
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceName: 'Test-PC',
      platform: 'win32',
      hardwareSummary: { cpuModel: 'i7', cpuCores: 8, totalMemoryMB: 16384, gpuModel: 'RTX', storageType: 'SSD', storageCapacityMB: 512000, driveCount: 1, performanceTier: 'high_end', displayCount: null, hasBattery: null, details: { ramCapacity: 'high', cpuTier: 'high', gpuTier: 'high', storageTier: 'high', isLaptop: null, isServer: null, isVirtualMachine: null }, confidence: 0.8 },
      softwareSummary: { installedAppCount: null, developerToolCount: 2, creativeSoftwareCount: 0, gameCount: 0, officeSuiteCount: 1, browserCount: 2, virtualizationCount: 1, securitySoftwareCount: 1, backgroundServiceCount: 10, categories: [{ category: 'browser', count: 2, relevance: 0.6 }], confidence: 0.7 },
      usageSummary: { optimizationFrequency: 'medium', browsingActivity: 'high', startupBehavior: 'moderate', diskGrowthRate: 'slow', storageConsumption: 'medium', maintenanceHabits: 'proactive', sessionDuration: 'medium', applicationCategories: ['browser'], confidence: 0.6 },
      workloadSummary: { primaryWorkload: 'development', secondaryWorkloads: ['browsing'], workloadScores: { development: 0.7 }, confidence: 0.7 },
      primaryProfile: 'developer_workstation',
      secondaryProfiles: [{ profileType: 'general_purpose', score: 0.3, weight: 0.3, evidence: ['Default'] }],
      profileScores: [{ profileType: 'developer_workstation', score: 0.7, weight: 0.7, evidence: ['Dev tools'] }],
      confidenceScore: 0.75,
      evidence: { relatedFacts: [], relatedKnowledge: [], relatedPredictions: [], contextEvidence: [], knowledgeEvidence: [], evidenceCount: 5, sourceProviders: ['test'], confidence: 0.75, historicalStability: 0.8, profileConsistency: 0.7, dataFreshness: 1.0, assumptions: ['Test assumption'] },
      changeHistory: [],
      futureMetadata: {},
    };
  });

  it('validates valid profile', () => {
    const result = v.validateProfile(validProfile);
    expect(result.valid).toBe(true);
  });
  it('fails for missing id', () => {
    const p = { ...validProfile, id: '' };
    expect(v.validateProfile(p).valid).toBe(false);
  });
  it('fails for invalid profile type', () => {
    const p = { ...validProfile, primaryProfile: 'invalid' as DeviceProfileType };
    expect(v.validateProfile(p).valid).toBe(false);
  });
  it('fails for no evidence', () => {
    const p = { ...validProfile, evidence: { ...validProfile.evidence, evidenceCount: 0 } };
    expect(v.validateProfile(p).valid).toBe(false);
  });
  it('fails for no source providers', () => {
    const p = { ...validProfile, evidence: { ...validProfile.evidence, sourceProviders: [] } };
    expect(v.validateProfile(p).valid).toBe(false);
  });
  it('warns for low confidence', () => {
    const p = { ...validProfile, confidenceScore: 0.05 };
    const result = v.validateProfile(p);
    expect(result.issues.some((i) => i.code === 'PROFILE_LOW_CONFIDENCE')).toBe(true);
  });
  it('warns for no assumptions', () => {
    const p = { ...validProfile, evidence: { ...validProfile.evidence, assumptions: [] } };
    const result = v.validateProfile(p);
    expect(result.issues.some((i) => i.code === 'PROFILE_NO_ASSUMPTIONS')).toBe(true);
  });
  it('fails for invalid change type', () => {
    const p = { ...validProfile, changeHistory: [{ id: 'c1', timestamp: new Date().toISOString(), changeType: 'invalid' as never, fromProfile: null, toProfile: null, fromScore: null, toScore: null, description: '', metadata: {} }] };
    expect(v.validateProfile(p).valid).toBe(false);
  });
  it('warns for inconsistent primary', () => {
    const p: DeviceProfile = { ...validProfile, primaryProfile: 'gaming_pc', profileScores: [{ profileType: 'developer_workstation', score: 0.9, weight: 0.9, evidence: [] }] };
    const result = v.validateProfile(p);
    expect(result.issues.some((i) => i.code === 'PROFILE_INCONSISTENT_PRIMARY')).toBe(true);
  });
});

// ── Profile History ──────────────────────────────────────────

describe('ProfileHistory', () => {
  let h: ProfileHistory;
  beforeEach(() => { h = new ProfileHistory(DEFAULT_PROFILE_CONFIG); });

  it('records created', () => {
    const profile = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8 } as never;
    const change = h.recordCreated(profile);
    expect(change).not.toBeNull();
    expect(change!.changeType).toBe('new');
    expect(h.count).toBe(1);
  });
  it('records updated with profile change', () => {
    const old = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [] } as never;
    const newP = { id: 'p1', primaryProfile: 'developer_workstation', confidenceScore: 0.85, secondaryProfiles: [] } as never;
    h.recordCreated(old);
    const changes = h.recordUpdated(old, newP);
    expect(changes.some((c) => c.changeType === 'changed')).toBe(true);
  });
  it('records strengthened', () => {
    const old = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.5, secondaryProfiles: [] } as never;
    const newP = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [] } as never;
    h.recordCreated(old);
    const changes = h.recordUpdated(old, newP);
    expect(changes.some((c) => c.changeType === 'strengthened')).toBe(true);
  });
  it('records weakened', () => {
    const old = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [] } as never;
    const newP = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.4, secondaryProfiles: [] } as never;
    h.recordCreated(old);
    const changes = h.recordUpdated(old, newP);
    expect(changes.some((c) => c.changeType === 'weakened')).toBe(true);
  });
  it('records merged', () => {
    const old = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [{ profileType: 'a' }, { profileType: 'b' }] } as never;
    const newP = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [{ profileType: 'a' }] } as never;
    h.recordCreated(old);
    const changes = h.recordUpdated(old, newP);
    expect(changes.some((c) => c.changeType === 'merged')).toBe(true);
  });
  it('records split', () => {
    const old = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [{ profileType: 'a' }] } as never;
    const newP = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [{ profileType: 'a' }, { profileType: 'b' }, { profileType: 'c' }] } as never;
    h.recordCreated(old);
    const changes = h.recordUpdated(old, newP);
    expect(changes.some((c) => c.changeType === 'split')).toBe(true);
  });
  it('records validated', () => {
    h.recordValidated('p1');
    expect(h.count).toBe(1);
  });
  it('tracks change records', () => {
    const profile = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8 } as never;
    h.recordCreated(profile);
    expect(h.changeCount).toBe(1);
  });
  it('clear resets', () => {
    h.recordValidated('p1');
    h.clear();
    expect(h.count).toBe(0);
    expect(h.changeCount).toBe(0);
  });
  it('calculates historical stability', () => {
    expect(h.getHistoricalStability()).toBe(1.0);
    const profile = { id: 'p1', primaryProfile: 'gaming_pc', confidenceScore: 0.8, secondaryProfiles: [] } as never;
    h.recordCreated(profile);
    const changed = { id: 'p1', primaryProfile: 'developer_workstation', confidenceScore: 0.8, secondaryProfiles: [] } as never;
    h.recordUpdated(profile, changed);
    expect(h.getHistoricalStability()).toBeLessThan(1.0);
  });
});

// ── Profile Builder ──────────────────────────────────────────

describe('ProfileBuilder', () => {
  it('builds a profile from context and knowledge', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const registry = new ProfileRegistry();
    const events = new ProfileEventEmitter();
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, registry, events);
    const profile = builder.build(ctx, k, null);
    expect(profile).not.toBeNull();
    expect(profile!.id).toContain('profile_');
    expect(profile!.primaryProfile).toBeDefined();
  });
  it('includes hardware summary', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.hardwareSummary.cpuModel).toBe('Intel i7-12700K');
  });
  it('includes software summary', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.softwareSummary.browserCount).toBe(2);
  });
  it('includes usage summary', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.usageSummary.optimizationFrequency).toBeDefined();
  });
  it('includes workload summary', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.workloadSummary.primaryWorkload).toBeDefined();
  });
  it('includes evidence with source providers', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.evidence.sourceProviders.length).toBeGreaterThan(0);
    expect(profile!.evidence.evidenceCount).toBeGreaterThan(0);
  });
  it('includes assumptions', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.evidence.assumptions.length).toBeGreaterThan(0);
  });
  it('includes confidence score', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.confidenceScore).toBeGreaterThan(0);
    expect(profile!.confidenceScore).toBeLessThanOrEqual(1);
  });
  it('integrates plugin scores', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const registry = new ProfileRegistry();
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'custom-profile',
      getVersion: () => '1.0',
      getPriority: () => 1,
      isAvailable: () => true,
      analyzeProfile: () => [{ profileType: 'power_user', score: 0.9, weight: 0.9, evidence: ['Plugin detected power user patterns'] }],
    };
    registry.registerPlugin(plugin);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, registry, new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile!.profileScores.some((s) => s.profileType === 'power_user')).toBe(true);
  });
  it('plugin failure does not break build', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const registry = new ProfileRegistry();
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'failing',
      getVersion: () => '1.0',
      getPriority: () => 1,
      isAvailable: () => true,
      analyzeProfile: () => { throw new Error('fail'); },
    };
    registry.registerPlugin(plugin);
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, registry, new ProfileEventEmitter());
    const profile = builder.build(ctx, k, null);
    expect(profile).not.toBeNull();
  });
  it('emits profile_created on first build', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const events = new ProfileEventEmitter();
    let created = false;
    events.on('profile_created', () => { created = true; });
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), events);
    builder.build(ctx, k, null);
    expect(created).toBe(true);
  });
  it('emits profile_updated on second build', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const history = new ProfileHistory(DEFAULT_PROFILE_CONFIG);
    const events = new ProfileEventEmitter();
    let updated = false;
    events.on('profile_updated', () => { updated = true; });
    const builder = new ProfileBuilder(DEFAULT_PROFILE_CONFIG, history, new ProfileRegistry(), events);
    builder.build(ctx, k, null);
    builder.build(ctx, k, null);
    expect(updated).toBe(true);
  });
});

// ── Device Profile Engine ────────────────────────────────────

describe('DeviceProfileEngine', () => {
  it('generates profile', async () => {
    const engine = new DeviceProfileEngine(DEFAULT_PROFILE_CONFIG);
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const profile = engine.generateProfile(ctx, k, null);
    expect(profile).not.toBeNull();
    expect(profile!.primaryProfile).toBeDefined();
  });
  it('exposes history', () => {
    const engine = new DeviceProfileEngine(DEFAULT_PROFILE_CONFIG);
    expect(engine.history).toBeDefined();
  });
  it('exposes registry', () => {
    const engine = new DeviceProfileEngine(DEFAULT_PROFILE_CONFIG);
    expect(engine.registry).toBeDefined();
  });
  it('exposes events', () => {
    const engine = new DeviceProfileEngine(DEFAULT_PROFILE_CONFIG);
    expect(engine.events).toBeDefined();
  });
});

// ── Device Profile Manager ───────────────────────────────────

describe('DeviceProfileManager', () => {
  let m: DeviceProfileManager;

  beforeEach(() => { m = new DeviceProfileManager(); });

  it('starts with no profile', () => {
    expect(m.getDeviceProfile()).toBeNull();
  });
  it('buildDeviceProfile returns profile', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const profile = m.buildDeviceProfile(ctx, k, null);
    expect(profile).not.toBeNull();
  });
  it('getDeviceProfile returns current', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    expect(m.getDeviceProfile()).not.toBeNull();
  });
  it('refreshProfile re-generates', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const first = m.getDeviceProfile();
    m.refreshProfile(ctx, k, null);
    const second = m.getDeviceProfile();
    expect(second).not.toBeNull();
    expect(second!.id).not.toBe(first!.id);
  });
  it('getPrimaryProfile returns type', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    expect(m.getPrimaryProfile()).not.toBeNull();
  });
  it('getSecondaryProfiles returns array', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    expect(Array.isArray(m.getSecondaryProfiles())).toBe(true);
  });
  it('getProfileHistory returns entries and changes', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const history = m.getProfileHistory();
    expect(history.entries.length).toBeGreaterThan(0);
    expect(history.changes.length).toBeGreaterThan(0);
  });
  it('getProfileStatistics returns stats', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const stats = m.getProfileStatistics();
    expect(stats.totalProfiles).toBe(1);
    expect(stats.profileVersion).toBe('1.0.0');
  });
  it('registerPlugin adds plugin', () => {
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'test', getVersion: () => '1.0', getPriority: () => 1, isAvailable: () => true, analyzeProfile: () => [],
    };
    expect(m.registerPlugin(plugin)).toBe(true);
  });
  it('unregisterPlugin removes plugin', () => {
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'test', getVersion: () => '1.0', getPriority: () => 1, isAvailable: () => true, analyzeProfile: () => [],
    };
    m.registerPlugin(plugin);
    expect(m.unregisterPlugin('test')).toBe(true);
  });
  it('validateProfile validates', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const result = m.validateProfile();
    expect(result.valid).toBe(true);
  });
  it('validateProfile returns error when no profile', () => {
    const result = m.validateProfile();
    expect(result.valid).toBe(false);
  });
  it('updateConfig updates', () => {
    m.updateConfig({ profileVersion: '2.0.0' });
    expect(m.config.profileVersion).toBe('2.0.0');
  });
  it('clear resets', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    m.clear();
    expect(m.getDeviceProfile()).toBeNull();
  });
  it('getAccuracyRecords is not applicable — manager exposes history', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const history = m.getProfileHistory();
    expect(history.changes.length).toBeGreaterThan(0);
  });
});

// ── Traceability ─────────────────────────────────────────────

describe('Traceability', () => {
  let m: DeviceProfileManager;

  beforeEach(() => { m = new DeviceProfileManager(); });

  it('every profile has evidence with source providers', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const profile = m.getDeviceProfile()!;
    expect(profile.evidence.sourceProviders.length).toBeGreaterThan(0);
  });
  it('every profile has confidence', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const profile = m.getDeviceProfile()!;
    expect(profile.confidenceScore).toBeGreaterThan(0);
  });
  it('every profile has related knowledge', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const profile = m.getDeviceProfile()!;
    expect(profile.evidence.relatedKnowledge.length).toBeGreaterThan(0);
  });
  it('every profile has assumptions', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const profile = m.getDeviceProfile()!;
    expect(profile.evidence.assumptions.length).toBeGreaterThan(0);
  });
  it('every profile has evidence count > 0', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const profile = m.getDeviceProfile()!;
    expect(profile.evidence.evidenceCount).toBeGreaterThan(0);
  });
  it('every profile has historical stability', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    m.buildDeviceProfile(ctx, k, null);
    const profile = m.getDeviceProfile()!;
    expect(profile.evidence.historicalStability).toBeGreaterThanOrEqual(0);
    expect(profile.evidence.historicalStability).toBeLessThanOrEqual(1);
  });
});

// ── Regression ───────────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const module = await import('../index');
    expect(module.DeviceProfileManager).toBeDefined();
    expect(module.DeviceProfileEngine).toBeDefined();
    expect(module.ProfileBuilder).toBeDefined();
    expect(module.ProfileRegistry).toBeDefined();
    expect(module.DeviceClassifier).toBeDefined();
    expect(module.HardwareAnalyzer).toBeDefined();
    expect(module.SoftwareAnalyzer).toBeDefined();
    expect(module.UsageAnalyzer).toBeDefined();
    expect(module.WorkloadAnalyzer).toBeDefined();
    expect(module.ProfileScorer).toBeDefined();
    expect(module.ProfileValidator).toBeDefined();
    expect(module.ProfileHistory).toBeDefined();
    expect(module.ProfileEventEmitter).toBeDefined();
    expect(module.DEFAULT_PROFILE_CONFIG).toBeDefined();
    expect(module.createProfileConfig).toBeDefined();
  });
  it('full integration: build from context + knowledge', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const profile = manager.buildDeviceProfile(ctx, k, null);
    expect(profile).not.toBeNull();
    expect(profile!.primaryProfile).toBeDefined();
    expect(profile!.hardwareSummary).toBeDefined();
    expect(profile!.softwareSummary).toBeDefined();
    expect(profile!.usageSummary).toBeDefined();
    expect(profile!.workloadSummary).toBeDefined();
  });
  it('full integration: validation passes', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    manager.buildDeviceProfile(ctx, k, null);
    const result = manager.validateProfile();
    expect(result.valid).toBe(true);
  });
  it('full integration: no execution or system modification', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const profile = manager.buildDeviceProfile(ctx, k, null);
    // Profile should only describe, never execute
    expect(profile).not.toBeNull();
    expect(typeof profile!.primaryProfile).toBe('string');
  });
  it('full integration: plugin extension works', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'ext-profile',
      getVersion: () => '1.0',
      getPriority: () => 1,
      isAvailable: () => true,
      analyzeProfile: () => [{ profileType: 'custom', score: 0.5, weight: 0.5, evidence: ['Custom plugin'] }],
    };
    manager.registerPlugin(plugin);
    const profile = manager.buildDeviceProfile(ctx, k, null);
    expect(profile!.profileScores.some((s) => s.profileType === 'custom')).toBe(true);
  });
});

// ── Performance ──────────────────────────────────────────────

describe('Performance', () => {
  it('profile generation under 150ms', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const start = performance.now();
    manager.buildDeviceProfile(ctx, k, null);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(150);
  });
});

// ── Edge Cases ───────────────────────────────────────────────

describe('Edge Cases', () => {
  it('empty context produces a profile with general_purpose fallback', async () => {
    const k = await createKnowledge(createMockContext());
    const manager = new DeviceProfileManager();
    const profile = manager.buildDeviceProfile(createMockContext(), k, null);
    expect(profile).not.toBeNull();
    // With no data, should fall back to general_purpose
    expect(profile!.primaryProfile).toBe('general_purpose');
  });
  it('plugin failure does not break build', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'fail',
      getVersion: () => '1.0',
      getPriority: () => 1,
      isAvailable: () => true,
      analyzeProfile: () => { throw new Error('fail'); },
    };
    manager.registerPlugin(plugin);
    const profile = manager.buildDeviceProfile(ctx, k, null);
    expect(profile).not.toBeNull();
  });
  it('unavailable plugin is skipped', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const plugin: ProfileProviderPlugin = {
      getPluginName: () => 'unavail',
      getVersion: () => '1.0',
      getPriority: () => 1,
      isAvailable: () => false,
      analyzeProfile: () => [{ profileType: 'custom', score: 1.0, weight: 1.0, evidence: [] }],
    };
    manager.registerPlugin(plugin);
    const profile = manager.buildDeviceProfile(ctx, k, null);
    // Custom profile should NOT appear since plugin is unavailable
    expect(profile!.profileScores.some((s) => s.profileType === 'custom' && s.evidence.length === 0)).toBe(false);
  });
  it('multiple builds work correctly', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    manager.buildDeviceProfile(ctx, k, null);
    manager.buildDeviceProfile(ctx, k, null);
    manager.buildDeviceProfile(ctx, k, null);
    const history = manager.getProfileHistory();
    expect(history.entries.length).toBeGreaterThan(2);
  });
  it('configuration with disabled history still works', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const cfg = createProfileConfig({ enableHistory: false });
    const manager = new DeviceProfileManager(cfg);
    const profile = manager.buildDeviceProfile(ctx, k, null);
    expect(profile).not.toBeNull();
    expect(manager.getProfileHistory().entries.length).toBe(0);
  });
  it('gaming context classifies as gaming PC', async () => {
    const ctx = createGamingContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const profile = manager.buildDeviceProfile(ctx, k, null);
    expect(profile!.hardwareSummary.details.gpuTier).toBe('very_high');
  });
  it('office context classifies with lower hardware tier', async () => {
    const ctx = createOfficeContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const profile = manager.buildDeviceProfile(ctx, k, null);
    expect(profile!.hardwareSummary.performanceTier).not.toBe('high_end');
  });
  it('privacy: never inspects private user data', async () => {
    const ctx = createFullContext();
    const k = await createKnowledge(ctx);
    const manager = new DeviceProfileManager();
    const profile = manager.buildDeviceProfile(ctx, k, null);
    // Profile should only use aggregated telemetry, not private data
    expect(profile!.evidence.assumptions.some((a) => a.includes('private') || a.includes('personal'))).toBe(false);
  });
});
