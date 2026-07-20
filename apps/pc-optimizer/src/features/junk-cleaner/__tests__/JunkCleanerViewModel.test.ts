// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JunkCleanerViewModel } from '../JunkCleanerViewModel';
import type { JunkCleanerService } from '../junkCleaner.service';
import type {
  CleanerInfo,
  CleaningPreview,
  CleaningStatusSnapshot,
  ScanStatusSnapshot,
} from '../junkCleaner.types';

function completeSnap(): ScanStatusSnapshot {
  return {
    present: true, taskId: 't1', status: 'completed', progress: 100,
    totalFiles: 5, totalBytes: 500, errorCount: 0, currentCleaner: null,
    cleaners: [
      { id: 'a', name: 'A', description: 'a', category: 'system', status: 'completed', totalFiles: 3, totalBytes: 300, errors: [], elapsedMs: 12, progress: 100 },
      { id: 'b', name: 'B', description: 'b', category: 'user',   status: 'completed', totalFiles: 2, totalBytes: 200, errors: [], elapsedMs: 12, progress: 100 },
    ],
  };
}

function samplePreview(): CleaningPreview {
  return {
    totalFiles: 5, totalBytes: 500, warningCount: 1,
    cleaners: [
      { id: 'a', name: 'A', category: 'system', totalFiles: 3, totalBytes: 300, warnings: [], warningCount: 0 },
      { id: 'b', name: 'B', category: 'user',   totalFiles: 2, totalBytes: 200, warnings: [{ path: '/x', reason: 'symlink', detail: '' }], warningCount: 1 },
    ],
  };
}

function completedCleaning(): CleaningStatusSnapshot {
  return {
    present: true, cleaningTaskId: 'c1', scanTaskId: 't1',
    status: 'completed', progress: 100,
    totalFilesRemoved: 5, totalBytesRecovered: 500, totalFilesSkipped: 0, totalFilesFailed: 0,
    durationMs: 42, etaMs: null, currentCleaner: null, currentFile: null,
    cleaners: [
      { id: 'a', name: 'A', category: 'system', result: 'success', filesRemoved: 3, bytesRecovered: 300, filesSkipped: 0, filesFailed: 0, errors: [], elapsedMs: 20, progress: 100, totalCandidates: 3 },
      { id: 'b', name: 'B', category: 'user',   result: 'success', filesRemoved: 2, bytesRecovered: 200, filesSkipped: 0, filesFailed: 0, errors: [], elapsedMs: 22, progress: 100, totalCandidates: 2 },
    ],
  };
}

function makeService(overrides: Partial<JunkCleanerService> = {}): JunkCleanerService {
  const catalog: CleanerInfo[] = [
    { id: 'a', name: 'A', description: 'a', category: 'system' },
    { id: 'b', name: 'B', description: 'b', category: 'user' },
  ];
  return {
    list: vi.fn(async () => catalog),
    startScan: vi.fn(async () => ({ taskId: 't1' })),
    refreshCache: vi.fn(async () => ({ refreshed: true })),
    getStatus: vi.fn(async () => completeSnap()),
    cancel: vi.fn(async () => ({ cancelled: true })),
    getResults: vi.fn(async () => ({ offset: 0, limit: 500, items: [] })),
    previewClean: vi.fn(async () => samplePreview()),
    executeClean: vi.fn(async () => ({ cleaningTaskId: 'c1' })),
    getCleaningStatus: vi.fn(async () => completedCleaning()),
    cancelClean: vi.fn(async () => ({ cancelled: true })),
    getLogs: vi.fn(async () => ({ total: 2, offset: 0, limit: 200, entries: [] })),
    undoClean: vi.fn(async () => ({ success: false, message: 'Not implemented', filesRestored: 0, bytesRestored: 0 })),
    ...overrides,
  };
}

describe('JunkCleanerViewModel — scan flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('bootstraps with all cleaners pre-selected', async () => {
    const vm = new JunkCleanerViewModel(makeService());
    await vm.bootstrap();
    expect(vm.state.bootstrap).toBe('ready');
    expect(vm.state.selected.size).toBe(2);
  });

  it('refuses to scan when nothing is selected', async () => {
    const svc = makeService();
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    vm.setAllSelected(false);
    await vm.startScan();
    expect(svc.startScan).not.toHaveBeenCalled();
    expect(vm.state.lastScanError).toMatch(/Select at least one/);
  });

  it('polls a scan to completion', async () => {
    const vm = new JunkCleanerViewModel(makeService());
    await vm.bootstrap();
    await vm.startScan();
    await vi.advanceTimersByTimeAsync(0);
    expect(vm.state.snapshot.status).toBe('completed');
  });
});

describe('JunkCleanerViewModel — cleaning flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  async function withCompletedScan() {
    const svc = makeService();
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    await vm.startScan();
    await vi.advanceTimersByTimeAsync(0);
    return { vm, svc };
  }

  it('previews cleaning against eligible cleaners only', async () => {
    const { vm, svc } = await withCompletedScan();
    await vm.openPreview();
    expect(svc.previewClean).toHaveBeenCalledWith('t1', ['a', 'b']);
    expect(vm.state.cleaningStep).toBe('preview');
    expect(vm.state.cleaningPreview?.totalFiles).toBe(5);
  });

  it('refuses to preview when no scanned category has files', async () => {
    const svc = makeService({
      getStatus: vi.fn(async (): Promise<ScanStatusSnapshot> => ({
        present: true, taskId: 't1', status: 'completed' as const, progress: 100,
        totalFiles: 0, totalBytes: 0, cleaners: [], errorCount: 0,
      })),
    });
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    await vm.startScan();
    await vi.advanceTimersByTimeAsync(0);
    await vm.openPreview();
    expect(svc.previewClean).not.toHaveBeenCalled();
    expect(vm.state.lastCleaningError).toMatch(/No categories with files/);
  });

  it('advances preview → confirm → running → summary', async () => {
    const { vm } = await withCompletedScan();
    await vm.openPreview();
    vm.advanceToConfirm();
    expect(vm.state.cleaningStep).toBe('confirm');

    await vm.confirmAndExecute();
    expect(vm.state.cleaningStep).toBe('running');
    await vi.advanceTimersByTimeAsync(0);
    expect(vm.state.cleaningStep).toBe('summary');
    expect(vm.state.cleaningSnapshot.totalFilesRemoved).toBe(5);
  });

  it('cancels the preview flow cleanly', async () => {
    const { vm } = await withCompletedScan();
    await vm.openPreview();
    vm.cancelCleaningFlow();
    expect(vm.state.cleaningStep).toBe('closed');
    expect(vm.state.cleaningPreview).toBeNull();
  });

  it('cancels an in-flight cleaning task', async () => {
    const { vm, svc } = await withCompletedScan();
    await vm.openPreview();
    vm.advanceToConfirm();
    await vm.confirmAndExecute();
    await vm.cancelCleaning();
    expect(svc.cancelClean).toHaveBeenCalledWith('c1');
  });

  it('loads and refreshes cleaning history', async () => {
    const { vm, svc } = await withCompletedScan();
    await vm.loadHistory(true);
    expect(svc.getLogs).toHaveBeenCalled();
    expect(vm.state.historyLoading).toBe(false);
  });

  it('surfaces cleaning service errors', async () => {
    const svc = makeService({
      previewClean: vi.fn(async () => { throw new Error('boom'); }),
    });
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    await vm.startScan();
    await vi.advanceTimersByTimeAsync(0);
    await vm.openPreview();
    expect(vm.state.cleaningPreviewError).toBe('boom');
  });
});
