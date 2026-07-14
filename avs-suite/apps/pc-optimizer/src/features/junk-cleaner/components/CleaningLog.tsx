import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import type { CleaningLogEntry } from '../junkCleaner.types';

export interface CleaningLogProps {
  entries: CleaningLogEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  query: string;
  categoryFilter: string | null;
  resultFilter: string | null;
  onQueryChange: (q: string) => void;
  onCategoryChange: (c: string | null) => void;
  onResultChange: (r: string | null) => void;
  onReload: () => void;
}

const RESULT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  success: 'success',
  partial: 'warning',
  cancelled: 'warning',
  failed: 'danger',
  nothing: 'neutral',
};

const RESULTS = ['success', 'partial', 'cancelled', 'failed'] as const;
const CATEGORIES = ['system', 'user', 'browsers', 'logs', 'applications'] as const;

/**
 * Searchable cleaning-history log. Backed by the SQLite history store
 * on the Python side; supports full-text search across cleaner name +
 * error payload, plus category and result filters. Exports as JSON or
 * CSV — file download uses a blob URL so no server round-trip.
 */
export function CleaningLog(props: CleaningLogProps) {
  const {
    entries,
    total,
    loading,
    error,
    query,
    categoryFilter,
    resultFilter,
    onQueryChange,
    onCategoryChange,
    onResultChange,
    onReload,
  } = props;

  // Debounce the search input so we don't hammer the RPC on every key.
  const [localQuery, setLocalQuery] = useState(query);
  useEffect(() => setLocalQuery(query), [query]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (localQuery !== query) onQueryChange(localQuery);
    }, 250);
    return () => clearTimeout(t);
  }, [localQuery, query, onQueryChange]);

  const exportJson = () => download(`avs-clean-log-${dateStamp()}.json`, JSON.stringify(entries, null, 2), 'application/json');
  const exportCsv = () => download(`avs-clean-log-${dateStamp()}.csv`, toCsv(entries), 'text/csv');

  const bytesRecoveredTotal = useMemo(
    () => entries.reduce((n, e) => n + (e.bytes_recovered || 0), 0),
    [entries],
  );

  return (
    <Card
      title="Cleaning history"
      className="mt-4"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onReload}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            data-testid="cleaning-log-refresh"
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={exportJson}
            leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
            disabled={entries.length === 0}
            data-testid="cleaning-log-export-json"
          >
            JSON
          </Button>
          <Button
            variant="secondary"
            onClick={exportCsv}
            leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
            disabled={entries.length === 0}
            data-testid="cleaning-log-export-csv"
          >
            CSV
          </Button>
        </div>
      }
      data-testid="cleaning-log"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search cleaner name or error text…"
            className="w-full rounded-md border border-border bg-surface-muted py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/40"
            data-testid="cleaning-log-search"
          />
        </div>
        <FilterSelect
          value={categoryFilter}
          onChange={onCategoryChange}
          placeholder="All categories"
          options={CATEGORIES}
          testId="cleaning-log-category-filter"
        />
        <FilterSelect
          value={resultFilter}
          onChange={onResultChange}
          placeholder="All results"
          options={RESULTS}
          testId="cleaning-log-result-filter"
        />
      </div>

      <div className="mb-2 text-xs text-text-muted">
        {loading
          ? 'Loading…'
          : `${entries.length.toLocaleString()} of ${total.toLocaleString()} entries · ${formatBytes(bytesRecoveredTotal)} recovered in view`}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-2 rounded-md border border-semantic-danger/40 bg-[color-mix(in_srgb,var(--avs-danger)_10%,transparent)] p-2 text-xs text-semantic-danger"
        >
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs" data-testid="cleaning-log-table">
          <thead>
            <tr className="border-b border-border bg-surface-muted uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-left font-medium">Action</th>
              <th className="px-3 py-2 text-left font-medium">Result</th>
              <th className="px-3 py-2 text-right font-medium">Recovered</th>
              <th className="px-3 py-2 text-right font-medium">Duration</th>
              <th className="px-3 py-2 text-right font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-6 text-center text-text-muted"
                  data-testid="cleaning-log-empty"
                >
                  No cleaning operations yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-border/60" data-testid={`cleaning-log-row-${e.id}`}>
                <td className="px-3 py-2 text-text-secondary tabular-nums">
                  {formatDate(e.started_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary">{e.cleaner_name}</span>
                    <Badge tone="neutral" className="uppercase">
                      {e.category}
                    </Badge>
                  </div>
                </td>
                <td className="px-3 py-2 text-text-secondary">{e.action}</td>
                <td className="px-3 py-2">
                  <Badge tone={RESULT_TONE[e.result] ?? 'neutral'}>{e.result}</Badge>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-primary">
                  {formatBytes(e.bytes_recovered)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                  {Math.max(1, Math.round(e.duration_ms / 100) / 10)}s
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.errors.count > 0 ? (
                    <Badge tone="warning">{e.errors.count}</Badge>
                  ) : (
                    <span className="text-text-muted">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  testId,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  options: readonly string[];
  testId: string;
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none"
      data-testid={testId}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function dateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

function toCsv(rows: CleaningLogEntry[]): string {
  const header = [
    'id',
    'started_at',
    'finished_at',
    'cleaner_id',
    'cleaner_name',
    'category',
    'action',
    'result',
    'files_removed',
    'bytes_recovered',
    'files_skipped',
    'files_failed',
    'duration_ms',
    'error_count',
  ];
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = rows.map((r) =>
    [
      r.id,
      r.started_at,
      r.finished_at,
      r.cleaner_id,
      r.cleaner_name,
      r.category,
      r.action,
      r.result,
      r.files_removed,
      r.bytes_recovered,
      r.files_skipped,
      r.files_failed,
      r.duration_ms,
      r.errors.count,
    ]
      .map(escape)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
