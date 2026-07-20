import { Card, Button } from '@avs/ui';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { HealthCategoryDetail } from '../dashboard.types';

export interface HealthBreakdownProps {
  categories: HealthCategoryDetail[] | undefined;
  onAction: (path: string) => void;
}

export function HealthBreakdown({ categories, onAction }: HealthBreakdownProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {categories?.map((category) => (
        <Card key={category.id} className="hover:border-border-hover transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="text-base font-semibold text-text-primary">{category.name}</div>
            <div className={`text-sm font-bold tabular-nums ${severityTextColor(category.severity)}`}>
              {category.score}%
            </div>
          </div>

          <div className="mb-3">
            <div className="h-2 bg-surface-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${severityBgColor(category.severity)} transition-all duration-500`}
                style={{ width: `${category.score}%` }}
              />
            </div>
          </div>

          <div className="text-sm text-text-secondary mb-4">{category.detail}</div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAction(category.path)}
            rightIcon={<ChevronRightIcon className="h-4 w-4" />}
            className="w-full justify-between"
          >
            {category.actionLabel}
          </Button>
        </Card>
      ))}
    </div>
  );
}

function severityTextColor(severity: 'success' | 'warning' | 'danger') {
  switch (severity) {
    case 'success':
      return 'text-semantic-success';
    case 'warning':
      return 'text-semantic-warning';
    case 'danger':
      return 'text-semantic-danger';
    default:
      return 'text-text-secondary';
  }
}

function severityBgColor(severity: 'success' | 'warning' | 'danger') {
  switch (severity) {
    case 'success':
      return 'bg-semantic-success';
    case 'warning':
      return 'bg-semantic-warning';
    case 'danger':
      return 'bg-semantic-danger';
    default:
      return 'bg-text-secondary';
  }
}
