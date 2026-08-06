import React from 'react';
import { Card } from '@avs/ui';
import { useNavigate } from 'react-router-dom';
import {
  ShieldExclamationIcon,
  HeartIcon,
  SparklesIcon,
  ArrowRightIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';

export interface AIOverviewProps {
  healthScore: number | null;
  securityStatus: string | null;
  processCount: number | null;
  predictionCount: number | null;
}

export const AIOverview = React.memo(function AIOverview({
  healthScore,
  securityStatus,
  processCount,
  predictionCount,
}: AIOverviewProps) {
  const navigate = useNavigate();

  const tiles = [
    {
      id: 'ai-health',
      title: 'Health',
      value: healthScore !== null ? `${healthScore}` : '—',
      unit: healthScore !== null ? '/ 100' : '',
      status: healthScore !== null ? (healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Fair' : 'Needs Attention') : 'Analyzing',
      statusColor: healthScore !== null ? (healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger') : 'text-text-muted',
      icon: SparklesIcon,
      iconBg: 'bg-brand-primary/10',
      iconColor: 'text-brand-primary',
      path: '/dashboard',
      description: 'Overall system health score',
    },
    {
      id: 'ai-security',
      title: 'Security',
      value: securityStatus ?? 'Protected',
      unit: '',
      status: securityStatus ?? 'Real-time protection active',
      statusColor: 'text-semantic-success',
      icon: ShieldExclamationIcon,
      iconBg: 'bg-semantic-danger/10',
      iconColor: 'text-semantic-danger',
      path: '/security-dashboard',
      description: 'Active protection status',
    },
    {
      id: 'ai-performance',
      title: 'Performance',
      value: processCount !== null ? `${processCount}` : '—',
      unit: processCount !== null ? 'processes' : '',
      status: processCount !== null ? 'Processes analyzed' : 'Monitoring',
      statusColor: 'text-text-secondary',
      icon: CircleStackIcon,
      iconBg: 'bg-semantic-info/10',
      iconColor: 'text-semantic-info',
      path: '/process-intelligence',
      description: 'Process intelligence analysis',
    },
    {
      id: 'ai-predictive',
      title: 'Predictive Health',
      value: predictionCount !== null ? `${predictionCount}` : '—',
      unit: predictionCount !== null ? 'predictions' : '',
      status: predictionCount !== null ? 'Forecasts generated' : 'Learning',
      statusColor: 'text-text-secondary',
      icon: HeartIcon,
      iconBg: 'bg-semantic-success/10',
      iconColor: 'text-semantic-success',
      path: '/predictive-health',
      description: 'Future health forecasts',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="ai-overview-tiles">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          onClick={() => navigate(tile.path)}
          className="group text-left"
          data-testid={`ai-tile-${tile.id}`}
        >
          <Card className="hover:border-brand-primary/40 transition-all duration-200 group-hover:shadow-lg group-hover:shadow-brand-primary/5">
            <div className="flex items-start justify-between mb-3">
              <div className={`p-2 rounded-lg ${tile.iconBg}`}>
                <tile.icon className={`h-5 w-5 ${tile.iconColor}`} aria-hidden />
              </div>
              <ArrowRightIcon className="h-4 w-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-statistic font-bold text-text-primary tabular-nums">{tile.value}</span>
              {tile.unit && <span className="text-caption text-text-muted">{tile.unit}</span>}
            </div>
            <div className="text-small font-medium text-text-primary mt-1">{tile.title}</div>
            <div className={`text-caption mt-0.5 ${tile.statusColor}`}>{tile.status}</div>
          </Card>
        </button>
      ))}
    </div>
  );
});
