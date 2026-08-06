import clsx from 'clsx';
import {
  BoltIcon,
  ShieldCheckIcon,
  TrashIcon,
  RocketLaunchIcon,
  ComputerDesktopIcon,
  DocumentChartBarIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import type { QuickAction } from '../protectionCenter.types';

const iconMap: Record<string, typeof BoltIcon> = {
  BoltIcon,
  ShieldCheckIcon,
  TrashIcon,
  RocketLaunchIcon,
  ComputerDesktopIcon,
  DocumentChartBarIcon,
};

const toneConfig: Record<string, string> = {
  brand: 'text-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_12%,transparent)]',
  success: 'text-[var(--avs-success)] bg-[color-mix(in_srgb,var(--avs-success)_12%,transparent)]',
  warning: 'text-[var(--avs-warning)] bg-[color-mix(in_srgb,var(--avs-warning)_12%,transparent)]',
  danger: 'text-[var(--avs-danger)] bg-[color-mix(in_srgb,var(--avs-danger)_12%,transparent)]',
  info: 'text-[var(--avs-info)] bg-[color-mix(in_srgb,var(--avs-info)_12%,transparent)]',
  neutral: 'text-[var(--avs-text-muted)] bg-[var(--avs-surface-muted)]',
};

export interface QuickActionsProps {
  actions: QuickAction[];
  onNavigate: (path: string) => void;
  isPro: boolean;
}

export function QuickActions({ actions, onNavigate, isPro }: QuickActionsProps) {
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      role="region"
      aria-label="Quick actions"
    >
      {actions.map((action) => {
        const Icon = iconMap[action.iconName] ?? BoltIcon;
        const locked = action.proOnly && !isPro;
        return (
          <button
            key={action.id}
            onClick={() => !locked && onNavigate(action.path)}
            disabled={locked}
            className={clsx(
              'group flex flex-col items-start gap-2 rounded-[var(--avs-radius-md)] p-3 text-left',
              'border border-[var(--avs-border)] bg-gradient-surface',
              'transition-all duration-[var(--avs-duration-normal)]',
              locked
                ? 'opacity-60 cursor-not-allowed'
                : 'cursor-pointer hover:border-[var(--avs-border-hover)] hover:shadow-[var(--avs-shadow-sm)]',
            )}
            aria-label={`${action.label}: ${action.description}`}
          >
            <div className="flex items-center gap-2">
              <div className={clsx('flex h-8 w-8 items-center justify-center rounded-[var(--avs-radius-md)]', toneConfig[action.tone] ?? toneConfig.brand)}>
                <Icon className="h-4 w-4" />
              </div>
              {action.proOnly && (
                <StarIcon className="h-3.5 w-3.5 text-[var(--avs-brand-primary)]" />
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--avs-text-primary)]">{action.label}</div>
              <div className="text-xs text-[var(--avs-text-muted)]">{action.description}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
