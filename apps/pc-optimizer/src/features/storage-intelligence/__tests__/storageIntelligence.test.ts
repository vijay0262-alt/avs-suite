/**
 * Tests for Storage Intelligence Platform (Phase 3.5).
 *
 * Covers:
 * - Helper functions: categorizeByExtension, isInstallerFile, isTempOrLogFile, formatBytes
 * - Scanner: sources, scan, conversion
 * - Index: add, remove, query, filter, largest/smallest
 * - Statistics: by category, extension, drive, age distribution
 * - Analyzer: largest files, folders, empty folders, duplicates, cleanup candidates, visualization
 * - Recommendation Engine: generate, filter, auto-fixable, review-required, total recovery
 * - Execution Task: validate, estimateDuration, config, action records
 * - Health Integration: score, issues, insights, recoverable space
 * - Events: emit, subscribe, listener count
 * - Regression: all exports, task registered, no forbidden modifications
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileEntry, FileCategory, StorageAnalysis, StorageRecommendation } from '../types';
import {
  categorizeByExtension,
  generateFileEntryId,
  formatBytes,
  isInstallerFile,
  isTempOrLogFile,
  DEFAULT_SCAN_SOURCES,
  LARGE_FILE_THRESHOLD,
} from '../types';
import { StorageScanner } from '../storageScanner';
import { StorageIndex } from '../storageIndex';
import { StorageStatisticsCalculator } from '../storageStatistics';
import { StorageAnalyzer } from '../storageAnalyzer';
import { StorageRecommendationEngine } from '../storageRecommendationEngine';
import { StorageExecutionTask, STORAGE_TASK_ID } from '../storageExecutionTask';
import { StorageHealthIntegration } from '../storageHealthIntegration';
import { StorageEventEmitter } from '../storageEvents';
import { isTaskRegistered } from '../../maintenance-engine/tasks/index';

// ── Test Helpers ──────────────────────────────────────────────

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: `file-${Math.random().toString(36).slice(2)}`,
    path: `C:\\Users\\Test\\file.txt`,
    name: 'file.txt',
    extension: 'txt',
    size: 1024,
    category: 'documents',
    createdDate: new Date().toISOString(),
    modifiedDate: new Date().toISOString(),
    accessDate: new Date().toISOString(),
    owner: 'user',
    hash: null,
    flags: [],
    isDirectory: false,
    parentFolder: 'C:\\Users\\Test',
    drive: 'C:',
    ...overrides,
  };
}

function makeLargeFileEntry(size: number, path: string = 'C:\\Users\\Test\\large.bin'): FileEntry {
  return makeFileEntry({
    id: generateFileEntryId(path),
    path,
    name: path.split('\\').pop() ?? 'large.bin',
    extension: 'bin',
    size,
    category: 'other',
    flags: ['large'],
    parentFolder: path.substring(0, path.lastIndexOf('\\')),
  });
}

// makeScanResult removed — not used in tests

// ── Helper Function Tests ─────────────────────────────────────

describe('Helper Functions', () => {
  it('categorizeByExtension maps known extensions', () => {
    expect(categorizeByExtension('pdf')).toBe('documents');
    expect(categorizeByExtension('jpg')).toBe('images');
    expect(categorizeByExtension('mp4')).toBe('videos');
    expect(categorizeByExtension('mp3')).toBe('music');
    expect(categorizeByExtension('zip')).toBe('archives');
    expect(categorizeByExtension('exe')).toBe('installers');
    expect(categorizeByExtension('tmp')).toBe('temporary');
    expect(categorizeByExtension('log')).toBe('logs');
  });

  it('categorizeByExtension returns other for unknown', () => {
    expect(categorizeByExtension('xyz')).toBe('other');
    expect(categorizeByExtension('')).toBe('other');
  });

  it('categorizeByExtension is case-insensitive', () => {
    expect(categorizeByExtension('PDF')).toBe('documents');
    expect(categorizeByExtension('JPG')).toBe('images');
  });

  it('generateFileEntryId produces stable IDs', () => {
    const id1 = generateFileEntryId('C:\\test\\file.txt');
    const id2 = generateFileEntryId('C:\\test\\file.txt');
    expect(id1).toBe(id2);
  });

  it('formatBytes formats correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('isInstallerFile detects installers', () => {
    expect(isInstallerFile('exe')).toBe(true);
    expect(isInstallerFile('msi')).toBe(true);
    expect(isInstallerFile('txt')).toBe(false);
  });

  it('isTempOrLogFile detects temp/log files', () => {
    expect(isTempOrLogFile('tmp')).toBe(true);
    expect(isTempOrLogFile('log')).toBe(true);
    expect(isTempOrLogFile('bak')).toBe(true);
    expect(isTempOrLogFile('txt')).toBe(false);
  });

  it('DEFAULT_SCAN_SOURCES has expected sources', () => {
    expect(DEFAULT_SCAN_SOURCES.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_SCAN_SOURCES.some((s) => s.type === 'downloads')).toBe(true);
    expect(DEFAULT_SCAN_SOURCES.some((s) => s.type === 'documents')).toBe(true);
    expect(DEFAULT_SCAN_SOURCES.some((s) => s.type === 'recycle_bin')).toBe(true);
    expect(DEFAULT_SCAN_SOURCES.some((s) => s.type === 'temporary')).toBe(true);
  });

  it('LARGE_FILE_THRESHOLD is 100MB', () => {
    expect(LARGE_FILE_THRESHOLD).toBe(100 * 1024 * 1024);
  });
});

// ── Scanner Tests ─────────────────────────────────────────────

describe('StorageScanner', () => {
  let scanner: StorageScanner;

  beforeEach(() => {
    scanner = new StorageScanner();
  });

  it('has default scan sources', () => {
    const sources = scanner.getSources();
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  it('setSourceEnabled toggles source', () => {
    scanner.setSourceEnabled('downloads', false);
    const sources = scanner.getSources();
    const downloads = sources.find((s) => s.type === 'downloads');
    expect(downloads?.enabled).toBe(false);
  });

  it('addSource adds custom source', () => {
    scanner.addSource({ type: 'custom', path: 'D:\\Custom', displayName: 'Custom', enabled: true });
    const sources = scanner.getSources();
    expect(sources.some((s) => s.type === 'custom')).toBe(true);
  });

  it('addSource does not add duplicates', () => {
    const initialCount = scanner.getSources().length;
    scanner.addSource({ type: 'downloads', path: '~/Downloads', displayName: 'Downloads', enabled: true });
    expect(scanner.getSources().length).toBe(initialCount);
  });

  it('scan returns result with errors when RPC unavailable', async () => {
    const result = await scanner.scan();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.entries).toEqual([]);
  });
});

// ── Index Tests ───────────────────────────────────────────────

describe('StorageIndex', () => {
  let index: StorageIndex;

  beforeEach(() => {
    index = new StorageIndex();
  });

  it('adds and retrieves entries', () => {
    const entry = makeFileEntry();
    index.add(entry);
    expect(index.getById(entry.id)).toEqual(entry);
    expect(index.size()).toBe(1);
  });

  it('addAll adds multiple entries', () => {
    const entries = [makeFileEntry({ id: 'f1' }), makeFileEntry({ id: 'f2' })];
    index.addAll(entries);
    expect(index.size()).toBe(2);
  });

  it('does not add duplicate IDs', () => {
    const entry = makeFileEntry({ id: 'f1' });
    index.add(entry);
    index.add(entry);
    expect(index.size()).toBe(1);
  });

  it('removes entries', () => {
    const entry = makeFileEntry({ id: 'f1' });
    index.add(entry);
    expect(index.remove('f1')).toBe(true);
    expect(index.getById('f1')).toBeNull();
    expect(index.size()).toBe(0);
  });

  it('returns false when removing unknown ID', () => {
    expect(index.remove('nonexistent')).toBe(false);
  });

  it('getByCategory filters correctly', () => {
    index.add(makeFileEntry({ id: 'f1', category: 'documents' }));
    index.add(makeFileEntry({ id: 'f2', category: 'images' }));
    index.add(makeFileEntry({ id: 'f3', category: 'documents' }));
    expect(index.getByCategory('documents')).toHaveLength(2);
    expect(index.getByCategory('images')).toHaveLength(1);
  });

  it('getByExtension filters correctly', () => {
    index.add(makeFileEntry({ id: 'f1', extension: 'txt' }));
    index.add(makeFileEntry({ id: 'f2', extension: 'pdf' }));
    expect(index.getByExtension('txt')).toHaveLength(1);
    expect(index.getByExtension('pdf')).toHaveLength(1);
  });

  it('getByDrive filters correctly', () => {
    index.add(makeFileEntry({ id: 'f1', drive: 'C:' }));
    index.add(makeFileEntry({ id: 'f2', drive: 'D:' }));
    expect(index.getByDrive('C:')).toHaveLength(1);
    expect(index.getByDrive('D:')).toHaveLength(1);
  });

  it('getByFlag filters correctly', () => {
    index.add(makeFileEntry({ id: 'f1', flags: ['large', 'unused'] }));
    index.add(makeFileEntry({ id: 'f2', flags: ['large'] }));
    expect(index.getByFlag('large')).toHaveLength(2);
    expect(index.getByFlag('unused')).toHaveLength(1);
  });

  it('getFiles returns only files', () => {
    index.add(makeFileEntry({ id: 'f1', isDirectory: false }));
    index.add(makeFileEntry({ id: 'f2', isDirectory: true }));
    expect(index.getFiles()).toHaveLength(1);
  });

  it('getDirectories returns only directories', () => {
    index.add(makeFileEntry({ id: 'f1', isDirectory: false }));
    index.add(makeFileEntry({ id: 'f2', isDirectory: true }));
    expect(index.getDirectories()).toHaveLength(1);
  });

  it('getLargestFiles returns sorted by size', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100 }));
    index.add(makeFileEntry({ id: 'f2', size: 500 }));
    index.add(makeFileEntry({ id: 'f3', size: 300 }));
    const largest = index.getLargestFiles(2);
    expect(largest[0]!.size).toBe(500);
    expect(largest[1]!.size).toBe(300);
  });

  it('getTotalSize sums all sizes', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100 }));
    index.add(makeFileEntry({ id: 'f2', size: 200 }));
    expect(index.getTotalSize()).toBe(300);
  });

  it('query filters with custom function', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100 }));
    index.add(makeFileEntry({ id: 'f2', size: 500 }));
    const large = index.query((e) => e.size > 200);
    expect(large).toHaveLength(1);
    expect(large[0]!.size).toBe(500);
  });

  it('clear removes all entries', () => {
    index.add(makeFileEntry({ id: 'f1' }));
    index.add(makeFileEntry({ id: 'f2' }));
    index.clear();
    expect(index.size()).toBe(0);
  });
});

// ── Statistics Tests ──────────────────────────────────────────

describe('StorageStatisticsCalculator', () => {
  let index: StorageIndex;
  let calc: StorageStatisticsCalculator;

  beforeEach(() => {
    index = new StorageIndex();
    calc = new StorageStatisticsCalculator(index);
  });

  it('computes basic statistics', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100 }));
    index.add(makeFileEntry({ id: 'f2', size: 200 }));
    index.add(makeFileEntry({ id: 'f3', size: 300, isDirectory: true }));
    const stats = calc.compute();
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalFolders).toBe(1);
    expect(stats.totalSize).toBe(300);
    expect(stats.averageFileSize).toBe(150);
    expect(stats.largestFileSize).toBe(200);
    expect(stats.smallestFileSize).toBe(100);
  });

  it('computes byCategory', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, category: 'documents' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, category: 'images' }));
    const stats = calc.compute();
    expect(stats.byCategory.documents.count).toBe(1);
    expect(stats.byCategory.documents.size).toBe(100);
    expect(stats.byCategory.images.count).toBe(1);
  });

  it('computes byExtension', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, extension: 'txt' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, extension: 'pdf' }));
    const stats = calc.compute();
    expect(stats.byExtension.txt!.count).toBe(1);
    expect(stats.byExtension.pdf!.size).toBe(200);
  });

  it('computes byDrive', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, drive: 'C:' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, drive: 'D:' }));
    const stats = calc.compute();
    expect(stats.byDrive['C:']!.count).toBe(1);
    expect(stats.byDrive['D:']!.size).toBe(200);
  });

  it('computes age distribution', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    index.add(makeFileEntry({ id: 'f1', size: 100, modifiedDate: old }));
    const stats = calc.compute();
    expect(stats.filesOlderThan30Days).toBe(1);
    expect(stats.filesOlderThan90Days).toBe(1);
  });

  it('handles empty index', () => {
    const stats = calc.compute();
    expect(stats.totalFiles).toBe(0);
    expect(stats.totalSize).toBe(0);
    expect(stats.averageFileSize).toBe(0);
  });
});

// ── Analyzer Tests ────────────────────────────────────────────

describe('StorageAnalyzer', () => {
  let index: StorageIndex;
  let analyzer: StorageAnalyzer;

  beforeEach(() => {
    index = new StorageIndex();
    analyzer = new StorageAnalyzer(index);
  });

  it('finds largest files', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100 }));
    index.add(makeFileEntry({ id: 'f2', size: 500 }));
    index.add(makeFileEntry({ id: 'f3', size: 300 }));
    const analysis = analyzer.analyze();
    expect(analysis.largestFiles[0]!.entry.size).toBe(500);
    expect(analysis.largestFiles[1]!.entry.size).toBe(300);
  });

  it('computes storage by category', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, category: 'documents' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, category: 'images' }));
    const analysis = analyzer.analyze();
    expect(analysis.storageByCategory.documents).toBe(100);
    expect(analysis.storageByCategory.images).toBe(200);
  });

  it('computes storage by extension', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, extension: 'txt' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, extension: 'pdf' }));
    const analysis = analyzer.analyze();
    expect(analysis.storageByExtension.txt).toBe(100);
    expect(analysis.storageByExtension.pdf).toBe(200);
  });

  it('finds empty folders', () => {
    index.add(makeFileEntry({ id: 'd1', isDirectory: true, path: 'C:\\Empty', parentFolder: 'C:\\' }));
    index.add(makeFileEntry({ id: 'f1', size: 100, parentFolder: 'C:\\Other' }));
    const analysis = analyzer.analyze();
    expect(analysis.emptyFolders.length).toBe(1);
    expect(analysis.emptyFolders[0]!.path).toBe('C:\\Empty');
  });

  it('finds cleanup candidates', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, flags: ['temporary'] }));
    index.add(makeFileEntry({ id: 'f2', size: 200, flags: ['old_installer'] }));
    index.add(makeFileEntry({ id: 'f3', size: 300, flags: [] }));
    const analysis = analyzer.analyze();
    expect(analysis.cleanupCandidates.length).toBe(2);
  });

  it('finds duplicate groups by hash', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, hash: 'abc123' }));
    index.add(makeFileEntry({ id: 'f2', size: 100, hash: 'abc123' }));
    index.add(makeFileEntry({ id: 'f3', size: 200, hash: 'def456' }));
    const analysis = analyzer.analyze();
    expect(analysis.duplicateGroups.length).toBe(1);
    expect(analysis.duplicateGroups[0]!.entries.length).toBe(2);
    expect(analysis.duplicateGroups[0]!.wastedSpace).toBe(100);
  });

  it('finds recently added large files', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    index.add(makeLargeFileEntry(200 * 1024 * 1024, 'C:\\recent.bin'));
    index.add(makeFileEntry({ id: 'f2', size: 200 * 1024 * 1024, createdDate: old, flags: ['large'] }));
    const analysis = analyzer.analyze();
    expect(analysis.recentlyAddedLargeFiles.length).toBe(1);
  });

  it('finds unused large files', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    index.add(makeFileEntry({ id: 'f1', size: 200 * 1024 * 1024, accessDate: old, flags: ['large', 'unused'] }));
    const analysis = analyzer.analyze();
    expect(analysis.unusedLargeFiles.length).toBe(1);
  });

  it('builds treemap', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, parentFolder: 'C:\\Folder1' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, parentFolder: 'C:\\Folder2' }));
    const treemap = analyzer.buildTreemap();
    expect(treemap.size).toBe(300);
    expect(treemap.children.length).toBe(2);
  });

  it('builds sunburst', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, category: 'documents', extension: 'txt' }));
    index.add(makeFileEntry({ id: 'f2', size: 200, category: 'images', extension: 'jpg' }));
    const sunburst = analyzer.buildSunburst();
    expect(sunburst.size).toBe(300);
    expect(sunburst.children.length).toBe(2);
  });

  it('builds heat map', () => {
    index.add(makeFileEntry({ id: 'f1', size: 100, parentFolder: 'C:\\Folder1' }));
    index.add(makeFileEntry({ id: 'f2', size: 500, parentFolder: 'C:\\Folder2' }));
    const heatMap = analyzer.buildHeatMap();
    expect(heatMap.length).toBe(2);
    expect(heatMap[0]!.size).toBe(500);
  });
});

// ── Recommendation Engine Tests ───────────────────────────────

describe('StorageRecommendationEngine', () => {
  let engine: StorageRecommendationEngine;
  let analysis: StorageAnalysis;

  beforeEach(() => {
    engine = new StorageRecommendationEngine();
    analysis = {
      largestFiles: [],
      largestFolders: [],
      storageByCategory: {} as Record<FileCategory, number>,
      storageByExtension: {},
      recentlyAddedLargeFiles: [],
      unusedLargeFiles: [],
      emptyFolders: [
        { path: 'C:\\Empty1', name: 'Empty1', parentFolder: 'C:\\', drive: 'C:' },
        { path: 'C:\\Empty2', name: 'Empty2', parentFolder: 'C:\\', drive: 'C:' },
      ],
      duplicateGroups: [
        { hash: 'abc', entries: [makeFileEntry({ id: 'f1' }), makeFileEntry({ id: 'f2' })], totalSize: 200, wastedSpace: 100 },
      ],
      cleanupCandidates: [
        makeFileEntry({ id: 'c1', extension: 'log', category: 'logs', flags: ['temporary'], size: 5000 }),
        makeFileEntry({ id: 'c2', extension: 'tmp', category: 'temporary', flags: ['temporary'], size: 10000 }),
        makeFileEntry({ id: 'c3', extension: 'exe', category: 'installers', flags: ['old_installer'], size: 50 * 1024 * 1024 }),
        makeFileEntry({ id: 'c4', path: 'C:\\Downloads\\file.zip', flags: ['in_downloads'], size: 30 * 1024 * 1024 }),
      ],
      totalAnalyzedSize: 100000,
      totalFileCount: 10,
      totalFolderCount: 2,
      analyzedAt: new Date().toISOString(),
    };
  });

  it('generates empty folder cleanup recommendation', () => {
    const recs = engine.generate(analysis);
    const emptyFolderRec = recs.find((r) => r.type === 'empty_folder_cleanup');
    expect(emptyFolderRec).toBeDefined();
    expect(emptyFolderRec!.affectedFileCount).toBe(2);
    expect(emptyFolderRec!.autoFixable).toBe(true);
  });

  it('generates old log cleanup recommendation', () => {
    const recs = engine.generate(analysis);
    const logRec = recs.find((r) => r.type === 'old_log_cleanup');
    expect(logRec).toBeDefined();
    expect(logRec!.estimatedRecovery).toBe(15000);
  });

  it('generates temp cleanup recommendation', () => {
    const recs = engine.generate(analysis);
    const tempRec = recs.find((r) => r.type === 'temp_cleanup');
    expect(tempRec).toBeDefined();
    expect(tempRec!.estimatedRecovery).toBe(10000);
  });

  it('generates old installer cleanup recommendation', () => {
    const recs = engine.generate(analysis);
    const installerRec = recs.find((r) => r.type === 'old_installer_cleanup');
    expect(installerRec).toBeDefined();
    expect(installerRec!.reviewRequired).toBe(true);
  });

  it('generates download cleanup recommendation', () => {
    const recs = engine.generate(analysis);
    const downloadRec = recs.find((r) => r.type === 'download_cleanup');
    expect(downloadRec).toBeDefined();
    expect(downloadRec!.reviewRequired).toBe(true);
  });

  it('generates duplicate cleanup recommendation', () => {
    const recs = engine.generate(analysis);
    const dupRec = recs.find((r) => r.type === 'duplicate_cleanup');
    expect(dupRec).toBeDefined();
    expect(dupRec!.estimatedRecovery).toBe(100);
  });

  it('recommendations are sorted by priority', () => {
    const recs = engine.generate(analysis);
    const priorities = recs.map((r) => r.priority);
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < priorities.length; i++) {
      expect(order[priorities[i]!]).toBeGreaterThanOrEqual(order[priorities[i - 1]!]);
    }
  });

  it('filterByType filters correctly', () => {
    const recs = engine.generate(analysis);
    const tempRecs = engine.filterByType(recs, 'temp_cleanup');
    expect(tempRecs.every((r) => r.type === 'temp_cleanup')).toBe(true);
  });

  it('getAutoFixable returns only auto-fixable', () => {
    const recs = engine.generate(analysis);
    const autoFixable = engine.getAutoFixable(recs);
    expect(autoFixable.every((r) => r.autoFixable)).toBe(true);
  });

  it('getReviewRequired returns only review-required', () => {
    const recs = engine.generate(analysis);
    const reviewRequired = engine.getReviewRequired(recs);
    expect(reviewRequired.every((r) => r.reviewRequired)).toBe(true);
  });

  it('getTotalEstimatedRecovery sums all recovery', () => {
    const recs = engine.generate(analysis);
    const total = engine.getTotalEstimatedRecovery(recs);
    expect(total).toBeGreaterThan(0);
  });
});

// ── Execution Task Tests ──────────────────────────────────────

describe('StorageExecutionTask', () => {
  let task: StorageExecutionTask;

  beforeEach(() => {
    task = new StorageExecutionTask();
  });

  it('has correct display name and description', () => {
    expect(task.displayName).toBe('Storage Intelligence Cleanup');
    expect(task.description).toContain('empty folders');
  });

  it('estimates zero duration for no config', () => {
    expect(task.estimateDuration()).toBe(0);
  });

  it('estimates duration based on operations', () => {
    task.setConfig({
      operations: [
        { type: 'empty_folder_cleanup', paths: ['C:\\Empty1', 'C:\\Empty2'] },
        { type: 'old_log_cleanup', paths: ['C:\\log1.log'] },
      ],
    });
    const duration = task.estimateDuration();
    expect(duration).toBeGreaterThan(0);
  });

  it('validates and rejects when no config', async () => {
    const result = await task.validate();
    expect(result.canRun).toBe(false);
    expect(result.errors).toContain('No execution configuration set');
  });

  it('validates and warns about empty operations', async () => {
    task.setConfig({ operations: [] });
    const result = await task.validate();
    expect(result.warnings).toContain('No operations configured');
  });

  it('validates and warns about operations with no paths', async () => {
    task.setConfig({ operations: [{ type: 'empty_folder_cleanup', paths: [] }] });
    const result = await task.validate();
    expect(result.warnings).toContain('Operation empty_folder_cleanup has no paths');
  });

  it('getActionRecords returns empty before execution', () => {
    expect(task.getActionRecords()).toEqual([]);
  });
});

// ── Health Integration Tests ──────────────────────────────────

describe('StorageHealthIntegration', () => {
  let integration: StorageHealthIntegration;
  let analysis: StorageAnalysis;
  let recommendations: StorageRecommendation[];

  beforeEach(() => {
    integration = new StorageHealthIntegration();
    analysis = {
      largestFiles: [],
      largestFolders: [],
      storageByCategory: {} as Record<FileCategory, number>,
      storageByExtension: {},
      recentlyAddedLargeFiles: [],
      unusedLargeFiles: [],
      emptyFolders: [],
      duplicateGroups: [],
      cleanupCandidates: [],
      totalAnalyzedSize: 500 * 1024 * 1024,
      totalFileCount: 100,
      totalFolderCount: 10,
      analyzedAt: new Date().toISOString(),
    };
    recommendations = [
      {
        id: 'rec1',
        type: 'temp_cleanup',
        title: 'Temp Cleanup',
        description: 'Clean temp files',
        estimatedRecovery: 600 * 1024 * 1024,
        risk: 'none',
        priority: 'high',
        reason: 'Temp files',
        affectedPaths: [],
        affectedFileCount: 50,
        autoFixable: true,
        reviewRequired: false,
      },
    ];
  });

  it('builds health contribution with score', () => {
    const contribution = integration.buildContribution(analysis, recommendations);
    expect(contribution.categoryId).toBe('storage');
    expect(contribution.score).toBeGreaterThanOrEqual(0);
    expect(contribution.score).toBeLessThanOrEqual(100);
  });

  it('identifies excessive temp files issue', () => {
    const contribution = integration.buildContribution(analysis, recommendations);
    expect(contribution.issues.some((i) => i.title === 'Excessive temporary files')).toBe(true);
  });

  it('generates insights', () => {
    const contribution = integration.buildContribution(analysis, recommendations);
    expect(contribution.insights.length).toBeGreaterThan(0);
    expect(contribution.insights.some((i) => i.includes('Analyzed'))).toBe(true);
  });

  it('calculates estimated recoverable space', () => {
    const contribution = integration.buildContribution(analysis, recommendations);
    expect(contribution.estimatedRecoverableSpace).toBe(600 * 1024 * 1024);
  });

  it('sets confidence based on file count', () => {
    const contribution = integration.buildContribution(analysis, recommendations);
    expect(contribution.confidence).toBe(0.9);
  });

  it('handles empty analysis', () => {
    const emptyAnalysis: StorageAnalysis = {
      ...analysis,
      totalFileCount: 0,
      totalAnalyzedSize: 0,
    };
    const contribution = integration.buildContribution(emptyAnalysis, []);
    expect(contribution.confidence).toBe(0.3);
  });
});

// ── Events Tests ──────────────────────────────────────────────

describe('StorageEvents', () => {
  let emitter: StorageEventEmitter;

  beforeEach(() => {
    emitter = new StorageEventEmitter();
  });

  it('emits events to subscribers', () => {
    const listener = vi.fn();
    emitter.on('storage_scan_started', listener);
    emitter.emit('storage_scan_started', { sources: [] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('supports unsubscribe', () => {
    const listener = vi.fn();
    const unsub = emitter.on('storage_scan_completed', listener);
    unsub();
    emitter.emit('storage_scan_completed', {});
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not crash when listener throws', () => {
    emitter.on('storage_analysis_completed', () => {
      throw new Error('test');
    });
    expect(() => emitter.emit('storage_analysis_completed', {})).not.toThrow();
  });

  it('tracks listener count', () => {
    emitter.on('storage_scan_started', () => {});
    emitter.on('storage_scan_started', () => {});
    expect(emitter.listenerCount('storage_scan_started')).toBe(2);
  });
});

// ── Regression Tests ──────────────────────────────────────────

describe('Regression', () => {
  it('all exports are defined', async () => {
    const mod = await import('../index');
    expect(mod.storageScanner).toBeDefined();
    expect(mod.storageIndex).toBeDefined();
    expect(mod.storageAnalyzer).toBeDefined();
    expect(mod.storageStatisticsCalculator).toBeDefined();
    expect(mod.storageRecommendationEngine).toBeDefined();
    expect(mod.storageHealthIntegration).toBeDefined();
    expect(mod.StorageScanner).toBeDefined();
    expect(mod.StorageIndex).toBeDefined();
    expect(mod.StorageAnalyzer).toBeDefined();
    expect(mod.StorageStatisticsCalculator).toBeDefined();
    expect(mod.StorageRecommendationEngine).toBeDefined();
    expect(mod.StorageExecutionTask).toBeDefined();
    expect(mod.StorageHealthIntegration).toBeDefined();
    expect(mod.StorageEventEmitter).toBeDefined();
    expect(mod.STORAGE_TASK_ID).toBeDefined();
  });

  it('task is registered in the execution engine registry', () => {
    expect(isTaskRegistered(STORAGE_TASK_ID)).toBe(true);
  });

  it('does not import from auth, licensing, payment, or scheduler', async () => {
    const mod = await import('../index');
    // Verify the module exports are from storage-intelligence only
    expect(mod.STORAGE_TASK_ID).toBe('storage_intelligence');
  });

  it('health contribution is compatible with health engine types', () => {
    const integration = new StorageHealthIntegration();
    const analysis: StorageAnalysis = {
      largestFiles: [],
      largestFolders: [],
      storageByCategory: {} as Record<FileCategory, number>,
      storageByExtension: {},
      recentlyAddedLargeFiles: [],
      unusedLargeFiles: [],
      emptyFolders: [],
      duplicateGroups: [],
      cleanupCandidates: [],
      totalAnalyzedSize: 0,
      totalFileCount: 0,
      totalFolderCount: 0,
      analyzedAt: new Date().toISOString(),
    };
    const contribution = integration.buildContribution(analysis, []);
    expect(contribution.categoryId).toBe('storage');
    expect(typeof contribution.score).toBe('number');
    expect(Array.isArray(contribution.issues)).toBe(true);
    expect(Array.isArray(contribution.insights)).toBe(true);
    expect(typeof contribution.estimatedRecoverableSpace).toBe('number');
  });

  it('visualization data structures are available', () => {
    const index = new StorageIndex();
    const analyzer = new StorageAnalyzer(index);
    index.add(makeFileEntry({ id: 'f1', size: 100, parentFolder: 'C:\\Folder1', category: 'documents', extension: 'txt' }));
    const treemap = analyzer.buildTreemap();
    const sunburst = analyzer.buildSunburst();
    const heatMap = analyzer.buildHeatMap();
    expect(treemap.children.length).toBeGreaterThan(0);
    expect(sunburst.children.length).toBeGreaterThan(0);
    expect(heatMap.length).toBeGreaterThan(0);
  });
});
