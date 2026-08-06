import { useEffect, useCallback } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  testId?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  actions,
  size = 'md',
  testId,
}: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  const titleId = testId ? `${testId}-title` : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      data-testid={testId}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className={`bg-[var(--avs-surface)] rounded-[var(--avs-radius-lg)] shadow-[var(--avs-shadow-xl,var(--avs-shadow-lg))] w-full ${sizeClasses[size]} max-h-[90vh] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--avs-border)]">
          <h2 id={titleId} className="text-section-title font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)] text-text-secondary hover:text-text-primary transition-colors outline-none focus-visible:shadow-focus"
            aria-label="Close dialog"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4" role="region" aria-live="polite">
          {children}
        </div>

        {/* Actions */}
        {actions && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--avs-border)]" role="toolbar">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
