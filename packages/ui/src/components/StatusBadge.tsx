import clsx from 'clsx';

export type StatusType =
  | 'protected'
  | 'scanning'
  | 'paused'
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'inactive'
  | 'pending';

export interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_CONFIG: Record<StatusType, { label: string; dotClass: string; textClass: string; bgClass: string; pulse?: boolean }> = {
  protected: {
    label: 'Protected',
    dotClass: 'bg-[var(--avs-success)]',
    textClass: 'text-[var(--avs-success)]',
    bgClass: 'bg-[var(--avs-success-bg)]',
  },
  scanning: {
    label: 'Scanning',
    dotClass: 'bg-[var(--avs-brand-primary)]',
    textClass: 'text-[var(--avs-brand-primary)]',
    bgClass: 'bg-[var(--avs-info-bg)]',
    pulse: true,
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-[var(--avs-warning)]',
    textClass: 'text-[var(--avs-warning)]',
    bgClass: 'bg-[var(--avs-warning-bg)]',
  },
  healthy: {
    label: 'Healthy',
    dotClass: 'bg-[var(--avs-success)]',
    textClass: 'text-[var(--avs-success)]',
    bgClass: 'bg-[var(--avs-success-bg)]',
  },
  warning: {
    label: 'Warning',
    dotClass: 'bg-[var(--avs-warning)]',
    textClass: 'text-[var(--avs-warning)]',
    bgClass: 'bg-[var(--avs-warning-bg)]',
  },
  critical: {
    label: 'Critical',
    dotClass: 'bg-[var(--avs-danger)]',
    textClass: 'text-[var(--avs-danger)]',
    bgClass: 'bg-[var(--avs-danger-bg)]',
    pulse: true,
  },
  inactive: {
    label: 'Inactive',
    dotClass: 'bg-[var(--avs-text-muted)]',
    textClass: 'text-[var(--avs-text-muted)]',
    bgClass: 'bg-[var(--avs-surface-muted)]',
  },
  pending: {
    label: 'Pending',
    dotClass: 'bg-[var(--avs-info)]',
    textClass: 'text-[var(--avs-info)]',
    bgClass: 'bg-[var(--avs-info-bg)]',
  },
};

const SIZES = {
  sm: 'px-2 py-0.5 text-caption gap-1.5',
  md: 'px-2.5 py-1 text-small gap-2',
};

const DOT_SIZES = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
};

/**
 * StatusBadge — standardized status indicator with colored dot and label.
 *
 * Statuses: protected, scanning, paused, healthy, warning, critical, inactive, pending.
 * Scanning and critical statuses pulse to draw attention.
 */
export function StatusBadge({ status, label, size = 'sm', className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const displayLabel = label ?? config.label;

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-medium',
        config.bgClass,
        config.textClass,
        SIZES[size],
        className,
      )}
      role="status"
    >
      <span
        className={clsx(
          'rounded-full shrink-0',
          config.dotClass,
          DOT_SIZES[size],
          config.pulse && 'animate-pulse',
        )}
        aria-hidden
      />
      {displayLabel}
    </span>
  );
}
