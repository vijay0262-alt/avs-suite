import React from 'react';
import { Button, Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  CheckCircleIcon,
  ClockIcon,
  CpuChipIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import type { OptimizationSummary } from '../OptimizationSummary.types';

export interface ImprovementSummaryProps {
  summary: OptimizationSummary;
  onClose: () => void;
}

export const ImprovementSummaryCard = React.memo(function ImprovementSummaryCard({
  summary,
  onClose,
}: ImprovementSummaryProps) {
  const scoreImproved = summary.healthAfter > summary.healthBefore;
  const durationSeconds = (summary.durationMs / 1000).toFixed(1);

  const stats = [
    {
      label: 'Recovered',
      value: formatBytes(summary.storageRecovered),
      icon: ArrowPathIcon,
      show: summary.storageRecovered > 0,
    },
    {
      label: 'Registry Fixed',
      value: `${summary.registryFixed} Entries`,
      icon: CpuChipIcon,
      show: summary.registryFixed > 0,
    },
    {
      label: 'Startup Improved',
      value: `${summary.startupOptimized} Applications`,
      icon: RocketLaunchIcon,
      show: summary.startupOptimized > 0,
    },
    {
      label: 'Privacy Cleaned',
      value: `${summary.privacyCleaned} Files`,
      icon: ShieldCheckIcon,
      show: summary.privacyCleaned > 0,
    },
    {
      label: 'Duplicates Removed',
      value: `${summary.duplicateFilesRemoved} Files`,
      icon: DocumentDuplicateIcon,
      show: summary.duplicateFilesRemoved > 0,
    },
    {
      label: 'Optimization Time',
      value: `${durationSeconds} Seconds`,
      icon: ClockIcon,
      show: true,
    },
  ].filter((s) => s.show);

  return (
    <Card title="Optimization Complete" role="region" aria-labelledby="improvement-summary-title">
      <h2 id="improvement-summary-title" className="sr-only">Optimization Complete</h2>
      <div className="space-y-6">
        {/* Celebration header */}
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-semantic-success/10">
            <CheckCircleIcon className="h-8 w-8 text-semantic-success" aria-hidden />
          </div>
          <div>
            <div className="text-xl font-bold text-text-primary">Optimization Complete</div>
            <div className="text-sm text-text-secondary">Your PC has been optimized successfully.</div>
          </div>
        </div>

        {/* Health Score before → after */}
        <div className="flex items-center justify-center gap-6 py-4 rounded-lg bg-surface-muted">
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-text-muted">Before</div>
            <div className="text-3xl font-bold text-text-secondary tabular-nums">{summary.healthBefore}</div>
          </div>
          <div className="text-2xl text-text-muted" aria-hidden>→</div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-text-muted">After</div>
            <div className="text-3xl font-bold text-semantic-success tabular-nums">{summary.healthAfter}</div>
          </div>
          {scoreImproved && (
            <div className="inline-flex items-center rounded-full bg-semantic-success/10 px-3 py-1 text-sm font-medium text-semantic-success">
              +{summary.healthAfter - summary.healthBefore}
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 p-4 rounded-md bg-surface-muted"
              data-testid={`summary-stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <stat.icon className="h-5 w-5 text-semantic-primary" aria-hidden />
              <div>
                <div className="text-xs text-text-muted">{stat.label}</div>
                <div className="text-sm font-semibold text-text-primary tabular-nums">{stat.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Close button */}
        <div className="flex justify-end">
          <Button onClick={onClose} data-testid="improvement-summary-close">
            Done
          </Button>
        </div>
      </div>
    </Card>
  );
});
