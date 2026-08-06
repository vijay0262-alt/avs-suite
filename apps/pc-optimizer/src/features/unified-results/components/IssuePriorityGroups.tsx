/**
 * IssuePriorityGroups — collapsible groups of issues by priority.
 *
 * Groups findings into Critical, High, Medium, Low, Informational.
 * Each group is collapsible with a count badge.
 */
import { useState } from 'react';
import {
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedIssue, IssuePriority } from '../unifiedResultsTypes';
import {
  priorityOrder,
  priorityLabel,
  priorityColor,
  priorityBg,
} from '../unifiedResultsTypes';

export interface IssuePriorityGroupsProps {
  issues: UnifiedIssue[];
}

const PRIORITY_ICONS: Record<IssuePriority, React.ReactNode> = {
  critical: <ShieldExclamationIcon className="h-4 w-4" />,
  high: <ExclamationTriangleIcon className="h-4 w-4" />,
  medium: <ExclamationTriangleIcon className="h-4 w-4" />,
  low: <InformationCircleIcon className="h-4 w-4" />,
  informational: <CheckCircleIcon className="h-4 w-4" />,
};

export function IssuePriorityGroups({ issues }: IssuePriorityGroupsProps) {
  const groups = groupByPriority(issues);

  if (issues.length === 0) {
    return (
      <div
        className="rounded-[var(--avs-radius-md)] border border-semantic-success/20 bg-semantic-success/5 p-4 text-center"
        data-testid="no-issues"
      >
        <CheckCircleIcon className="mx-auto h-8 w-8 text-semantic-success" />
        <p className="mt-2 text-small font-medium text-semantic-success">No issues found</p>
        <p className="text-caption text-text-muted">Your system is clean and healthy.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="issue-priority-groups">
      {groups.map(({ priority, items }) => (
        <IssueGroup key={priority} priority={priority} items={items} />
      ))}
    </div>
  );
}

function groupByPriority(issues: UnifiedIssue[]): { priority: IssuePriority; items: UnifiedIssue[] }[] {
  const map = new Map<IssuePriority, UnifiedIssue[]>();
  for (const issue of issues) {
    const list = map.get(issue.priority) ?? [];
    list.push(issue);
    map.set(issue.priority, list);
  }
  return Array.from(map.entries())
    .map(([priority, items]) => ({ priority, items }))
    .sort((a, b) => priorityOrder(a.priority) - priorityOrder(b.priority));
}

function IssueGroup({ priority, items }: { priority: IssuePriority; items: UnifiedIssue[] }) {
  const [expanded, setExpanded] = useState(priority === 'critical' || priority === 'high');

  return (
    <div className={`rounded-[var(--avs-radius-md)] border ${priorityBg(priority)}`} role="group" aria-label={`${priorityLabel(priority)} issues`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className={priorityColor(priority)}>{PRIORITY_ICONS[priority]}</span>
        <span className={`text-small font-semibold ${priorityColor(priority)}`}>
          {priorityLabel(priority)}
        </span>
        <span className="rounded-full bg-[var(--avs-surface)] px-2 py-0.5 text-caption font-medium tabular-nums text-text-secondary">
          {items.length}
        </span>
        <ChevronRightIcon
          className={`ml-auto h-4 w-4 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>

      {expanded && (
        <div className="space-y-1.5 px-3 pb-3">
          {items.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: UnifiedIssue }) {
  return (
    <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface)] p-3" data-testid={`issue-${issue.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-small font-medium text-text-primary">{issue.title}</p>
          <p className="mt-0.5 text-caption text-text-secondary">{issue.description}</p>
          {issue.location && (
            <p className="mt-1 text-caption text-text-muted font-mono truncate" title={issue.location}>
              {issue.location}
            </p>
          )}
          {issue.evidence.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1">
              <EyeIcon className="h-3 w-3 text-text-muted" aria-hidden />
              <span className="text-micro text-text-muted">
                Evidence: {issue.evidence.join(', ')}
              </span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-caption font-bold tabular-nums ${priorityColor(issue.priority)}`}>
            {Math.round(issue.confidence * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
