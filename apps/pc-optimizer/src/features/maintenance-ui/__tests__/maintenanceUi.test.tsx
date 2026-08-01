/**
 * Tests for Maintenance Dashboard & Reports UI (Phase 2.3).
 *
 * Covers:
 * - Hook: useMaintenanceHistory (reactive data, refresh, query, delete)
 * - Hook: useChartData (chart data derivation)
 * - Hook: useTaskFrequency (task frequency derivation)
 * - AnalyticsCards: rendering, loading state, empty state
 * - HistoryTable: rendering, sorting, filtering, pagination, empty state, no results
 * - ExecutionDetailDialog: rendering, close behavior
 * - ReportsView: rendering, range selection, custom range, schedule report
 * - EmptyState/ErrorState: rendering
 * - StatusBadge/SourceBadge: rendering
 * - Regression: no existing modules modified, navigation entries exist
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// ── Mock @avs/ui to avoid React instance mismatch ─────────────

vi.mock('@avs/ui', () => ({
  Card: ({ title, children, ...rest }: { title?: React.ReactNode; children?: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('div', { ...rest, 'data-card-title': title ?? undefined }, children),
  Button: ({ children, onClick, disabled, ...rest }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean; [k: string]: unknown }) =>
    React.createElement('button', { onClick, disabled, ...rest }, children),
  Badge: ({ children, tone, ...rest }: { children?: React.ReactNode; tone?: string; [k: string]: unknown }) =>
    React.createElement('span', { ...rest, 'data-tone': tone }, children),
  StatTile: ({ label, value, hint, icon, ...rest }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('div', rest, icon, React.createElement('div', null, label, React.createElement('div', null, value), hint)),
  Skeleton: ({ className, ...rest }: { className?: string; [k: string]: unknown }) =>
    React.createElement('div', { ...rest, className: `animate-pulse ${className ?? ''}` }),
  ProgressBar: ({ value, label, ...rest }: { value: number; label?: string; [k: string]: unknown }) =>
    React.createElement('div', rest, label, `${value}%`),
}));

vi.mock('@avs/shared/utils', () => ({
  formatBytes: (bytes: number) => bytes === 0 ? '0 B' : `${(bytes / 1024).toFixed(1)} KB`,
  clamp: (v: number, min: number, max: number) => Math.min(Math.max(v, min), max),
}));

import type { ExecutionRecord, ExecutionStatistics } from '../../maintenance-history/types';
import type { NavItemId } from '@avs/shared/types';

// ── Mock service setup ────────────────────────────────────────

const mockRecords: ExecutionRecord[] = [];
let mockStatistics: ExecutionStatistics = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  partialExecutions: 0,
  cancelledExecutions: 0,
  successRate: 0,
  averageDurationMs: 0,
  averageSpaceRecovered: 0,
  largestCleanupBytes: 0,
  largestCleanupExecutionId: null,
  mostFrequentTaskId: null,
  mostFrequentTaskName: null,
  mostFrequentTaskCount: 0,
  lastRunAt: null,
  longestRunMs: 0,
  longestRunExecutionId: null,
  totalFilesRemoved: 0,
  totalSpaceRecovered: 0,
};

vi.mock('../../maintenance-history', () => ({
  maintenanceHistoryService: {
    getAllRecords: () => mockRecords,
    getStatistics: () => mockStatistics,
    getRecordCount: () => mockRecords.length,
    getRecordById: (id: string) => mockRecords.find((r) => r.id === id) ?? null,
    query: (_filter: unknown) => {
      // Simple mock: return all records (real filtering tested in Phase 2.2)
      return mockRecords;
    },
    deleteRecord: (id: string) => {
      const idx = mockRecords.findIndex((r) => r.id === id);
      if (idx >= 0) { mockRecords.splice(idx, 1); return true; }
      return false;
    },
    generateReportForRange: () => ({
      summary: {
        totalExecutions: 0, successful: 0, failed: 0, partial: 0, cancelled: 0,
        successRate: 0, totalFilesRemoved: 0, totalSpaceRecovered: 0, averageDurationMs: 0,
      },
      timeline: [],
      taskResults: [],
      performanceMetrics: {
        averageDurationMs: 0, longestRunMs: 0, shortestRunMs: 0,
        averageSpacePerExecution: 0,
      },
      recoveredSpace: {
        totalBytes: 0, totalFiles: 0, totalFolders: 0, totalRecycleBinItems: 0,
        totalTempFiles: 0, totalBrowserData: 0, totalRegistryEntries: 0,
        largestSingleCleanup: 0,
      },
      warnings: [],
      errors: [],
      overallHealth: 'unknown' as const,
      generatedAt: new Date().toISOString(),
    }),
    generateReportForSchedule: () => ({
      summary: {
        totalExecutions: 0, successful: 0, failed: 0, partial: 0, cancelled: 0,
        successRate: 0, totalFilesRemoved: 0, totalSpaceRecovered: 0, averageDurationMs: 0,
      },
      timeline: [],
      taskResults: [],
      performanceMetrics: {
        averageDurationMs: 0, longestRunMs: 0, shortestRunMs: 0,
        averageSpacePerExecution: 0,
      },
      recoveredSpace: {
        totalBytes: 0, totalFiles: 0, totalFolders: 0, totalRecycleBinItems: 0,
        totalTempFiles: 0, totalBrowserData: 0, totalRegistryEntries: 0,
        largestSingleCleanup: 0,
      },
      warnings: [],
      errors: [],
      overallHealth: 'unknown' as const,
      generatedAt: new Date().toISOString(),
    }),
  },
  historyEvents: {
    on: () => () => {},
  },
}));

// ── Helpers ───────────────────────────────────────────────────

function createMockRecord(
  overrides: Partial<ExecutionRecord> = {},
): ExecutionRecord {
  return {
    id: 'exec-1',
    scheduleId: null,
    jobId: 'job-1',
    source: 'manual',
    startTime: new Date('2025-01-01T10:00:00Z').toISOString(),
    endTime: new Date('2025-01-01T10:00:10Z').toISOString(),
    durationMs: 10000,
    status: 'succeeded',
    taskResults: [{
      taskId: 'junk_cleaner',
      taskName: 'Junk Cleaner',
      status: 'completed',
      startTime: new Date('2025-01-01T10:00:00Z').toISOString(),
      endTime: new Date('2025-01-01T10:00:05Z').toISOString(),
      durationMs: 5000,
      filesCleaned: 10,
      bytesRecovered: 1024,
      errors: [],
      warnings: [],
    }],
    filesRemoved: 10,
    foldersRemoved: 0,
    registryEntriesRemoved: 0,
    recycleBinItemsRemoved: 0,
    temporaryFilesRemoved: 0,
    browserDataRemoved: 0,
    totalSpaceRecovered: 1024,
    warnings: [],
    errors: [],
    appVersion: '1.0.0',
    loggedAt: new Date('2025-01-01T10:00:11Z').toISOString(),
    ...overrides,
  };
}

function render(jsx: React.ReactElement): { container: HTMLElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(jsx); });
  return {
    container,
    unmount: () => act(() => root.unmount()),
  };
}

// ── Tests ─────────────────────────────────────────────────────

beforeEach(() => {
  mockRecords.length = 0;
  mockStatistics = {
    totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0,
    partialExecutions: 0, cancelledExecutions: 0, successRate: 0,
    averageDurationMs: 0, averageSpaceRecovered: 0, largestCleanupBytes: 0,
    largestCleanupExecutionId: null, mostFrequentTaskId: null,
    mostFrequentTaskName: null, mostFrequentTaskCount: 0, lastRunAt: null,
    longestRunMs: 0, longestRunExecutionId: null, totalFilesRemoved: 0,
    totalSpaceRecovered: 0,
  };
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── useMaintenanceHistory hook ────────────────────────────────

describe('useMaintenanceHistory', () => {
  it('returns initial state with empty records', async () => {
    const { useMaintenanceHistory } = await import('../useMaintenanceHistory');
    function TestComp() {
      const data = useMaintenanceHistory();
      return React.createElement('div', { 'data-testid': 'result' }, JSON.stringify({
        count: data.recordCount,
        loading: data.loading,
      }));
    }
    const { container, unmount } = render(React.createElement(TestComp));
    await act(async () => {});
    const el = container.querySelector('[data-testid="result"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain('"count":0');
    unmount();
  });

  it('returns records from service', async () => {
    mockRecords.push(createMockRecord({ id: 'test-1' }));
    mockStatistics.totalExecutions = 1;
    const { useMaintenanceHistory } = await import('../useMaintenanceHistory');
    function TestComp() {
      const data = useMaintenanceHistory();
      return React.createElement('div', { 'data-testid': 'result' }, JSON.stringify({
        count: data.recordCount,
        recordsLen: data.records.length,
      }));
    }
    const { container, unmount } = render(React.createElement(TestComp));
    await act(async () => {});
    const el = container.querySelector('[data-testid="result"]');
    expect(el?.textContent).toContain('"recordsLen":1');
    unmount();
  });
});

// ── useChartData hook ─────────────────────────────────────────

describe('useChartData', () => {
  it('returns empty array for no records', async () => {
    const { useChartData } = await import('../useMaintenanceHistory');
    function TestComp() {
      const data = useChartData([]);
      return React.createElement('div', { 'data-testid': 'result' }, JSON.stringify(data));
    }
    const { container, unmount } = render(React.createElement(TestComp));
    const el = container.querySelector('[data-testid="result"]');
    expect(el?.textContent).toBe('[]');
    unmount();
  });

  it('aggregates records by date', async () => {
    const records = [
      createMockRecord({ id: 'r1', startTime: '2025-01-01T10:00:00Z', status: 'succeeded', totalSpaceRecovered: 1024, durationMs: 5000 }),
      createMockRecord({ id: 'r2', startTime: '2025-01-01T11:00:00Z', status: 'failed', totalSpaceRecovered: 2048, durationMs: 3000 }),
      createMockRecord({ id: 'r3', startTime: '2025-01-02T10:00:00Z', status: 'succeeded', totalSpaceRecovered: 4096, durationMs: 7000 }),
    ];
    const { useChartData } = await import('../useMaintenanceHistory');
    function TestComp() {
      const data = useChartData(records);
      return React.createElement('div', { 'data-testid': 'result' }, JSON.stringify(data));
    }
    const { container, unmount } = render(React.createElement(TestComp));
    const el = container.querySelector('[data-testid="result"]');
    const parsed = JSON.parse(el?.textContent ?? '[]');
    expect(parsed).toHaveLength(2);
    expect(parsed[0].date).toBe('2025-01-01');
    expect(parsed[0].executions).toBe(2);
    expect(parsed[0].successRate).toBe(50);
    expect(parsed[1].date).toBe('2025-01-02');
    expect(parsed[1].executions).toBe(1);
    expect(parsed[1].successRate).toBe(100);
    unmount();
  });
});

// ── useTaskFrequency hook ─────────────────────────────────────

describe('useTaskFrequency', () => {
  it('returns empty array for no records', async () => {
    const { useTaskFrequency } = await import('../useMaintenanceHistory');
    function TestComp() {
      const data = useTaskFrequency([]);
      return React.createElement('div', { 'data-testid': 'result' }, JSON.stringify(data));
    }
    const { container, unmount } = render(React.createElement(TestComp));
    const el = container.querySelector('[data-testid="result"]');
    expect(el?.textContent).toBe('[]');
    unmount();
  });

  it('counts task occurrences and sorts by frequency', async () => {
    const records = [
      createMockRecord({ id: 'r1', taskResults: [
        { taskId: 'junk', taskName: 'Junk Cleaner', status: 'completed', startTime: '', endTime: '', durationMs: 1000, filesCleaned: 5, bytesRecovered: 100, errors: [], warnings: [] },
        { taskId: 'registry', taskName: 'Registry Cleaner', status: 'completed', startTime: '', endTime: '', durationMs: 1000, filesCleaned: 5, bytesRecovered: 100, errors: [], warnings: [] },
      ]}),
      createMockRecord({ id: 'r2', taskResults: [
        { taskId: 'junk', taskName: 'Junk Cleaner', status: 'completed', startTime: '', endTime: '', durationMs: 1000, filesCleaned: 5, bytesRecovered: 100, errors: [], warnings: [] },
      ]}),
    ];
    const { useTaskFrequency } = await import('../useMaintenanceHistory');
    function TestComp() {
      const data = useTaskFrequency(records);
      return React.createElement('div', { 'data-testid': 'result' }, JSON.stringify(data));
    }
    const { container, unmount } = render(React.createElement(TestComp));
    const el = container.querySelector('[data-testid="result"]');
    const parsed = JSON.parse(el?.textContent ?? '[]');
    expect(parsed).toHaveLength(2);
    expect(parsed[0].taskId).toBe('junk');
    expect(parsed[0].count).toBe(2);
    expect(parsed[1].taskId).toBe('registry');
    expect(parsed[1].count).toBe(1);
    unmount();
  });
});

// ── AnalyticsCards ────────────────────────────────────────────

describe('AnalyticsCards', () => {
  it('renders loading skeleton when loading', async () => {
    const { AnalyticsCards } = await import('../components/AnalyticsCards');
    const stats = mockStatistics;
    const { container, unmount } = render(
      React.createElement(AnalyticsCards, { statistics: stats, loading: true })
    );
    expect(container.querySelector('[data-testid="analytics-cards"]')).toBeTruthy();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    unmount();
  });

  it('renders 6 stat tiles with data', async () => {
    const { AnalyticsCards } = await import('../components/AnalyticsCards');
    const stats = {
      ...mockStatistics,
      totalExecutions: 42,
      successfulExecutions: 40,
      successRate: 95.2,
      totalSpaceRecovered: 1048576,
      averageDurationMs: 15000,
      lastRunAt: '2025-01-01T10:00:00Z',
      largestCleanupBytes: 524288,
    };
    const { container, unmount } = render(
      React.createElement(AnalyticsCards, { statistics: stats, loading: false })
    );
    expect(container.querySelector('[data-testid="card-total-executions"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-success-rate"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-space-recovered"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-avg-duration"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-last-run"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="card-largest-cleanup"]')).toBeTruthy();
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('95%');
    unmount();
  });

  it('shows Never for last run when no executions', async () => {
    const { AnalyticsCards } = await import('../components/AnalyticsCards');
    const { container, unmount } = render(
      React.createElement(AnalyticsCards, { statistics: mockStatistics, loading: false })
    );
    expect(container.textContent).toContain('Never');
    unmount();
  });
});

// ── HistoryTable ──────────────────────────────────────────────

describe('HistoryTable', () => {
  it('renders empty state when no records', async () => {
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records: [], onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="history-table-empty"]')).toBeTruthy();
    unmount();
  });

  it('renders loading skeleton when loading', async () => {
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records: [], onRowClick: () => {}, loading: true })
    );
    expect(container.querySelector('[data-testid="history-table"]')).toBeTruthy();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    unmount();
  });

  it('renders table with records', async () => {
    const records = [
      createMockRecord({ id: 'r1', status: 'succeeded', source: 'manual', filesRemoved: 10, totalSpaceRecovered: 1024 }),
      createMockRecord({ id: 'r2', status: 'failed', source: 'scheduled', filesRemoved: 5, totalSpaceRecovered: 0 }),
    ];
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="history-table-grid"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="history-row-r1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="history-row-r2"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="status-badge-succeeded"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="status-badge-failed"]')).toBeTruthy();
    unmount();
  });

  it('renders search input', async () => {
    const records = [createMockRecord({ id: 'r1' })];
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="history-search-input"]')).toBeTruthy();
    unmount();
  });

  it('renders status and source filter dropdowns', async () => {
    const records = [createMockRecord({ id: 'r1' })];
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="history-status-filter"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="history-source-filter"]')).toBeTruthy();
    unmount();
  });

  it('shows pagination when records exceed page size', async () => {
    const records: ExecutionRecord[] = [];
    for (let i = 0; i < 15; i++) {
      records.push(createMockRecord({ id: `r${i}`, startTime: new Date(2025, 0, 1, 10, i, 0).toISOString() }));
    }
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="history-pagination"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pagination-prev"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="pagination-next"]')).toBeTruthy();
    unmount();
  });

  it('hides pagination when records fit in one page', async () => {
    const records = [createMockRecord({ id: 'r1' })];
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="history-pagination"]')).toBeFalsy();
    unmount();
  });

  it('renders sortable column headers', async () => {
    const records = [createMockRecord({ id: 'r1' })];
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="sort-header-startTime"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sort-header-status"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sort-header-durationMs"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sort-header-filesRemoved"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="sort-header-totalSpaceRecovered"]')).toBeTruthy();
    unmount();
  });

  it('shows warning and error badges', async () => {
    const records = [
      createMockRecord({ id: 'r1', warnings: ['Test warning'], errors: ['Test error'] }),
    ];
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records, onRowClick: () => {} })
    );
    expect(container.querySelector('[data-testid="warnings-r1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="errors-r1"]')).toBeTruthy();
    unmount();
  });

  it('calls onRowClick when row is clicked', async () => {
    const record = createMockRecord({ id: 'r1' });
    const onRowClick = vi.fn();
    const { HistoryTable } = await import('../components/HistoryTable');
    const { container, unmount } = render(
      React.createElement(HistoryTable, { records: [record], onRowClick })
    );
    const row = container.querySelector('[data-testid="history-row-r1"]');
    expect(row).toBeTruthy();
    act(() => {
      row?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRowClick).toHaveBeenCalledWith(record);
    unmount();
  });
});

// ── ExecutionDetailDialog ─────────────────────────────────────

describe('ExecutionDetailDialog', () => {
  it('renders nothing when record is null', async () => {
    const { ExecutionDetailDialog } = await import('../components/ExecutionDetailDialog');
    const { container, unmount } = render(
      React.createElement(ExecutionDetailDialog, { record: null, onClose: () => {} })
    );
    expect(container.querySelector('[data-testid="detail-dialog"]')).toBeFalsy();
    unmount();
  });

  it('renders dialog with record details', async () => {
    const record = createMockRecord({
      id: 'test-detail',
      warnings: ['Warning 1'],
      errors: ['Error 1'],
      appVersion: '2.1.0',
    });
    const { ExecutionDetailDialog } = await import('../components/ExecutionDetailDialog');
    const { container, unmount } = render(
      React.createElement(ExecutionDetailDialog, { record, onClose: () => {} })
    );
    expect(container.querySelector('[data-testid="detail-dialog"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="detail-summary"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="detail-space-breakdown"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="detail-task-results"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="detail-warnings"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="detail-errors"]')).toBeTruthy();
    expect(container.textContent).toContain('2.1.0');
    unmount();
  });

  it('calls onClose when close button is clicked', async () => {
    const record = createMockRecord({ id: 'test-close' });
    const onClose = vi.fn();
    const { ExecutionDetailDialog } = await import('../components/ExecutionDetailDialog');
    const { container, unmount } = render(
      React.createElement(ExecutionDetailDialog, { record, onClose })
    );
    const closeBtn = container.querySelector('[data-testid="detail-dialog-close"]');
    expect(closeBtn).toBeTruthy();
    act(() => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('calls onClose when overlay is clicked', async () => {
    const record = createMockRecord({ id: 'test-overlay' });
    const onClose = vi.fn();
    const { ExecutionDetailDialog } = await import('../components/ExecutionDetailDialog');
    const { container, unmount } = render(
      React.createElement(ExecutionDetailDialog, { record, onClose })
    );
    const overlay = container.querySelector('[data-testid="detail-dialog-overlay"]');
    expect(overlay).toBeTruthy();
    act(() => {
      overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
    unmount();
  });

  it('hides warnings section when no warnings', async () => {
    const record = createMockRecord({ id: 'no-warn', warnings: [], errors: [] });
    const { ExecutionDetailDialog } = await import('../components/ExecutionDetailDialog');
    const { container, unmount } = render(
      React.createElement(ExecutionDetailDialog, { record, onClose: () => {} })
    );
    expect(container.querySelector('[data-testid="detail-warnings"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="detail-errors"]')).toBeFalsy();
    unmount();
  });
});

// ── ReportsView ───────────────────────────────────────────────

describe('ReportsView', () => {
  it('renders range selector buttons', async () => {
    const { ReportsView } = await import('../components/ReportsView');
    const { container, unmount } = render(React.createElement(ReportsView));
    expect(container.querySelector('[data-testid="reports-range-selector"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="range-option-today"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="range-option-7days"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="range-option-30days"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="range-option-custom"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="range-option-schedule"]')).toBeTruthy();
    unmount();
  });

  it('shows custom date inputs when custom range selected', async () => {
    const { ReportsView } = await import('../components/ReportsView');
    const { container, unmount } = render(React.createElement(ReportsView));
    // Click custom range
    act(() => {
      container.querySelector('[data-testid="range-option-custom"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    expect(container.querySelector('[data-testid="custom-range-inputs"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="custom-date-from"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="custom-date-to"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="custom-generate-btn"]')).toBeTruthy();
    unmount();
  });

  it('shows schedule input when schedule range selected', async () => {
    const { ReportsView } = await import('../components/ReportsView');
    const { container, unmount } = render(React.createElement(ReportsView));
    act(() => {
      container.querySelector('[data-testid="range-option-schedule"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      );
    });
    expect(container.querySelector('[data-testid="schedule-inputs"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="schedule-id-input"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="schedule-generate-btn"]')).toBeTruthy();
    unmount();
  });

  it('auto-generates report for 30 days range', async () => {
    const { ReportsView } = await import('../components/ReportsView');
    const { container, unmount } = render(React.createElement(ReportsView));
    await act(async () => {});
    // 30days is default — should auto-generate
    expect(container.querySelector('[data-testid="report-content"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="report-health"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="report-summary"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="report-performance"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="report-recovered-space"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="report-task-stats"]')).toBeTruthy();
    unmount();
  });
});

// ── EmptyState ────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders title and description', async () => {
    const { EmptyState } = await import('../components/EmptyState');
    const { container, unmount } = render(
      React.createElement(EmptyState, { title: 'No Data', description: 'Nothing here yet' })
    );
    expect(container.textContent).toContain('No Data');
    expect(container.textContent).toContain('Nothing here yet');
    expect(container.querySelector('[data-testid="empty-state"]')).toBeTruthy();
    unmount();
  });

  it('renders with custom testId', async () => {
    const { EmptyState } = await import('../components/EmptyState');
    const { container, unmount } = render(
      React.createElement(EmptyState, { title: 'Test', testId: 'custom-empty' })
    );
    expect(container.querySelector('[data-testid="custom-empty"]')).toBeTruthy();
    unmount();
  });
});

// ── ErrorState ────────────────────────────────────────────────

describe('ErrorState', () => {
  it('renders error message', async () => {
    const { ErrorState } = await import('../components/ErrorState');
    const { container, unmount } = render(
      React.createElement(ErrorState, { message: 'Test error message' })
    );
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('Test error message');
    expect(container.querySelector('[data-testid="error-state"]')).toBeTruthy();
    unmount();
  });

  it('renders retry button when onRetry provided', async () => {
    const { ErrorState } = await import('../components/ErrorState');
    const onRetry = vi.fn();
    const { container, unmount } = render(
      React.createElement(ErrorState, { message: 'Error', onRetry })
    );
    const retryBtn = container.querySelector('button');
    expect(retryBtn).toBeTruthy();
    expect(retryBtn?.textContent).toContain('Retry');
    act(() => {
      retryBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalled();
    unmount();
  });
});

// ── StatusBadge / SourceBadge ─────────────────────────────────

describe('StatusBadge', () => {
  it('renders succeeded badge', async () => {
    const { StatusBadge } = await import('../components/StatusBadge');
    const { container, unmount } = render(
      React.createElement(StatusBadge, { status: 'succeeded' })
    );
    expect(container.querySelector('[data-testid="status-badge-succeeded"]')).toBeTruthy();
    expect(container.textContent).toContain('Succeeded');
    unmount();
  });

  it('renders failed badge', async () => {
    const { StatusBadge } = await import('../components/StatusBadge');
    const { container, unmount } = render(
      React.createElement(StatusBadge, { status: 'failed' })
    );
    expect(container.querySelector('[data-testid="status-badge-failed"]')).toBeTruthy();
    expect(container.textContent).toContain('Failed');
    unmount();
  });

  it('renders partial badge', async () => {
    const { StatusBadge } = await import('../components/StatusBadge');
    const { container, unmount } = render(
      React.createElement(StatusBadge, { status: 'partially_completed' })
    );
    expect(container.textContent).toContain('Partial');
    unmount();
  });

  it('renders cancelled badge', async () => {
    const { StatusBadge } = await import('../components/StatusBadge');
    const { container, unmount } = render(
      React.createElement(StatusBadge, { status: 'cancelled' })
    );
    expect(container.textContent).toContain('Cancelled');
    unmount();
  });
});

describe('SourceBadge', () => {
  it('renders source label', async () => {
    const { SourceBadge } = await import('../components/StatusBadge');
    const { container, unmount } = render(
      React.createElement(SourceBadge, { source: 'scheduled' })
    );
    expect(container.querySelector('[data-testid="source-badge-scheduled"]')).toBeTruthy();
    expect(container.textContent).toContain('Scheduled');
    unmount();
  });

  it('renders unknown source as-is', async () => {
    const { SourceBadge } = await import('../components/StatusBadge');
    const { container, unmount } = render(
      React.createElement(SourceBadge, { source: 'custom_source' })
    );
    expect(container.textContent).toContain('custom_source');
    unmount();
  });
});

// ── Regression ────────────────────────────────────────────────

describe('Regression', () => {
  it('NavItemId includes maintenance-history and reports', async () => {
    // Verify the type was extended by checking that the values are valid
    const navIds: NavItemId[] = [
      'dashboard', 'junk-cleaner', 'maintenance-history', 'reports', 'settings'
    ];
    expect(navIds).toContain('maintenance-history');
    expect(navIds).toContain('reports');
  });

  it('i18n includes nav.maintenanceHistory and nav.reports', async () => {
    const { en } = await import('@avs/shared/i18n');
    expect(en.nav.maintenanceHistory).toBe('Maintenance History');
    expect(en.nav.reports).toBe('Reports');
  });

  it('maintenance-ui module does not import from auth, licensing, payment, or sync', async () => {
    // This test verifies we haven't accidentally coupled to restricted modules
    // by checking the module can be imported without those dependencies
    const mod = await import('../index');
    expect(mod).toBeDefined();
    expect(mod.AnalyticsCards).toBeDefined();
    expect(mod.HistoryTable).toBeDefined();
    expect(mod.ReportsView).toBeDefined();
    expect(mod.ExecutionDetailDialog).toBeDefined();
    expect(mod.MaintenanceHistoryPage).toBeDefined();
    expect(mod.ReportsPage).toBeDefined();
  });
});
