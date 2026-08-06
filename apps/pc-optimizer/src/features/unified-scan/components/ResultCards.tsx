/**
 * ResultCards — premium result cards showing before/after improvements.
 *
 * Each card displays a metric with current value, improved value,
 * and the difference, highlighting positive changes in green.
 */
import type { ReactNode } from 'react';
import {
  CircleStackIcon,
  ClockIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  HeartIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedResultCard } from '../unifiedScanTypes';

const ICONS: Record<string, ReactNode> = {
  CircleStackIcon: <CircleStackIcon className="h-5 w-5" />,
  ClockIcon: <ClockIcon className="h-5 w-5" />,
  EyeSlashIcon: <EyeSlashIcon className="h-5 w-5" />,
  ShieldCheckIcon: <ShieldCheckIcon className="h-5 w-5" />,
  RocketLaunchIcon: <RocketLaunchIcon className="h-5 w-5" />,
  HeartIcon: <HeartIcon className="h-5 w-5" />,
};

export interface ResultCardsProps {
  cards: UnifiedResultCard[];
}

function ResultCard({ card }: { card: UnifiedResultCard }) {
  const icon = ICONS[card.icon] ?? <CircleStackIcon className="h-5 w-5" />;

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-4 transition-all hover:border-brand-primary/30 hover:shadow-lg"
      data-testid={`result-card-${card.id}`}
    >
      <div className="flex items-center gap-2 mb-3 text-brand-primary">
        {icon}
        <span className="text-sm font-medium text-text-primary">{card.title}</span>
      </div>

      <div className="flex items-end justify-between gap-2">
        {/* Before */}
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-text-muted">Before</div>
          <div className="text-lg font-semibold tabular-nums text-text-muted">
            {card.currentValue}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center pb-1">
          {card.positive ? (
            <ArrowTrendingUpIcon className="h-5 w-5 text-semantic-success" aria-hidden />
          ) : (
            <ArrowTrendingDownIcon className="h-5 w-5 text-semantic-warning" aria-hidden />
          )}
        </div>

        {/* After */}
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-text-muted">After</div>
          <div className={`text-lg font-bold tabular-nums ${card.positive ? 'text-semantic-success' : 'text-text-primary'}`}>
            {card.improvedValue}
          </div>
        </div>
      </div>

      {/* Difference badge */}
      <div className="mt-3 flex justify-center">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            card.positive
              ? 'bg-semantic-success/10 text-semantic-success'
              : 'bg-semantic-warning/10 text-semantic-warning'
          }`}
        >
          {card.difference}
        </span>
      </div>
    </div>
  );
}

export function ResultCards({ cards }: ResultCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      data-testid="unified-result-cards"
      role="group"
      aria-label="Scan results"
    >
      {cards.map((card) => (
        <ResultCard key={card.id} card={card} />
      ))}
    </div>
  );
}
