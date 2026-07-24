import React from 'react';
import { Card } from '@avs/ui';
import {
  ExclamationTriangleIcon,
  XCircleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { HealthIssue, HealthCategory } from '../dashboard.types';

export interface IssuesListProps {
  issues: HealthIssue[] | undefined;
  onIssueClick?: (issue: HealthIssue) => void;
}

const CATEGORY_LABELS: Record<HealthCategory, string> = {
  storage: 'Storage',
  startup: 'Startup',
  privacy: 'Privacy',
  performance: 'Performance',
  security: 'Security',
  windows: 'Windows Health',
};

const CATEGORY_ORDER: HealthCategory[] = ['storage', 'startup', 'privacy', 'performance', 'security', 'windows'];

export const IssuesList = React.memo(function IssuesList({ issues, onIssueClick }: IssuesListProps) {
  if (!issues || issues.length === 0) {
    return (
      <Card title="Issues Found">
        <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="issues-empty-state">
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-semantic-success/10">
            <CheckCircleIcon className="h-7 w-7 text-semantic-success" aria-hidden />
          </div>
          <div className="space-y-1">
            <div className="text-base font-medium text-text-primary">Everything looks great.</div>
            <div className="text-sm text-text-secondary">No optimization required. Your PC is running at peak performance.</div>
          </div>
        </div>
      </Card>
    );
  }

  const byCategory = new Map<HealthCategory, HealthIssue[]>();
  for (const issue of issues) {
    const list = byCategory.get(issue.category) ?? [];
    list.push(issue);
    byCategory.set(issue.category, list);
  }

  const categories = CATEGORY_ORDER.filter((c) => byCategory.has(c));

  return (
    <Card title={`${issues.length} Issues Found`}>
      <div className="space-y-4">
        {categories.map((category) => {
          const categoryIssues = byCategory.get(category)!;
          return (
            <div key={category}>
              <div className="mb-2 text-xs uppercase tracking-wide text-text-muted">
                {CATEGORY_LABELS[category]}
              </div>
              <ul className="space-y-1" role="list">
                {categoryIssues.map((issue) => (
                  <li key={issue.id}>
                    <button
                      onClick={() => onIssueClick?.(issue)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-surface-muted text-left transition-colors"
                    >
                      <span className="shrink-0">{iconForSeverity(issue.severity)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary">{issue.title}</div>
                        <div className="text-xs text-text-secondary truncate">{issue.detail}</div>
                      </div>
                      {issue.canAutoFix && (
                        <span className="text-xs text-semantic-success shrink-0">Auto-fix</span>
                      )}
                      <ChevronRightIcon className="h-4 w-4 text-text-muted shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
});

function iconForSeverity(severity: HealthIssue['severity']) {
  if (severity === 'high') {
    return <XCircleIcon className="h-5 w-5 text-semantic-danger" aria-hidden />;
  }
  if (severity === 'medium') {
    return <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" aria-hidden />;
  }
  return <InformationCircleIcon className="h-5 w-5 text-semantic-info" aria-hidden />;
}
