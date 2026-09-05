import clsx from 'clsx';
import { memo } from 'react';
import { formatBytes } from '@avs/shared/utils';
import {
  ArchiveBoxIcon,
  CircleStackIcon,
  DocumentTextIcon,
  GlobeAltIcon,
  PhotoIcon,
  TrashIcon,
  BoltIcon,
  ArrowDownTrayIcon,
  BugAntIcon,
  ClockIcon,
  PuzzlePieceIcon,
  RectangleStackIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { CleanerCategory, CleanerSummary, ScanStatus } from '../junkCleaner.types';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'windows-temp': ArchiveBoxIcon,
  'user-temp': ArchiveBoxIcon,
  'recycle-bin': TrashIcon,
  'thumbnail-cache': PhotoIcon,
  prefetch: BoltIcon,
  'windows-update-cache': ArrowDownTrayIcon,
  'browser-cache': GlobeAltIcon,
  'browser-history': ClockIcon,
  'crash-dumps': BugAntIcon,
  'log-files': DocumentTextIcon,
  'event-logs': DocumentTextIcon,
  'icon-cache': RectangleStackIcon,
  'recent-items': ClockIcon,
  'chkdsk-fragments': PuzzlePieceIcon,
};

// Cleaners that are opt-in (unchecked by default) because they have
// side effects like logging users out of websites.
const OPT_IN_CLEANERS = new Set(['browser-history']);

const STATUS_DOT: Record<ScanStatus, string> = {
  pending: 'bg-text-muted',
  running: 'bg-brand-primary animate-pulse',
  completed: 'bg-semantic-success',
  cancelled: 'bg-semantic-warning',
  failed: 'bg-semantic-danger',
};

function severityFromBytes(bytes: number): { pct: number; color: string } {
  if (bytes === 0) return { pct: 0, color: 'var(--avs-success)' };
  if (bytes < 50 * 1024 * 1024) return { pct: 25, color: 'var(--avs-success)' };
  if (bytes < 200 * 1024 * 1024) return { pct: 50, color: 'var(--avs-warning)' };
  if (bytes < 1024 * 1024 * 1024) return { pct: 75, color: 'var(--avs-warning)' };
  return { pct: 100, color: 'var(--avs-danger)' };
}

export interface CategoryRowProps {
  id: string;
  name: string;
  description: string;
  category: CleanerCategory;
  summary: CleanerSummary | undefined;
  selected: boolean;
  disabled: boolean;
  detailsAvailable: boolean;
  onToggle: (id: string) => void;
  onViewDetails: (id: string) => void;
}

export const CategoryRow = memo(function CategoryRow({
  id,
  name,
  description,
  summary,
  selected,
  disabled,
  detailsAvailable,
  onToggle,
  onViewDetails,
}: CategoryRowProps) {
  const Icon = ICONS[id] ?? CircleStackIcon;
  const status: ScanStatus = summary?.status ?? 'pending';
  const progress = summary?.progress ?? (status === 'completed' ? 100 : 0);
  const files = summary?.totalFiles ?? 0;
  const bytes = summary?.totalBytes ?? 0;
  const hasData = files > 0 && status === 'completed';
  const severity = severityFromBytes(bytes);

  return (
    <div
      onClick={() => !disabled && onToggle(id)}
      className={clsx(
        'group relative cursor-pointer overflow-hidden rounded-[var(--avs-radius-lg)] border transition-all',
        'outline-none focus-visible:shadow-focus',
        disabled && 'cursor-not-allowed opacity-60',
        selected
          ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_4%,transparent)]'
          : 'border-[var(--avs-border)] bg-[var(--avs-surface)] hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_35%,var(--avs-border))]',
      )}
      data-testid={`junk-category-row-${id}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Checkbox */}
        <div
          className={clsx(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
            selected
              ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
              : 'border-[var(--avs-border)] bg-transparent',
          )}
        >
          {selected && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
        </div>

        {/* Icon */}
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)] transition-colors',
            selected
              ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)] text-[var(--avs-brand-primary)]'
              : 'bg-[var(--avs-surface-muted)] text-text-secondary group-hover:text-[var(--avs-brand-primary)]',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-small font-semibold text-text-primary">{name}</span>
            {OPT_IN_CLEANERS.has(id) && (
              <span
                className="flex items-center gap-0.5 text-caption text-semantic-warning"
                title="Opt-in: unchecked by default. Deleting cookies will log you out of websites."
              >
                <ExclamationTriangleIcon className="h-3 w-3" />
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-caption text-text-muted">{description}</p>
        </div>

        {/* Stats */}
        <div className="flex shrink-0 flex-col items-end text-right">
          <span
            className={clsx(
              'text-small font-semibold tabular-nums',
              bytes > 0 ? 'text-text-primary' : 'text-text-muted',
            )}
            data-testid={`junk-category-bytes-${id}`}
          >
            {formatBytes(bytes)}
          </span>
          <div className="flex items-center gap-1.5">
            {status !== 'pending' && (
              <span
                className={clsx('h-1.5 w-1.5 rounded-full', STATUS_DOT[status])}
                data-testid={`junk-category-status-${id}`}
              />
            )}
            <span className="text-caption text-text-muted tabular-nums">
              {files.toLocaleString()} files
            </span>
          </div>
        </div>

        {/* Details link */}
        {detailsAvailable && hasData ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails(id);
            }}
            className="flex shrink-0 items-center gap-0.5 rounded-[var(--avs-radius-md)] px-2 py-1 text-caption font-medium text-[var(--avs-brand-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--avs-brand-primary)_8%,transparent)]"
            data-testid={`junk-category-details-${id}`}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="w-6 shrink-0" />
        )}
      </div>

      {/* Severity / progress bar at bottom */}
      {status === 'running' ? (
        <div className="h-0.5 w-full bg-[var(--avs-surface-muted)]">
          <div
            className="h-full bg-brand-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
            data-testid={`junk-category-progress-${id}`}
          />
        </div>
      ) : (
        bytes > 0 && (
          <div className="h-0.5 w-full bg-[var(--avs-surface-muted)]">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${severity.pct}%`, backgroundColor: severity.color }}
            />
          </div>
        )
      )}
    </div>
  );
});
