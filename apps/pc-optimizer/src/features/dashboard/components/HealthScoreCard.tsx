import { Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { HEALTH_STATUS_CONFIG } from '../dashboard.types';
import type { HealthScore } from '../dashboard.types';

export interface HealthScoreCardProps {
  healthScore: HealthScore | null;
  loading: boolean;
}

export function HealthScoreCard({ healthScore, loading }: HealthScoreCardProps) {
  if (loading || !healthScore) {
    return (
      <Card title="Health Score">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-text-muted">Calculating health score...</div>
        </div>
      </Card>
    );
  }

  const config = HEALTH_STATUS_CONFIG[healthScore.status];
  const scoreColor =
    healthScore.overallScore >= 80
      ? 'text-semantic-success'
      : healthScore.overallScore >= 60
        ? 'text-semantic-warning'
        : 'text-semantic-danger';
  const strokeColor =
    healthScore.overallScore >= 80
      ? 'stroke-semantic-success'
      : healthScore.overallScore >= 60
        ? 'stroke-semantic-warning'
        : 'stroke-semantic-danger';

  return (
    <Card title="Health Score" role="region" aria-labelledby="health-score-title">
      <h2 id="health-score-title" className="sr-only">System Health Score</h2>
      <div className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center gap-6">
          <div
            className="relative h-32 w-32 shrink-0"
            role="img"
            aria-label={`Health score: ${healthScore.overallScore} out of 100, status: ${config.label}`}
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
                strokeDasharray={`${healthScore.overallScore * 2.83} 283`}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-3xl font-bold ${scoreColor}`}>{healthScore.overallScore}</div>
                <div className="text-xs text-text-muted">/ 100</div>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className={`text-2xl font-semibold ${config.color}`}>{config.label}</div>
            <div className="mt-1 inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-text-secondary">
              {healthScore.issuesFound > 0 ? `${healthScore.issuesFound} Issues Found` : 'No Issues Found'}
            </div>
            <div className="mt-2 text-sm text-text-secondary">
              {healthScore.status === 'excellent' || healthScore.status === 'good'
                ? 'Your PC is in great shape.'
                : 'Your PC can be improved with a quick cleanup.'}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Recoverable" value={formatBytes(healthScore.recoverableSpace)} />
          <Stat label="Memory" value={formatBytes(healthScore.memoryRecovery)} />
          <Stat
            label="Boot"
            value={
              healthScore.bootImprovementSeconds > 0
                ? `${Math.round(healthScore.bootImprovementSeconds)}s faster`
                : 'Optimized'
            }
          />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted p-3 text-center">
      <div className="text-lg font-bold text-text-primary tabular-nums">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}

