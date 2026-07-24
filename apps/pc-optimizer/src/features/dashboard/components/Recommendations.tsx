import React from 'react';
import { Card, Button } from '@avs/ui';
import {
  SparklesIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  CircleStackIcon,
  ServerIcon,
  RocketLaunchIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { Recommendation } from '../dashboard.types';

export interface RecommendationsProps {
  recommendations: Recommendation[];
  onAction?: (path: string) => void;
}

const CATEGORY_ICONS: Record<string, typeof SparklesIcon> = {
  health: SparklesIcon,
  storage: CircleStackIcon,
  startup: ServerIcon,
  privacy: ShieldCheckIcon,
  security: ShieldCheckIcon,
  performance: CpuChipIcon,
  upgrade: RocketLaunchIcon,
};

const SEVERITY_ICONS: Record<string, typeof InformationCircleIcon> = {
  success: CheckCircleIcon,
  info: InformationCircleIcon,
  warning: ExclamationTriangleIcon,
  danger: ExclamationTriangleIcon,
};

const SEVERITY_COLORS: Record<string, string> = {
  success: 'text-semantic-success',
  info: 'text-text-secondary',
  warning: 'text-semantic-warning',
  danger: 'text-semantic-danger',
};

export const Recommendations = React.memo(function Recommendations({ recommendations, onAction }: RecommendationsProps) {
  if (recommendations.length === 0) return null;

  return (
    <Card title="Recommendations">
      <div className="space-y-3" data-testid="recommendations-list">
        {recommendations.map((rec) => {
          const CategoryIcon = CATEGORY_ICONS[rec.category] ?? SparklesIcon;
          const SeverityIcon = SEVERITY_ICONS[rec.severity] ?? InformationCircleIcon;
          const severityColor = SEVERITY_COLORS[rec.severity] ?? 'text-text-secondary';
          return (
            <div
              key={rec.id}
              className="flex items-start gap-3 p-3 rounded-md bg-surface-muted hover:bg-surface-muted/80 transition-colors"
              data-testid={`recommendation-${rec.id}`}
            >
              <div className={`shrink-0 ${severityColor}`}>
                <SeverityIcon className="h-5 w-5" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{rec.title}</span>
                  <CategoryIcon className="h-4 w-4 text-text-muted shrink-0" aria-hidden />
                </div>
                <div className="text-xs text-text-secondary mt-0.5">{rec.description}</div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAction?.(rec.actionPath)}
                rightIcon={<ArrowRightIcon className="h-3.5 w-3.5" />}
                className="shrink-0"
              >
                {rec.actionLabel}
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
});
