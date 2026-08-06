import clsx from 'clsx';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { ProtectionState, ProtectionLevel } from '../protectionCenter.types';

const levelConfig: Record<
  ProtectionLevel,
  {
    icon: typeof ShieldCheckIcon;
    bg: string;
    border: string;
    iconColor: string;
    titleColor: string;
    pulse: boolean;
  }
> = {
  fully_protected: {
    icon: ShieldCheckIcon,
    bg: 'bg-[color-mix(in_srgb,var(--avs-success)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--avs-success)_30%,transparent)]',
    iconColor: 'text-[var(--avs-success)]',
    titleColor: 'text-[var(--avs-success)]',
    pulse: false,
  },
  partially_protected: {
    icon: ExclamationTriangleIcon,
    bg: 'bg-[color-mix(in_srgb,var(--avs-warning)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--avs-warning)_30%,transparent)]',
    iconColor: 'text-[var(--avs-warning)]',
    titleColor: 'text-[var(--avs-warning)]',
    pulse: false,
  },
  at_risk: {
    icon: ShieldExclamationIcon,
    bg: 'bg-[color-mix(in_srgb,var(--avs-danger)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--avs-danger)_30%,transparent)]',
    iconColor: 'text-[var(--avs-danger)]',
    titleColor: 'text-[var(--avs-danger)]',
    pulse: true,
  },
  unknown: {
    icon: ArrowPathIcon,
    bg: 'bg-[var(--avs-surface-muted)]',
    border: 'border-[var(--avs-border)]',
    iconColor: 'text-[var(--avs-text-muted)]',
    titleColor: 'text-[var(--avs-text-muted)]',
    pulse: false,
  },
};

export interface ProtectionBannerProps {
  state: ProtectionState;
  onRefresh: () => void;
  lastRefresh: number | null;
}

export function ProtectionBanner({ state, onRefresh, lastRefresh }: ProtectionBannerProps) {
  const config = levelConfig[state.level];
  const Icon = config.icon;

  const refreshLabel = lastRefresh
    ? `Updated ${new Date(lastRefresh).toLocaleTimeString()}`
    : 'Not yet updated';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={state.headline}
      className={clsx(
        'relative overflow-hidden rounded-[var(--avs-radius-xl)] border p-6',
        config.bg,
        config.border,
        'transition-all duration-[var(--avs-duration-normal)]',
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={clsx(
            'flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--avs-radius-lg)]',
            'bg-[var(--avs-surface)] shadow-[var(--avs-shadow-sm)]',
            config.pulse && 'animate-pulse',
          )}
        >
          <Icon className={clsx('h-7 w-7', config.iconColor)} />
        </div>

        <div className="flex-1 min-w-0">
          <h1 className={clsx('text-xl font-bold', config.titleColor)}>
            {state.headline}
          </h1>
          <p className="mt-1 text-sm text-[var(--avs-text-secondary)]">
            {state.subheadline}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-[var(--avs-radius-md)] px-3 py-1.5 text-xs font-medium text-[var(--avs-text-secondary)] hover:bg-[var(--avs-surface-muted)] transition-colors"
            aria-label="Refresh protection status"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
          <span className="text-xs text-[var(--avs-text-muted)]">{refreshLabel}</span>
        </div>
      </div>
    </div>
  );
}
