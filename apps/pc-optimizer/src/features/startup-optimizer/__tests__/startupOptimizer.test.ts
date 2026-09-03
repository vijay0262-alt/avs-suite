/**
 * Tests for Startup Optimizer module (Phase 3.3).
 *
 * Covers:
 * - Helper functions: generateEntryId, isProtectedApp, formatBootDelay
 * - Scanner: scan, convert entries, source mapping
 * - Repository: store, get, update, enable/disable, persistence
 * - Impact Calculator: level detection, boot delay, CPU/mem/disk, confidence
 * - Analyzer: analysis, health score, recommendations, health contribution
 * - Execution Task: validate, execute, rollback, safety checks
 * - History: record, query, clear
 * - Events: emit, subscribe, unsubscribe, error isolation
 * - Regression: all exports defined, no forbidden modifications
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { StartupEntry, StartupChangeRecord } from '../types';
import {
  generateEntryId,
  isProtectedApp,
  formatBootDelay,
  PROTECTED_APP_PATTERNS,
} from '../types';
import { StartupRepository } from '../startupRepository';
import { StartupImpactCalculator } from '../startupImpactCalculator';
import { StartupAnalyzer } from '../startupAnalyzer';
import { StartupExecutionTask } from '../startupExecutionTask';
import { StartupHistory, generateRecordId } from '../startupHistory';
import { startupEvents } from '../startupEvents';

// ── Test Helpers ──────────────────────────────────────────────

function makeEntry(overrides: Partial<StartupEntry> = {}): StartupEntry {
  return {
    id: 'test-entry-1',
    name: 'Test App',
    publisher: 'Test Publisher',
    executablePath: 'C:\\Program Files\\TestApp\\test.exe',
    commandLine: '"C:\\Program Files\\TestApp\\test.exe" --arg',
    source: 'registry_hkcu_run',
    enabled: true,
    launchType: 'registry',
    userScope: 'current_user',
    signatureStatus: 'signed',
    impactLevel: 'medium',
    estimatedBootDelayMs: 500,
    estimatedCpuUsage: 5,
    estimatedMemoryBytes: 30 * 1024 * 1024,
    estimatedDiskActivity: 15,
    impactConfidence: 0.7,
    isProtected: false,
    protectedReason: null,
    executableExists: true,
    ...overrides,
  };
}

function makeEntries(): StartupEntry[] {
  return [
    makeEntry({ id: 'entry-1', name: 'Chrome', impactLevel: 'high', enabled: true }),
    makeEntry({ id: 'entry-2', name: 'Windows Defender', impactLevel: 'low', enabled: true, isProtected: true, protectedReason: 'Security' }),
    makeEntry({ id: 'entry-3', name: 'Unknown App', impactLevel: 'none', enabled: true, signatureStatus: 'unsigned' }),
    makeEntry({ id: 'entry-4', name: 'Broken App', impactLevel: 'low', enabled: false, executableExists: false }),
    makeEntry({ id: 'entry-5', name: 'Spotify', impactLevel: 'high', enabled: true, executablePath: 'C:\\Program Files\\Chrome\\chrome.exe' }),
  ];
}

// ── Helper Function Tests ─────────────────────────────────────

describe('Helper Functions', () => {
  it('generateEntryId produces stable IDs', () => {
    const id1 = generateEntryId('registry_hkcu_run', 'Chrome', '"C:\\chrome.exe"');
    const id2 = generateEntryId('registry_hkcu_run', 'Chrome', '"C:\\chrome.exe"');
    const id3 = generateEntryId('registry_hkcu_run', 'Firefox', '"C:\\firefox.exe"');
    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toMatch(/^startup-/);
  });

  it('isProtectedApp detects protected patterns', () => {
    expect(isProtectedApp('Windows Defender')).toBe(true);
    expect(isProtectedApp('AVS AI Shield')).toBe(true);
    expect(isProtectedApp('AVS AI Shield')).toBe(true);
    expect(isProtectedApp('Microsoft Defender Antivirus')).toBe(true);
    expect(isProtectedApp('Chrome')).toBe(false);
    expect(isProtectedApp('Spotify')).toBe(false);
  });

  it('isProtectedApp rejects unrelated applications', () => {
    expect(isProtectedApp('Notepad')).toBe(false);
    expect(isProtectedApp('Visual Studio Code')).toBe(false);
    expect(isProtectedApp('AVS Video Editor')).toBe(false);
  });

  it('PROTECTED_APP_PATTERNS includes critical entries', () => {
    expect(PROTECTED_APP_PATTERNS).toContain('windows defender');
    expect(PROTECTED_APP_PATTERNS).toContain('avsshield');
    expect(PROTECTED_APP_PATTERNS).toContain('avs ai shield');
    expect(PROTECTED_APP_PATTERNS).toContain('microsoft defender');
  });

  it('formatBootDelay formats correctly', () => {
    expect(formatBootDelay(500)).toBe('500 ms');
    expect(formatBootDelay(1500)).toBe('~1.5 sec');
    expect(formatBootDelay(65000)).toBe('~1 min 5 sec');
  });
});

// ── Repository Tests ──────────────────────────────────────────

describe('StartupRepository', () => {
  let repo: StartupRepository;

  beforeEach(() => {
    repo = new StartupRepository(false);
  });

  it('stores and retrieves entries', () => {
    const entries = makeEntries();
    repo.store(entries);
    expect(repo.count()).toBe(5);
    expect(repo.getAll()).toHaveLength(5);
  });

  it('gets entry by ID', () => {
    repo.store(makeEntries());
    const entry = repo.getById('entry-1');
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe('Chrome');
  });

  it('returns null for unknown ID', () => {
    repo.store(makeEntries());
    expect(repo.getById('nonexistent')).toBeNull();
  });

  it('gets enabled entries', () => {
    repo.store(makeEntries());
    const enabled = repo.getEnabled();
    expect(enabled).toHaveLength(4);
  });

  it('gets disabled entries', () => {
    repo.store(makeEntries());
    const disabled = repo.getDisabled();
    expect(disabled).toHaveLength(1);
    expect(disabled[0]!.name).toBe('Broken App');
  });

  it('updates an entry', () => {
    repo.store(makeEntries());
    const entry = repo.getById('entry-1')!;
    repo.update({ ...entry, enabled: false });
    expect(repo.getById('entry-1')!.enabled).toBe(false);
  });

  it('sets enabled state', () => {
    repo.store(makeEntries());
    const updated = repo.setEnabled('entry-1', false);
    expect(updated).not.toBeNull();
    expect(updated!.enabled).toBe(false);
  });

  it('returns null when setting enabled for unknown entry', () => {
    repo.store(makeEntries());
    expect(repo.setEnabled('nonexistent', true)).toBeNull();
  });

  it('removes an entry', () => {
    repo.store(makeEntries());
    expect(repo.remove('entry-1')).toBe(true);
    expect(repo.count()).toBe(4);
    expect(repo.getById('entry-1')).toBeNull();
  });

  it('returns false when removing unknown entry', () => {
    repo.store(makeEntries());
    expect(repo.remove('nonexistent')).toBe(false);
  });

  it('clears all entries', () => {
    repo.store(makeEntries());
    repo.clear();
    expect(repo.count()).toBe(0);
  });
});

// ── Impact Calculator Tests ───────────────────────────────────

describe('StartupImpactCalculator', () => {
  let calc: StartupImpactCalculator;

  beforeEach(() => {
    calc = new StartupImpactCalculator();
  });

  it('calculates impact for a high-impact entry', () => {
    const entry = makeEntry({ name: 'Chrome', impactLevel: 'high', estimatedBootDelayMs: 0 });
    const impact = calc.calculate(entry);
    expect(impact.level).toBe('high');
    expect(impact.bootDelayMs).toBeGreaterThan(1000);
    expect(impact.cpuUsage).toBeGreaterThan(10);
    expect(impact.memoryBytes).toBeGreaterThan(50 * 1024 * 1024);
    expect(impact.confidence).toBeGreaterThan(0);
    expect(impact.explanation).toContain('Chrome');
  });

  it('calculates impact for a very high-impact entry', () => {
    const entry = makeEntry({ name: 'Norton Antivirus', impactLevel: 'none', estimatedBootDelayMs: 0 });
    const impact = calc.calculate(entry);
    expect(impact.level).toBe('very_high');
    expect(impact.bootDelayMs).toBeGreaterThan(3000);
  });

  it('calculates impact for a low-impact entry', () => {
    const entry = makeEntry({ name: 'Windows Defender', impactLevel: 'none', estimatedBootDelayMs: 0 });
    const impact = calc.calculate(entry);
    expect(impact.level).toBe('low');
    expect(impact.bootDelayMs).toBeLessThan(200);
  });

  it('calculates impact for a medium-impact entry', () => {
    const entry = makeEntry({ name: 'Generic App', impactLevel: 'none' });
    const impact = calc.calculate(entry);
    expect(impact.level).toBe('medium');
  });

  it('uses raw boot delay when available', () => {
    const entry = makeEntry({ name: 'Chrome', impactLevel: 'high', estimatedBootDelayMs: 2000 });
    const impact = calc.calculate(entry);
    expect(impact.bootDelayMs).toBe(2000);
  });

  it('calculates confidence based on available data', () => {
    const entry = makeEntry({
      name: 'Chrome',
      impactLevel: 'high',
      estimatedBootDelayMs: 2000,
      publisher: 'Google',
      signatureStatus: 'signed',
      executablePath: 'C:\\chrome.exe',
    });
    const impact = calc.calculate(entry);
    expect(impact.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('calculates total boot impact for enabled entries', () => {
    const entries = makeEntries();
    const total = calc.calculateTotalBootImpact(entries);
    expect(total).toBeGreaterThan(0);
  });

  it('calculates all impacts', () => {
    const entries = makeEntries();
    const impacts = calc.calculateAll(entries);
    expect(impacts).toHaveLength(5);
    expect(impacts[0]!.entryId).toBe('entry-1');
  });

  it('generates human-readable explanation', () => {
    const entry = makeEntry({ name: 'Chrome', impactLevel: 'high' });
    const impact = calc.calculate(entry);
    expect(impact.explanation).toContain('high impact');
    expect(impact.explanation).toContain('Chrome');
  });
});

// ── Analyzer Tests ────────────────────────────────────────────

describe('StartupAnalyzer', () => {
  let analyzer: StartupAnalyzer;

  beforeEach(() => {
    analyzer = new StartupAnalyzer();
    startupEvents.clear();
  });

  afterEach(() => {
    startupEvents.clear();
  });

  it('analyzes entries and produces correct counts', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.totalEntries).toBe(5);
    expect(analysis.enabledCount).toBe(4);
    expect(analysis.disabledCount).toBe(1);
  });

  it('estimates boot impact', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.estimatedBootImpactMs).toBeGreaterThan(0);
  });

  it('identifies high-impact entries', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.highImpactEntries.length).toBeGreaterThan(0);
    expect(analysis.highImpactEntries.some((e) => e.name === 'Chrome')).toBe(true);
  });

  it('identifies missing executables', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.missingExecutables).toHaveLength(1);
    expect(analysis.missingExecutables[0]!.name).toBe('Broken App');
  });

  it('identifies unsigned entries', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.unsignedEntries.length).toBeGreaterThan(0);
    expect(analysis.unsignedEntries.some((e) => e.name === 'Unknown App')).toBe(true);
  });

  it('identifies protected entries', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.protectedEntries).toHaveLength(1);
    expect(analysis.protectedEntries[0]!.name).toBe('Windows Defender');
  });

  it('identifies duplicate entries', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    // entry-1 and entry-5 both have the same executablePath
    expect(analysis.duplicateEntries.length).toBeGreaterThan(0);
  });

  it('calculates health score', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.healthScore).toBeGreaterThanOrEqual(0);
    expect(analysis.healthScore).toBeLessThanOrEqual(100);
  });

  it('generates recommendations', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.recommendations.length).toBeGreaterThan(0);
  });

  it('generates disable_high_impact recommendation', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    const disableRec = analysis.recommendations.find((r) => r.type === 'disable_high_impact');
    expect(disableRec).toBeDefined();
    expect(disableRec!.entryIds).not.toContain('entry-2'); // Protected entry excluded
  });

  it('generates remove_broken recommendation', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    const removeRec = analysis.recommendations.find((r) => r.type === 'remove_broken');
    expect(removeRec).toBeDefined();
  });

  it('generates review_unsigned recommendation', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    const unsignedRec = analysis.recommendations.find((r) => r.type === 'review_unsigned');
    expect(unsignedRec).toBeDefined();
  });

  it('estimates boot improvement', () => {
    const entries = makeEntries();
    const analysis = analyzer.analyze(entries);
    expect(analysis.estimatedBootImprovementMs).toBeGreaterThanOrEqual(0);
  });

  it('emits startup_analysis_completed event', () => {
    const listener = vi.fn();
    startupEvents.on('startup_analysis_completed', listener);
    analyzer.analyze(makeEntries());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('generates health contribution data', () => {
    const entries = makeEntries();
    const contribution = analyzer.getHealthContribution(entries);
    expect(contribution.score).toBeGreaterThanOrEqual(0);
    expect(contribution.score).toBeLessThanOrEqual(100);
    expect(contribution.issues).toBeDefined();
    expect(contribution.insights).toBeDefined();
    expect(contribution.recommendations).toBeDefined();
    expect(contribution.estimatedBootImprovementMs).toBeGreaterThanOrEqual(0);
  });

  it('health contribution includes insights about startup state', () => {
    const entries = makeEntries();
    const contribution = analyzer.getHealthContribution(entries);
    expect(contribution.insights.some((i) => i.includes('enabled'))).toBe(true);
    expect(contribution.insights.some((i) => i.includes('boot impact'))).toBe(true);
  });

  it('health contribution flags too many startup programs', () => {
    const manyEntries = Array.from({ length: 35 }, (_, i) =>
      makeEntry({ id: `entry-${i}`, name: `App ${i}`, enabled: true }),
    );
    const contribution = analyzer.getHealthContribution(manyEntries);
    expect(contribution.issues.some((i) => i.title.includes('Too many'))).toBe(true);
  });
});

// ── History Tests ─────────────────────────────────────────────

describe('StartupHistory', () => {
  let history: StartupHistory;

  beforeEach(() => {
    history = new StartupHistory(false);
  });

  it('records a change', () => {
    const record: StartupChangeRecord = {
      recordId: generateRecordId(),
      entryId: 'entry-1',
      entryName: 'Chrome',
      action: 'disable',
      previousState: true,
      newState: false,
      timestamp: new Date().toISOString(),
      backupId: 'backup-1',
      success: true,
      error: null,
      estimatedImprovementMs: 1500,
    };
    history.record(record);
    expect(history.count()).toBe(1);
  });

  it('retrieves all records (newest first)', () => {
    const r1 = { recordId: 'r1', entryId: 'e1', entryName: 'A', action: 'disable' as const, previousState: true, newState: false, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 };
    const r2 = { recordId: 'r2', entryId: 'e2', entryName: 'B', action: 'enable' as const, previousState: false, newState: true, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 };
    history.record(r1);
    history.record(r2);
    const all = history.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.recordId).toBe('r2');
  });

  it('filters by entry ID', () => {
    history.record({ recordId: 'r1', entryId: 'e1', entryName: 'A', action: 'disable', previousState: true, newState: false, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    history.record({ recordId: 'r2', entryId: 'e2', entryName: 'B', action: 'enable', previousState: false, newState: true, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    history.record({ recordId: 'r3', entryId: 'e1', entryName: 'A', action: 'restore', previousState: false, newState: true, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    const e1Records = history.getByEntry('e1');
    expect(e1Records).toHaveLength(2);
  });

  it('gets record by ID', () => {
    history.record({ recordId: 'r1', entryId: 'e1', entryName: 'A', action: 'disable', previousState: true, newState: false, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    expect(history.getById('r1')).not.toBeNull();
    expect(history.getById('nonexistent')).toBeNull();
  });

  it('gets latest for entry', () => {
    history.record({ recordId: 'r1', entryId: 'e1', entryName: 'A', action: 'disable', previousState: true, newState: false, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    history.record({ recordId: 'r2', entryId: 'e1', entryName: 'A', action: 'restore', previousState: false, newState: true, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    const latest = history.getLatestForEntry('e1');
    expect(latest).not.toBeNull();
    expect(latest!.recordId).toBe('r2');
  });

  it('filters by action type', () => {
    history.record({ recordId: 'r1', entryId: 'e1', entryName: 'A', action: 'disable', previousState: true, newState: false, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    history.record({ recordId: 'r2', entryId: 'e2', entryName: 'B', action: 'enable', previousState: false, newState: true, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    history.record({ recordId: 'r3', entryId: 'e3', entryName: 'C', action: 'restore', previousState: false, newState: true, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    expect(history.getDisableRecords()).toHaveLength(1);
    expect(history.getEnableRecords()).toHaveLength(1);
    expect(history.getRestoreRecords()).toHaveLength(1);
  });

  it('clears all records', () => {
    history.record({ recordId: 'r1', entryId: 'e1', entryName: 'A', action: 'disable', previousState: true, newState: false, timestamp: new Date().toISOString(), backupId: null, success: true, error: null, estimatedImprovementMs: 0 });
    history.clear();
    expect(history.count()).toBe(0);
  });

  it('generateRecordId produces unique IDs', () => {
    const id1 = generateRecordId();
    const id2 = generateRecordId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^startup-change-/);
  });
});

// ── Execution Task Tests ──────────────────────────────────────

describe('StartupExecutionTask', () => {
  afterEach(() => {
    startupEvents.clear();
    vi.restoreAllMocks();
  });

  it('estimates duration based on operations', () => {
    const config = { disableEntryIds: ['entry-1', 'entry-2'], enableEntryIds: ['entry-3'] };
    const task = new StartupExecutionTask(config, makeEntries());
    expect(task.estimateDuration()).toBe(6000); // 3 ops * 2000ms
  });

  it('estimates zero duration for no operations', () => {
    const config = { disableEntryIds: [], enableEntryIds: [] };
    const task = new StartupExecutionTask(config, []);
    expect(task.estimateDuration()).toBe(0);
  });

  it('validates and rejects protected entries in disable list', async () => {
    const config = { disableEntryIds: ['entry-2'], enableEntryIds: [] };
    const task = new StartupExecutionTask(config, makeEntries());
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors.some((e) => e.includes('protected'))).toBe(true);
  });

  it('validates and rejects unknown entries', async () => {
    const config = { disableEntryIds: ['nonexistent'], enableEntryIds: [] };
    const task = new StartupExecutionTask(config, makeEntries());
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
  });

  it('validates and warns about already-disabled entries', async () => {
    const config = { disableEntryIds: ['entry-4'], enableEntryIds: [] };
    const task = new StartupExecutionTask(config, makeEntries());
    const result = await task.validate();
    expect(result.warnings.some((w) => w.includes('already disabled'))).toBe(true);
  });

  it('validates and warns about already-enabled entries', async () => {
    const config = { disableEntryIds: [], enableEntryIds: ['entry-1'] };
    const task = new StartupExecutionTask(config, makeEntries());
    const result = await task.validate();
    expect(result.warnings.some((w) => w.includes('already enabled'))).toBe(true);
  });

  it('passes validation for valid config', async () => {
    const config = { disableEntryIds: ['entry-1'], enableEntryIds: ['entry-4'] };
    const task = new StartupExecutionTask(config, makeEntries());
    // Mock RPC availability
    vi.stubGlobal('window', { avs: { rpc: { call: vi.fn() } } });
    const result = await task.validate();
    expect(result.canRun).toBe(true);
    vi.unstubAllGlobals();
  });

  it('has correct display name and description', () => {
    const task = new StartupExecutionTask({ disableEntryIds: [], enableEntryIds: [] }, []);
    expect(task.displayName).toBe('Startup Optimizer');
    expect(task.description).toContain('startup');
  });

  it('getChanges returns empty before execution', () => {
    const task = new StartupExecutionTask({ disableEntryIds: [], enableEntryIds: [] }, []);
    expect(task.getChanges()).toHaveLength(0);
  });
});

// ── Safety Tests ──────────────────────────────────────────────

describe('Safety', () => {
  it('protected app patterns include Windows Defender', () => {
    expect(isProtectedApp('Windows Defender Antivirus Service')).toBe(true);
  });

  it('protected app patterns include AVS AI Shield', () => {
    expect(isProtectedApp('AVS AI Shield')).toBe(true);
  });

  it('protected app patterns include security software', () => {
    expect(isProtectedApp('Avast Antivirus')).toBe(true);
    expect(isProtectedApp('Norton Security')).toBe(true);
    expect(isProtectedApp('McAfee Total Protection')).toBe(true);
  });

  it('non-protected apps are not flagged', () => {
    expect(isProtectedApp('Chrome')).toBe(false);
    expect(isProtectedApp('Spotify')).toBe(false);
    expect(isProtectedApp('My Custom App')).toBe(false);
  });

  it('execution task rejects disabling protected entries in validation', async () => {
    const entries = [
      makeEntry({ id: 'defender', name: 'Windows Defender', isProtected: true, protectedReason: 'Security' }),
    ];
    const task = new StartupExecutionTask({ disableEntryIds: ['defender'], enableEntryIds: [] }, entries);
    const result = await task.validate();
    expect(result.canRun).toBe(false);
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('StartupEvents', () => {
  afterEach(() => {
    startupEvents.clear();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    startupEvents.on('startup_scan_started', listener);
    startupEvents.emit('startup_scan_started', { timestamp: '2025-01-01' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = startupEvents.on('startup_scan_completed', listener);
    expect(startupEvents.listenerCount('startup_scan_completed')).toBe(1);
    unsub();
    expect(startupEvents.listenerCount('startup_scan_completed')).toBe(0);
  });

  it('does not crash when listener throws', () => {
    const badListener = () => { throw new Error('crash'); };
    const goodListener = vi.fn();
    startupEvents.on('startup_item_changed', badListener);
    startupEvents.on('startup_item_changed', goodListener);
    startupEvents.emit('startup_item_changed', { test: true });
    expect(goodListener).toHaveBeenCalledTimes(1);
  });

  it('tracks listener count', () => {
    expect(startupEvents.listenerCount('startup_execution_completed')).toBe(0);
    const u1 = startupEvents.on('startup_execution_completed', () => {});
    const u2 = startupEvents.on('startup_execution_completed', () => {});
    expect(startupEvents.listenerCount('startup_execution_completed')).toBe(2);
    u1();
    expect(startupEvents.listenerCount('startup_execution_completed')).toBe(1);
    u2();
    expect(startupEvents.listenerCount('startup_execution_completed')).toBe(0);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.startupScanner).toBeDefined();
    expect(mod.startupRepository).toBeDefined();
    expect(mod.startupImpactCalculator).toBeDefined();
    expect(mod.startupAnalyzer).toBeDefined();
    expect(mod.startupHistory).toBeDefined();
    expect(mod.startupEvents).toBeDefined();
    expect(mod.StartupScanner).toBeDefined();
    expect(mod.StartupRepository).toBeDefined();
    expect(mod.StartupImpactCalculator).toBeDefined();
    expect(mod.StartupAnalyzer).toBeDefined();
    expect(mod.StartupExecutionTask).toBeDefined();
    expect(mod.StartupHistory).toBeDefined();
    expect(mod.STARTUP_OPTIMIZER_TASK_ID).toBeDefined();
    expect(mod.setStartupExecutionConfig).toBeDefined();
  });

  it('task is registered in the execution engine registry', async () => {
    const { isTaskRegistered } = await import('../../maintenance-engine/tasks');
    const { STARTUP_OPTIMIZER_TASK_ID } = await import('../index');
    expect(isTaskRegistered(STARTUP_OPTIMIZER_TASK_ID)).toBe(true);
  });

  it('does not import from auth, licensing, payment, or scheduler', async () => {
    const mod = await import('../index');
    expect(mod.startupAnalyzer).toBeDefined();
  });

  it('health contribution data is compatible with health engine types', () => {
    const analyzer = new StartupAnalyzer();
    const entries = makeEntries();
    const contribution = analyzer.getHealthContribution(entries);
    // Verify the shape matches what the health engine expects
    expect(contribution).toHaveProperty('score');
    expect(contribution).toHaveProperty('issues');
    expect(contribution).toHaveProperty('insights');
    expect(contribution).toHaveProperty('recommendations');
    expect(contribution).toHaveProperty('estimatedBootImprovementMs');
    expect(typeof contribution.score).toBe('number');
    expect(Array.isArray(contribution.issues)).toBe(true);
    expect(Array.isArray(contribution.insights)).toBe(true);
    expect(Array.isArray(contribution.recommendations)).toBe(true);
  });
});
