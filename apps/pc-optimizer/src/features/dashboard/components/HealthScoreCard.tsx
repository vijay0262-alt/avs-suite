import { Card } from '@avs/ui';
import { HEALTH_STATUS_CONFIG } from '../dashboard.types';
import type { HealthScore } from '../dashboard.types';

export interface HealthScoreCardProps {
  healthScore: HealthScore | null;
  loading: boolean;
}

export function HealthScoreCard({ healthScore, loading }: HealthScoreCardProps) {
  if (loading) {
    return (
      <Card title="Health Score">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-text-muted">Loading health score...</div>
        </div>
      </Card>
    );
  }

  if (!healthScore) {
    return (
      <Card title="Health Score">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-text-muted">Unable to load health score</div>
        </div>
      </Card>
    );
  }

  const config = HEALTH_STATUS_CONFIG[healthScore.status];
  const scoreColor = healthScore.overallScore >= 80 
    ? 'text-semantic-success' 
    : healthScore.overallScore >= 60 
      ? 'text-semantic-warning' 
      : 'text-semantic-danger';

  return (
    <Card title="Health Score" role="region" aria-labelledby="health-score-title">
      <h2 id="health-score-title" className="sr-only">System Health Score</h2>
      <div className="space-y-6">
        {/* Overall Score */}
        <div className="flex items-center gap-6">
          <div className="relative h-32 w-32" role="img" aria-label={`Health score: ${healthScore.overallScore} out of 100, status: ${config.label}`}>
            <svg className="h-full w-full transform -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-surface-muted"
              />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${healthScore.overallScore * 2.83} 283`}
                className={scoreColor}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-3xl font-bold ${scoreColor}`}>
                  {healthScore.overallScore}
                </div>
                <div className="text-xs text-text-muted">/ 100</div>
              </div>
            </div>
          </div>
          <div className="flex-1">
            <div className={`text-xl font-semibold ${config.color}`}>
              {config.label}
            </div>
            <div className="mt-2 text-sm text-text-secondary">
              Your system is in {config.label.toLowerCase()} condition.
            </div>
          </div>
        </div>

        {/* Category Scores */}
        <div>
          <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
            Category Scores
          </div>
          <div className="space-y-3" role="list" aria-label="Category health scores">
            <CategoryBar
              label="CPU"
              score={healthScore.categoryScores.cpu}
              color={healthScore.categoryScores.cpu >= 80 ? 'success' : healthScore.categoryScores.cpu >= 60 ? 'warning' : 'danger'}
            />
            <CategoryBar
              label="Memory"
              score={healthScore.categoryScores.memory}
              color={healthScore.categoryScores.memory >= 80 ? 'success' : healthScore.categoryScores.memory >= 60 ? 'warning' : 'danger'}
            />
            <CategoryBar
              label="Storage"
              score={healthScore.categoryScores.storage}
              color={healthScore.categoryScores.storage >= 80 ? 'success' : healthScore.categoryScores.storage >= 60 ? 'warning' : 'danger'}
            />
            <CategoryBar
              label="Security"
              score={healthScore.categoryScores.security}
              color={healthScore.categoryScores.security >= 80 ? 'success' : healthScore.categoryScores.security >= 60 ? 'warning' : 'danger'}
            />
            <CategoryBar
              label="Performance"
              score={healthScore.categoryScores.performance}
              color={healthScore.categoryScores.performance >= 80 ? 'success' : healthScore.categoryScores.performance >= 60 ? 'warning' : 'danger'}
            />
          </div>
        </div>

        {/* Suggestions */}
        {healthScore.suggestions.length > 0 && (
          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Suggestions
            </div>
            <ul className="space-y-2 text-sm text-text-secondary" role="list" aria-label="System improvement suggestions">
              {healthScore.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-semantic-primary" aria-hidden="true">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

function CategoryBar({ label, score, color }: { label: string; score: number; color: 'success' | 'warning' | 'danger' }) {
  const colorClass = color === 'success' ? 'bg-semantic-success' : color === 'warning' ? 'bg-semantic-warning' : 'bg-semantic-danger';
  
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-sm text-text-secondary">{label}</div>
      <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all duration-500 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="w-12 text-right text-sm font-medium text-text-primary tabular-nums">
        {Math.round(score)}
      </div>
    </div>
  );
}
