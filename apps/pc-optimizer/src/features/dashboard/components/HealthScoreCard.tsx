import React from 'react';
import { Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { SCORE_ZONE_CONFIG } from '../dashboard.types';
import type { HealthSnapshot } from '../dashboard.types';
import { scoreToHealthBadge, getDashboardMessage } from '../dashboard.utils';
import { useAnimatedNumber } from './useAnimatedNumber';
import { HealthBadge } from './HealthBadge';

export interface HealthScoreCardProps {
  healthScore: HealthSnapshot | null;
  loading: boolean;
  error?: string | null;
}

export const HealthScoreCard = React.memo(function HealthScoreCard({ healthScore, loading, error }: HealthScoreCardProps) {
  const animatedScore = useAnimatedNumber(healthScore?.overallScore ?? 0);
  const displayScore = Math.round(animatedScore);

  if (loading && !healthScore) {
    return (
      <Card title="Health Score">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-text-muted">Calculating health score...</div>
        </div>
      </Card>
    );
  }

  if (!healthScore) {
    return (
      <Card title="Health Score">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-text-muted">
            {error ? error : 'Unable to load health score'}
          </div>
        </div>
      </Card>
    );
  }

  const zoneConfig = SCORE_ZONE_CONFIG[healthScore.scoreZone];

  // Colors and messaging driven by the Health Engine's scoreZone, not hardcoded in UI.
  const scoreColor = zoneConfig.textColor;
  const strokeColor = zoneConfig.strokeColor;

  const issueCount = healthScore.issues.length;

  return (
    <Card title="Health Score" role="region" aria-labelledby="health-score-title">
      <h2 id="health-score-title" className="sr-only">System Health Score</h2>
      <div className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center gap-6">
          <div
            className="relative h-32 w-32 shrink-0"
            role="img"
            aria-label={`Health score: ${displayScore} out of 100, status: ${zoneConfig.label}`}
          >
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                className="stroke-surface-muted"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                className={strokeColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${animatedScore * 2.83} 283`}
                style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-3xl font-bold ${scoreColor} tabular-nums`}>{displayScore}</div>
                <div className="text-xs text-text-muted">/ 100</div>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-semibold ${zoneConfig.textColor}`}>{zoneConfig.label}</div>
              <HealthBadge badge={scoreToHealthBadge(displayScore)} size="sm" />
            </div>
            <div className="mt-1 inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-text-secondary">
              {issueCount > 0 ? `${issueCount} Issues Found` : 'No Issues Found'}
            </div>
            <div className="mt-2 text-sm text-text-secondary">
              {(() => {
                const msg = getDashboardMessage(displayScore);
                return (
                  <>
                    <span className="font-medium text-text-primary">{msg.title}</span>
                    {' — '}
                    {msg.description}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Real measured stats only */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Temp Files" value={formatBytes(healthScore.tempFilesSize)} />
          <Stat label="Startup Apps" value={String(healthScore.startupAppsEnabled)} />
          <Stat label="Recycle Bin" value={formatBytes(healthScore.recycleBinSize)} />
        </div>
      </div>
    </Card>
  );
});

const Stat = React.memo(function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted p-3 text-center">
      <div className="text-lg font-bold text-text-primary tabular-nums">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
});

