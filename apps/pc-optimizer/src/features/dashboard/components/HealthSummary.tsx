import React from 'react';
import { Card } from '@avs/ui';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { HealthSummaryItem } from '../dashboard.types';

export interface HealthSummaryProps {
  summary: HealthSummaryItem[] | undefined;
}

export const HealthSummary = React.memo(function HealthSummary({ summary }: HealthSummaryProps) {
  return (
    <Card title="Your PC Summary">
      <ul className="space-y-3" role="list" aria-label="PC health summary">
        {summary?.map((item, index) => (
          <li key={index} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">{iconForSeverity(item.severity)}</span>
            <span className={`text-sm ${severityTextColor(item.severity)}`}>{item.text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
});

function iconForSeverity(severity: HealthSummaryItem['severity']) {
  const className = `h-5 w-5 ${severityIconColor(severity)}`;
  switch (severity) {
    case 'success':
      return <CheckCircleIcon className={className} aria-hidden="true" />;
    case 'warning':
      return <ExclamationTriangleIcon className={className} aria-hidden="true" />;
    case 'danger':
      return <XCircleIcon className={className} aria-hidden="true" />;
    case 'info':
    default:
      return <InformationCircleIcon className={className} aria-hidden="true" />;
  }
}

function severityIconColor(severity: HealthSummaryItem['severity']) {
  switch (severity) {
    case 'success':
      return 'text-semantic-success';
    case 'warning':
      return 'text-semantic-warning';
    case 'danger':
      return 'text-semantic-danger';
    case 'info':
    default:
      return 'text-semantic-info';
  }
}

function severityTextColor(severity: HealthSummaryItem['severity']) {
  switch (severity) {
    case 'success':
      return 'text-semantic-success';
    case 'warning':
      return 'text-semantic-warning';
    case 'danger':
      return 'text-semantic-danger';
    case 'info':
    default:
      return 'text-text-secondary';
  }
}
