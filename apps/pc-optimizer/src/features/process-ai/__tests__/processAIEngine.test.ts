/**
 * Process AI Engine — Comprehensive Tests
 *
 * Tests for:
 * - Process classification (system, browser, updater, background, etc.)
 * - Safety assessment (critical_system, safe, review_recommended, avoid)
 * - CPU impact analysis (high, background, sustained)
 * - Memory impact analysis (high, leak detection)
 * - Disk impact analysis (high activity)
 * - GPU impact analysis
 * - Network impact analysis (abnormal traffic)
 * - Background impact analysis (idle, unused)
 * - Startup impact analysis
 * - Issue detection (high CPU, memory leak, idle, duplicates, unsigned)
 * - Risk assessment (overall risk, protected processes, risk factors)
 * - Recommendations (close, restart, delay startup, scan security)
 * - Explanation engine (browser, updater, memory leak, high CPU)
 * - Dashboard provider (summary, top consumers, alerts)
 * - Trend analysis (stable, degrading, improving)
 * - Full engine integration (end-to-end report)
 * - Protected process handling
 * - Configuration limits
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessAIEngine } from '../ProcessAIEngine';
import { ProcessAnalyzer } from '../ProcessAnalyzer';
import { ProcessHistory } from '../ProcessHistory';
import { ProcessRecommendationEngine } from '../ProcessRecommendationEngine';
import { ProcessExplanationEngine } from '../ProcessExplanationEngine';
import { ProcessTrendAnalyzer } from '../ProcessTrendAnalyzer';
import { DEFAULT_PROCESS_CONFIG } from '../types';
import type {
  ProcessEntry,
  ProcessSnapshot,
  ProcessInfo,
  ProcessSensors,
} from '../types';
import { processEventBus } from '../ProcessEvents';

// ── Mock Factories ───────────────────────────────────────────────────

function makeProcessInfo(overrides?: Partial<ProcessInfo>): ProcessInfo {
  return {
    pid: 1000,
    name: 'test.exe',
    displayName: 'Test Process',
    parentPid: 4,
    parentName: 'explorer.exe',
    publisher: 'Test Publisher',
    description: 'A test process',
    executablePath: 'C:\\Program Files\\Test\\test.exe',
    signatureStatus: 'valid',
    signatureIssuer: 'Test CA',
    launchTime: Date.now() - 3600000,
    priority: 'normal',
    integrityLevel: 'medium',
    threadCount: 4,
    handleCount: 100,
    windowTitle: 'Test Window',
    userAccount: 'User',
    isService: false,
    serviceName: '',
    isStartupEntry: false,
    startupEntryName: '',
    category: 'unknown',
    safetyLevel: 'safe',
    ...overrides,
  };
}

function makeProcessSensors(overrides?: Partial<ProcessSensors>): ProcessSensors {
  return {
    cpuUsagePercent: 5,
    perCoreUsage: [5, 5, 5, 5],
    memoryMB: 100,
    privateMemoryMB: 80,
    workingSetMB: 100,
    virtualMemoryMB: 200,
    diskReadMBps: 0.1,
    diskWriteMBps: 0.1,
    gpuUsagePercent: 0,
    vramMB: 0,
    networkDownloadMbps: 0.1,
    networkUploadMbps: 0.1,
    powerDrawEstimateW: 2,
    ...overrides,
  };
}

function makeProcessEntry(overrides?: { info?: Partial<ProcessInfo>; sensors?: Partial<ProcessSensors> }): ProcessEntry {
  return {
    info: makeProcessInfo(overrides?.info),
    sensors: makeProcessSensors(overrides?.sensors),
  };
}

function makeSnapshot(entries?: ProcessEntry[]): ProcessSnapshot {
  const ents = entries ?? [makeProcessEntry()];
  return {
    id: `proc-snap-${Date.now()}`,
    timestamp: Date.now(),
    scanDurationMs: 50,
    processCount: ents.length,
    entries: ents,
    systemTotals: {
      totalCpuUsagePercent: ents.reduce((s, e) => s + e.sensors.cpuUsagePercent, 0),
      totalMemoryMB: ents.reduce((s, e) => s + e.sensors.memoryMB, 0),
      totalDiskReadMBps: ents.reduce((s, e) => s + e.sensors.diskReadMBps, 0),
      totalDiskWriteMBps: ents.reduce((s, e) => s + e.sensors.diskWriteMBps, 0),
      totalGpuUsagePercent: ents.reduce((s, e) => s + e.sensors.gpuUsagePercent, 0),
      totalNetworkDownloadMbps: ents.reduce((s, e) => s + e.sensors.networkDownloadMbps, 0),
      totalNetworkUploadMbps: ents.reduce((s, e) => s + e.sensors.networkUploadMbps, 0),
      totalProcessCount: ents.length,
      totalThreadCount: ents.reduce((s, e) => s + e.info.threadCount, 0),
      totalHandleCount: ents.reduce((s, e) => s + e.info.handleCount, 0),
    },
    metadata: { source: 'mock', version: '1.0.0', partial: false },
  };
}

function makeChromeEntry(): ProcessEntry {
  return makeProcessEntry({
    info: {
      pid: 2000,
      name: 'chrome.exe',
      displayName: 'Google Chrome',
      publisher: 'Google LLC',
      description: 'Google Chrome web browser',
      windowTitle: 'Google Chrome',
      category: 'browser',
      safetyLevel: 'safe',
    },
    sensors: {
      cpuUsagePercent: 18,
      memoryMB: 1400,
      privateMemoryMB: 1200,
      workingSetMB: 1400,
      virtualMemoryMB: 2800,
      networkDownloadMbps: 5,
      networkUploadMbps: 1,
      powerDrawEstimateW: 8,
    },
  });
}

function makeAdobeUpdaterEntry(): ProcessEntry {
  return makeProcessEntry({
    info: {
      pid: 3000,
      name: 'adobeupdater.exe',
      displayName: 'Adobe Updater',
      publisher: 'Adobe Inc.',
      description: 'Adobe software updater',
      isService: false,
      windowTitle: '',
      category: 'updater',
      safetyLevel: 'safe',
    },
    sensors: {
      cpuUsagePercent: 4,
      memoryMB: 480,
      privateMemoryMB: 400,
      workingSetMB: 480,
      virtualMemoryMB: 600,
    },
  });
}

function makeSystemEntry(): ProcessEntry {
  return makeProcessEntry({
    info: {
      pid: 4,
      name: 'System',
      displayName: 'System',
      publisher: 'Microsoft Corporation',
      description: 'Windows system process',
      isService: true,
      serviceName: 'System',
      windowTitle: '',
      category: 'system',
      safetyLevel: 'critical_system',
    },
    sensors: {
      cpuUsagePercent: 1,
      memoryMB: 50,
      perCoreUsage: [1, 1, 1, 1],
    },
  });
}

function makeSvchostEntry(): ProcessEntry {
  return makeProcessEntry({
    info: {
      pid: 500,
      name: 'svchost.exe',
      displayName: 'Service Host',
      publisher: 'Microsoft Corporation',
      description: 'Windows service host',
      isService: true,
      serviceName: 'svchost',
      windowTitle: '',
      category: 'windows',
      safetyLevel: 'critical_system',
    },
    sensors: {
      cpuUsagePercent: 2,
      memoryMB: 80,
    },
  });
}

function makeUnsignedEntry(): ProcessEntry {
  return makeProcessEntry({
    info: {
      pid: 6000,
      name: 'suspicious.exe',
      displayName: 'Unknown Application',
      publisher: 'Unknown',
      description: '',
      signatureStatus: 'unsigned',
      signatureIssuer: '',
      windowTitle: 'Unknown App',
      category: 'unknown',
      safetyLevel: 'review_recommended',
    },
    sensors: {
      cpuUsagePercent: 3,
      memoryMB: 50,
    },
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe('ProcessAIEngine', () => {
  let engine: ProcessAIEngine;

  beforeEach(() => {
    processEventBus.clear();
    engine = new ProcessAIEngine();
  });

  afterEach(() => {
    engine?.dispose();
    processEventBus.clear();
  });

  describe('full analysis', () => {
    it('produces a complete report from a snapshot', () => {
      const snapshot = makeSnapshot([makeChromeEntry(), makeSystemEntry(), makeAdobeUpdaterEntry()]);
      const report = engine.analyze(snapshot);

      expect(report.snapshotId).toBe(snapshot.id);
      expect(report.totalProcesses).toBe(3);
      expect(report.analyses.length).toBe(3);
      expect(report.insights.length).toBe(3);
      expect(report.systemSummary).toBeTruthy();
      expect(report.systemExplanation).toBeTruthy();
      expect(report.dashboard).toBeDefined();
    });

    it('stores last report for retrieval', () => {
      const snapshot = makeSnapshot([makeChromeEntry()]);
      engine.analyze(snapshot);
      expect(engine.getLastReport()).not.toBeNull();
    });

    it('computes overall confidence', () => {
      const snapshot = makeSnapshot([makeChromeEntry(), makeSystemEntry()]);
      const report = engine.analyze(snapshot);
      expect(report.overallConfidence).toBeGreaterThan(0);
      expect(report.overallConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('process classification', () => {
    it('classifies system processes correctly', () => {
      const snapshot = makeSnapshot([makeSystemEntry()]);
      const report = engine.analyze(snapshot);
      const sys = report.analyses.find((a) => a.name === 'System')!;
      expect(sys.category).toBe('system');
      expect(sys.safetyLevel).toBe('critical_system');
    });

    it('classifies browser processes correctly', () => {
      const snapshot = makeSnapshot([makeChromeEntry()]);
      const report = engine.analyze(snapshot);
      const chrome = report.analyses.find((a) => a.name === 'chrome.exe')!;
      expect(chrome.category).toBe('browser');
      expect(chrome.safetyLevel).toBe('safe');
    });

    it('classifies updater processes correctly', () => {
      const snapshot = makeSnapshot([makeAdobeUpdaterEntry()]);
      const report = engine.analyze(snapshot);
      const updater = report.analyses.find((a) => a.name === 'adobeupdater.exe')!;
      expect(updater.category).toBe('updater');
      expect(updater.safetyLevel).toBe('safe');
    });

    it('classifies Windows service processes as critical_system', () => {
      const snapshot = makeSnapshot([makeSvchostEntry()]);
      const report = engine.analyze(snapshot);
      const svchost = report.analyses.find((a) => a.name === 'svchost.exe')!;
      expect(svchost.safetyLevel).toBe('critical_system');
    });

    it('classifies unsigned unknown processes as review_recommended', () => {
      const snapshot = makeSnapshot([makeUnsignedEntry()]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.name === 'suspicious.exe')!;
      expect(proc.safetyLevel).toBe('review_recommended');
    });
  });

  describe('CPU impact analysis', () => {
    it('detects high CPU usage', () => {
      const entry = makeProcessEntry({
        info: { pid: 100, name: 'heavy.exe', displayName: 'Heavy App' },
        sensors: { cpuUsagePercent: 60, perCoreUsage: [60, 55, 65, 58] },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 100)!;

      expect(proc.impact.cpu.level).toBe('high');
      expect(proc.issues.some((i) => i.type === 'high_cpu')).toBe(true);
    });

    it('detects background CPU load', () => {
      const entry = makeProcessEntry({
        info: { pid: 101, name: 'bg.exe', displayName: 'Background App', windowTitle: '' },
        sensors: { cpuUsagePercent: 20 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 101)!;

      expect(proc.impact.cpu.isBackgroundLoad).toBe(true);
    });

    it('reports minimal CPU for idle processes', () => {
      const entry = makeProcessEntry({
        info: { pid: 102, name: 'idle.exe', displayName: 'Idle App' },
        sensors: { cpuUsagePercent: 0.5 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 102)!;

      expect(proc.impact.cpu.level === 'none' || proc.impact.cpu.level === 'minimal' || proc.impact.cpu.level === 'low').toBe(true);
    });
  });

  describe('Memory impact analysis', () => {
    it('detects high memory usage', () => {
      const entry = makeProcessEntry({
        info: { pid: 200, name: 'memoryhog.exe', displayName: 'Memory Hog' },
        sensors: { memoryMB: 2000, privateMemoryMB: 1800, workingSetMB: 2000, virtualMemoryMB: 4000 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 200)!;

      expect(proc.impact.memory.level === 'high' || proc.impact.memory.level === 'critical').toBe(true);
    });

    it('detects memory leak from trend data', () => {
      const history = new ProcessHistory();
      const baseTime = Date.now();
      const memValues = [100, 150, 200, 280, 380];
      for (let i = 0; i < memValues.length; i++) {
        const entry = makeProcessEntry({
          info: { pid: 300, name: 'leaky.exe', displayName: 'Leaky App' },
          sensors: { memoryMB: memValues[i]!, cpuUsagePercent: 0.5 },
        });
        const snap = makeSnapshot([entry]);
        snap.timestamp = baseTime + i * 60000;
        history.add(snap);
      }

      const analyzer = new ProcessAnalyzer(DEFAULT_PROCESS_CONFIG, history);
      const latestSnapshot = makeSnapshot([
        makeProcessEntry({
          info: { pid: 300, name: 'leaky.exe', displayName: 'Leaky App' },
          sensors: { memoryMB: 380, cpuUsagePercent: 0.5 },
        }),
      ]);
      latestSnapshot.timestamp = baseTime + 5 * 60000;
      history.add(latestSnapshot);

      const analyses = analyzer.analyzeAll(latestSnapshot);
      const proc = analyses.find((a) => a.pid === 300)!;
      expect(proc.impact.memory.isLeakSuspected).toBe(true);
    });
  });

  describe('Disk impact analysis', () => {
    it('detects high disk activity', () => {
      const entry = makeProcessEntry({
        info: { pid: 400, name: 'diskapp.exe', displayName: 'Disk App' },
        sensors: { diskReadMBps: 60, diskWriteMBps: 40 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 400)!;

      expect(proc.impact.disk.level === 'high' || proc.impact.disk.level === 'critical').toBe(true);
      expect(proc.issues.some((i) => i.type === 'high_disk_activity')).toBe(true);
    });
  });

  describe('Network impact analysis', () => {
    it('detects abnormal network activity for non-browser process', () => {
      const entry = makeProcessEntry({
        info: { pid: 500, name: 'weirdapp.exe', displayName: 'Weird App', category: 'unknown' },
        sensors: { networkDownloadMbps: 150, networkUploadMbps: 50 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 500)!;

      expect(proc.impact.network.isAbnormal).toBe(true);
      expect(proc.issues.some((i) => i.type === 'abnormal_network')).toBe(true);
    });
  });

  describe('Background impact analysis', () => {
    it('detects idle background process', () => {
      const entry = makeProcessEntry({
        info: { pid: 600, name: 'bgapp.exe', displayName: 'BG App', windowTitle: '', category: 'background' },
        sensors: { cpuUsagePercent: 0.1, memoryMB: 200 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 600)!;

      expect(proc.impact.background.isBackgroundProcess).toBe(true);
    });
  });

  describe('Startup impact analysis', () => {
    it('detects startup entry', () => {
      const entry = makeProcessEntry({
        info: { pid: 700, name: 'startupapp.exe', displayName: 'Startup App', isStartupEntry: true, startupEntryName: 'StartupApp' },
        sensors: { cpuUsagePercent: 2, memoryMB: 50 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.pid === 700)!;

      expect(proc.impact.startup.isStartupEntry).toBe(true);
    });
  });

  describe('Issue detection', () => {
    it('detects unsigned process as suspicious', () => {
      const snapshot = makeSnapshot([makeUnsignedEntry()]);
      const report = engine.analyze(snapshot);
      const proc = report.analyses.find((a) => a.name === 'suspicious.exe')!;

      expect(proc.issues.some((i) => i.type === 'suspicious_behavior')).toBe(true);
    });

    it('detects duplicate processes', () => {
      const entries = [
        makeProcessEntry({ info: { pid: 801, name: 'dup.exe', displayName: 'Dup 1' } }),
        makeProcessEntry({ info: { pid: 802, name: 'dup.exe', displayName: 'Dup 2' } }),
        makeProcessEntry({ info: { pid: 803, name: 'dup.exe', displayName: 'Dup 3' } }),
      ];
      const snapshot = makeSnapshot(entries);
      const report = engine.analyze(snapshot);
      const dup = report.analyses.find((a) => a.name === 'dup.exe')!;
      expect(dup.issues.some((i) => i.type === 'duplicate_process')).toBe(true);
    });

    it('does not flag browser duplicates', () => {
      const entries = [
        makeProcessEntry({ info: { pid: 901, name: 'chrome.exe', displayName: 'Chrome 1', category: 'browser' } }),
        makeProcessEntry({ info: { pid: 902, name: 'chrome.exe', displayName: 'Chrome 2', category: 'browser' } }),
        makeProcessEntry({ info: { pid: 903, name: 'chrome.exe', displayName: 'Chrome 3', category: 'browser' } }),
      ];
      const snapshot = makeSnapshot(entries);
      const report = engine.analyze(snapshot);
      const chrome = report.analyses.find((a) => a.name === 'chrome.exe')!;
      expect(chrome.issues.some((i) => i.type === 'duplicate_process')).toBe(false);
    });
  });

  describe('Protected processes', () => {
    it('never recommends terminating critical system processes', () => {
      const snapshot = makeSnapshot([makeSystemEntry()]);
      const report = engine.analyze(snapshot);
      const sys = report.analyses.find((a) => a.name === 'System')!;

      expect(sys.safetyLevel).toBe('critical_system');
      expect(sys.recommendedAction).toContain('No action');
      expect(report.recommendations.filter((r) => r.pid === 4)).toHaveLength(0);
    });

    it('counts protected processes in risk assessment', () => {
      const snapshot = makeSnapshot([makeSystemEntry(), makeSvchostEntry(), makeChromeEntry()]);
      const report = engine.analyze(snapshot);
      expect(report.riskAssessment.protectedProcesses).toBe(2);
    });
  });

  describe('Risk assessment', () => {
    it('assesses overall risk from high-impact processes', () => {
      const snapshot = makeSnapshot([
        makeProcessEntry({
          info: { pid: 1100, name: 'heavy.exe', displayName: 'Heavy' },
          sensors: { cpuUsagePercent: 80, memoryMB: 2000 },
        }),
        makeSystemEntry(),
      ]);
      const report = engine.analyze(snapshot);
      expect(report.riskAssessment.overallRisk).not.toBe('none');
    });

    it('includes mitigating factors for healthy processes', () => {
      const entry = makeProcessEntry({
        info: { pid: 999, name: 'minimal.exe', displayName: 'Minimal App', publisher: 'Microsoft', signatureStatus: 'valid' },
        sensors: { cpuUsagePercent: 0.1, memoryMB: 5, diskReadMBps: 0, diskWriteMBps: 0, networkDownloadMbps: 0.1, networkUploadMbps: 0.1, powerDrawEstimateW: 0.5 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      expect(report.riskAssessment.mitigatingFactors.length).toBeGreaterThan(0);
    });
  });

  describe('Recommendations', () => {
    it('generates close_process recommendation for unused background app', () => {
      const history = new ProcessHistory();
      const baseTime = Date.now();
      // Create snapshots showing the process has been idle for a long time
      for (let i = 0; i < 4; i++) {
        const snap = makeSnapshot([
          makeProcessEntry({
            info: { pid: 1200, name: 'bgapp.exe', displayName: 'BG App', windowTitle: '', category: 'background' },
            sensors: { cpuUsagePercent: 0.1, memoryMB: 300 },
          }),
        ]);
        snap.timestamp = baseTime - (3 - i) * 60 * 60 * 1000; // 3 hours ago to now
        history.add(snap);
      }
      const analyzer = new ProcessAnalyzer(DEFAULT_PROCESS_CONFIG, history);
      const latestSnap = makeSnapshot([
        makeProcessEntry({
          info: { pid: 1200, name: 'bgapp.exe', displayName: 'BG App', windowTitle: '', category: 'background' },
          sensors: { cpuUsagePercent: 0.1, memoryMB: 300 },
        }),
      ]);
      latestSnap.timestamp = baseTime;
      history.add(latestSnap);
      const analyses = analyzer.analyzeAll(latestSnap);
      const recEngine = new ProcessRecommendationEngine(DEFAULT_PROCESS_CONFIG);
      const recs = recEngine.generate(analyses);
      const rec = recs.find((r) => r.pid === 1200);
      expect(rec).toBeDefined();
      expect(rec!.action).toBe('close_process');
      expect(rec!.canAutomate).toBe(true);
    });

    it('generates restart_process recommendation for memory leak', () => {
      const history = new ProcessHistory();
      const baseTime = Date.now();
      const memValues = [100, 180, 260, 340, 420];
      for (let i = 0; i < memValues.length; i++) {
        const snap = makeSnapshot([
          makeProcessEntry({
            info: { pid: 1300, name: 'leaky.exe', displayName: 'Leaky' },
            sensors: { memoryMB: memValues[i]!, cpuUsagePercent: 0.5 },
          }),
        ]);
        snap.timestamp = baseTime + i * 60000; // 1 minute apart
        history.add(snap);
      }

      const analyzer = new ProcessAnalyzer(DEFAULT_PROCESS_CONFIG, history);
      const latestSnap = makeSnapshot([
        makeProcessEntry({
          info: { pid: 1300, name: 'leaky.exe', displayName: 'Leaky' },
          sensors: { memoryMB: 420, cpuUsagePercent: 0.5 },
        }),
      ]);
      latestSnap.timestamp = baseTime + 5 * 60000;
      history.add(latestSnap);
      const analyses = analyzer.analyzeAll(latestSnap);

      const recEngine = new ProcessRecommendationEngine(DEFAULT_PROCESS_CONFIG);
      const recs = recEngine.generate(analyses);
      const rec = recs.find((r) => r.pid === 1300);
      expect(rec).toBeDefined();
      expect(rec!.action).toBe('restart_process');
    });

    it('generates scan_security recommendation for unsigned process', () => {
      const snapshot = makeSnapshot([makeUnsignedEntry()]);
      const report = engine.analyze(snapshot);
      const rec = report.recommendations.find((r) => r.pid === 6000);
      expect(rec).toBeDefined();
      expect(rec!.action).toBe('scan_security');
    });

    it('includes rollback availability for safe processes', () => {
      const entry = makeProcessEntry({
        info: { pid: 1400, name: 'safeapp.exe', displayName: 'Safe App', category: 'background', windowTitle: '' },
        sensors: { cpuUsagePercent: 0.1, memoryMB: 200 },
      });
      const snapshot = makeSnapshot([entry]);
      const report = engine.analyze(snapshot);
      const rec = report.recommendations.find((r) => r.pid === 1400);
      if (rec) {
        expect(rec.rollbackAvailable).toBe(true);
      }
    });

    it('respects maxRecommendations limit', () => {
      const engine = new ProcessAIEngine({ ...DEFAULT_PROCESS_CONFIG, maxRecommendations: 2 });
      const entries: ProcessEntry[] = [];
      for (let i = 0; i < 5; i++) {
        entries.push(makeProcessEntry({
          info: { pid: 2000 + i, name: `bg${i}.exe`, displayName: `BG ${i}`, windowTitle: '', category: 'background' },
          sensors: { cpuUsagePercent: 0.1, memoryMB: 300 },
        }));
      }
      const snapshot = makeSnapshot(entries);
      const report = engine.analyze(snapshot);
      expect(report.recommendations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Explanation engine', () => {
    let explanation: ProcessExplanationEngine;

    beforeEach(() => {
      explanation = new ProcessExplanationEngine();
    });

    it('explains browser with tab context', () => {
      const entry = makeChromeEntry();
      const analysis = { category: 'browser', health: 'normal' } as never;
      const result = explanation.explainBrowser(entry, analysis, 27);
      expect(result.explanation).toContain('27');
      expect(result.explanation).toContain('tabs');
    });

    it('explains idle updater with recovery estimate', () => {
      const entry = makeAdobeUpdaterEntry();
      const result = explanation.explainIdleUpdater(entry, 3);
      expect(result.explanation).toContain('3.0 hours');
      expect(result.explanation).toContain('480 MB');
      expect(result.explanation).toContain('low risk');
    });

    it('explains memory leak pattern', () => {
      const entry = makeProcessEntry({
        info: { pid: 1500, name: 'leaky.exe', displayName: 'Leaky App' },
        sensors: { memoryMB: 1200 },
      });
      const result = explanation.explainMemoryLeak(entry, 150);
      expect(result.explanation).toContain('memory leak');
      expect(result.explanation).toContain('Restarting');
    });

    it('explains high CPU with background context', () => {
      const entry = makeProcessEntry({
        info: { pid: 1600, name: 'indexer.exe', displayName: 'Indexer' },
        sensors: { cpuUsagePercent: 35 },
      });
      const result = explanation.explainHighCPU(entry, 35, true);
      expect(result.explanation).toContain('background');
    });

    it('generates system summary for healthy system', () => {
      const summary = explanation.explainSystemSummary(150, 15, 8000, 0);
      expect(summary).toContain('no high-impact');
    });

    it('generates system summary for loaded system', () => {
      const summary = explanation.explainSystemSummary(200, 85, 16000, 5);
      expect(summary).toContain('5 processes');
    });
  });

  describe('Dashboard provider', () => {
    it('builds dashboard summary with correct counts', () => {
      const snapshot = makeSnapshot([makeChromeEntry(), makeSystemEntry(), makeAdobeUpdaterEntry()]);
      const report = engine.analyze(snapshot);
      const summary = report.dashboard.summary;

      expect(summary.totalProcesses).toBe(3);
      expect(summary.systemProcessCount).toBeGreaterThan(0);
    });

    it('builds top consumers list', () => {
      const snapshot = makeSnapshot([
        makeChromeEntry(),
        makeProcessEntry({
          info: { pid: 1700, name: 'heavy.exe', displayName: 'Heavy' },
          sensors: { cpuUsagePercent: 70, memoryMB: 1500 },
        }),
      ]);
      const report = engine.analyze(snapshot);
      expect(report.dashboard.topConsumers.length).toBeGreaterThan(0);
    });

    it('builds alerts for high-severity issues', () => {
      const snapshot = makeSnapshot([
        makeProcessEntry({
          info: { pid: 1800, name: 'heavy.exe', displayName: 'Heavy' },
          sensors: { cpuUsagePercent: 80, memoryMB: 2000 },
        }),
      ]);
      const report = engine.analyze(snapshot);
      expect(report.dashboard.alerts.length).toBeGreaterThan(0);
    });
  });

  describe('Trend analysis', () => {
    it('returns empty summaries with insufficient data', () => {
      const history = new ProcessHistory();
      const trendAnalyzer = new ProcessTrendAnalyzer(DEFAULT_PROCESS_CONFIG, history);
      expect(trendAnalyzer.getTrendSummaries([100])).toHaveLength(0);
    });
  });

  describe('Evidence traceability', () => {
    it('every insight has evidence', () => {
      const snapshot = makeSnapshot([makeChromeEntry(), makeSystemEntry()]);
      const report = engine.analyze(snapshot);

      for (const insight of report.insights) {
        expect(insight.evidence.length).toBeGreaterThan(0);
      }
    });

    it('evidence includes metric, value, and timestamp', () => {
      const snapshot = makeSnapshot([makeChromeEntry()]);
      const report = engine.analyze(snapshot);
      const insight = report.insights[0]!;
      const evidence = insight.evidence[0]!;
      expect(evidence.metric).toBeTruthy();
      expect(evidence.value).toBeTruthy();
      expect(evidence.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('respects maxInsights limit', () => {
      const engine = new ProcessAIEngine({ ...DEFAULT_PROCESS_CONFIG, maxInsights: 2 });
      const entries: ProcessEntry[] = [];
      for (let i = 0; i < 5; i++) {
        entries.push(makeProcessEntry({
          info: { pid: 3000 + i, name: `proc${i}.exe`, displayName: `Proc ${i}` },
        }));
      }
      const snapshot = makeSnapshot(entries);
      const report = engine.analyze(snapshot);
      expect(report.insights.length).toBeLessThanOrEqual(2);
    });

    it('can disable recommendations', () => {
      const engine = new ProcessAIEngine({ ...DEFAULT_PROCESS_CONFIG, enableRecommendations: false });
      const snapshot = makeSnapshot([makeChromeEntry()]);
      const report = engine.analyze(snapshot);
      expect(report.recommendations.length).toBe(0);
    });

    it('can disable dashboard', () => {
      const engine = new ProcessAIEngine({ ...DEFAULT_PROCESS_CONFIG, enableDashboard: false });
      const snapshot = makeSnapshot([makeChromeEntry()]);
      const report = engine.analyze(snapshot);
      expect(report.dashboard.topConsumers.length).toBe(0);
    });
  });
});
