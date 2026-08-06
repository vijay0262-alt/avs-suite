import clsx from 'clsx';
import {
  ShieldCheckIcon,
  FireIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CpuChipIcon,
  CircleStackIcon,
  Battery50Icon,
  HeartIcon,
} from '@heroicons/react/24/outline';
import type { ProtectionCardData, CardStatus } from '../protectionCenter.types';

const iconMap: Record<string, typeof ShieldCheckIcon> = {
  ShieldCheckIcon,
  FireIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CpuChipIcon,
  CircleStackIcon,
  Battery50Icon,
  HeartIcon,
};

const statusConfig: Record<CardStatus, { dot: string; label: string }> = {
  active: { dot: 'bg-[var(--avs-success)]', label: 'text-[var(--avs-success)]' },
  warning: { dot: 'bg-[var(--avs-warning)]', label: 'text-[var(--avs-warning)]' },
  inactive: { dot: 'bg-[var(--avs-danger)]', label: 'text-[var(--avs-danger)]' },
  pending: { dot: 'bg-[var(--avs-text-muted)]', label: 'text-[var(--avs-text-muted)]' },
};

export interface ProtectionCardsProps {
  cards: ProtectionCardData[];
  onNavigate: (path: string) => void;
}

export function ProtectionCards({ cards, onNavigate }: ProtectionCardsProps) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      role="region"
      aria-label="Live protection cards"
    >
      {cards.map((card) => {
        const Icon = iconMap[card.iconName] ?? ShieldCheckIcon;
        const sc = statusConfig[card.status];
        return (
          <button
            key={card.id}
            onClick={() => card.actionPath && onNavigate(card.actionPath)}
            disabled={!card.actionPath}
            className={clsx(
              'group relative overflow-hidden rounded-[var(--avs-radius-lg)] p-4 text-left',
              'bg-gradient-surface border border-[var(--avs-border)]',
              'shadow-[var(--avs-shadow-sm)] transition-all duration-[var(--avs-duration-normal)]',
              card.actionPath && 'cursor-pointer hover:border-[var(--avs-border-hover)] hover:shadow-[var(--avs-shadow-md)]',
            )}
            aria-label={`${card.title}: ${card.statusLabel}`}
          >
            <div className="flex items-center justify-between mb-3">
              <Icon className="h-5 w-5 text-[var(--avs-text-muted)]" />
              <div className="flex items-center gap-1.5">
                <span className={clsx('h-2 w-2 rounded-full', sc.dot)} />
                <span className={clsx('text-caption font-medium', sc.label)}>{card.statusLabel}</span>
              </div>
            </div>

            <div className="text-statistic font-bold text-[var(--avs-text-primary)] tabular-nums">
              {card.primaryValue}
            </div>
            {card.secondaryValue && (
              <div className="text-caption text-[var(--avs-text-muted)] mt-0.5">{card.secondaryValue}</div>
            )}
            <div className="mt-2 text-small font-semibold text-[var(--avs-text-primary)]">{card.title}</div>
          </button>
        );
      })}
    </div>
  );
}
