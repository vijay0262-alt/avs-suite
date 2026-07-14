// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JunkCleanerViewModel } from '../JunkCleanerViewModel';
import type { JunkCleanerService } from '../junkCleaner.service';
import type { CleanerInfo, ScanStatusSnapshot } from '../junkCleaner.types';

function makeService(overrides: Partial<JunkCleanerService> = {}): JunkCleanerService {
  const catalog: CleanerInfo[] = [
    { id: 'a', name: 'A', description: 'a', category: 'system' },
    { id: 'b', name: 'B', description: 'b', category: 'user' },
  ];
  return {
    list: vi.fn(async () => catalog),
    startScan: vi.fn(async () => ({ taskId: 't1' })),
    getStatus: vi.fn(async (): Promise<ScanStatusSnapshot> => ({
      present: true,
      taskId: 't1',
      status: 'completed',
      progress: 100,
      totalFiles: 5,
      totalBytes: 500,
      cleaners: [
        {
          id: 'a',
          name: 'A',
          description: 'a',
          category: 'system',
          status: 'completed',
          totalFiles: 3,
          totalBytes: 300,
          errors: [],
          elapsedMs: 12,
          progress: 100,
        },
        {
          id: 'b',
          name: 'B',
          description: 'b',
          category: 'user',
          status: 'completed',
          totalFiles: 2,
          totalBytes: 200,
          errors: [],
          elapsedMs: 12,
          progress: 100,
        },
      ],
      errorCount: 0,
      currentCleaner: null,
    })),
    cancel: vi.fn(async () => ({ cancelled: true })),
    getResults: vi.fn(async (_t, cleanerId) => ({
      offset: 0,
      limit: 500,
      items: Array.from({ length: cleanerId === 'a' ? 3 : 2 }, (_, i) => ({
        path: `/tmp/${cleanerId}/${i}`,
        name: `file_${i}`,
        extension: 'tmp',
        size: 100,
        modifiedAt: Date.now() / 1000,
        category: 'system' as const,
        cleanerId,
      })),
    })),
    ...overrides,
  };
}

describe('JunkCleanerViewModel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('bootstraps with all cleaners pre-selected', async () => {
    const vm = new JunkCleanerViewModel(makeService());
    await vm.bootstrap();
    expect(vm.state.bootstrap).toBe('ready');
    expect(vm.state.catalog).toHaveLength(2);
    expect(vm.state.selected.size).toBe(2);
  });

  it('toggles selection and select-all', async () => {
    const vm = new JunkCleanerViewModel(makeService());
    await vm.bootstrap();
    vm.toggleSelection('a');
    expect(vm.state.selected.has('a')).toBe(false);
    expect(vm.state.selected.has('b')).toBe(true);
    vm.setAllSelected(false);
    expect(vm.state.selected.size).toBe(0);
    vm.setAllSelected(true);
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

  it('starts a scan and polls to completion', async () => {
    const svc = makeService();
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    await vm.startScan();
    // Immediate poll fires synchronously via microtask.
    await vi.advanceTimersByTimeAsync(0);
    expect(vm.state.activeTaskId).toBe('t1');
    expect(vm.state.snapshot.status).toBe('completed');
    expect(vm.state.snapshot.totalFiles).toBe(5);
  });

  it('cancels a scan', async () => {
    const svc = makeService();
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    await vm.startScan();
    await vi.advanceTimersByTimeAsync(0);
    await vm.cancelScan();
    expect(svc.cancel).toHaveBeenCalledWith('t1');
  });

  it('loads details paginated for the selected cleaner', async () => {
    const svc = makeService();
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    await vm.startScan();
    await vi.advanceTimersByTimeAsync(0);
    await vm.openDetails('a');
    expect(vm.state.detailsCleanerId).toBe('a');
    expect(vm.state.detailsItems).toHaveLength(3);
    vm.closeDetails();
    expect(vm.state.detailsCleanerId).toBeNull();
    expect(vm.state.detailsItems).toHaveLength(0);
  });

  it('surfaces service errors', async () => {
    const svc = makeService({ list: vi.fn(async () => { throw new Error('boom'); }) });
    const vm = new JunkCleanerViewModel(svc);
    await vm.bootstrap();
    expect(vm.state.bootstrap).toBe('error');
    expect(vm.state.bootstrapError).toBe('boom');
  });
});
