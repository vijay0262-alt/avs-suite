/**
 * ActionPanel — bottom action bar with review, apply, export, save, close.
 *
 * Provides the primary action buttons after scan completion.
 */
import type { ReactNode } from 'react';
import {
  DocumentArrowDownIcon,
  DocumentTextIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@avs/ui';
import type { UnifiedResultAction } from '../unifiedResultsTypes';

export interface ActionPanelProps {
  actions: UnifiedResultAction[];
  onExport: () => void;
  onSave: () => void;
  onClose: () => void;
  onReviewDetails?: () => void;
  onApplySelected?: () => void;
  onApplyAllSafe?: () => void;
  selectedCount?: number;
  safeCount?: number;
}

const ACTION_ICONS: Record<string, ReactNode> = {
  EyeIcon: <EyeIcon className="h-4 w-4" />,
  SparklesIcon: <SparklesIcon className="h-4 w-4" />,
  CheckIcon: <CheckIcon className="h-4 w-4" />,
  DocumentArrowDownIcon: <DocumentArrowDownIcon className="h-4 w-4" />,
  DocumentTextIcon: <DocumentTextIcon className="h-4 w-4" />,
};

const VARIANT_MAP: Record<string, 'primary' | 'secondary' | 'danger' | 'ghost'> = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
  ghost: 'ghost',
};

export function ActionPanel({
  actions,
  onExport,
  onSave,
  onClose,
  onReviewDetails,
  onApplySelected,
  onApplyAllSafe,
  selectedCount = 0,
  safeCount = 0,
}: ActionPanelProps) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--avs-border)] pt-4"
      data-testid="action-panel"
    >
      {/* Left: export/save */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onExport} leftIcon={<DocumentArrowDownIcon className="h-4 w-4" />}>
          Export
        </Button>
        <Button variant="ghost" size="sm" onClick={onSave} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>
          Save Report
        </Button>
        {onReviewDetails && (
          <Button variant="ghost" size="sm" onClick={onReviewDetails} leftIcon={<EyeIcon className="h-4 w-4" />}>
            Review Details
          </Button>
        )}
      </div>

      {/* Right: apply + close */}
      <div className="flex items-center gap-2">
        {onApplyAllSafe && safeCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onApplyAllSafe}
            leftIcon={<SparklesIcon className="h-4 w-4" />}
          >
            Apply All Safe ({safeCount})
          </Button>
        )}
        {onApplySelected && selectedCount > 0 && (
          <Button
            variant="primary"
            size="sm"
            onClick={onApplySelected}
            leftIcon={<CheckIcon className="h-4 w-4" />}
          >
            Apply Selected ({selectedCount})
          </Button>
        )}
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={VARIANT_MAP[action.variant] ?? 'secondary'}
            size="sm"
            onClick={action.action}
            leftIcon={ACTION_ICONS[action.icon]}
          >
            {action.label}
            {action.requiresPro && (
              <span className="ml-1 text-micro opacity-70">Pro</span>
            )}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={onClose} leftIcon={<XMarkIcon className="h-4 w-4" />}>
          Close
        </Button>
      </div>
    </div>
  );
}
