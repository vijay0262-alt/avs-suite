import clsx from 'clsx';
import { memo } from 'react';
import { Badge } from '@avs/ui';
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

const STATUS_TONE: Record<ScanStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  pending: 'neutral',
  running: 'brand',
  completed: 'success',
  cancelled: 'warning',
  failed: 'danger',
};

const STATUS_LABEL: Record<ScanStatus, string> = {
  pending: 'Pending',
  running: 'Scanning',
  completed: 'Complete',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

const CATEGORY_LABEL: Record<CleanerCategory, string> = {
  system: 'System',
  user: 'User',
  applications: 'Apps',
  browsers: 'Browsers',
  logs: 'Logs',
};

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

/**
 * Category card for the Junk Cleaner. Displays icon, label,
 * status badge, file count / size, and a selectable state.
 * Clicking the card toggles selection; the details link opens the file list.
 */
export const CategoryRow = memo(function CategoryRow({
  id,
  name,
  description,
  category,
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

  return (
    <div
      onClick={() => !disabled && onToggle(id)}
      className={clsx(
        'group relative flex cursor-pointer items-center gap-4 rounded-[var(--avs-radius-lg)] border-2 px-4 py-3 transition-all',
        'outline-none focus-visible:shadow-focus',
        disabled && 'cursor-not-allowed opacity-60',
        selected
          ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)]'
          : 'border-[var(--avs-border)] bg-[var(--avs-surface)] hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_40%,var(--avs-border))]',
      )}
      data-testid={`junk-category-row-${id}`}
    >
      {/* Selection indicator */}
      <div
        className={clsx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
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
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)] transition-colors',
          selected
            ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)] text-[var(--avs-brand-primary)]'
            : 'bg-[var(--avs-info-bg)] text-[var(--avs-brand-primary)]',
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-small font-semibold text-text-primary">{name}</span>
          <Badge tone="neutral" className="uppercase tracking-wide">
            {CATEGORY_LABEL[category]}
          </Badge>
          {OPT_IN_CLEANERS.has(id) && (
            <span
              className="flex items-center gap-1 text-caption text-semantic-warning"
              title="Opt-in: unchecked by default. Deleting cookies will log you out of websites."
            >
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              Opt-in
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-caption text-text-secondary">{description}</p>

        {status === 'running' && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--avs-surface-muted)]">
            <div
              className="h-full bg-brand-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
              data-testid={`junk-category-progress-${id}`}
            />
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="hidden shrink-0 flex-col items-end text-right sm:flex">
        <span
          className={clsx(
            'text-small font-semibold tabular-nums',
            bytes > 0 ? 'text-text-primary' : 'text-text-muted',
          )}
          data-testid={`junk-category-bytes-${id}`}
        >
          {formatBytes(bytes)}
        </span>
        <span className="text-caption text-text-muted tabular-nums">
          {files.toLocaleString()} files
        </span>
      </div>

      {/* Status badge */}
      {status !== 'pending' && (
        <Badge tone={STATUS_TONE[status]} className="shrink-0" data-testid={`junk-category-status-${id}`}>
          {STATUS_LABEL[status]}
        </Badge>
      )}

      {/* Details link */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onViewDetails(id);
        }}
        disabled={!detailsAvailable || !hasData}
        className={clsx(
          'flex shrink-0 items-center gap-1 rounded-[var(--avs-radius-md)] px-2 py-1.5 text-caption font-medium transition-colors',
          detailsAvailable && hasData
            ? 'text-[var(--avs-brand-primary)] hover:bg-[color-mix(in_srgb,var(--avs-brand-primary)_8%,transparent)]'
            : 'cursor-not-allowed text-text-muted opacity-50',
        )}
        data-testid={`junk-category-details-${id}`}
      >
        Details
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});
