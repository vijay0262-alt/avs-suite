/**
 * ScanTree — professional expandable scan phase tree.
 *
 * Shows completed phases with checkmarks, the current phase with an
 * animated indicator, and remaining phases in a dimmed state.
 * Supports nested children for sub-phases.
 */
import { useState } from 'react';
import {
  CheckCircleIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedScanTreeNode } from '../unifiedScanTypes';

export interface ScanTreeProps {
  nodes: UnifiedScanTreeNode[];
}

function StatusIcon({ status }: { status: UnifiedScanTreeNode['status'] }) {
  switch (status) {
    case 'complete':
      return <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />;
    case 'scanning':
      return <ArrowPathIcon className="h-4 w-4 text-brand-primary shrink-0 animate-spin" aria-hidden />;
    case 'error':
      return <ExclamationCircleIcon className="h-4 w-4 text-semantic-danger shrink-0" aria-hidden />;
    case 'skipped':
      return <MinusCircleIcon className="h-4 w-4 text-text-muted shrink-0" aria-hidden />;
    default:
      return <div className="h-4 w-4 rounded-full border-2 border-[var(--avs-border)] shrink-0" />;
  }
}

function TreeNode({ node, depth = 0 }: { node: UnifiedScanTreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(node.status === 'scanning');
  const hasChildren = node.children && node.children.length > 0;
  const isScanning = node.status === 'scanning';

  return (
    <div className="space-y-0.5">
      <div
        className={`flex items-center gap-2 rounded-[var(--avs-radius-sm)] px-2 py-1.5 transition-colors ${
          isScanning ? 'bg-brand-primary/10' : 'hover:bg-[var(--avs-surface-muted)]/50'
        }`}
        role="treeitem"
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isScanning}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-0.5 rounded hover:bg-[var(--avs-surface-muted)] transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 text-text-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              aria-hidden
            />
          </button>
        ) : (
          <div className="w-5" />
        )}

        <StatusIcon status={node.status} />

        <span
          className={`text-small flex-1 truncate ${
            isScanning
              ? 'font-medium text-text-primary'
              : node.status === 'complete'
                ? 'text-text-muted'
                : 'text-text-muted/60'
          }`}
        >
          {node.label}
        </span>

        {/* Items/issues count */}
        {(node.itemsScanned > 0 || node.issuesFound > 0) && (
          <div className="flex items-center gap-2 text-caption tabular-nums text-text-muted shrink-0">
            {node.itemsScanned > 0 && (
              <span>{node.itemsScanned.toLocaleString()} items</span>
            )}
            {node.issuesFound > 0 && (
              <span className="text-semantic-warning">{node.issuesFound} issues</span>
            )}
          </div>
        )}
      </div>

      {/* Reason for error/skipped */}
      {node.reason && (node.status === 'error' || node.status === 'skipped') && (
        <div className={`ml-7 text-caption ${node.status === 'error' ? 'text-semantic-danger' : 'text-text-muted'}`}>
          {node.reason}
        </div>
      )}

      {/* Children */}
      {hasChildren && expanded && (
        <div className="ml-6 space-y-0.5 border-l border-[var(--avs-border)] pl-2" role="group">
          {node.children!.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ScanTree({ nodes }: ScanTreeProps) {
  return (
    <div
      className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-3 space-y-0.5"
      data-testid="unified-scan-tree"
      role="tree"
      aria-label="Scan phases"
    >
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} />
      ))}
    </div>
  );
}
