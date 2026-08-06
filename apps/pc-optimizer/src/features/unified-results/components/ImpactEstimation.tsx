/**
 * ImpactEstimation — grid of estimated improvements.
 *
 * Shows storage recovery, memory recovery, startup improvement,
 * performance gain, and estimated time with current vs estimated values.
 */
import type { ReactNode } from 'react';
import {
  CircleStackIcon,
  CpuChipIcon,
  ClockIcon,
  RocketLaunchIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedImpactEstimate } from '../unifiedResultsTypes';

const ICONS: Record<string, ReactNode> = {
  CircleStackIcon: <CircleStackIcon className="h-5 w-5" />,
  CpuChipIcon: <CpuChipIcon className="h-5 w-5" />,
  ClockIcon: <ClockIcon className="h-5 w-5" />,
  RocketLaunchIcon: <RocketLaunchIcon className="h-5 w-5" />,
};

export interface ImpactEstimationProps {
  estimates: UnifiedImpactEstimate[];
}

export function ImpactEstimation({ estimates }: ImpactEstimationProps) {
  if (estimates.length === 0) return null;

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3"
      data-testid="impact-estimation"
      role="group"
      aria-label="Estimated improvements"
    >
      {estimates.map((est) => (
        <ImpactCard key={est.id} estimate={est} />
      ))}
    </div>
  );
}

function ImpactCard({ estimate }: { estimate: UnifiedImpactEstimate }) {
  const icon = ICONS[estimate.icon] ?? <ArrowTrendingUpIcon className="h-5 w-5" />;

  return (
    <div
      className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-3 transition-all hover:border-brand-primary/30"
      data-testid={`impact-${estimate.id}`}
    >
      <div className="flex items-center gap-1.5 text-brand-primary mb-2">
        {icon}
        <span className="text-xs font-medium text-text-primary truncate">{estimate.label}</span>
      </div>

      <div className="flex items-end justify-between gap-1">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wide text-text-muted">Current</div>
          <div className="text-sm font-semibold tabular-nums text-text-muted">
            {estimate.currentValue}
          </div>
        </div>
        <ArrowTrendingUpIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wide text-text-muted">Estimated</div>
          <div className={`text-sm font-bold tabular-nums ${estimate.positive ? 'text-semantic-success' : 'text-text-primary'}`}>
            {estimate.estimatedValue}
          </div>
        </div>
      </div>

      <div className="mt-2 flex justify-center">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            estimate.positive
              ? 'bg-semantic-success/10 text-semantic-success'
              : 'bg-semantic-warning/10 text-semantic-warning'
          }`}
        >
          {estimate.difference}
        </span>
      </div>
    </div>
  );
}
