/**
 * HistoryTable — searchable, sortable, paginated table of execution records.
 *
 * Columns:
 *   Date, Status, Source, Duration, Files Cleaned, Space Recovered,
 *   Tasks Executed, Warnings, Errors
 *
 * Features:
 *   - Column sorting (asc/desc)
 *   - Status/source filtering
 *   - Text search
 *   - Pagination
 *   - Row click → detail dialog
 *   - Status badges
 *   - Accessible (ARIA labels, keyboard navigation)
 */
import React, { useState, useMemo, useCallback } from 'react';
import { Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ExecutionRecord, ExecutionRecordStatus, ExecutionSource } from '../../maintenance-history';
import { StatusBadge, SourceBadge } from './StatusBadge';
import { EmptyState } from './EmptyState';

export interface HistoryTableProps {
  records: ExecutionRecord[];
  onRowClick: (record: ExecutionRecord) => void;
  loading?: boolean;
  testId?: string;
}

type SortField = 'startTime' | 'status' | 'source' | 'durationMs' | 'filesRemoved' | 'totalSpaceRecovered' | 'warnings' | 'errors';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

export const HistoryTable = React.memo(function HistoryTable({
  records,
  onRowClick,
  loading,
  testId,
}: HistoryTableProps) {
  const [sortField, setSortField] = useState<SortField>('startTime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExecutionRecordStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<ExecutionSource | 'all'>('all');
  const [page, setPage] = useState(0);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return field;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = [...records];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Source filter
    if (sourceFilter !== 'all') {
      result = result.filter((r) => r.source === sourceFilter);
    }

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => {
        return (
          r.id.toLowerCase().includes(q) ||
          r.taskResults.some((t) => t.taskName.toLowerCase().includes(q)) ||
          r.errors.some((e) => e.toLowerCase().includes(q)) ||
          r.warnings.some((w) => w.toLowerCase().includes(q))
        );
      });
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    return result;
  }, [records, sortField, sortDir, search, statusFilter, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageData = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const resetPage = useCallback(() => setPage(0), []);

  if (loading) {
    return (
      <div className="space-y-3" data-testid={testId ?? 'history-table'}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)]"
          />
        ))}
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <EmptyState
        title="No maintenance history"
        description="Your maintenance execution history will appear here after the first automated cleanup."
        testId="history-table-empty"
      />
    );
  }

  return (
    <div className="space-y-4" data-testid={testId ?? 'history-table'}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--avs-text-muted)]" />
          <input
            type="text"
            placeholder="Search executions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] py-2 pl-9 pr-3 text-small text-[var(--avs-text-primary)] outline-none focus:border-[var(--avs-brand-primary)]"
            aria-label="Search execution history"
            data-testid="history-search-input"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); resetPage(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--avs-text-muted)] hover:text-[var(--avs-text-primary)]"
              aria-label="Clear search"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as ExecutionRecordStatus | 'all'); resetPage(); }}
          className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-[var(--avs-text-primary)] outline-none focus:border-[var(--avs-brand-primary)]"
          aria-label="Filter by status"
          data-testid="history-status-filter"
        >
          <option value="all">All Statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="partially_completed">Partial</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Source filter */}
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value as ExecutionSource | 'all'); resetPage(); }}
          className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-[var(--avs-text-primary)] outline-none focus:border-[var(--avs-brand-primary)]"
          aria-label="Filter by source"
          data-testid="history-source-filter"
        >
          <option value="all">All Sources</option>
          <option value="scheduled">Scheduled</option>
          <option value="manual">Manual</option>
          <option value="quick_scan">Quick Scan</option>
          <option value="deep_clean">Deep Clean</option>
          <option value="browser_cleanup">Browser Cleanup</option>
          <option value="ai_recommended">AI Recommended</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)]">
        <table className="w-full text-small" role="table" data-testid="history-table-grid">
          <thead className="bg-[var(--avs-surface-muted)]">
            <tr>
              <SortHeader field="startTime" label="Date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="status" label="Status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="source" label="Source" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="durationMs" label="Duration" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="filesRemoved" label="Files" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="totalSpaceRecovered" label="Space" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-left font-medium text-[var(--avs-text-secondary)]">Tasks</th>
              <SortHeader field="warnings" label="Warn" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              <SortHeader field="errors" label="Errors" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {pageData.map((record) => (
              <tr
                key={record.id}
                onClick={() => onRowClick(record)}
                className="cursor-pointer border-t border-[var(--avs-border)] hover:bg-[var(--avs-surface-muted)] transition-colors outline-none focus-visible:shadow-[var(--avs-focus-ring)]"
                tabIndex={0}
                data-testid={`history-row-${record.id}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(record);
                  }
                }}
              >
                <td className="px-3 py-2 text-[var(--avs-text-primary)] whitespace-nowrap">
                  {new Date(record.startTime).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2"><StatusBadge status={record.status} /></td>
                <td className="px-3 py-2"><SourceBadge source={record.source} /></td>
                <td className="px-3 py-2 text-[var(--avs-text-secondary)] tabular-nums whitespace-nowrap">
                  {formatDuration(record.durationMs)}
                </td>
                <td className="px-3 py-2 text-[var(--avs-text-secondary)] tabular-nums">
                  {record.filesRemoved}
                </td>
                <td className="px-3 py-2 text-[var(--avs-text-secondary)] tabular-nums whitespace-nowrap">
                  {formatBytes(record.totalSpaceRecovered)}
                </td>
                <td className="px-3 py-2 text-[var(--avs-text-secondary)]">
                  {record.taskResults.length}
                </td>
                <td className="px-3 py-2">
                  {record.warnings.length > 0 ? (
                    <Badge tone="warning" data-testid={`warnings-${record.id}`}>{record.warnings.length}</Badge>
                  ) : (
                    <span className="text-[var(--avs-text-muted)]">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {record.errors.length > 0 ? (
                    <Badge tone="danger" data-testid={`errors-${record.id}`}>{record.errors.length}</Badge>
                  ) : (
                    <span className="text-[var(--avs-text-muted)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* No results */}
      {filtered.length === 0 && records.length > 0 && (
        <EmptyState
          title="No matching results"
          description="Try adjusting your search or filters."
          testId="history-no-results"
        />
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between" data-testid="history-pagination">
          <span className="text-caption text-[var(--avs-text-muted)]">
            Showing {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-1.5 text-[var(--avs-text-secondary)] hover:bg-[var(--avs-surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
              data-testid="pagination-prev"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-caption text-[var(--avs-text-secondary)]">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-1.5 text-[var(--avs-text-secondary)] hover:bg-[var(--avs-surface-muted)] disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
              data-testid="pagination-next"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Sortable header ───────────────────────────────────────────

function SortHeader({
  field,
  label,
  sortField,
  sortDir,
  onSort,
}: {
  field: SortField;
  label: string;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <th
      className="px-3 py-2 text-left font-medium text-[var(--avs-text-secondary)] cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(field)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSort(field);
      }}
      tabIndex={0}
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      data-testid={`sort-header-${field}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive &&
          (sortDir === 'asc' ? (
            <ChevronUpIcon className="h-3 w-3" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          ))}
      </span>
    </th>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
