/**
 * ResultCardsGrid — premium result cards with multiple metrics per card.
 *
 * Each card shows a title, icon, status, and a list of metrics.
 * Used for before/after comparisons, threat summaries, privacy items, etc.
 */
import type { ReactNode } from 'react';
import {
  CircleStackIcon,
  ClockIcon,
  ShieldCheckIcon,
  EyeSlashIcon,
  CpuChipIcon,
  RocketLaunchIcon,
  HeartIcon,
  GlobeAltIcon,
  DocumentDuplicateIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedResultCardData } from '../unifiedResultsTypes';

const ICONS: Record<string, ReactNode> = {
  CircleStackIcon: <CircleStackIcon className="h-5 w-5" />,
  ClockIcon: <ClockIcon className="h-5 w-5" />,
  ShieldCheckIcon: <ShieldCheckIcon className="h-5 w-5" />,
  EyeSlashIcon: <EyeSlashIcon className="h-5 w-5" />,
  CpuChipIcon: <CpuChipIcon className="h-5 w-5" />,
  RocketLaunchIcon: <RocketLaunchIcon className="h-5 w-5" />,
  HeartIcon: <HeartIcon className="h-5 w-5" />,
  GlobeAltIcon: <GlobeAltIcon className="h-5 w-5" />,
  DocumentDuplicateIcon: <DocumentDuplicateIcon className="h-5 w-5" />,
  ServerStackIcon: <ServerStackIcon className="h-5 w-5" />,
};

const STATUS_BORDER: Record<string, string> = {
  good: 'border-semantic-success/20',
  warning: 'border-semantic-warning/20',
  danger: 'border-semantic-danger/20',
};

const STATUS_DOT: Record<string, string> = {
  good: 'bg-semantic-success',
  warning: 'bg-semantic-warning',
  danger: 'bg-semantic-danger',
};

const METRIC_TONE: Record<string, string> = {
  default: 'text-text-primary',
  success: 'text-semantic-success',
  warning: 'text-semantic-warning',
  danger: 'text-semantic-danger',
};

export interface ResultCardsGridProps {
  cards: UnifiedResultCardData[];
}

export function ResultCardsGrid({ cards }: ResultCardsGridProps) {
  if (cards.length === 0) return null;

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      data-testid="result-cards-grid"
      role="group"
      aria-label="Scan result cards"
    >
      {cards.map((card) => (
        <ResultCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function ResultCard({ card }: { card: UnifiedResultCardData }) {
  const icon = ICONS[card.icon] ?? <CircleStackIcon className="h-5 w-5" />;
  const borderClass = card.status ? STATUS_BORDER[card.status] : 'border-[var(--avs-border)]';

  return (
    <div
      className={`rounded-[var(--avs-radius-lg)] border ${borderClass} bg-[var(--avs-surface)] p-4 transition-all hover:shadow-lg`}
      data-testid={`result-card-${card.id}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-brand-primary">{icon}</span>
        <span className="text-small font-medium text-text-primary flex-1">{card.title}</span>
        {card.status && (
          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[card.status]}`} aria-hidden />
        )}
      </div>

      {/* Metrics */}
      <div className="space-y-2">
        {card.metrics.map((metric, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-caption text-text-muted">{metric.label}</span>
            <span className={`text-small font-bold tabular-nums ${METRIC_TONE[metric.tone ?? 'default']}`}>
              {metric.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
