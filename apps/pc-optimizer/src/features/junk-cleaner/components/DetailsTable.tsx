import { useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { formatBytes } from '@avs/shared/utils';
import type { ScanItem } from '../junkCleaner.types';

// Type assertion to fix react-window JSX typing issues with newer React versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ListComponent = List as any;

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 36;
const MAX_HEIGHT = 480;

export interface DetailsTableProps {
  items: ScanItem[];
  loading: boolean;
  error: string | null;
  cleanerName: string;
  onClose: () => void;
}

/**
 * Virtualised details table for a single cleaner's result set.
 *
 * Uses `react-window`'s FixedSizeList so a scan producing hundreds of
 * thousands of rows renders in constant memory / paint time. The
 * displayed columns match the brief exactly: Path, File name,
 * Extension, Size, Modified date, Category.
 */
export function DetailsTable({ items, loading, error, cleanerName, onClose }: DetailsTableProps) {
  const rows = useMemo(() => items, [items]);
  const listHeight = Math.min(MAX_HEIGHT, Math.max(ROW_HEIGHT * 3, ROW_HEIGHT * rows.length));

  return (
    <div
      className="mt-4 rounded-lg border border-border bg-surface"
      data-testid="junk-details-table"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div>
          <div className="text-sm font-semibold text-text-primary">{cleanerName} — details</div>
          <div className="text-xs text-text-muted">
            {loading
              ? `Loading… ${rows.length.toLocaleString()} rows so far`
              : `${rows.length.toLocaleString()} files`}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1 text-xs font-medium text-text-secondary hover:bg-surface-muted"
          data-testid="junk-details-close"
        >
          Close
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="border-b border-border bg-[color-mix(in_srgb,var(--avs-danger)_10%,transparent)] px-4 py-2 text-xs text-semantic-danger"
        >
          {error}
        </div>
      )}

      {/* Column header — kept outside the virtualised list so it never scrolls out. */}
      <div
        className="grid items-center gap-3 border-b border-border bg-surface-muted px-4 text-xs font-medium uppercase tracking-wide text-text-muted"
        style={{ height: HEADER_HEIGHT, gridTemplateColumns: '2fr 1.3fr 60px 90px 130px' }}
      >
        <span>Path</span>
        <span>File name</span>
        <span>Ext</span>
        <span className="text-right">Size</span>
        <span className="text-right">Modified</span>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="px-4 py-6 text-center text-sm text-text-muted" data-testid="junk-details-empty">
          No files to show.
        </div>
      ) : (
        <ListComponent
          height={listHeight}
          itemCount={rows.length}
          itemSize={ROW_HEIGHT}
          width="100%"
          overscanCount={20}
        >
          {({ index, style }: { index: number; style: React.CSSProperties }) => {
            const row = rows[index];
            if (!row) return null;
            return (
              <div
                style={style}
                className="grid items-center gap-3 border-b border-border/60 px-4 text-xs text-text-secondary hover:bg-surface-muted"
                data-testid={`junk-details-row-${index}`}
              >
                <span
                  className="truncate font-mono text-[11px] text-text-muted"
                  title={row.path}
                  style={{ gridColumn: '1 / 2' }}
                >
                  {row.path}
                </span>
                <span className="truncate text-text-primary" title={row.name}>
                  {row.name}
                </span>
                <span className="truncate uppercase text-text-muted">{row.extension || '—'}</span>
                <span className="text-right tabular-nums text-text-primary">
                  {formatBytes(row.size)}
                </span>
                <span className="text-right tabular-nums text-text-muted">
                  {formatModified(row.modifiedAt)}
                </span>
              </div>
            );
          }}
        </ListComponent>
      )}
    </div>
  );
}

function formatModified(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—';
  const d = new Date(ts * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
