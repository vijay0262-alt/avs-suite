import clsx from 'clsx';
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
  'crash-dumps': BugAntIcon,
  'log-files': DocumentTextIcon,
};

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
 * Single row in the Junk Cleaner category list. Displays icon, label,
 * status pill, live progress, file count / size, and "View details".
 */
export function CategoryRow({
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

  return (
    <div
      className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3"
      data-testid={`junk-category-row-${id}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(id)}
        disabled={disabled}
        className="h-4 w-4 accent-brand-primary"
        aria-label={`Include ${name} in scan`}
        data-testid={`junk-category-check-${id}`}
      />

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--avs-brand-primary)_12%,transparent)] text-brand-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-text-primary">{name}</span>
          <Badge tone="neutral" className="uppercase tracking-wide">
            {CATEGORY_LABEL[category]}
          </Badge>
          <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-text-secondary">{description}</p>

        {status === 'running' && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full bg-brand-primary transition-[width] duration-200"
              style={{ width: `${progress}%` }}
              data-testid={`junk-category-progress-${id}`}
            />
          </div>
        )}
      </div>

      <div className="hidden shrink-0 flex-col items-end text-right sm:flex">
        <span
          className={clsx(
            'text-sm font-semibold tabular-nums',
            bytes > 0 ? 'text-text-primary' : 'text-text-muted',
          )}
          data-testid={`junk-category-bytes-${id}`}
        >
          {formatBytes(bytes)}
        </span>
        <span className="text-xs text-text-muted tabular-nums">
          {files.toLocaleString()} files
        </span>
      </div>

      <button
        type="button"
        onClick={() => onViewDetails(id)}
        disabled={!detailsAvailable || files === 0}
        className={clsx(
          'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
          'outline-none focus-visible:shadow-[var(--avs-focus-ring)]',
          detailsAvailable && files > 0
            ? 'bg-surface-muted text-text-primary hover:bg-border'
            : 'cursor-not-allowed bg-surface-muted text-text-muted opacity-60',
        )}
        data-testid={`junk-category-details-${id}`}
      >
        View details
      </button>
    </div>
  );
}
