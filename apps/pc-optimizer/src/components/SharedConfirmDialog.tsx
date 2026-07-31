/**
 * SharedConfirmDialog — reusable confirmation modal for destructive actions.
 *
 * Replaces the inline `fixed inset-0` modals scattered across modules
 * (DiskAnalyzer, Uninstaller, Updater, Wiper) with a single consistent component.
 */
import type { ReactNode } from 'react';
import { Button } from '@avs/ui';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export interface SharedConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}

export function SharedConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  onConfirm,
  onCancel,
  testId = 'confirm-dialog',
}: SharedConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
    >
      <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          {variant === 'danger' && (
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-semantic-danger" aria-hidden />
          )}
          <h3
            id={`${testId}-title`}
            className="text-lg font-semibold text-text-primary"
          >
            {title}
          </h3>
        </div>
        <div className="text-sm text-text-secondary mb-6">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} data-testid={`${testId}-cancel`}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            data-testid={`${testId}-confirm`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
